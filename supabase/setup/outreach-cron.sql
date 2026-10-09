-- ============================================================================
-- Outreach scheduler: calls the site every 15 minutes so queued emails go out
-- through the US business day (the app itself decides who is in business
-- hours, enforces the daily target, and skips weekends and holidays).
--
-- Not a migration: it contains your secret. Run it once in the Supabase SQL
-- Editor after replacing PASTE_YOUR_CRON_SECRET_HERE with the exact value of
-- CRON_SECRET from Vercel. Run it again any time to update the job.
-- ============================================================================

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
-- See the last runs (status 202 = started fine, 401 = wrong secret):
--   select status_code, created from net._http_response order by created desc limit 10;
