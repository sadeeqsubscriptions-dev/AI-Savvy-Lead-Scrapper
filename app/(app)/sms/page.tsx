import type { Metadata } from 'next'
import { SmsWorkspace, type SmsNumberOption } from '@/components/sms/sms-workspace'
import { canWrite, isAdmin, requirePage } from '@/lib/auth'
import { toE164 } from '@/lib/phone'
import type { SmsMessageWithLead } from '@/lib/sms/shape'
import { createAdminClient, hasAdminCredentials } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { numberFor, syncNumbers, twilioReady } from '@/lib/voice/numbers'

export const metadata: Metadata = { title: 'SMS' }

export default async function SmsPage({
  searchParams,
}: {
  searchParams: Promise<{ number?: string; with?: string; to?: string; lead?: string }>
}) {
  const [params, session] = await Promise.all([searchParams, requirePage('sms')])
  const orgId = session.organization.id
  const supabase = await createClient()

  const [numbers, mine, { data: messages }, { data: memberRows }] = await Promise.all([
    hasAdminCredentials() ? syncNumbers(orgId) : Promise.resolve([]),
    hasAdminCredentials() ? numberFor(orgId, session.userId) : Promise.resolve(null),
    supabase
      .from('sms_messages')
      .select('*, lead:leads(id, full_name, company)')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(1000),
    supabase.from('organization_members').select('user_id, profile:profiles(full_name, email)').eq('org_id', orgId),
  ])

  type MemberName = { user_id: string; profile: { full_name: string | null; email: string } | null }
  const nameOf = new Map<string, string>()
  for (const member of (memberRows ?? []) as unknown as MemberName[]) {
    nameOf.set(member.user_id, member.profile?.full_name ?? member.profile?.email ?? 'Teammate')
  }
  const options: SmsNumberOption[] = numbers
    .filter((number) => number.sms)
    .map((number) => ({
      id: number.id,
      phoneNumber: number.phone_number,
      name: number.friendly_name,
      assignedTo: number.assigned_to,
      assignedName: number.assigned_to ? (nameOf.get(number.assigned_to) ?? null) : null,
    }))

  // "Text" from a lead page: open a conversation with that lead on my number.
  const to = toE164(params.to)
  let lead: { id: string; full_name: string; company: string | null } | null = null
  if (params.lead) {
    const { data } = await supabase.from('leads').select('id, full_name, company').eq('id', params.lead).eq('org_id', orgId).maybeSingle()
    lead = data
  }

  return (
    <SmsWorkspace
      orgId={orgId}
      numbers={options}
      defaultNumberId={mine?.sms ? mine.id : (options[0]?.id ?? null)}
      messages={((messages ?? []) as unknown as SmsMessageWithLead[]).reverse()}
      canWrite={canWrite(session.role)}
      isAdmin={isAdmin(session.role)}
      ready={twilioReady()}
      initial={
        to
          ? { numberId: mine?.sms ? mine.id : (options[0]?.id ?? null), contact: to, lead }
          : params.number && params.with
            ? { numberId: params.number, contact: toE164(params.with), lead: null }
            : null
      }
    />
  )
}
