-- ============================================================================
-- Phone numbers per teammate, and SMS
--
-- phone_numbers  every Twilio number a workspace has: the one that comes with
--                Growth/Pro ('plan'), extra numbers an admin buys for the team
--                ('purchased', billed separately through Stripe) and company
--                numbers attached from the AI Savvy Twilio account
--                ('attached'). A number can be assigned to one teammate: their
--                calls and texts go out from it. Members can read the table;
--                only the server changes it (buying and releasing happen in
--                Twilio and Stripe).
-- sms_messages   every text sent or received on those numbers. The SMS page
--                groups them into conversations by number + contact and gets
--                new ones over Realtime.
-- ============================================================================

create table if not exists public.phone_numbers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  phone_number text not null unique check (phone_number ~ '^\+[1-9][0-9]{7,14}$'),
  twilio_sid text unique,
  friendly_name text not null default '',
  assigned_to uuid references public.profiles (id) on delete set null,
  source text not null default 'purchased' check (source in ('plan', 'purchased', 'attached')),
  stripe_subscription_id text unique,
  monthly_price_cents integer not null default 0 check (monthly_price_cents >= 0),
  voice boolean not null default true,
  sms boolean not null default true,
  -- Set once Twilio points the number's voice and SMS webhooks at this app.
  configured_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists phone_numbers_org_idx on public.phone_numbers (org_id, created_at);
create index if not exists phone_numbers_assigned_idx on public.phone_numbers (assigned_to);

alter table public.phone_numbers enable row level security;

drop policy if exists "Members read their phone numbers" on public.phone_numbers;
create policy "Members read their phone numbers"
  on public.phone_numbers for select
  to authenticated
  using (org_id in (select public.user_org_ids()));

-- The number each Growth/Pro workspace already has moves over as its plan number.
insert into public.phone_numbers (org_id, phone_number, twilio_sid, friendly_name, source)
select org_id, twilio_number, twilio_number_sid, 'Workspace number', 'plan'
from public.org_billing
where twilio_number is not null
on conflict (phone_number) do nothing;

alter table public.org_billing drop column if exists twilio_number;
alter table public.org_billing drop column if exists twilio_number_sid;

create table if not exists public.sms_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  phone_number_id uuid not null references public.phone_numbers (id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  -- The other party, E.164. The workspace's own number is on phone_numbers.
  contact_number text not null,
  body text not null,
  lead_id uuid references public.leads (id) on delete set null,
  -- Who sent it, for outbound texts.
  user_id uuid references public.profiles (id) on delete set null,
  twilio_sid text unique,
  status text not null default 'received'
    check (status in ('queued', 'sent', 'delivered', 'failed', 'received')),
  error text,
  -- Inbound texts: when a teammate opened the conversation.
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists sms_messages_conversation_idx
  on public.sms_messages (org_id, phone_number_id, contact_number, created_at desc);
create index if not exists sms_messages_org_created_idx on public.sms_messages (org_id, created_at desc);
create index if not exists sms_messages_lead_idx on public.sms_messages (lead_id, created_at desc);

alter table public.sms_messages enable row level security;

drop policy if exists "Members read their texts" on public.sms_messages;
create policy "Members read their texts"
  on public.sms_messages for select
  to authenticated
  using (org_id in (select public.user_org_ids()));

-- No insert/update policies: texts are written by the server (the Twilio
-- webhook and the send action), which also marks them read.

-- Stream new texts to the open SMS page.
alter publication supabase_realtime add table public.sms_messages;
