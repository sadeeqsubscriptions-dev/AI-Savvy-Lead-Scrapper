-- ============================================================================
-- Cold email outreach
-- One thread per lead (initial email + follow-ups), and every message sent or
-- received on it. Replies are matched back from the IMAP inbox by Message-ID.
-- ============================================================================

create type public.outreach_status as enum (
  'active',     -- in the sequence, follow-ups still scheduled
  'replied',    -- lead answered; follow-ups stopped
  'completed',  -- every step sent, no reply
  'stopped',    -- a rep stopped it by hand
  'bounced'     -- the mail server rejected the address
);

create type public.outreach_direction as enum ('outbound', 'inbound');

create table public.outreach_threads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  lead_id uuid not null references public.leads (id) on delete cascade,
  status public.outreach_status not null default 'active',
  subject text not null default '',
  to_email text not null,
  emails_sent integer not null default 0 check (emails_sent >= 0),
  next_followup_at timestamptz,
  last_sent_at timestamptz,
  replied_at timestamptz,
  last_error text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One sequence per lead: a double click can never email someone twice.
  unique (org_id, lead_id)
);

create index outreach_threads_org_status_idx on public.outreach_threads (org_id, status);
create index outreach_threads_due_idx
  on public.outreach_threads (next_followup_at)
  where status = 'active' and next_followup_at is not null;

create trigger outreach_threads_updated_at before update on public.outreach_threads
  for each row execute function public.set_updated_at();

create table public.outreach_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  thread_id uuid not null references public.outreach_threads (id) on delete cascade,
  direction public.outreach_direction not null,
  -- 0 = first email, 1.. = follow-ups. Null for inbound replies.
  step integer check (step is null or step >= 0),
  subject text not null default '',
  body text not null default '',
  message_id text not null,
  in_reply_to text,
  from_email text not null,
  to_email text not null,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  -- Inbox sync re-reads the same mail; this keeps each reply stored once.
  unique (org_id, message_id)
);

create index outreach_messages_thread_idx on public.outreach_messages (thread_id, sent_at);
create index outreach_messages_sent_idx on public.outreach_messages (sent_at desc) where direction = 'outbound';

-- ─── RLS ────────────────────────────────────────────────────────────────────

alter table public.outreach_threads enable row level security;
alter table public.outreach_messages enable row level security;

create policy "View outreach in my organizations"
  on public.outreach_threads for select
  to authenticated
  using (org_id in (select public.user_org_ids()));

create policy "Start outreach in my organizations"
  on public.outreach_threads for insert
  to authenticated
  with check (public.can_write_org(org_id));

create policy "Update outreach in my organizations"
  on public.outreach_threads for update
  to authenticated
  using (public.can_write_org(org_id))
  with check (public.can_write_org(org_id));

create policy "Delete outreach in my organizations"
  on public.outreach_threads for delete
  to authenticated
  using (public.can_write_org(org_id));

create policy "View outreach messages in my organizations"
  on public.outreach_messages for select
  to authenticated
  using (org_id in (select public.user_org_ids()));

create policy "Record outreach messages in my organizations"
  on public.outreach_messages for insert
  to authenticated
  with check (public.can_write_org(org_id));
