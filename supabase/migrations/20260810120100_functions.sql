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
