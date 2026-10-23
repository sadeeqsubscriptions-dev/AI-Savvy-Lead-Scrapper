import type { Metadata } from 'next'
import { PlanNotice } from '@/components/billing/plan-notice'
import { isAdmin, requirePage } from '@/lib/auth'
import { getAssignableMembers, getLeadsByOwner } from '@/lib/queries'
import { TargetingWorkspace } from '@/components/targeting/targeting-workspace'

export const metadata: Metadata = { title: 'Targeting' }

// A brief involves several web searches before Claude writes the final
// response — well beyond a default serverless timeout. 300s is the max
// Vercel allows on Hobby/Pro with Fluid Compute.
export const maxDuration = 300

export default async function TargetingPage({
  searchParams,
}: {
  searchParams: Promise<{ rep?: string }>
}) {
  const session = await requirePage('targeting')
  const params = await searchParams
  const admin = isAdmin(session.role)

  const members = admin ? await getAssignableMembers(session.organization.id) : []
  const activeRepId = admin && params.rep ? params.rep : session.userId
  const activeMember = members.find((member) => member.id === activeRepId)

  const leads = await getLeadsByOwner(session.organization.id, activeRepId)

  return (
    <>
      <PlanNotice orgId={session.organization.id} feature="ai" needsSetup />
      <TargetingWorkspace
        leads={leads}
        members={admin ? members : []}
        activeRepId={activeRepId}
        activeRepName={
          activeRepId === session.userId
            ? 'You'
            : (activeMember?.name ?? 'Unknown teammate')
        }
      />
    </>
  )
}
