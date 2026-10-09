import type { Metadata } from 'next'
import { canWrite, requireSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { ActivityItem } from '@/components/leads/activity-log'
import { StatusWorkspace, type StatusRow } from '@/components/status/status-workspace'

export const metadata: Metadata = { title: 'Status' }

/**
 * Every lead that has been worked — emailed, called, or moved past "New" —
 * with where it stands and what happened last.
 */
export default async function StatusPage() {
  const session = await requireSession()
  const supabase = await createClient()
  const orgId = session.organization.id

  const [{ data: threads }, { data: calls }, { data: moved }] = await Promise.all([
    supabase
      .from('outreach_threads')
      .select('lead_id, status, emails_sent, last_sent_at, replied_at, next_followup_at')
      .eq('org_id', orgId),
    supabase
      .from('calls')
      .select('lead_id, started_at, status')
      .eq('org_id', orgId)
      .order('started_at', { ascending: false })
      .limit(1000),
    supabase.from('leads').select('id').eq('org_id', orgId).neq('status', 'New').limit(1000),
  ])

  const ids = new Set<string>()
  for (const thread of threads ?? []) ids.add(thread.lead_id)
  for (const call of calls ?? []) if (call.lead_id) ids.add(call.lead_id)
  for (const lead of moved ?? []) ids.add(lead.id)
  const leadIds = [...ids]

  // Ids travel in the request URL, so look them up in batches.
  const batches: string[][] = []
  for (let start = 0; start < leadIds.length; start += 150) batches.push(leadIds.slice(start, start + 150))

  const results = await Promise.all(
    batches.map((batch) =>
      Promise.all([
        supabase
          .from('leads')
          .select('id, full_name, company, email, phone, status, last_contacted_at')
          .in('id', batch)
          .eq('org_id', orgId),
        supabase
          .from('lead_activities')
          .select('id, lead_id, type, title, body, created_at, actor:profiles(full_name, email)')
          .in('lead_id', batch)
          .order('created_at', { ascending: false })
          .limit(1500),
      ]),
    ),
  )
  const leads = results.flatMap(([{ data }]) => data ?? [])
  const activities = results
    .flatMap(([, { data }]) => (data as unknown as (ActivityItem & { lead_id: string })[] | null) ?? [])
    .sort((a, b) => b.created_at.localeCompare(a.created_at))

  const threadByLead = new Map((threads ?? []).map((thread) => [thread.lead_id, thread]))
  const callsByLead = new Map<string, number>()
  for (const call of calls ?? []) if (call.lead_id) callsByLead.set(call.lead_id, (callsByLead.get(call.lead_id) ?? 0) + 1)

  const activityByLead = new Map<string, ActivityItem[]>()
  for (const row of activities) {
    const list = activityByLead.get(row.lead_id) ?? []
    if (list.length < 15) list.push(row)
    activityByLead.set(row.lead_id, list)
  }

  const rows: StatusRow[] = leads.map((lead) => {
    const thread = threadByLead.get(lead.id)
    return {
      ...lead,
      email_status: thread?.status ?? null,
      emails_sent: thread?.emails_sent ?? 0,
      replied_at: thread?.replied_at ?? null,
      next_followup_at: thread?.status === 'active' ? (thread.next_followup_at ?? null) : null,
      calls: callsByLead.get(lead.id) ?? 0,
      activities: activityByLead.get(lead.id) ?? [],
    }
  })

  // Most recent movement first.
  rows.sort((a, b) => {
    const at = (row: StatusRow) => row.activities[0]?.created_at ?? row.last_contacted_at ?? ''
    return at(b).localeCompare(at(a))
  })

  return <StatusWorkspace rows={rows} canWrite={canWrite(session.role)} />
}
