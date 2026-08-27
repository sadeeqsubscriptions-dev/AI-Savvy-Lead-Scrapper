'use client'

import { useRouter } from 'next/navigation'
import { useActionState, useEffect, useState, useTransition } from 'react'
import { Copy, Mail, Trash2, UserPlus, Users } from 'lucide-react'
import { inviteMember, removeMember, revokeInvitation, updateMemberRole } from '@/lib/actions/team'
import type { ActionState } from '@/lib/actions/state'
import { MEMBER_ROLES } from '@/lib/constants'
import { formatCurrency, formatDate, formatNumber, formatPercent } from '@/lib/format'
import type { Invitation, MemberRole, TeamPerformanceRow } from '@/lib/supabase/types'
import { FormAlert } from '@/components/auth/form-alert'
import { SubmitButton } from '@/components/auth/submit-button'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, EmptyState, SectionHeading } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/field'
import { Modal } from '@/components/ui/modal'
import { Progress } from '@/components/ui/progress'
import { toast } from '@/components/ui/toaster'

export type MemberRow = {
  userId: string
  name: string
  email: string
  role: MemberRole
  jobTitle: string | null
  joinedAt: string
}

const roleTone: Record<MemberRole, 'brand' | 'violet' | 'neutral' | 'outline'> = {
  owner: 'brand',
  admin: 'violet',
  member: 'neutral',
  viewer: 'outline',
}

export function TeamWorkspace({
  members,
  invitations,
  performance,
  isAdmin,
  currentUserId,
  quota,
}: {
  members: MemberRow[]
  invitations: Invitation[]
  performance: TeamPerformanceRow[]
  isAdmin: boolean
  currentUserId: string
  quota: number
}) {
  const router = useRouter()
  const [inviting, setInviting] = useState(false)
  const [pending, startTransition] = useTransition()
  const [state, formAction] = useActionState<ActionState, FormData>(inviteMember, {})

  useEffect(() => {
    if (state.ok && state.message) {
      toast.success(state.message)
      router.refresh()
    }
  }, [state, router])

  const totals = performance.reduce(
    (accumulator, row) => ({
      leads: accumulator.leads + Number(row.total_leads),
      won: accumulator.won + Number(row.won_leads),
      pipeline: accumulator.pipeline + Number(row.pipeline_value),
    }),
    { leads: 0, won: 0, pipeline: 0 },
  )

  const maxLeads = Math.max(1, ...performance.map((row) => Number(row.total_leads)))

  const changeRole = (userId: string, role: MemberRole) => {
    startTransition(async () => {
      const result = await updateMemberRole(userId, role)
      if (result.error) toast.error(result.error)
      else {
        toast.success(result.message!)
        router.refresh()
      }
    })
  }

  const remove = (userId: string, name: string) => {
    if (!window.confirm(`Remove ${name} from this workspace? Their leads become unassigned.`)) return

    startTransition(async () => {
      const result = await removeMember(userId)
      if (result.error) toast.error(result.error)
      else {
        toast.success(result.message!)
        router.refresh()
      }
    })
  }

  const revoke = (id: string) => {
    startTransition(async () => {
      const result = await revokeInvitation(id)
      if (result.error) toast.error(result.error)
      else {
        toast.success(result.message!)
        router.refresh()
      }
    })
  }

  const copyToken = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token)
      toast.success('Invite code copied.')
    } catch {
      toast.error('Could not access the clipboard.')
    }
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-5">
      <SectionHeading
        eyebrow="People"
        title="Team"
        description="Manage who has access and see how the pipeline is distributed."
        action={
          isAdmin ? (
            <Button variant="brand" onClick={() => setInviting(true)}>
              <UserPlus className="size-4" />
              Invite teammate
            </Button>
          ) : null
        }
      />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: 'Members', value: formatNumber(members.length) },
          { label: 'Pending invites', value: formatNumber(invitations.length) },
          { label: 'Leads owned', value: `${formatNumber(totals.leads)} / ${formatNumber(quota)}` },
          { label: 'Team pipeline', value: formatCurrency(totals.pipeline) },
        ].map((stat) => (
          <Card key={stat.label} className="p-4">
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <p className="mt-1 font-mono text-2xl font-semibold">{stat.value}</p>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader
          title="Members"
          description={`${members.length} ${members.length === 1 ? 'person' : 'people'} with access`}
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead className="border-b border-border bg-secondary/30 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Person</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Leads</th>
                <th className="px-4 py-3 font-medium">Won</th>
                <th className="px-4 py-3 font-medium">Conversion</th>
                <th className="px-4 py-3 font-medium">Pipeline</th>
                <th className="px-4 py-3 font-medium">Joined</th>
                {isAdmin ? <th className="w-10 px-4 py-3" /> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {members.map((member) => {
                const stats = performance.find((row) => row.user_id === member.userId)
                const isSelf = member.userId === currentUserId

                return (
                  <tr key={member.userId} className="transition-colors hover:bg-secondary/20">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={member.name} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {member.name}
                            {isSelf ? (
                              <span className="ml-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                                you
                              </span>
                            ) : null}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {member.jobTitle ?? member.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {isAdmin && !isSelf ? (
                        <Select
                          value={member.role}
                          onChange={(event) =>
                            changeRole(member.userId, event.target.value as MemberRole)
                          }
                          disabled={pending}
                          className="h-8 w-auto text-xs"
                          aria-label={`Role for ${member.name}`}
                        >
                          {MEMBER_ROLES.map((role) => (
                            <option key={role.value} value={role.value}>
                              {role.label}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <Badge tone={roleTone[member.role]}>
                          {MEMBER_ROLES.find((role) => role.value === member.role)?.label}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-sm">
                        {formatNumber(stats?.total_leads ?? 0)}
                      </span>
                      <Progress
                        value={(Number(stats?.total_leads ?? 0) / maxLeads) * 100}
                        className="mt-1.5 w-20"
                      />
                    </td>
                    <td className="px-4 py-3 font-mono text-sm">
                      {formatNumber(stats?.won_leads ?? 0)}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm">
                      {formatPercent(stats?.conversion ?? 0)}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm">
                      {formatCurrency(stats?.pipeline_value ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {formatDate(member.joinedAt)}
                    </td>
                    {isAdmin ? (
                      <td className="px-4 py-3">
                        {!isSelf ? (
                          <button
                            type="button"
                            onClick={() => remove(member.userId, member.name)}
                            disabled={pending}
                            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive"
                            aria-label={`Remove ${member.name}`}
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {isAdmin ? (
        <Card>
          <CardHeader
            title="Pending invitations"
            description="Invites expire automatically after 14 days."
          />
          {invitations.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No pending invitations"
              description="Invite a teammate and share their code so they can join the workspace."
              action={
                <Button variant="outline" onClick={() => setInviting(true)}>
                  <UserPlus className="size-4" />
                  Invite teammate
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-border">
              {invitations.map((invitation) => (
                <li key={invitation.id} className="flex items-center gap-3 px-5 py-3.5">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                    <Mail className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{invitation.email}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {MEMBER_ROLES.find((role) => role.value === invitation.role)?.label} · expires{' '}
                      {formatDate(invitation.expires_at)}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToken(invitation.token)}
                  >
                    <Copy className="size-3.5" />
                    Copy code
                  </Button>
                  <button
                    type="button"
                    onClick={() => revoke(invitation.id)}
                    disabled={pending}
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive"
                    aria-label={`Revoke invite for ${invitation.email}`}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      <Modal
        open={inviting}
        onClose={() => setInviting(false)}
        title="Invite a teammate"
        description="They will join your workspace as soon as they sign up with this email, or enter the invite code."
      >
        <form action={formAction} className="space-y-4">
          <FormAlert error={state.error} />

          <Field label="Work email" htmlFor="invite-email" error={state.fieldErrors?.email}>
            <Input
              id="invite-email"
              name="email"
              type="email"
              required
              placeholder="name@company.com"
            />
          </Field>

          <Field label="Role" htmlFor="invite-role">
            <Select id="invite-role" name="role" defaultValue="member">
              {MEMBER_ROLES.filter((role) => role.value !== 'owner').map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label} — {role.description}
                </option>
              ))}
            </Select>
          </Field>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setInviting(false)}>
              Cancel
            </Button>
            <SubmitButton variant="brand" pendingText="Creating invite…">
              Send invite
            </SubmitButton>
          </div>
        </form>
      </Modal>
    </div>
  )
}
