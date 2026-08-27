-- AI-generated sales briefing cached on the lead, so opening it twice does
-- not re-spend Claude/API credits. Regeneration overwrites both columns.

alter table public.leads
  add column ai_brief jsonb,
  add column ai_brief_generated_at timestamptz;
