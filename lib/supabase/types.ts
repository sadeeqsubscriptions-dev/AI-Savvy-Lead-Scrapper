/**
 * Database types for the AI Savvy Leads Scrapper schema.
 *
 * Regenerate after changing a migration:
 *   supabase gen types typescript --project-id jgxumvzginmhckeurxiy > lib/supabase/types.ts
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type MemberRole = 'owner' | 'admin' | 'member' | 'viewer'
export type LeadStatus = 'New' | 'Contacted' | 'Qualified' | 'Proposal' | 'Won' | 'Lost'
export type ActivityType =
  | 'created'
  | 'note'
  | 'email'
  | 'call'
  | 'meeting'
  | 'status_change'
  | 'assigned'
  | 'imported'
export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
export type RecordStatus = 'pending' | 'imported' | 'rejected' | 'duplicate'
export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired'
export type OutreachStatus = 'active' | 'replied' | 'completed' | 'stopped' | 'bounced'
export type OutreachDirection = 'outbound' | 'inbound'

type Timestamps = {
  created_at: string
  updated_at: string
}

export type Organization = Timestamps & {
  id: string
  name: string
  slug: string
  plan: string
  lead_quota: number
  website: string | null
  logo_url: string | null
  created_by: string | null
}

export type Profile = Timestamps & {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  job_title: string | null
  phone: string | null
  timezone: string
  onboarded: boolean
}

export type OrganizationMember = {
  id: string
  org_id: string
  user_id: string
  role: MemberRole
  created_at: string
}

export type Invitation = {
  id: string
  org_id: string
  email: string
  role: MemberRole
  token: string
  status: InvitationStatus
  invited_by: string | null
  expires_at: string
  accepted_at: string | null
  created_at: string
}

export type ScrapeJob = Timestamps & {
  id: string
  org_id: string
  created_by: string | null
  name: string
  provider: string
  query: string
  locations: string[]
  industry: string | null
  min_score: number
  max_results: number
  auto_import: boolean
  status: JobStatus
  progress: number
  total_found: number
  total_imported: number
  error: string | null
  config: Json
  started_at: string | null
  completed_at: string | null
}

/**
 * Claude's short sales script for a lead (v2). Briefs saved before v2 have a
 * different shape; read them through `currentBrief()` in lib/ai/brief.ts.
 */
export type LeadAiBrief = {
  version: 2
  /** Two or three lines on who they are. */
  summary: string
  /** Where to hit them: the problems AI Savvy can solve for this business. */
  pain_points: string[]
  /** The one AI Savvy service to lead with, and how to say it. */
  offer: { service: string; pitch: string }
  /** First line to say on a call. */
  opener: string
  objections: { objection: string; response: string }[]
  sources: { title: string; url: string }[]
  generated_by: string | null
  model: string
}

export type Lead = Timestamps & {
  id: string
  org_id: string
  full_name: string
  company: string | null
  title: string | null
  email: string | null
  phone: string | null
  website: string | null
  location: string | null
  city: string | null
  country: string | null
  industry: string | null
  source: string
  status: LeadStatus
  score: number
  estimated_value: number
  owner_id: string | null
  notes: string | null
  tags: string[]
  scrape_job_id: string | null
  external_id: string | null
  metadata: Json
  last_contacted_at: string | null
  created_by: string | null
  ai_brief: LeadAiBrief | null
  ai_brief_generated_at: string | null
}

export type LeadActivity = {
  id: string
  org_id: string
  lead_id: string | null
  user_id: string | null
  type: ActivityType
  title: string
  body: string | null
  metadata: Json
  created_at: string
}

export type Meeting = Timestamps & {
  id: string
  org_id: string
  lead_id: string | null
  created_by: string | null
  title: string
  description: string | null
  starts_at: string
  ends_at: string
  location: string | null
  meeting_url: string | null
  attendees: string[]
  status: string
}

export type ScrapedRecord = {
  id: string
  org_id: string
  job_id: string
  full_name: string | null
  company: string | null
  title: string | null
  email: string | null
  phone: string | null
  website: string | null
  address: string | null
  city: string | null
  country: string | null
  industry: string | null
  score: number
  source_url: string | null
  raw: Json
  status: RecordStatus
  imported_lead_id: string | null
  created_at: string
}

export type OutreachThread = Timestamps & {
  id: string
  org_id: string
  lead_id: string
  status: OutreachStatus
  subject: string
  to_email: string
  emails_sent: number
  next_followup_at: string | null
  last_sent_at: string | null
  replied_at: string | null
  last_error: string | null
  created_by: string | null
}

export type OutreachMessage = {
  id: string
  org_id: string
  thread_id: string
  direction: OutreachDirection
  step: number | null
  subject: string
  body: string
  message_id: string
  in_reply_to: string | null
  from_email: string
  to_email: string
  sent_at: string
  created_at: string
}

export type CallStatus = 'dialing' | 'in_progress' | 'completed' | 'failed'

export type Call = {
  id: string
  org_id: string
  lead_id: string | null
  user_id: string | null
  to_number: string
  status: CallStatus
  twilio_call_sid: string | null
  started_at: string
  ended_at: string | null
  duration_seconds: number | null
  summary: string | null
  /** Seconds counted against the plan (set once, by the Twilio status webhook). */
  billed_seconds: number | null
  created_at: string
}

export type CallEvent = {
  id: string
  org_id: string
  call_id: string
  kind: 'transcript' | 'suggestion'
  speaker: 'rep' | 'lead' | null
  text: string
  payload: Json
  created_at: string
}

export type OutreachSettings = {
  org_id: string
  autopilot: boolean
  /** New leads emailed per day; null = the default. */
  daily_new: number | null
  last_run_at: string | null
  last_run: Json
  updated_at: string
}

export type PlanId = 'free' | 'starter' | 'growth' | 'pro' | 'internal'

export type OrgBilling = {
  org_id: string
  plan: PlanId
  status: 'active' | 'past_due' | 'canceled'
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  period_start: string
  period_end: string | null
  updated_at: string
}

export type PhoneNumberSource = 'plan' | 'purchased' | 'attached'

/** A Twilio number the workspace owns; optionally one teammate's own line. */
export type PhoneNumber = Timestamps & {
  id: string
  org_id: string
  /** E.164. */
  phone_number: string
  twilio_sid: string | null
  friendly_name: string
  assigned_to: string | null
  source: PhoneNumberSource
  stripe_subscription_id: string | null
  monthly_price_cents: number
  voice: boolean
  sms: boolean
  configured_at: string | null
}

export type SmsDirection = 'inbound' | 'outbound'
export type SmsStatus = 'queued' | 'sent' | 'delivered' | 'failed' | 'received'

export type SmsMessage = {
  id: string
  org_id: string
  phone_number_id: string
  direction: SmsDirection
  /** The other party, E.164. */
  contact_number: string
  body: string
  lead_id: string | null
  user_id: string | null
  twilio_sid: string | null
  status: SmsStatus
  error: string | null
  read_at: string | null
  created_at: string
}

export type OrgUsage = {
  org_id: string
  period_start: string
  leads_found: number
  ai_leads: number
  call_seconds: number
  bonus_leads: number
  bonus_ai_leads: number
  bonus_call_seconds: number
}

export type MailAccount = {
  org_id: string
  email: string
  provider: string
  smtp_host: string
  smtp_port: number
  imap_host: string
  imap_port: number
  password_encrypted: string
  sender_name: string | null
  sender_title: string | null
  postal_address: string | null
  verified_at: string | null
  updated_at: string
}

export type SalesProfile = {
  org_id: string
  company_name: string
  website: string | null
  description: string
  services: string
  booking_url: string | null
  sender_name: string | null
  sender_title: string | null
  postal_address: string | null
  updated_at: string
}

export type Notification = {
  id: string
  org_id: string
  user_id: string
  title: string
  body: string | null
  href: string | null
  read_at: string | null
  created_at: string
}

export type DashboardMetrics = {
  total_leads: number
  new_leads: number
  qualified_leads: number
  won_leads: number
  lost_leads: number
  leads_this_week: number
  leads_prev_week: number
  pipeline_value: number
  won_value: number
  avg_score: number
  needs_attention: number
}

export type LeadTrendPoint = { day: string; created: number; won: number }

export type TeamPerformanceRow = {
  user_id: string
  full_name: string | null
  email: string
  role: MemberRole
  total_leads: number
  won_leads: number
  pipeline_value: number
  conversion: number
}

export type SearchResult = {
  kind: 'lead' | 'meeting' | 'job'
  id: string
  title: string
  subtitle: string | null
  href: string
}

type Table<Row, Insert, Update> = {
  Row: Row
  Insert: Insert
  Update: Update
  Relationships: []
}

type Defaulted<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

export type Database = {
  public: {
    Tables: {
      organizations: Table<
        Organization,
        Defaulted<Organization, 'id' | 'slug' | 'plan' | 'lead_quota' | 'website' | 'logo_url' | 'created_by' | 'created_at' | 'updated_at'>,
        Partial<Organization>
      >
      profiles: Table<
        Profile,
        Defaulted<Profile, 'full_name' | 'avatar_url' | 'job_title' | 'phone' | 'timezone' | 'onboarded' | 'created_at' | 'updated_at'>,
        Partial<Profile>
      >
      organization_members: Table<
        OrganizationMember,
        Defaulted<OrganizationMember, 'id' | 'role' | 'created_at'>,
        Partial<OrganizationMember>
      >
      invitations: Table<
        Invitation,
        Defaulted<Invitation, 'id' | 'role' | 'token' | 'status' | 'invited_by' | 'expires_at' | 'accepted_at' | 'created_at'>,
        Partial<Invitation>
      >
      scrape_jobs: Table<
        ScrapeJob,
        Defaulted<
          ScrapeJob,
          | 'id' | 'created_by' | 'provider' | 'locations' | 'industry' | 'min_score' | 'max_results'
          | 'auto_import' | 'status' | 'progress' | 'total_found' | 'total_imported' | 'error'
          | 'config' | 'started_at' | 'completed_at' | 'created_at' | 'updated_at'
        >,
        Partial<ScrapeJob>
      >
      leads: Table<
        Lead,
        Defaulted<
          Lead,
          | 'id' | 'company' | 'title' | 'email' | 'phone' | 'website' | 'location' | 'city'
          | 'country' | 'industry' | 'source' | 'status' | 'score' | 'estimated_value'
          | 'owner_id' | 'notes' | 'tags' | 'scrape_job_id' | 'external_id' | 'metadata'
          | 'last_contacted_at' | 'created_by' | 'created_at' | 'updated_at'
          | 'ai_brief' | 'ai_brief_generated_at'
        >,
        Partial<Lead>
      >
      lead_activities: Table<
        LeadActivity,
        Defaulted<LeadActivity, 'id' | 'lead_id' | 'user_id' | 'type' | 'body' | 'metadata' | 'created_at'>,
        Partial<LeadActivity>
      >
      meetings: Table<
        Meeting,
        Defaulted<
          Meeting,
          | 'id' | 'lead_id' | 'created_by' | 'description' | 'location' | 'meeting_url'
          | 'attendees' | 'status' | 'created_at' | 'updated_at'
        >,
        Partial<Meeting>
      >
      scraped_records: Table<
        ScrapedRecord,
        Defaulted<
          ScrapedRecord,
          | 'id' | 'full_name' | 'company' | 'title' | 'email' | 'phone' | 'website' | 'address'
          | 'city' | 'country' | 'industry' | 'score' | 'source_url' | 'raw' | 'status'
          | 'imported_lead_id' | 'created_at'
        >,
        Partial<ScrapedRecord>
      >
      outreach_threads: Table<
        OutreachThread,
        Defaulted<
          OutreachThread,
          | 'id' | 'status' | 'subject' | 'emails_sent' | 'next_followup_at' | 'last_sent_at'
          | 'replied_at' | 'last_error' | 'created_by' | 'created_at' | 'updated_at'
        >,
        Partial<OutreachThread>
      >
      outreach_messages: Table<
        OutreachMessage,
        Defaulted<OutreachMessage, 'id' | 'step' | 'subject' | 'body' | 'in_reply_to' | 'sent_at' | 'created_at'>,
        Partial<OutreachMessage>
      >
      calls: Table<
        Call,
        Defaulted<
          Call,
          | 'id' | 'lead_id' | 'user_id' | 'status' | 'twilio_call_sid' | 'started_at'
          | 'ended_at' | 'duration_seconds' | 'summary' | 'billed_seconds' | 'created_at'
        >,
        Partial<Call>
      >
      call_events: Table<
        CallEvent,
        Defaulted<CallEvent, 'id' | 'speaker' | 'payload' | 'created_at'>,
        Partial<CallEvent>
      >
      outreach_settings: Table<
        OutreachSettings,
        Defaulted<OutreachSettings, 'autopilot' | 'daily_new' | 'last_run_at' | 'last_run' | 'updated_at'>,
        Partial<OutreachSettings>
      >
      org_billing: Table<OrgBilling, Defaulted<OrgBilling, 'plan' | 'status' | 'stripe_customer_id' | 'stripe_subscription_id' | 'period_start' | 'period_end' | 'updated_at'>, Partial<OrgBilling>>
      phone_numbers: Table<
        PhoneNumber,
        Defaulted<
          PhoneNumber,
          | 'id' | 'twilio_sid' | 'friendly_name' | 'assigned_to' | 'source' | 'stripe_subscription_id'
          | 'monthly_price_cents' | 'voice' | 'sms' | 'configured_at' | 'created_at' | 'updated_at'
        >,
        Partial<PhoneNumber>
      >
      sms_messages: Table<
        SmsMessage,
        Defaulted<SmsMessage, 'id' | 'lead_id' | 'user_id' | 'twilio_sid' | 'status' | 'error' | 'read_at' | 'created_at'>,
        Partial<SmsMessage>
      >
      org_usage: Table<OrgUsage, Defaulted<OrgUsage, 'leads_found' | 'ai_leads' | 'call_seconds' | 'bonus_leads' | 'bonus_ai_leads' | 'bonus_call_seconds'>, Partial<OrgUsage>>
      mail_accounts: Table<MailAccount, Defaulted<MailAccount, 'provider' | 'smtp_port' | 'imap_port' | 'sender_name' | 'sender_title' | 'postal_address' | 'verified_at' | 'updated_at'>, Partial<MailAccount>>
      sales_profiles: Table<SalesProfile, Defaulted<SalesProfile, 'website' | 'description' | 'services' | 'booking_url' | 'sender_name' | 'sender_title' | 'postal_address' | 'updated_at'>, Partial<SalesProfile>>
      billing_events: Table<{ id: string; type: string; created_at: string }, { id: string; type: string; created_at?: string }, Partial<{ id: string; type: string }>>
      notifications: Table<
        Notification,
        Defaulted<Notification, 'id' | 'body' | 'href' | 'read_at' | 'created_at'>,
        Partial<Notification>
      >
    }
    Views: Record<never, never>
    Functions: {
      create_organization: { Args: { org_name: string }; Returns: Organization }
      current_org_id: { Args: Record<string, never>; Returns: string | null }
      dashboard_metrics: { Args: { target_org: string }; Returns: DashboardMetrics }
      lead_trend: { Args: { target_org: string; days?: number }; Returns: LeadTrendPoint[] }
      team_performance: { Args: { target_org: string }; Returns: TeamPerformanceRow[] }
      import_scraped_records: { Args: { target_job: string; record_ids?: string[] }; Returns: number }
      accept_invitation: { Args: { invite_token: string }; Returns: string }
      search_org: { Args: { target_org: string; term: string; max_results?: number }; Returns: SearchResult[] }
      seed_demo_data: { Args: { target_org: string }; Returns: number }
      consume_usage: {
        Args: { target_org: string; period: string; kind: string; amount: number; cap: number; partial?: boolean }
        Returns: number
      }
      add_usage_bonus: { Args: { target_org: string; period: string; kind: string; amount: number }; Returns: void }
      reset_demo_data: { Args: { target_org: string }; Returns: void }
      is_org_member: { Args: { target_org: string }; Returns: boolean }
      is_org_admin: { Args: { target_org: string }; Returns: boolean }
    }
    Enums: {
      member_role: MemberRole
      lead_status: LeadStatus
      activity_type: ActivityType
      job_status: JobStatus
      record_status: RecordStatus
      invitation_status: InvitationStatus
    }
    CompositeTypes: Record<never, never>
  }
}
