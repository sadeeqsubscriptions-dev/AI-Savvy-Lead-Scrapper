-- ============================================================================
-- Per-person page access
-- Which pages a member or viewer can open, chosen by an admin on the Team
-- page. Null = the default set for non-admins (see lib/access.ts). Owners and
-- admins always see everything. Admins may already update membership rows
-- (RLS "Admins can change roles"), so no new policy is needed.
-- ============================================================================

alter table public.organization_members
  add column if not exists page_access text[];
