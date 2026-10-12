-- ============================================================================
-- Outreach autopilot setup — run once in the Supabase SQL Editor.
--
-- 1. Creates the autopilot settings table (on/off switch + last run).
-- 2. Schedules a call to the site every 15 minutes. Each run: reads replies,
--    sends due follow-ups, and emails new leads that are in business hours
--    (weekdays 9-4 in their own time zone, up to 25 new leads a day).
--
-- BEFORE RUNNING: replace PASTE_YOUR_CRON_SECRET_HERE (near the bottom) with
-- the exact value of CRON_SECRET from Vercel. Safe to run again any time.
-- ============================================================================

-- ─── 1. Settings table ──────────────────────────────────────────────────────

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

-- ─── 2. Every-15-minutes scheduler ──────────────────────────────────────────

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Replace an earlier version of the job, if any.
select cron.unschedule(jobid) from cron.job where jobname = 'ai-savvy-outreach';

select cron.schedule(
  'ai-savvy-outreach',
  '*/15 * * * *',
  $$
  select net.http_get(
    url := 'https://ai-savvy-lead-scrapper.vercel.app/api/outreach/cron',
    headers := jsonb_build_object('Authorization', 'Bearer PASTE_YOUR_CRON_SECRET_HERE'),
    timeout_milliseconds := 30000
  );
  $$
);

-- Check it is there:
--   select jobname, schedule, active from cron.job;
-- See the last calls (202 = started fine, 401 = wrong secret):
--   select status_code, created from net._http_response order by created desc limit 10;
-- The Outreach page also shows "Autopilot on · last run N minutes ago".
