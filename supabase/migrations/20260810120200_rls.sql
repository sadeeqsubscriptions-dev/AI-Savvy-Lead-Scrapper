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
