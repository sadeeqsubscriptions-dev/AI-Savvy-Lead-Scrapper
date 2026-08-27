import type { Metadata } from 'next'
import { isAdmin, requireSession } from '@/lib/auth'
import { getAssignableMembers, getLeadsByOwner } from '@/lib/queries'
import { TargetingWorkspace } from '@/components/targeting/targeting-workspace'

export const metadata: Metadata = { title: 'Targeting' }

// A brief involves several web searches before Claude writes the final
// response — well beyond a default serverless timeout.
export const maxDuration = 120

export default async function TargetingPage({
  searchParams,
}: {
  searchParams: Promise<{ rep?: string }>
}) {
  const session = await requireSession()
  const params = await searchParams
  const admin = isAdmin(session.role)

  const members = admin ? await getAssignableMembers(session.organization.id) : []
  const activeRepId = admin && params.rep ? params.rep : session.userId
  const activeMember = members.find((member) => member.id === activeRepId)

  const leads = await getLeadsByOwner(session.organization.id, activeRepId)

  return (
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
  )
}
