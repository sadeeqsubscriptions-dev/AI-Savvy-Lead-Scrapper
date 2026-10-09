'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Activity, ClipboardList, PhoneCall } from 'lucide-react'
import { updateLeadStatus } from '@/lib/actions/leads'
import { LEAD_STATUSES } from '@/lib/constants'
import { formatRelative } from '@/lib/format'
import type { LeadStatus, OutreachStatus } from '@/lib/supabase/types'
import { cn } from '@/lib/utils'
import { ActivityLog, type ActivityItem } from '@/components/leads/activity-log'
import { outreachStatusLabel, outreachStatusTone } from '@/components/outreach/outreach-drawer'
import { Avatar } from '@/components/ui/avatar'
import { Badge, leadStatusColor } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, EmptyState, SectionHeading } from '@/components/ui/card'
import { Select } from '@/components/ui/field'
import { Modal } from '@/components/ui/modal'
import { toast } from '@/components/ui/toaster'

export type StatusRow = {
  id: string
  full_name: string
  company: string | null
  email: string | null
  phone: string | null
  status: LeadStatus
  last_contacted_at: string | null
  email_status: OutreachStatus | null
  emails_sent: number
  replied_at: string | null
  next_followup_at: string | null
  calls: number
  activities: ActivityItem[]
}

export function StatusWorkspace({ rows, canWrite }: { rows: StatusRow[]; canWrite: boolean }) {
  const router = useRouter()
  const [stage, setStage] = useState<LeadStatus | 'all'>('all')
  const [logFor, setLogFor] = useState<string | null>(null)
  const [saving, startSaving] = useTransition()

  const counts = Object.fromEntries(LEAD_STATUSES.map((status) => [status, 0])) as Record<LeadStatus, number>
  for (const row of rows) counts[row.status]++

  const visible = stage === 'all' ? rows : rows.filter((row) => row.status === stage)
  const logging = rows.find((row) => row.id === logFor) ?? null

  const move = (id: string, status: LeadStatus) => {
    startSaving(async () => {
      const result = await updateLeadStatus(id, status)
      if (result.error) toast.error(result.error)
      else {
        toast.success(`Moved to ${status}.`)
        router.refresh()
      }
    })
  }

  return (
    <div className="mx-auto max-w-[1300px] space-y-5">
      <SectionHeading
        eyebrow="Pipeline"
        title="Status"
        description="Every lead you've emailed, called or moved forward. Update the stage or log what happened — it's saved to the lead's timeline in the CRM too."
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setStage('all')}
          className={cn(
            'rounded-lg border px-3 py-2 text-left text-sm transition-colors',
            stage === 'all' ? 'border-primary bg-primary/10' : 'border-border hover:bg-secondary/40',
          )}
        >
          <span className="block text-[11px] text-muted-foreground">All</span>
          <span className="font-mono font-semibold">{rows.length}</span>
        </button>
        {LEAD_STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setStage(status)}
            className={cn(
              'rounded-lg border px-3 py-2 text-left text-sm transition-colors',
              stage === status ? 'border-primary bg-primary/10' : 'border-border hover:bg-secondary/40',
            )}
          >
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className={cn('size-2 rounded-full', leadStatusColor[status])} />
              {status}
            </span>
            <span className="font-mono font-semibold">{counts[status]}</span>
          </button>
        ))}
      </div>

      <Card>
        {visible.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="Nothing here yet"
            description="Leads show up here once you email them, call them, or move them past New."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Lead</th>
                  <th className="px-3 py-3 font-medium">Stage</th>
                  <th className="px-3 py-3 font-medium">Email</th>
                  <th className="px-3 py-3 font-medium">Last update</th>
                  <th className="px-3 py-3 font-medium">Next</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map((row) => {
                  const last = row.activities[0]
                  return (
                    <tr key={row.id} className="align-top hover:bg-secondary/20">
                      <td className="px-4 py-3">
                        <Link href={`/targeting/${row.id}`} className="flex items-center gap-3">
                          <Avatar name={row.full_name} size="sm" />
                          <span className="min-w-0">
                            <span className="block max-w-56 truncate text-sm font-medium hover:text-primary">
                              {row.full_name}
                            </span>
                            <span className="block max-w-56 truncate text-xs text-muted-foreground">
                              {row.company ?? row.email ?? '—'}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        <Select
                          value={row.status}
                          onChange={(event) => move(row.id, event.target.value as LeadStatus)}
                          disabled={!canWrite || saving}
                          className="w-36"
                          aria-label={`Stage for ${row.full_name}`}
                        >
                          {LEAD_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="px-3 py-3">
                        {row.email_status ? (
                          <div className="space-y-1">
                            <Badge tone={outreachStatusTone[row.email_status]}>
                              {outreachStatusLabel[row.email_status]}
                            </Badge>
                            <p className="text-[11px] text-muted-foreground">
                              {row.replied_at ? `Replied ${formatRelative(row.replied_at)}` : `${row.emails_sent} sent`}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Not emailed</span>
                        )}
                        {row.calls > 0 ? (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {row.calls} call{row.calls === 1 ? '' : 's'}
                          </p>
                        ) : null}
                      </td>
                      <td className="max-w-72 px-3 py-3">
                        {last ? (
                          <>
                            <p className="truncate text-sm">{last.title}</p>
                            <p className="text-[11px] text-muted-foreground">{formatRelative(last.created_at)}</p>
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">
                        {row.next_followup_at ? `Follow-up ${formatRelative(row.next_followup_at)}` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5">
                          {row.phone ? (
                            <Link
                              href={`/dialer?lead=${row.id}`}
                              className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
                              aria-label={`Call ${row.full_name}`}
                              title="Call"
                            >
                              <PhoneCall className="size-4" />
                            </Link>
                          ) : null}
                          <Button variant="outline" size="sm" onClick={() => setLogFor(row.id)}>
                            <ClipboardList className="size-3.5" />
                            Log
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={Boolean(logging)}
        onClose={() => setLogFor(null)}
        title={logging ? `Log for ${logging.full_name}` : 'Log'}
        description="What happened? It's added to the lead's timeline in the CRM."
        className="max-w-xl"
      >
        {logging ? (
          <ActivityLog leadId={logging.id} activities={logging.activities} canWrite={canWrite} compact />
        ) : null}
      </Modal>
    </div>
  )
}
