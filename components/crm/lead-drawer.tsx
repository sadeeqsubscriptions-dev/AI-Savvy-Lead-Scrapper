'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import {
  Building2,
  Globe,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { deleteLead, logActivity, updateLeadStatus } from '@/lib/actions/leads'
import type { ActionState } from '@/lib/actions/state'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate, formatRelative } from '@/lib/format'
import { LEAD_STATUSES } from '@/lib/constants'
import type { ActivityType, LeadActivity, LeadStatus } from '@/lib/supabase/types'
import type { LeadWithOwner } from '@/lib/queries'
import { Avatar } from '@/components/ui/avatar'
import { Badge, leadStatusTone } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/field'
import { Drawer } from '@/components/ui/modal'
import { Progress, Spinner } from '@/components/ui/progress'
import { toast } from '@/components/ui/toaster'
import { SubmitButton } from '@/components/auth/submit-button'
import { cn } from '@/lib/utils'

type ActivityRow = LeadActivity & {
  actor: { full_name: string | null; email: string } | null
}

const activityLabels: Record<ActivityType, string> = {
  created: 'Created',
  note: 'Note',
  email: 'Email',
  call: 'Call',
  meeting: 'Meeting',
  status_change: 'Status',
  assigned: 'Assigned',
  imported: 'Imported',
}

export function LeadDrawer({
  lead,
  canWrite,
  onClose,
  onEdit,
}: {
  lead: LeadWithOwner | null
  canWrite: boolean
  onClose: () => void
  onEdit: (lead: LeadWithOwner) => void
}) {
  const [activities, setActivities] = useState<ActivityRow[]>([])
  const [loading, setLoading] = useState(false)
  const [pending, startTransition] = useTransition()
  const [state, formAction] = useActionState<ActionState, FormData>(logActivity, {})

  const leadId = lead?.id

  useEffect(() => {
    if (!leadId) {
      setActivities([])
      return
    }

    let cancelled = false
    setLoading(true)

    const load = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('lead_activities')
        .select('*, actor:profiles(full_name, email)')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(40)

      if (!cancelled) {
        setActivities((data as unknown as ActivityRow[]) ?? [])
        setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [leadId, state.ok])

  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message)
  }, [state])

  if (!lead) return null

  const changeStatus = (status: LeadStatus) => {
    startTransition(async () => {
      const result = await updateLeadStatus(lead.id, status)
      if (result.error) toast.error(result.error)
      else toast.success(`Moved to ${status}.`)
    })
  }

  const remove = () => {
    if (!window.confirm(`Delete ${lead.full_name}? This cannot be undone.`)) return
    startTransition(async () => {
      const result = await deleteLead(lead.id)
      if (result.error) toast.error(result.error)
      else {
        toast.success('Lead deleted.')
        onClose()
      }
    })
  }

  return (
    <Drawer open onClose={onClose} label={`${lead.full_name} details`}>
      <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-card/95 p-5 backdrop-blur">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={lead.full_name} size="lg" />
          <div className="min-w-0">
            <h2 className="truncate font-display text-base font-semibold">{lead.full_name}</h2>
            <p className="truncate text-sm text-muted-foreground">
              {[lead.title, lead.company].filter(Boolean).join(' at ') || 'No company on file'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label="Close panel"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="space-y-6 p-5">
        <div className="grid grid-cols-2 gap-2">
          <a
            href={lead.email ? `mailto:${lead.email}` : undefined}
            aria-disabled={!lead.email}
            className={cn(
              'flex items-center justify-center gap-2 rounded-lg border border-border py-2 text-xs transition-colors',
              lead.email
                ? 'hover:bg-secondary'
                : 'pointer-events-none opacity-40',
            )}
          >
            <Mail className="size-3.5" />
            Email
          </a>
          <a
            href={lead.phone ? `tel:${lead.phone}` : undefined}
            aria-disabled={!lead.phone}
            className={cn(
              'flex items-center justify-center gap-2 rounded-lg border border-border py-2 text-xs transition-colors',
              lead.phone ? 'hover:bg-secondary' : 'pointer-events-none opacity-40',
            )}
          >
            <Phone className="size-3.5" />
            Call
          </a>
        </div>

        {canWrite ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => onEdit(lead)}>
              <Pencil className="size-3.5" />
              Edit
            </Button>
            <Button variant="destructive" size="sm" onClick={remove} disabled={pending}>
              <Trash2 className="size-3.5" />
              Delete
            </Button>
          </div>
        ) : null}

        <div className="rounded-xl border border-border p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Lead score</p>
            <Sparkles className="size-4 text-primary" />
          </div>
          <p className="mt-2 font-mono text-3xl font-semibold text-primary">{lead.score}</p>
          <Progress value={lead.score} className="mt-3" />
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Pipeline
          </p>
          {canWrite ? (
            <Select
              value={lead.status}
              onChange={(event) => changeStatus(event.target.value as LeadStatus)}
              disabled={pending}
              aria-label="Lead status"
            >
              {LEAD_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </Select>
          ) : (
            <Badge tone={leadStatusTone[lead.status]}>{lead.status}</Badge>
          )}
        </div>

        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Details
          </p>
          <dl className="space-y-2.5 text-sm">
            {[
              { icon: Mail, label: 'Email', value: lead.email },
              { icon: Phone, label: 'Phone', value: lead.phone },
              { icon: Building2, label: 'Industry', value: lead.industry },
              { icon: MapPin, label: 'Location', value: lead.location },
              { icon: Globe, label: 'Website', value: lead.website },
            ].map((row) => (
              <div key={row.label} className="flex items-start justify-between gap-3">
                <dt className="flex shrink-0 items-center gap-2 text-muted-foreground">
                  <row.icon className="size-3.5" />
                  {row.label}
                </dt>
                <dd className="min-w-0 truncate text-right">{row.value || '—'}</dd>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Estimated value</dt>
              <dd className="font-mono">{formatCurrency(lead.estimated_value, false)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Source</dt>
              <dd>{lead.source}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Owner</dt>
              <dd>{lead.owner?.full_name ?? lead.owner?.email ?? 'Unassigned'}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Last contact</dt>
              <dd>{lead.last_contacted_at ? formatRelative(lead.last_contacted_at) : 'Never'}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Created</dt>
              <dd>{formatDate(lead.created_at)}</dd>
            </div>
          </dl>
        </div>

        {lead.notes ? (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Notes
            </p>
            <p className="rounded-lg bg-secondary/50 p-3 text-sm leading-6 text-muted-foreground">
              {lead.notes}
            </p>
          </div>
        ) : null}

        {canWrite ? (
          <form action={formAction} className="rounded-xl border border-border p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Log a touch
            </p>
            <input type="hidden" name="lead_id" value={lead.id} />
            <div className="grid grid-cols-[7rem_1fr] gap-2">
              <Field htmlFor="activity-type">
                <Select id="activity-type" name="type" defaultValue="note" aria-label="Activity type">
                  <option value="note">Note</option>
                  <option value="call">Call</option>
                  <option value="email">Email</option>
                  <option value="meeting">Meeting</option>
                </Select>
              </Field>
              <Field htmlFor="activity-title" error={state.fieldErrors?.title}>
                <Input
                  id="activity-title"
                  name="title"
                  required
                  minLength={2}
                  placeholder="What happened?"
                />
              </Field>
            </div>
            <div className="mt-2 flex justify-end">
              <SubmitButton size="sm" variant="brand" pendingText="Saving…">
                Log activity
              </SubmitButton>
            </div>
          </form>
        ) : null}

        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Timeline
          </p>
          {loading ? (
            <div className="flex justify-center py-6">
              <Spinner className="text-muted-foreground" />
            </div>
          ) : activities.length === 0 ? (
            <p className="py-4 text-xs text-muted-foreground">No activity recorded yet.</p>
          ) : (
            <ol className="space-y-4 border-l border-border pl-4">
              {activities.map((item) => (
                <li key={item.id} className="relative">
                  <span className="absolute -left-[1.3rem] top-1.5 size-2 rounded-full bg-primary" />
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm leading-snug">{item.title}</p>
                    <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
                      {activityLabels[item.type]}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {item.actor?.full_name ?? item.actor?.email ?? 'Automation'} ·{' '}
                    {formatRelative(item.created_at)}
                  </p>
                  {item.body && item.type === 'note' ? (
                    <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{item.body}</p>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </Drawer>
  )
}
