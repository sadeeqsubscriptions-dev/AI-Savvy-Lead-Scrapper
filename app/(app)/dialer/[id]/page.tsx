import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { currentBrief } from '@/lib/ai/brief-shape'
import { canWrite, requireSession } from '@/lib/auth'
import { mailboxFor } from '@/lib/outreach/mailbox'
import { leadTimezone } from '@/lib/outreach/schedule'
import { createClient } from '@/lib/supabase/server'
import type { Call } from '@/lib/supabase/types'
import { missingVoiceSettings, voiceConfigured } from '@/lib/voice/twilio'
import { CallWorkspace } from '@/components/dialer/call-workspace'

export const metadata: Metadata = { title: 'Call' }

// Writing a script or an after-call email runs Claude from this page.
export const maxDuration = 300

export default async function CallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await requireSession()
  const supabase = await createClient()

  const { data: lead } = await supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .eq('org_id', session.organization.id)
    .maybeSingle()
  if (!lead) notFound()

  const { data: calls } = await supabase
    .from('calls')
    .select('*')
    .eq('lead_id', lead.id)
    .order('started_at', { ascending: false })
    .limit(5)

  return (
    <CallWorkspace
      lead={{
        id: lead.id,
        full_name: lead.full_name,
        company: lead.company,
        industry: lead.industry,
        phone: lead.phone,
        email: lead.email,
        website: lead.website,
        status: lead.status,
        timeZone: leadTimezone(lead),
      }}
      brief={currentBrief(lead.ai_brief)}
      recentCalls={(calls as Call[] | null) ?? []}
      canWrite={canWrite(session.role)}
      voice={{ configured: voiceConfigured(), missing: missingVoiceSettings() }}
      mailReady={Boolean(await mailboxFor(session.organization.id))}
    />
  )
}
