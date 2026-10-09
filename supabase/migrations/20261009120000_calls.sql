-- ============================================================================
-- Browser dialer
-- One row per call placed from the site, plus a live event stream for it:
-- transcript lines (from Twilio real-time transcription) and Claude's
-- suggestions. The dialer page subscribes to call_events over Realtime.
-- ============================================================================

create table public.calls (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete set null,
  user_id uuid references public.profiles (id) on delete set null,
  to_number text not null,
  status text not null default 'dialing'
    check (status in ('dialing', 'in_progress', 'completed', 'failed')),
  twilio_call_sid text unique,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  summary text,
  created_at timestamptz not null default now()
);

create index calls_org_started_idx on public.calls (org_id, started_at desc);
create index calls_lead_idx on public.calls (lead_id, started_at desc);

create table public.call_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  call_id uuid not null references public.calls (id) on delete cascade,
  kind text not null check (kind in ('transcript', 'suggestion')),
  -- 'rep' or 'lead' for transcript lines; null for suggestions.
  speaker text check (speaker is null or speaker in ('rep', 'lead')),
  text text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index call_events_call_idx on public.call_events (call_id, created_at);

alter table public.calls enable row level security;
alter table public.call_events enable row level security;

create policy "View calls in my organizations"
  on public.calls for select
  to authenticated
  using (org_id in (select public.user_org_ids()));

create policy "Place calls in my organizations"
  on public.calls for insert
  to authenticated
  with check (public.can_write_org(org_id) and user_id = auth.uid());

create policy "Update calls in my organizations"
  on public.calls for update
  to authenticated
  using (public.can_write_org(org_id))
  with check (public.can_write_org(org_id));

create policy "View call events in my organizations"
  on public.call_events for select
  to authenticated
  using (org_id in (select public.user_org_ids()));

create policy "Record call events in my organizations"
  on public.call_events for insert
  to authenticated
  with check (public.can_write_org(org_id));

-- Stream new transcript lines and suggestions to the open dialer.
alter publication supabase_realtime add table public.call_events;
