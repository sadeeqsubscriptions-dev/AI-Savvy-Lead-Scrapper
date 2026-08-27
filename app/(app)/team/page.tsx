import type { Metadata } from 'next'
import { TeamWorkspace, type MemberRow } from '@/components/team/team-workspace'
import { isAdmin, requireSession } from '@/lib/auth'
import { getInvitations, getMembers, getTeamPerformance } from '@/lib/queries'

export const metadata: Metadata = { title: 'Team' }

export default async function TeamPage() {
  const session = await requireSession()
  const admin = isAdmin(session.role)

  const [members, performance, invitations] = await Promise.all([
    getMembers(session.organization.id),
    getTeamPerformance(session.organization.id),
    admin ? getInvitations(session.organization.id) : Promise.resolve([]),
  ])

  const rows: MemberRow[] = members.map((member) => ({
    userId: member.user_id,
    name: member.profile?.full_name ?? member.profile?.email ?? 'Unknown',
    email: member.profile?.email ?? '',
    role: member.role,
    jobTitle: member.profile?.job_title ?? null,
    joinedAt: member.created_at,
  }))

  return (
    <TeamWorkspace
      members={rows}
      invitations={invitations}
      performance={performance}
      isAdmin={admin}
      currentUserId={session.userId}
      quota={session.organization.lead_quota}
    />
  )
}
