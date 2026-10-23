import type { Metadata } from 'next'
import { TeamWorkspace, type MemberRow } from '@/components/team/team-workspace'
import { isAdmin, requirePage } from '@/lib/auth'
import { getEntitlements } from '@/lib/billing/entitlements'
import { getInvitations, getMembers, getTeamPerformance } from '@/lib/queries'
import { hasAdminCredentials } from '@/lib/supabase/admin'
import { syncNumbers } from '@/lib/voice/numbers'
import type { PhoneNumberRow } from '@/components/team/phone-numbers'

export const metadata: Metadata = { title: 'Team' }

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ number?: string }> }) {
  const session = await requirePage('team')
  const admin = isAdmin(session.role)

  const [members, performance, invitations, entitlements, numbers, params] = await Promise.all([
    getMembers(session.organization.id),
    getTeamPerformance(session.organization.id),
    admin ? getInvitations(session.organization.id) : Promise.resolve([]),
    getEntitlements(session.organization.id),
    hasAdminCredentials() ? syncNumbers(session.organization.id) : Promise.resolve([]),
    searchParams,
  ])

  const numberRows: PhoneNumberRow[] = numbers.map((number) => ({
    id: number.id,
    phoneNumber: number.phone_number,
    name: number.friendly_name,
    assignedTo: number.assigned_to,
    source: number.source,
    monthlyPrice: number.monthly_price_cents / 100,
    sms: number.sms,
    voice: number.voice,
    configured: Boolean(number.configured_at),
    ringInApp: number.ring_in_app,
    problem: number.problem ?? null,
  }))

  const rows: MemberRow[] = members.map((member) => ({
    userId: member.user_id,
    name: member.profile?.full_name ?? member.profile?.email ?? 'Unknown',
    email: member.profile?.email ?? '',
    role: member.role,
    jobTitle: member.profile?.job_title ?? null,
    joinedAt: member.created_at,
    pageAccess: member.page_access,
  }))

  return (
    <TeamWorkspace
      members={rows}
      invitations={invitations}
      performance={performance}
      isAdmin={admin}
      currentUserId={session.userId}
      quota={entitlements.plan.limits.storedLeads}
      numbers={numberRows}
      phone={{
        internal: entitlements.plan.id === 'internal',
        callingIncluded: entitlements.plan.features.calling,
        // Back from Stripe Checkout: the number is bought by the webhook moments later.
        justBought: params.number === 'new',
      }}
    />
  )
}
