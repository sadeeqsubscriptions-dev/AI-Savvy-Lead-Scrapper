-- LeadForge - complete schema bootstrap
-- Generated from supabase/migrations, in order. Do not edit by hand.
-- Paste into Supabase Dashboard > SQL Editor and run once.

-- ==== 20260810120000_init_schema.sql =======================================

-- ============================================================================
-- LeadForge — core schema
-- Multi-tenant CRM: organizations own every row, users join via memberships.
-- ============================================================================

-- pgcrypto backs gen_random_bytes() for invitation tokens; pg_trgm backs the
-- trigram indexes used by lead search.
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- ─── Enums ──────────────────────────────────────────────────────────────────

create type public.member_role as enum ('owner', 'admin', 'member', 'viewer');

create type public.lead_status as enum ('New', 'Contacted', 'Qualified', 'Proposal', 'Won', 'Lost');

create type public.activity_type as enum (
  'created', 'note', 'email', 'call', 'meeting', 'status_change', 'assigned', 'imported'
);

create type public.job_status as enum ('queued', 'running', 'completed', 'failed', 'cancelled');

create type public.record_status as enum ('pending', 'imported', 'rejected', 'duplicate');

create type public.invitation_status as enum ('pending', 'accepted', 'revoked', 'expired');

-- ─── Organizations ──────────────────────────────────────────────────────────

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$'),
  plan text not null default 'trial',
  lead_quota integer not null default 5000 check (lead_quota >= 0),
  website text,
  logo_url text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── Profiles (1:1 with auth.users) ─────────────────────────────────────────

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  job_title text,
  phone text,
  timezone text not null default 'UTC',
  onboarded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── Memberships ────────────────────────────────────────────────────────────

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null default 'member',
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);

create index organization_members_user_idx on public.organization_members (user_id);
create index organization_members_org_idx on public.organization_members (org_id);

-- ─── Invitations ────────────────────────────────────────────────────────────

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  email text not null,
  role public.member_role not null default 'member',
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  status public.invitation_status not null default 'pending',
  invited_by uuid references public.profiles (id) on delete set null,
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index invitations_pending_email_idx
  on public.invitations (org_id, lower(email))
  where status = 'pending';

-- ─── Scrape jobs ────────────────────────────────────────────────────────────

create table public.scrape_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  name text not null,
  provider text not null default 'sample',
  query text not null,
  locations text[] not null default '{}',
  industry text,
  min_score integer not null default 0 check (min_score between 0 and 100),
  max_results integer not null default 100 check (max_results between 1 and 5000),
  auto_import boolean not null default true,
  status public.job_status not null default 'queued',
  progress integer not null default 0 check (progress between 0 and 100),
  total_found integer not null default 0,
  total_imported integer not null default 0,
  error text,
  config jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index scrape_jobs_org_created_idx on public.scrape_jobs (org_id, created_at desc);
create index scrape_jobs_status_idx on public.scrape_jobs (status) where status in ('queued', 'running');

-- ─── Leads ──────────────────────────────────────────────────────────────────

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  full_name text not null check (length(trim(full_name)) > 0),
  company text,
  title text,
  email text,
  phone text,
  website text,
  location text,
  city text,
  country text,
  industry text,
  source text not null default 'Manual',
  status public.lead_status not null default 'New',
  score integer not null default 50 check (score between 0 and 100),
  estimated_value numeric(12, 2) not null default 0 check (estimated_value >= 0),
  owner_id uuid references public.profiles (id) on delete set null,
  notes text,
  tags text[] not null default '{}',
  scrape_job_id uuid references public.scrape_jobs (id) on delete set null,
  external_id text,
  metadata jsonb not null default '{}'::jsonb,
  last_contacted_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index leads_org_created_idx on public.leads (org_id, created_at desc);
create index leads_org_status_idx on public.leads (org_id, status);
create index leads_org_owner_idx on public.leads (org_id, owner_id);
create index leads_org_score_idx on public.leads (org_id, score desc);

-- Case-insensitive dedupe of emails within an organization.
create unique index leads_org_email_idx
  on public.leads (org_id, lower(email))
  where email is not null and length(trim(email)) > 0;

-- Trigram indexes back the `ilike '%term%'` search used by the CRM search box.
create index leads_name_trgm_idx on public.leads using gin (full_name extensions.gin_trgm_ops);
create index leads_company_trgm_idx on public.leads using gin (company extensions.gin_trgm_ops);
create index leads_email_trgm_idx on public.leads using gin (email extensions.gin_trgm_ops);

-- ─── Lead activities (timeline) ─────────────────────────────────────────────

create table public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  type public.activity_type not null default 'note',
  title text not null,
  body text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index lead_activities_org_created_idx on public.lead_activities (org_id, created_at desc);
create index lead_activities_lead_idx on public.lead_activities (lead_id, created_at desc);

-- ─── Meetings ───────────────────────────────────────────────────────────────

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  title text not null check (length(trim(title)) > 0),
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text,
  meeting_url text,
  attendees text[] not null default '{}',
  status text not null default 'scheduled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meetings_time_order check (ends_at > starts_at)
);

create index meetings_org_start_idx on public.meetings (org_id, starts_at);

-- ─── Scraped records (staging before import) ────────────────────────────────

create table public.scraped_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  job_id uuid not null references public.scrape_jobs (id) on delete cascade,
  full_name text,
  company text,
  title text,
  email text,
  phone text,
  website text,
  address text,
  city text,
  country text,
  industry text,
  score integer not null default 50 check (score between 0 and 100),
  source_url text,
  raw jsonb not null default '{}'::jsonb,
  status public.record_status not null default 'pending',
  imported_lead_id uuid references public.leads (id) on delete set null,
  created_at timestamptz not null default now()
);

create index scraped_records_job_idx on public.scraped_records (job_id, created_at desc);
create index scraped_records_org_idx on public.scraped_records (org_id, status);

-- ─── Notifications ──────────────────────────────────────────────────────────

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  body text,
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- ==== 20260810120100_functions.sql =========================================

-- ============================================================================
-- LeadForge — helper functions, triggers, and RPCs
-- ============================================================================

-- ─── updated_at maintenance ─────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger organizations_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger leads_updated_at before update on public.leads
  for each row execute function public.set_updated_at();
create trigger meetings_updated_at before update on public.meetings
  for each row execute function public.set_updated_at();
create trigger scrape_jobs_updated_at before update on public.scrape_jobs
  for each row execute function public.set_updated_at();

-- ─── Membership helpers ─────────────────────────────────────────────────────
-- These are SECURITY DEFINER so RLS policies on organization_members can call
-- them without recursing into the very policy being evaluated.

create or replace function public.user_org_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select org_id from public.organization_members where user_id = auth.uid();
$$;

create or replace function public.is_org_member(target_org uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.organization_members
    where org_id = target_org and user_id = auth.uid()
  );
$$;

create or replace function public.is_org_admin(target_org uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.organization_members
    where org_id = target_org
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

create or replace function public.current_org_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select org_id
  from public.organization_members
  where user_id = auth.uid()
  order by case role
    when 'owner' then 0
    when 'admin' then 1
    when 'member' then 2
    else 3
  end, created_at
  limit 1;
$$;

-- ─── Slug generation ────────────────────────────────────────────────────────

create or replace function public.generate_org_slug(source text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  base text;
  candidate text;
  suffix integer := 0;
begin
  base := regexp_replace(lower(coalesce(nullif(trim(source), ''), 'workspace')), '[^a-z0-9]+', '-', 'g');
  base := trim(both '-' from base);

  if base = '' then
    base := 'workspace';
  end if;

  base := left(base, 40);
  candidate := base;

  while exists (select 1 from public.organizations where slug = candidate) loop
    suffix := suffix + 1;
    candidate := base || '-' || suffix::text;
  end loop;

  return candidate;
end;
$$;

-- ─── Organization creation ──────────────────────────────────────────────────
-- Wrapped in a SECURITY DEFINER function because the caller cannot satisfy the
-- organizations INSERT policy and the membership INSERT policy at the same
-- time (there is no membership row yet).

create or replace function public.create_organization(org_name text)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org public.organizations;
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.organizations (name, slug, created_by)
  values (trim(org_name), public.generate_org_slug(org_name), uid)
  returning * into new_org;

  insert into public.organization_members (org_id, user_id, role)
  values (new_org.id, uid, 'owner');

  update public.profiles set onboarded = true where id = uid;

  return new_org;
end;
$$;

-- ─── New user bootstrap ─────────────────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  org_name text;
  new_org_id uuid;
  invite record;
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), ''),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(profiles.full_name, excluded.full_name);

  -- Auto-join any workspace that invited this email address.
  for invite in
    select * from public.invitations
    where lower(email) = lower(new.email)
      and status = 'pending'
      and expires_at > now()
  loop
    insert into public.organization_members (org_id, user_id, role)
    values (invite.org_id, new.id, invite.role)
    on conflict (org_id, user_id) do nothing;

    update public.invitations
      set status = 'accepted', accepted_at = now()
      where id = invite.id;

    update public.profiles set onboarded = true where id = new.id;
  end loop;

  -- Otherwise create the workspace they named at signup.
  org_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'organization_name', '')), '');

  if org_name is not null and not exists (
    select 1 from public.organization_members where user_id = new.id
  ) then
    insert into public.organizations (name, slug, created_by)
    values (org_name, public.generate_org_slug(org_name), new.id)
    returning id into new_org_id;

    insert into public.organization_members (org_id, user_id, role)
    values (new_org_id, new.id, 'owner');

    update public.profiles set onboarded = true where id = new.id;
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── Lead timeline automation ───────────────────────────────────────────────

create or replace function public.log_lead_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.lead_activities (org_id, lead_id, user_id, type, title, metadata)
  values (
    new.org_id,
    new.id,
    coalesce(new.created_by, auth.uid()),
    case when new.scrape_job_id is not null then 'imported'::public.activity_type
         else 'created'::public.activity_type end,
    case when new.scrape_job_id is not null
         then new.full_name || ' was imported from a scrape'
         else new.full_name || ' was added' end,
    jsonb_build_object('source', new.source, 'status', new.status)
  );
  return new;
end;
$$;

create trigger leads_after_insert
  after insert on public.leads
  for each row execute function public.log_lead_created();

create or replace function public.log_lead_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    insert into public.lead_activities (org_id, lead_id, user_id, type, title, metadata)
    values (
      new.org_id, new.id, auth.uid(), 'status_change',
      new.full_name || ' moved to ' || new.status::text,
      jsonb_build_object('from', old.status, 'to', new.status)
    );
  end if;

  if new.owner_id is distinct from old.owner_id and new.owner_id is not null then
    insert into public.lead_activities (org_id, lead_id, user_id, type, title, metadata)
    values (
      new.org_id, new.id, auth.uid(), 'assigned',
      new.full_name || ' was reassigned',
      jsonb_build_object('from', old.owner_id, 'to', new.owner_id)
    );
  end if;

  return new;
end;
$$;

create trigger leads_after_update
  after update on public.leads
  for each row execute function public.log_lead_status_change();

-- ─── Invitations ────────────────────────────────────────────────────────────

create or replace function public.accept_invitation(invite_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invite public.invitations;
  uid uuid := auth.uid();
  user_email text;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select email into user_email from auth.users where id = uid;

  select * into invite from public.invitations
  where token = invite_token and status = 'pending' and expires_at > now();

  if invite.id is null then
    raise exception 'This invitation is no longer valid';
  end if;

  if lower(invite.email) <> lower(user_email) then
    raise exception 'This invitation was sent to a different email address';
  end if;

  insert into public.organization_members (org_id, user_id, role)
  values (invite.org_id, uid, invite.role)
  on conflict (org_id, user_id) do nothing;

  update public.invitations
    set status = 'accepted', accepted_at = now()
    where id = invite.id;

  update public.profiles set onboarded = true where id = uid;

  return invite.org_id;
end;
$$;

-- ─── Dashboard metrics ──────────────────────────────────────────────────────

create or replace function public.dashboard_metrics(target_org uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  result jsonb;
begin
  if not public.is_org_member(target_org) then
    raise exception 'Not a member of this organization';
  end if;

  select jsonb_build_object(
    'total_leads', count(*),
    'new_leads', count(*) filter (where status = 'New'),
    'qualified_leads', count(*) filter (where status in ('Qualified', 'Proposal')),
    'won_leads', count(*) filter (where status = 'Won'),
    'lost_leads', count(*) filter (where status = 'Lost'),
    'leads_this_week', count(*) filter (where created_at >= now() - interval '7 days'),
    'leads_prev_week', count(*) filter (
      where created_at >= now() - interval '14 days' and created_at < now() - interval '7 days'
    ),
    'pipeline_value', coalesce(sum(estimated_value) filter (where status not in ('Won', 'Lost')), 0),
    'won_value', coalesce(sum(estimated_value) filter (where status = 'Won'), 0),
    'avg_score', coalesce(round(avg(score)), 0),
    'needs_attention', count(*) filter (where status = 'New' and created_at < now() - interval '3 days')
  )
  into result
  from public.leads
  where org_id = target_org;

  return result;
end;
$$;

-- Daily lead counts for the pipeline chart.
create or replace function public.lead_trend(target_org uuid, days integer default 30)
returns table (day date, created bigint, won bigint)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_org_member(target_org) then
    raise exception 'Not a member of this organization';
  end if;

  return query
  select
    series.day::date,
    count(l.id) filter (where l.id is not null) as created,
    count(l.id) filter (where l.status = 'Won') as won
  from generate_series(
    (current_date - (greatest(days, 1) - 1))::timestamptz,
    current_date::timestamptz,
    interval '1 day'
  ) as series(day)
  left join public.leads l
    on l.org_id = target_org
    and l.created_at >= series.day
    and l.created_at < series.day + interval '1 day'
  group by series.day
  order by series.day;
end;
$$;

-- Per-member performance for the team page and dashboard leaderboard.
create or replace function public.team_performance(target_org uuid)
returns table (
  user_id uuid,
  full_name text,
  email text,
  role public.member_role,
  total_leads bigint,
  won_leads bigint,
  pipeline_value numeric,
  conversion numeric
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_org_member(target_org) then
    raise exception 'Not a member of this organization';
  end if;

  return query
  select
    p.id,
    p.full_name,
    p.email,
    m.role,
    count(l.id) as total_leads,
    count(l.id) filter (where l.status = 'Won') as won_leads,
    coalesce(sum(l.estimated_value) filter (where l.status not in ('Won', 'Lost')), 0) as pipeline_value,
    case when count(l.id) = 0 then 0
         else round((count(l.id) filter (where l.status = 'Won'))::numeric * 100 / count(l.id), 1)
    end as conversion
  from public.organization_members m
  join public.profiles p on p.id = m.user_id
  left join public.leads l on l.owner_id = p.id and l.org_id = target_org
  where m.org_id = target_org
  group by p.id, p.full_name, p.email, m.role
  order by won_leads desc, total_leads desc;
end;
$$;

-- ─── Import scraped records into leads ──────────────────────────────────────

create or replace function public.import_scraped_records(target_job uuid, record_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  job public.scrape_jobs;
  rec public.scraped_records;
  new_lead_id uuid;
  imported integer := 0;
begin
  select * into job from public.scrape_jobs where id = target_job;

  if job.id is null then
    raise exception 'Scrape job not found';
  end if;

  if not public.is_org_member(job.org_id) then
    raise exception 'Not a member of this organization';
  end if;

  for rec in
    select * from public.scraped_records
    where job_id = target_job
      and status = 'pending'
      and (record_ids is null or id = any (record_ids))
  loop
    -- Skip anything already in the CRM under the same email.
    if rec.email is not null and length(trim(rec.email)) > 0 and exists (
      select 1 from public.leads
      where org_id = job.org_id and lower(email) = lower(rec.email)
    ) then
      update public.scraped_records set status = 'duplicate' where id = rec.id;
      continue;
    end if;

    insert into public.leads (
      org_id, full_name, company, title, email, phone, website, location,
      city, country, industry, source, score, scrape_job_id, created_by,
      owner_id, metadata
    )
    values (
      job.org_id,
      coalesce(nullif(trim(rec.full_name), ''), nullif(trim(rec.company), ''), 'Unknown contact'),
      rec.company, rec.title, nullif(trim(rec.email), ''), rec.phone, rec.website,
      coalesce(rec.address, rec.city), rec.city, rec.country,
      coalesce(rec.industry, job.industry),
      'Scraper', rec.score, job.id, job.created_by, job.created_by,
      jsonb_build_object('source_url', rec.source_url, 'provider', job.provider)
    )
    returning id into new_lead_id;

    update public.scraped_records
      set status = 'imported', imported_lead_id = new_lead_id
      where id = rec.id;

    imported := imported + 1;
  end loop;

  update public.scrape_jobs
    set total_imported = total_imported + imported
    where id = target_job;

  return imported;
end;
$$;

-- ─── Global search ──────────────────────────────────────────────────────────

create or replace function public.search_org(target_org uuid, term text, max_results integer default 10)
returns table (kind text, id uuid, title text, subtitle text, href text)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_org_member(target_org) then
    raise exception 'Not a member of this organization';
  end if;

  if term is null or length(trim(term)) < 2 then
    return;
  end if;

  return query
  (
    select 'lead'::text, l.id, l.full_name,
           coalesce(l.company, l.email, l.status::text),
           '/crm?lead=' || l.id::text
    from public.leads l
    where l.org_id = target_org
      and (l.full_name ilike '%' || term || '%'
        or l.company ilike '%' || term || '%'
        or l.email ilike '%' || term || '%')
    order by l.score desc
    limit max_results
  )
  union all
  (
    select 'meeting'::text, mt.id, mt.title,
           to_char(mt.starts_at, 'Mon DD, HH12:MI AM'),
           '/calendar'
    from public.meetings mt
    where mt.org_id = target_org and mt.title ilike '%' || term || '%'
    order by mt.starts_at
    limit 5
  )
  union all
  (
    select 'job'::text, j.id, j.name, j.status::text, '/scraper'
    from public.scrape_jobs j
    where j.org_id = target_org and j.name ilike '%' || term || '%'
    order by j.created_at desc
    limit 5
  );
end;
$$;

-- ==== 20260810120200_rls.sql ===============================================

-- ============================================================================
-- LeadForge — Row Level Security
-- Every tenant table is gated on organization membership. The service_role key
-- bypasses RLS entirely, which is how the scraper worker writes results.
-- ============================================================================

create or replace function public.shares_org_with(target_user uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select target_user = auth.uid() or exists (
    select 1
    from public.organization_members mine
    join public.organization_members theirs on theirs.org_id = mine.org_id
    where mine.user_id = auth.uid() and theirs.user_id = target_user
  );
$$;

create or replace function public.can_write_org(target_org uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.organization_members
    where org_id = target_org
      and user_id = auth.uid()
      and role in ('owner', 'admin', 'member')
  );
$$;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.invitations enable row level security;
alter table public.leads enable row level security;
alter table public.lead_activities enable row level security;
alter table public.meetings enable row level security;
alter table public.scrape_jobs enable row level security;
alter table public.scraped_records enable row level security;
alter table public.notifications enable row level security;

-- ─── organizations ──────────────────────────────────────────────────────────

create policy "Members can view their organizations"
  on public.organizations for select
  to authenticated
  using (public.is_org_member(id));

create policy "Admins can update their organization"
  on public.organizations for update
  to authenticated
  using (public.is_org_admin(id))
  with check (public.is_org_admin(id));

create policy "Owners can delete their organization"
  on public.organizations for delete
  to authenticated
  using (
    exists (
      select 1 from public.organization_members
      where org_id = organizations.id and user_id = auth.uid() and role = 'owner'
    )
  );

-- ─── profiles ───────────────────────────────────────────────────────────────

create policy "View profiles of teammates"
  on public.profiles for select
  to authenticated
  using (public.shares_org_with(id));

create policy "Update own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "Insert own profile"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

-- ─── organization_members ───────────────────────────────────────────────────

create policy "View memberships in my organizations"
  on public.organization_members for select
  to authenticated
  using (org_id in (select public.user_org_ids()));

create policy "Admins can add members"
  on public.organization_members for insert
  to authenticated
  with check (public.is_org_admin(org_id));

create policy "Admins can change member roles"
  on public.organization_members for update
  to authenticated
  using (public.is_org_admin(org_id))
  with check (public.is_org_admin(org_id));

create policy "Admins can remove members, members can leave"
  on public.organization_members for delete
  to authenticated
  using (public.is_org_admin(org_id) or user_id = auth.uid());

-- ─── invitations ────────────────────────────────────────────────────────────

create policy "View invitations for my organizations"
  on public.invitations for select
  to authenticated
  using (org_id in (select public.user_org_ids()));

create policy "Admins can invite"
  on public.invitations for insert
  to authenticated
  with check (public.is_org_admin(org_id));

create policy "Admins can update invitations"
  on public.invitations for update
  to authenticated
  using (public.is_org_admin(org_id))
  with check (public.is_org_admin(org_id));

create policy "Admins can revoke invitations"
  on public.invitations for delete
  to authenticated
  using (public.is_org_admin(org_id));

-- ─── leads ──────────────────────────────────────────────────────────────────

create policy "View leads in my organizations"
  on public.leads for select
  to authenticated
  using (org_id in (select public.user_org_ids()));

create policy "Create leads in my organizations"
  on public.leads for insert
  to authenticated
  with check (public.can_write_org(org_id));

create policy "Update leads in my organizations"
  on public.leads for update
  to authenticated
  using (public.can_write_org(org_id))
  with check (public.can_write_org(org_id));

create policy "Delete leads in my organizations"
  on public.leads for delete
  to authenticated
  using (public.can_write_org(org_id));

-- ─── lead_activities ────────────────────────────────────────────────────────

create policy "View activity in my organizations"
  on public.lead_activities for select
  to authenticated
  using (org_id in (select public.user_org_ids()));

create policy "Log activity in my organizations"
  on public.lead_activities for insert
  to authenticated
  with check (public.can_write_org(org_id));

create policy "Delete own activity"
  on public.lead_activities for delete
  to authenticated
  using (user_id = auth.uid() or public.is_org_admin(org_id));

-- ─── meetings ───────────────────────────────────────────────────────────────

create policy "View meetings in my organizations"
  on public.meetings for select
  to authenticated
  using (org_id in (select public.user_org_ids()));

create policy "Create meetings in my organizations"
  on public.meetings for insert
  to authenticated
  with check (public.can_write_org(org_id));

create policy "Update meetings in my organizations"
  on public.meetings for update
  to authenticated
  using (public.can_write_org(org_id))
  with check (public.can_write_org(org_id));

create policy "Delete meetings in my organizations"
  on public.meetings for delete
  to authenticated
  using (public.can_write_org(org_id));

-- ─── scrape_jobs ────────────────────────────────────────────────────────────

create policy "View scrape jobs in my organizations"
  on public.scrape_jobs for select
  to authenticated
  using (org_id in (select public.user_org_ids()));

create policy "Create scrape jobs in my organizations"
  on public.scrape_jobs for insert
  to authenticated
  with check (public.can_write_org(org_id));

create policy "Update scrape jobs in my organizations"
  on public.scrape_jobs for update
  to authenticated
  using (public.can_write_org(org_id))
  with check (public.can_write_org(org_id));

create policy "Delete scrape jobs in my organizations"
  on public.scrape_jobs for delete
  to authenticated
  using (public.can_write_org(org_id));

-- ─── scraped_records ────────────────────────────────────────────────────────

create policy "View scraped records in my organizations"
  on public.scraped_records for select
  to authenticated
  using (org_id in (select public.user_org_ids()));

create policy "Write scraped records in my organizations"
  on public.scraped_records for insert
  to authenticated
  with check (public.can_write_org(org_id));

create policy "Update scraped records in my organizations"
  on public.scraped_records for update
  to authenticated
  using (public.can_write_org(org_id))
  with check (public.can_write_org(org_id));

create policy "Delete scraped records in my organizations"
  on public.scraped_records for delete
  to authenticated
  using (public.can_write_org(org_id));

-- ─── notifications ──────────────────────────────────────────────────────────

create policy "View own notifications"
  on public.notifications for select
  to authenticated
  using (user_id = auth.uid());

create policy "Update own notifications"
  on public.notifications for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Delete own notifications"
  on public.notifications for delete
  to authenticated
  using (user_id = auth.uid());

-- ==== 20260810120300_demo_seed.sql =========================================

-- ============================================================================
-- LeadForge — demo data generator
-- Exposed as an RPC so a freshly created workspace can be populated from the
-- Settings screen instead of shipping fixtures in the client bundle.
-- ============================================================================

create or replace function public.seed_demo_data(target_org uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  inserted integer := 0;
  new_lead_id uuid;
  job_id uuid;
  item record;
  statuses public.lead_status[] := array['New', 'Contacted', 'Qualified', 'Proposal', 'Won', 'Lost'];
  srcs text[] := array['Website', 'LinkedIn', 'Apollo', 'Referral', 'Scraper', 'Cold outreach'];
  companies text[] := array[
    'Northstar Labs', 'Hearth & Field', 'Metric House', 'Civic Thread', 'Brightline Health',
    'Relay Commerce', 'Goodwell Studio', 'Orbit Systems', 'Ritual Goods', 'Anchor Analytics',
    'Lumen Freight', 'Cobalt Robotics', 'Verdant Farms', 'Pivot Legal', 'Sable Interiors',
    'Kindred Fitness', 'Atlas Payments', 'Juniper Media', 'Quartz Security', 'Harbor Dental'
  ];
  firsts text[] := array[
    'Maya', 'Elliot', 'Sofia', 'Darius', 'Leila', 'Noah', 'Avery', 'Marcus', 'Jules', 'Priya',
    'Owen', 'Nadia', 'Theo', 'Imani', 'Caleb', 'Rosa', 'Dev', 'Hana', 'Miles', 'Zoe'
  ];
  lasts text[] := array[
    'Chen', 'Brooks', 'Ramirez', 'Wells', 'Okafor', 'Kim', 'Wilson', 'Grant', 'Martin', 'Shah',
    'Doyle', 'Haddad', 'Novak', 'Barnes', 'Foster', 'Nguyen', 'Patel', 'Sato', 'Rivera', 'Lang'
  ];
  titles text[] := array[
    'VP of Growth', 'Head of Revenue', 'Founder', 'Director of Partnerships', 'CRO',
    'COO', 'Managing Partner', 'VP of Sales', 'Ecommerce Director', 'Head of Marketing'
  ];
  cities text[] := array[
    'San Francisco, CA', 'New York, NY', 'Austin, TX', 'Washington, DC', 'Boston, MA',
    'Chicago, IL', 'Los Angeles, CA', 'Denver, CO', 'Seattle, WA', 'Miami, FL'
  ];
  industries text[] := array['SaaS', 'Healthcare', 'Commerce', 'Fintech', 'AI', 'Logistics', 'Legal', 'Media'];
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_org_admin(target_org) then
    raise exception 'Only workspace admins can load demo data';
  end if;

  -- Idempotent: skip if this workspace already has leads.
  if exists (select 1 from public.leads where org_id = target_org limit 1) then
    return 0;
  end if;

  for i in 0..47 loop
    insert into public.leads (
      org_id, full_name, company, title, email, phone, location, city,
      industry, source, status, score, estimated_value, owner_id, created_by,
      notes, last_contacted_at, created_at
    )
    values (
      target_org,
      firsts[1 + (i % 20)] || ' ' || lasts[1 + ((i * 7) % 20)],
      companies[1 + (i % 20)],
      titles[1 + (i % 10)],
      -- Names and companies both cycle every 20 rows, so the block number keeps
      -- the address unique against leads_org_email_idx across all 48 rows.
      lower(firsts[1 + (i % 20)]) || '.' || lower(lasts[1 + ((i * 7) % 20)]) ||
        case when i >= 20 then ((i / 20) + 1)::text else '' end || '@' ||
        regexp_replace(lower(companies[1 + (i % 20)]), '[^a-z0-9]', '', 'g') || '.com',
      '(' || (200 + (i * 13) % 700)::text || ') 555-' || lpad(((i * 37) % 10000)::text, 4, '0'),
      cities[1 + (i % 10)],
      split_part(cities[1 + (i % 10)], ',', 1),
      industries[1 + (i % 8)],
      srcs[1 + (i % 6)],
      statuses[1 + (i % 6)],
      42 + ((i * 17) % 58),
      case when i % 6 = 5 then 0 else 4000 + ((i * 2300) % 46000) end,
      uid,
      uid,
      'Imported with the demo dataset. Replace with your own notes.',
      case when i % 4 = 0 then null else now() - ((i % 21) || ' days')::interval end,
      now() - ((i % 45) || ' days')::interval - ((i * 37) % 1440 || ' minutes')::interval
    )
    returning id into new_lead_id;

    inserted := inserted + 1;

    if i % 3 = 0 then
      insert into public.lead_activities (org_id, lead_id, user_id, type, title, body, created_at)
      values (
        target_org, new_lead_id, uid,
        (array['note', 'email', 'call']::public.activity_type[])[1 + (i % 3)],
        (array[
          'Left a voicemail and followed up by email',
          'Sent the pricing overview',
          'Discovery call booked for next week'
        ])[1 + (i % 3)],
        'Auto-generated demo activity.',
        now() - ((i % 10) || ' days')::interval
      );
    end if;
  end loop;

  -- A few completed scrape jobs so the scraper page has history.
  for item in
    select * from (values
      ('SaaS founders — Austin', 'Google Maps', 'saas founders', array['Austin, TX'], 128),
      ('Marketing agencies — NYC', 'linkedin', 'marketing agency', array['New York, NY'], 84),
      ('Healthtech — Boston', 'Google Maps', 'healthtech', array['Boston, MA'], 67)
    ) as t(name, provider, query, locations, found)
  loop
    insert into public.scrape_jobs (
      org_id, created_by, name, provider, query, locations, status, progress,
      total_found, total_imported, started_at, completed_at, created_at
    )
    values (
      target_org, uid, item.name, item.provider, item.query, item.locations,
      'completed', 100, item.found, item.found,
      now() - interval '2 days', now() - interval '2 days' + interval '4 minutes',
      now() - interval '2 days'
    )
    returning id into job_id;
  end loop;

  -- Upcoming meetings across the next two weeks.
  for item in
    select l.id, l.full_name, l.company, row_number() over (order by l.score desc) as rn
    from public.leads l
    where l.org_id = target_org and l.status in ('Qualified', 'Proposal')
    limit 5
  loop
    insert into public.meetings (
      org_id, lead_id, created_by, title, description, starts_at, ends_at, meeting_url
    )
    values (
      target_org, item.id, uid,
      'Discovery call — ' || coalesce(item.company, item.full_name),
      'Walk through the current workflow and agree on next steps.',
      date_trunc('hour', now()) + (item.rn * interval '1 day') + interval '10 hours',
      date_trunc('hour', now()) + (item.rn * interval '1 day') + interval '10 hours 30 minutes',
      'https://meet.google.com/demo-' || substr(md5(item.id::text), 1, 8)
    );
  end loop;

  return inserted;
end;
$$;

create or replace function public.reset_demo_data(target_org uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_org_admin(target_org) then
    raise exception 'Only workspace admins can reset data';
  end if;

  delete from public.lead_activities where org_id = target_org;
  delete from public.meetings where org_id = target_org;
  delete from public.scraped_records where org_id = target_org;
  delete from public.scrape_jobs where org_id = target_org;
  delete from public.leads where org_id = target_org;
end;
$$;

-- ==== 20260810120400_fix_demo_seed_email_uniqueness.sql ====================

-- ============================================================================
-- Fix: seed_demo_data generated duplicate lead emails.
--
-- The first name and the company were both selected with `i % 20`, so rows 0,
-- 20, and 40 produced an identical address and the 21st insert tripped
-- leads_org_email_idx. Any expression built purely from `i % 20` repeats every
-- 20 rows, so the local part now also carries the block number.
--
-- 20260810120300 carries the same corrected expression so a fresh database is
-- right on the first run. This migration exists for databases that already
-- applied the original version.
-- ============================================================================

create or replace function public.seed_demo_data(target_org uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  inserted integer := 0;
  new_lead_id uuid;
  job_id uuid;
  item record;
  statuses public.lead_status[] := array['New', 'Contacted', 'Qualified', 'Proposal', 'Won', 'Lost'];
  srcs text[] := array['Website', 'LinkedIn', 'Apollo', 'Referral', 'Scraper', 'Cold outreach'];
  companies text[] := array[
    'Northstar Labs', 'Hearth & Field', 'Metric House', 'Civic Thread', 'Brightline Health',
    'Relay Commerce', 'Goodwell Studio', 'Orbit Systems', 'Ritual Goods', 'Anchor Analytics',
    'Lumen Freight', 'Cobalt Robotics', 'Verdant Farms', 'Pivot Legal', 'Sable Interiors',
    'Kindred Fitness', 'Atlas Payments', 'Juniper Media', 'Quartz Security', 'Harbor Dental'
  ];
  firsts text[] := array[
    'Maya', 'Elliot', 'Sofia', 'Darius', 'Leila', 'Noah', 'Avery', 'Marcus', 'Jules', 'Priya',
    'Owen', 'Nadia', 'Theo', 'Imani', 'Caleb', 'Rosa', 'Dev', 'Hana', 'Miles', 'Zoe'
  ];
  lasts text[] := array[
    'Chen', 'Brooks', 'Ramirez', 'Wells', 'Okafor', 'Kim', 'Wilson', 'Grant', 'Martin', 'Shah',
    'Doyle', 'Haddad', 'Novak', 'Barnes', 'Foster', 'Nguyen', 'Patel', 'Sato', 'Rivera', 'Lang'
  ];
  titles text[] := array[
    'VP of Growth', 'Head of Revenue', 'Founder', 'Director of Partnerships', 'CRO',
    'COO', 'Managing Partner', 'VP of Sales', 'Ecommerce Director', 'Head of Marketing'
  ];
  cities text[] := array[
    'San Francisco, CA', 'New York, NY', 'Austin, TX', 'Washington, DC', 'Boston, MA',
    'Chicago, IL', 'Los Angeles, CA', 'Denver, CO', 'Seattle, WA', 'Miami, FL'
  ];
  industries text[] := array['SaaS', 'Healthcare', 'Commerce', 'Fintech', 'AI', 'Logistics', 'Legal', 'Media'];
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_org_admin(target_org) then
    raise exception 'Only workspace admins can load demo data';
  end if;

  -- Idempotent: skip if this workspace already has leads.
  if exists (select 1 from public.leads where org_id = target_org limit 1) then
    return 0;
  end if;

  for i in 0..47 loop
    insert into public.leads (
      org_id, full_name, company, title, email, phone, location, city,
      industry, source, status, score, estimated_value, owner_id, created_by,
      notes, last_contacted_at, created_at
    )
    values (
      target_org,
      firsts[1 + (i % 20)] || ' ' || lasts[1 + ((i * 7) % 20)],
      companies[1 + (i % 20)],
      titles[1 + (i % 10)],
      lower(firsts[1 + (i % 20)]) || '.' || lower(lasts[1 + ((i * 7) % 20)]) ||
        case when i >= 20 then ((i / 20) + 1)::text else '' end || '@' ||
        regexp_replace(lower(companies[1 + (i % 20)]), '[^a-z0-9]', '', 'g') || '.com',
      '(' || (200 + (i * 13) % 700)::text || ') 555-' || lpad(((i * 37) % 10000)::text, 4, '0'),
      cities[1 + (i % 10)],
      split_part(cities[1 + (i % 10)], ',', 1),
      industries[1 + (i % 8)],
      srcs[1 + (i % 6)],
      statuses[1 + (i % 6)],
      42 + ((i * 17) % 58),
      case when i % 6 = 5 then 0 else 4000 + ((i * 2300) % 46000) end,
      uid,
      uid,
      'Imported with the demo dataset. Replace with your own notes.',
      case when i % 4 = 0 then null else now() - ((i % 21) || ' days')::interval end,
      now() - ((i % 45) || ' days')::interval - ((i * 37) % 1440 || ' minutes')::interval
    )
    returning id into new_lead_id;

    inserted := inserted + 1;

    if i % 3 = 0 then
      insert into public.lead_activities (org_id, lead_id, user_id, type, title, body, created_at)
      values (
        target_org, new_lead_id, uid,
        (array['note', 'email', 'call']::public.activity_type[])[1 + (i % 3)],
        (array[
          'Left a voicemail and followed up by email',
          'Sent the pricing overview',
          'Discovery call booked for next week'
        ])[1 + (i % 3)],
        'Auto-generated demo activity.',
        now() - ((i % 10) || ' days')::interval
      );
    end if;
  end loop;

  -- A few completed scrape jobs so the scraper page has history.
  for item in
    select * from (values
      ('SaaS founders — Austin', 'Google Maps', 'saas founders', array['Austin, TX'], 128),
      ('Marketing agencies — NYC', 'linkedin', 'marketing agency', array['New York, NY'], 84),
      ('Healthtech — Boston', 'Google Maps', 'healthtech', array['Boston, MA'], 67)
    ) as t(name, provider, query, locations, found)
  loop
    insert into public.scrape_jobs (
      org_id, created_by, name, provider, query, locations, status, progress,
      total_found, total_imported, started_at, completed_at, created_at
    )
    values (
      target_org, uid, item.name, item.provider, item.query, item.locations,
      'completed', 100, item.found, item.found,
      now() - interval '2 days', now() - interval '2 days' + interval '4 minutes',
      now() - interval '2 days'
    )
    returning id into job_id;
  end loop;

  -- Upcoming meetings across the next two weeks.
  for item in
    select l.id, l.full_name, l.company, row_number() over (order by l.score desc) as rn
    from public.leads l
    where l.org_id = target_org and l.status in ('Qualified', 'Proposal')
    limit 5
  loop
    insert into public.meetings (
      org_id, lead_id, created_by, title, description, starts_at, ends_at, meeting_url
    )
    values (
      target_org, item.id, uid,
      'Discovery call — ' || coalesce(item.company, item.full_name),
      'Walk through the current workflow and agree on next steps.',
      date_trunc('hour', now()) + (item.rn * interval '1 day') + interval '10 hours',
      date_trunc('hour', now()) + (item.rn * interval '1 day') + interval '10 hours 30 minutes',
      'https://meet.google.com/demo-' || substr(md5(item.id::text), 1, 8)
    );
  end loop;

  return inserted;
end;
$$;


-- ==== 20260827120000_lead_ai_brief.sql ======================================

-- AI-generated sales briefing cached on the lead, so opening it twice does
-- not re-spend Claude/API credits. Regeneration overwrites both columns.

alter table public.leads
  add column ai_brief jsonb,
  add column ai_brief_generated_at timestamptz;
