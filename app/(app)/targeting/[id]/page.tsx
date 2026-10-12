import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { currentBrief } from '@/lib/ai/brief-shape'
import { canWrite, requireSession } from '@/lib/auth'
import { ineligibleReason, isDemoLead } from '@/lib/outreach/eligibility'
import { describeSendTime, leadTimezone, nextSendWindow } from '@/lib/outreach/schedule'
import { mailConfigured } from '@/lib/outreach/mailer'
import { createClient } from '@/lib/supabase/server'
import type { Call, OutreachMessage, OutreachThread } from '@/lib/supabase/types'
import type { ActivityItem } from '@/components/leads/activity-log'
import { LeadHub } from '@/components/targeting/lead-hub'

export const metadata: Metadata = { title: 'Lead' }

// Research and email writing both run from this page.
export const maxDuration = 300

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await requireSession()
  const supabase = await createClient()
  const orgId = session.organization.id

  const { data: lead } = await supabase.from('leads').select('*').eq('id', id).eq('org_id', orgId).maybeSingle()
  if (!lead) notFound()

  const [{ data: activities }, { data: thread }, { data: calls }, { data: settings }] = await Promise.all([
    supabase
      .from('lead_activities')
      .select('id, type, title, body, created_at, actor:profiles(full_name, email)')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: false })
      .limit(40),
    supabase
      .from('outreach_threads')
      .select('*, messages:outreach_messages(*)')
      .eq('lead_id', lead.id)
      .eq('org_id', orgId)
      .maybeSingle(),
    supabase
      .from('calls')
      .select('*')
      .eq('lead_id', lead.id)
      .order('started_at', { ascending: false })
      .limit(5),
    supabase.from('outreach_settings').select('autopilot').eq('org_id', orgId).maybeSingle(),
  ])

  const flaggedReason = lead.email ? ineligibleReason(lead) : null
  const zone = leadTimezone(lead)
  const autopilotFrom =
    (settings?.autopilot ?? true) && lead.email && !flaggedReason && !isDemoLead(lead.metadata) && !thread
      ? describeSendTime(nextSendWindow(zone), zone)
      : null

  const outreach = thread as unknown as (OutreachThread & { messages: OutreachMessage[] }) | null

  return (
    <LeadHub
      lead={lead}
      brief={currentBrief(lead.ai_brief)}
      flagged={flaggedReason}
      autopilotFrom={autopilotFrom}
      thread={
        outreach
          ? { ...outreach, messages: [...outreach.messages].sort((a, b) => a.sent_at.localeCompare(b.sent_at)) }
          : null
      }
      calls={(calls as Call[] | null) ?? []}
      activities={(activities as unknown as ActivityItem[] | null) ?? []}
      canWrite={canWrite(session.role)}
      mailReady={mailConfigured()}
    />
  )
}
