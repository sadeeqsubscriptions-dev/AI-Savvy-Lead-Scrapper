-- ============================================================================
-- Daily sending pace per workspace
-- How many new leads the autopilot emails each weekday, set on the Outreach
-- page. Null = the default (25). Kept between 1 and 100 to protect each
-- workspace's sender reputation.
-- ============================================================================

alter table public.outreach_settings
  add column if not exists daily_new integer check (daily_new between 1 and 100);
