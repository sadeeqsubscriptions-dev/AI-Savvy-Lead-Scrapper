import { createClient } from '@/lib/supabase/server'
import { PAGE_SIZE } from '@/lib/constants'
import type {
  DashboardMetrics,
  Lead,
  LeadActivity,
  LeadStatus,
  LeadTrendPoint,
  Meeting,
  Profile,
  ScrapeJob,
  ScrapedRecord,
  TeamPerformanceRow,
} from '@/lib/supabase/types'

/** A profile stub joined onto owned records. */
type OwnerRef = Pick<Profile, 'id' | 'full_name' | 'email' | 'avatar_url'> | null

export type LeadWithOwner = Lead & { owner: OwnerRef }
export type ActivityWithActor = LeadActivity & {
  actor: OwnerRef
  lead: Pick<Lead, 'id' | 'full_name' | 'company'> | null
}
export type MeetingWithLead = Meeting & {
  lead: Pick<Lead, 'id' | 'full_name' | 'company' | 'email'> | null
}

const OWNER_SELECT = 'owner:profiles!leads_owner_id_fkey(id, full_name, email, avatar_url)'

// ─── Dashboard ──────────────────────────────────────────────────────────────

export async function getDashboardMetrics(orgId: string): Promise<DashboardMetrics> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('dashboard_metrics', { target_org: orgId })

  if (error || !data) {
    return {
      total_leads: 0,
      new_leads: 0,
      qualified_leads: 0,
      won_leads: 0,
      lost_leads: 0,
      leads_this_week: 0,
      leads_prev_week: 0,
      pipeline_value: 0,
      won_value: 0,
      avg_score: 0,
      needs_attention: 0,
    }
  }

  return data as DashboardMetrics
}

export async function getLeadTrend(orgId: string, days = 30): Promise<LeadTrendPoint[]> {
  const supabase = await createClient()
  const { data } = await supabase.rpc('lead_trend', { target_org: orgId, days })
  return (data as LeadTrendPoint[] | null) ?? []
}

export async function getTeamPerformance(orgId: string): Promise<TeamPerformanceRow[]> {
  const supabase = await createClient()
  const { data } = await supabase.rpc('team_performance', { target_org: orgId })
  return (data as TeamPerformanceRow[] | null) ?? []
}

export async function getRecentActivity(orgId: string, limit = 8): Promise<ActivityWithActor[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('lead_activities')
    .select(
      'id, org_id, lead_id, user_id, type, title, body, metadata, created_at, actor:profiles(id, full_name, email, avatar_url), lead:leads(id, full_name, company)',
    )
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(limit)

  return (data as unknown as ActivityWithActor[] | null) ?? []
}

// ─── Leads ──────────────────────────────────────────────────────────────────

export type LeadFilters = {
  query?: string
  status?: string
  source?: string
  owner?: string
  sort?: string
  page?: number
}

export async function getLeads(orgId: string, filters: LeadFilters = {}) {
  const supabase = await createClient()
  const page = Math.max(1, filters.page ?? 1)
  const from = (page - 1) * PAGE_SIZE

  let request = supabase
    .from('leads')
    .select(`*, ${OWNER_SELECT}`, { count: 'exact' })
    .eq('org_id', orgId)

  if (filters.query && filters.query.trim().length > 0) {
    const term = filters.query.trim().replace(/[%,()]/g, '')
    request = request.or(
      `full_name.ilike.%${term}%,company.ilike.%${term}%,email.ilike.%${term}%,title.ilike.%${term}%`,
    )
  }

  if (filters.status && filters.status !== 'all') {
    request = request.eq('status', filters.status as LeadStatus)
  }

  if (filters.source && filters.source !== 'all') {
    request = request.eq('source', filters.source)
  }

  if (filters.owner && filters.owner !== 'all') {
    request = filters.owner === 'unassigned'
      ? request.is('owner_id', null)
      : request.eq('owner_id', filters.owner)
  }

  const sorts: Record<string, { column: string; ascending: boolean }> = {
    newest: { column: 'created_at', ascending: false },
    oldest: { column: 'created_at', ascending: true },
    score: { column: 'score', ascending: false },
    value: { column: 'estimated_value', ascending: false },
    name: { column: 'full_name', ascending: true },
  }
  const sort = sorts[filters.sort ?? 'newest'] ?? sorts.newest

  const { data, count, error } = await request
    .order(sort.column, { ascending: sort.ascending })
    .range(from, from + PAGE_SIZE - 1)

  if (error) throw new Error(error.message)

  return {
    leads: (data as unknown as LeadWithOwner[]) ?? [],
    total: count ?? 0,
    page,
    pageCount: Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE)),
  }
}

/** Board view needs every open lead grouped by column, not a single page. */
export async function getLeadsForBoard(orgId: string, filters: LeadFilters = {}) {
  const supabase = await createClient()

  let request = supabase.from('leads').select(`*, ${OWNER_SELECT}`).eq('org_id', orgId)

  if (filters.query && filters.query.trim().length > 0) {
    const term = filters.query.trim().replace(/[%,()]/g, '')
    request = request.or(`full_name.ilike.%${term}%,company.ilike.%${term}%,email.ilike.%${term}%`)
  }
  if (filters.source && filters.source !== 'all') request = request.eq('source', filters.source)
  if (filters.owner && filters.owner !== 'all' && filters.owner !== 'unassigned') {
    request = request.eq('owner_id', filters.owner)
  }

  const { data } = await request.order('score', { ascending: false }).limit(300)
  return (data as unknown as LeadWithOwner[]) ?? []
}

export async function getLead(orgId: string, leadId: string) {
  const supabase = await createClient()

  const [{ data: lead }, { data: activities }] = await Promise.all([
    supabase
      .from('leads')
      .select(`*, ${OWNER_SELECT}`)
      .eq('org_id', orgId)
      .eq('id', leadId)
      .maybeSingle(),
    supabase
      .from('lead_activities')
      .select('*, actor:profiles(id, full_name, email, avatar_url)')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(40),
  ])

  if (!lead) return null

  return {
    lead: lead as unknown as LeadWithOwner,
    activities: (activities as unknown as ActivityWithActor[]) ?? [],
  }
}

/** A rep's assigned pipeline for the Targeting workspace, best leads first. */
export async function getLeadsByOwner(orgId: string, ownerId: string, limit = 100) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('leads')
    .select(`*, ${OWNER_SELECT}`)
    .eq('org_id', orgId)
    .eq('owner_id', ownerId)
    .not('status', 'in', '("Won","Lost")')
    .order('score', { ascending: false })
    .limit(limit)

  return (data as unknown as LeadWithOwner[]) ?? []
}

export async function getLeadStatusCounts(orgId: string) {
  const supabase = await createClient()
  const { data } = await supabase.from('leads').select('status').eq('org_id', orgId).limit(5000)

  const counts: Record<string, number> = {}
  for (const row of data ?? []) {
    counts[row.status] = (counts[row.status] ?? 0) + 1
  }
  return counts
}

// ─── Team ───────────────────────────────────────────────────────────────────

export async function getMembers(orgId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('organization_members')
    .select('id, role, created_at, user_id, profile:profiles(id, full_name, email, avatar_url, job_title)')
    .eq('org_id', orgId)
    .order('created_at')

  return (
    (data as unknown as {
      id: string
      role: import('@/lib/supabase/types').MemberRole
      created_at: string
      user_id: string
      profile: Pick<Profile, 'id' | 'full_name' | 'email' | 'avatar_url' | 'job_title'> | null
    }[]) ?? []
  )
}

export async function getInvitations(orgId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('invitations')
    .select('*')
    .eq('org_id', orgId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  return data ?? []
}

/** Lightweight owner list for assignment dropdowns. */
export async function getAssignableMembers(orgId: string) {
  const members = await getMembers(orgId)
  return members
    .filter((member) => member.profile)
    .map((member) => ({
      id: member.user_id,
      name: member.profile!.full_name ?? member.profile!.email,
    }))
}

// ─── Meetings ───────────────────────────────────────────────────────────────

export async function getMeetings(orgId: string, rangeStart: Date, rangeEnd: Date) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('meetings')
    .select('*, lead:leads(id, full_name, company, email)')
    .eq('org_id', orgId)
    .gte('starts_at', rangeStart.toISOString())
    .lte('starts_at', rangeEnd.toISOString())
    .order('starts_at')

  return (data as unknown as MeetingWithLead[]) ?? []
}

export async function getUpcomingMeetings(orgId: string, limit = 5) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('meetings')
    .select('*, lead:leads(id, full_name, company, email)')
    .eq('org_id', orgId)
    .gte('starts_at', new Date().toISOString())
    .order('starts_at')
    .limit(limit)

  return (data as unknown as MeetingWithLead[]) ?? []
}

// ─── Scraper ────────────────────────────────────────────────────────────────

export async function getScrapeJobs(orgId: string, limit = 20): Promise<ScrapeJob[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('scrape_jobs')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(limit)

  return data ?? []
}

export async function getScrapeJob(orgId: string, jobId: string) {
  const supabase = await createClient()

  const [{ data: job }, { data: records }] = await Promise.all([
    supabase.from('scrape_jobs').select('*').eq('org_id', orgId).eq('id', jobId).maybeSingle(),
    supabase
      .from('scraped_records')
      .select('*')
      .eq('job_id', jobId)
      .order('score', { ascending: false })
      .limit(200),
  ])

  if (!job) return null
  return { job, records: (records as ScrapedRecord[]) ?? [] }
}

export async function getPendingRecordCount(orgId: string) {
  const supabase = await createClient()
  const { count } = await supabase
    .from('scraped_records')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('status', 'pending')

  return count ?? 0
}
