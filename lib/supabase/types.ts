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

export type LeadAiBrief = {
  summary: string
  company_context: string
  talking_points: string[]
  objections: { objection: string; response: string }[]
  closing_strategy: string
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
