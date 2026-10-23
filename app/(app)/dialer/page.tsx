import type { Metadata } from 'next'
import { PlanNotice } from '@/components/billing/plan-notice'
import { redirect } from 'next/navigation'
import { requirePage } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { missingVoiceSettings, voiceConfigured } from '@/lib/voice/twilio'
import { DialerList, type DialerListLead } from '@/components/dialer/dialer-list'

export const metadata: Metadata = { title: 'Dialer' }

export default async function DialerPage({ searchParams }: { searchParams: Promise<{ lead?: string }> }) {
  const { lead } = await searchParams
  // Old links (/dialer?lead=…) go straight to the lead's call page.
  if (lead) redirect(`/dialer/${lead}`)

  const session = await requirePage('dialer')
  const supabase = await createClient()
  const { data } = await supabase
    .from('leads')
    .select('id, full_name, company, phone, industry, score, status, last_contacted_at')
    .eq('org_id', session.organization.id)
    .not('phone', 'is', null)
    .neq('phone', '')
    .order('score', { ascending: false })
    .limit(500)

  return (
    <>
      <PlanNotice orgId={session.organization.id} feature="calling" />
      <DialerList
        leads={(data as DialerListLead[] | null) ?? []}
        voice={{ configured: voiceConfigured(), missing: missingVoiceSettings() }}
      />
    </>
  )
}
