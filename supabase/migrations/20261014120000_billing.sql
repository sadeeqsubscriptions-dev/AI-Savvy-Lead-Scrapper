-- ============================================================================
-- Billing, usage and per-workspace mailboxes
--
-- org_billing   one row per workspace: plan, Stripe ids, billing period, the
--               Twilio number it was given. Members can READ it; only the
--               server (service role) can change it — so nobody can upgrade
--               themselves by editing their own row.
-- org_usage     what a workspace used in a billing period, plus top-ups.
--               Counted only by the server, through consume_usage().
-- mail_accounts the inbox each workspace sends from. The app password is
--               stored encrypted and the table is server-only (no RLS
--               policies), so it can never be read from the browser.
-- ============================================================================

create table if not exists public.org_billing (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'starter', 'growth', 'pro', 'internal')),
  status text not null default 'active' check (status in ('active', 'past_due', 'canceled')),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  period_start timestamptz not null default date_trunc('month', now()),
  period_end timestamptz,
  twilio_number text,
  twilio_number_sid text,
  updated_at timestamptz not null default now()
);

alter table public.org_billing enable row level security;

drop policy if exists "Members read their billing" on public.org_billing;
create policy "Members read their billing"
  on public.org_billing for select
  to authenticated
  using (org_id in (select public.user_org_ids()));

create table if not exists public.org_usage (
  org_id uuid not null references public.organizations (id) on delete cascade,
  period_start timestamptz not null,
  leads_found integer not null default 0 check (leads_found >= 0),
  ai_leads integer not null default 0 check (ai_leads >= 0),
  call_seconds integer not null default 0 check (call_seconds >= 0),
  bonus_leads integer not null default 0 check (bonus_leads >= 0),
  bonus_ai_leads integer not null default 0 check (bonus_ai_leads >= 0),
  bonus_call_seconds integer not null default 0 check (bonus_call_seconds >= 0),
  primary key (org_id, period_start)
);

alter table public.org_usage enable row level security;

drop policy if exists "Members read their usage" on public.org_usage;
create policy "Members read their usage"
  on public.org_usage for select
  to authenticated
  using (org_id in (select public.user_org_ids()));

create table if not exists public.mail_accounts (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  email text not null,
  provider text not null default 'zoho',
  smtp_host text not null,
  smtp_port integer not null default 465,
  imap_host text not null,
  imap_port integer not null default 993,
  password_encrypted text not null,
  sender_name text,
  sender_title text,
  postal_address text,
  verified_at timestamptz,
  updated_at timestamptz not null default now()
);

-- RLS on, no policies: only the service role (server code) can touch it.
alter table public.mail_accounts enable row level security;

-- Every existing workspace gets a billing row; new ones get one on creation.
insert into public.org_billing (org_id) select id from public.organizations on conflict do nothing;

create or replace function public.create_org_billing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.org_billing (org_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists organizations_billing on public.organizations;
create trigger organizations_billing after insert on public.organizations
  for each row execute function public.create_org_billing();

-- Atomically uses `amount` of a metered allowance if it fits under `cap`
-- (plan allowance; top-ups are added on top). Returns how much was granted:
-- `amount`, or less when `partial` and only part of it fits, or 0.
create or replace function public.consume_usage(
  target_org uuid,
  period timestamptz,
  kind text,
  amount integer,
  cap integer,
  partial boolean default false
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  used integer;
  bonus integer;
  granted integer;
begin
  if kind not in ('leads_found', 'ai_leads', 'call_seconds') then
    raise exception 'Unknown usage kind %', kind;
  end if;

  insert into public.org_usage (org_id, period_start) values (target_org, period)
  on conflict do nothing;

  -- Lock the row so two scrapes or calls can't both spend the last units.
  execute format(
    'select %I, %I from public.org_usage where org_id = $1 and period_start = $2 for update',
    kind,
    'bonus_' || kind
  ) into used, bonus using target_org, period;

  granted := least(amount, greatest(0, cap + bonus - used));
  if granted < amount and not partial then
    return 0;
  end if;
  if granted > 0 then
    execute format('update public.org_usage set %I = %I + $3 where org_id = $1 and period_start = $2', kind, kind)
      using target_org, period, granted;
  end if;
  return granted;
end;
$$;

-- Adds purchased top-up units to the current period.
create or replace function public.add_usage_bonus(target_org uuid, period timestamptz, kind text, amount integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if kind not in ('leads_found', 'ai_leads', 'call_seconds') then
    raise exception 'Unknown usage kind %', kind;
  end if;
  insert into public.org_usage (org_id, period_start) values (target_org, period) on conflict do nothing;
  execute format('update public.org_usage set %I = %I + $3 where org_id = $1 and period_start = $2', 'bonus_' || kind, 'bonus_' || kind)
    using target_org, period, amount;
end;
$$;

-- Only server code may meter usage.
revoke execute on function public.consume_usage(uuid, timestamptz, text, integer, integer, boolean) from public, anon, authenticated;
revoke execute on function public.add_usage_bonus(uuid, timestamptz, text, integer) from public, anon, authenticated;
grant execute on function public.consume_usage(uuid, timestamptz, text, integer, integer, boolean) to service_role;
grant execute on function public.add_usage_bonus(uuid, timestamptz, text, integer) to service_role;

-- What each workspace sells. The AI writes scripts, emails and call answers
-- from this, so a roofing company's emails pitch roofing, not AI Savvy.
create table if not exists public.sales_profiles (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  company_name text not null check (length(trim(company_name)) > 0),
  website text,
  description text not null default '',
  services text not null default '',
  booking_url text,
  sender_name text,
  sender_title text,
  postal_address text,
  updated_at timestamptz not null default now()
);

alter table public.sales_profiles enable row level security;

drop policy if exists "Members read their sales profile" on public.sales_profiles;
create policy "Members read their sales profile"
  on public.sales_profiles for select
  to authenticated
  using (org_id in (select public.user_org_ids()));

drop policy if exists "Admins edit their sales profile" on public.sales_profiles;
create policy "Admins edit their sales profile"
  on public.sales_profiles for all
  to authenticated
  using (public.is_org_admin(org_id))
  with check (public.is_org_admin(org_id));

-- Call minutes are metered once per call, when Twilio reports its length.
alter table public.calls add column if not exists billed_seconds integer;

-- Stripe webhook events already handled (Stripe retries; a top-up must
-- never be added twice). Server-only.
create table if not exists public.billing_events (
  id text primary key,
  type text not null,
  created_at timestamptz not null default now()
);
alter table public.billing_events enable row level security;

-- The AI Savvy team's own workspace: unlimited, never billed.
update public.org_billing set plan = 'internal'
where org_id in (
  select m.org_id
  from public.organization_members m
  join public.profiles p on p.id = m.user_id
  where lower(p.email) in ('yossi@aisavvy.us', 'sadeeq@aisavvy.us') and m.role = 'owner'
);
