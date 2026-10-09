import type { Metadata } from 'next'
import { currentBrief } from '@/lib/ai/brief-shape'
import { canWrite, requireSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { Call } from '@/lib/supabase/types'
import { missingVoiceSettings, voiceConfigured } from '@/lib/voice/twilio'
import { DialerWorkspace, type DialerLead } from '@/components/dialer/dialer-workspace'

export const metadata: Metadata = { title: 'Dialer' }

// Writing a brief from here runs web research before Claude answers.
export const maxDuration = 300

export default async function DialerPage({ searchParams }: { searchParams: Promise<{ lead?: string }> }) {
  const session = await requireSession()
  const { lead: leadId } = await searchParams
  const supabase = await createClient()
  const orgId = session.organization.id

  const [{ data: withPhones }, { data: lead }, { data: calls }] = await Promise.all([
    supabase
      .from('leads')
      .select('id, full_name, company, phone, industry, score, status')
      .eq('org_id', orgId)
      .not('phone', 'is', null)
      .neq('phone', '')
      .order('score', { ascending: false })
      .limit(300),
    leadId
      ? supabase.from('leads').select('*').eq('id', leadId).eq('org_id', orgId).maybeSingle()
      : Promise.resolve({ data: null }),
    leadId
      ? supabase
          .from('calls')
          .select('*')
          .eq('lead_id', leadId)
          .eq('org_id', orgId)
          .order('started_at', { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [] as Call[] }),
  ])

  const selected: DialerLead | null = lead
    ? {
        id: lead.id,
        full_name: lead.full_name,
        company: lead.company,
        industry: lead.industry,
        phone: lead.phone,
        website: lead.website,
        email: lead.email,
        brief: currentBrief(lead.ai_brief),
      }
    : null

  return (
    <DialerWorkspace
      // A fresh dialer per lead: number, transcript and coach start empty.
      key={selected?.id ?? 'picker'}
      leads={withPhones ?? []}
      lead={selected}
      recentCalls={(calls as Call[] | null) ?? []}
      canCall={canWrite(session.role)}
      voice={{ configured: voiceConfigured(), missing: missingVoiceSettings() }}
    />
  )
}
