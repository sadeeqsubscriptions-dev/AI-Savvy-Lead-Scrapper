-- ============================================================================
-- Outreach autopilot settings
-- One row per workspace: whether the scheduler emails eligible leads on its
-- own, and what its last run did (shown on the Outreach page).
-- ============================================================================

create table if not exists public.outreach_settings (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  autopilot boolean not null default true,
  last_run_at timestamptz,
  last_run jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.outreach_settings enable row level security;

drop policy if exists "View outreach settings in my organizations" on public.outreach_settings;
create policy "View outreach settings in my organizations"
  on public.outreach_settings for select
  to authenticated
  using (org_id in (select public.user_org_ids()));

drop policy if exists "Admins change outreach settings" on public.outreach_settings;
create policy "Admins change outreach settings"
  on public.outreach_settings for all
  to authenticated
  using (public.is_org_admin(org_id))
  with check (public.is_org_admin(org_id));
