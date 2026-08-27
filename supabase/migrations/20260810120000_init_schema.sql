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
