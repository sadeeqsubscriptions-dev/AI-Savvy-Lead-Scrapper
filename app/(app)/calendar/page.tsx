import type { Metadata } from 'next'
import { CalendarWorkspace } from '@/components/calendar/calendar-workspace'
import { canWrite, requireSession } from '@/lib/auth'
import { getMeetings, getUpcomingMeetings } from '@/lib/queries'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Calendar' }

/** Accepts `?month=YYYY-MM`, falling back to the current month. */
function resolveMonth(value?: string) {
  if (value) {
    const match = /^(\d{4})-(\d{2})$/.exec(value)
    if (match) {
      const year = Number(match[1])
      const month = Number(match[2]) - 1
      if (year >= 1970 && year <= 2999 && month >= 0 && month <= 11) return { year, month }
    }
  }

  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() }
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const session = await requireSession()
  const { month: monthParam } = await searchParams
  const { year, month } = resolveMonth(monthParam)

  // Pad the range so the leading/trailing days of the six-week grid are covered.
  const rangeStart = new Date(year, month, -7)
  const rangeEnd = new Date(year, month + 1, 14, 23, 59, 59)

  const supabase = await createClient()

  const [meetings, upcoming, { data: leadRows }] = await Promise.all([
    getMeetings(session.organization.id, rangeStart, rangeEnd),
    getUpcomingMeetings(session.organization.id, 5),
    supabase
      .from('leads')
      .select('id, full_name, company')
      .eq('org_id', session.organization.id)
      .order('score', { ascending: false })
      .limit(200),
  ])

  const leads = (leadRows ?? []).map((lead) => ({
    id: lead.id,
    label: lead.company ? `${lead.full_name} — ${lead.company}` : lead.full_name,
  }))

  return (
    <CalendarWorkspace
      meetings={meetings}
      upcoming={upcoming}
      leads={leads}
      year={year}
      month={month}
      canWrite={canWrite(session.role)}
    />
  )
}
