-- ============================================================================
-- Per-number choice: ring incoming calls in the app or not
-- Off = calls to the number only go to the assignee's mobile (if set), and
-- the browser never pops the incoming-call card.
-- ============================================================================

alter table public.phone_numbers
  add column if not exists ring_in_app boolean not null default true;
