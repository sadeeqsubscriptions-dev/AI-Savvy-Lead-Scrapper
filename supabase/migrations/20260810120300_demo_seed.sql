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
