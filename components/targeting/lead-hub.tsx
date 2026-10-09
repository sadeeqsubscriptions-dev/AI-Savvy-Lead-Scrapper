'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Building2,
  Database,
  Globe,
  Mail,
  MapPin,
  Phone,
  PhoneCall,
  RefreshCw,
  Send,
  Sparkles,
} from 'lucide-react'
import { generateLeadBrief } from '@/lib/actions/targeting'
import { updateLeadStatus } from '@/lib/actions/leads'
import { LEAD_STATUSES } from '@/lib/constants'
import { formatDateTime, formatRelative } from '@/lib/format'
import type { Call, Lead, LeadAiBrief, LeadStatus, OutreachMessage, OutreachThread } from '@/lib/supabase/types'
import { cn } from '@/lib/utils'
import { ActivityLog, type ActivityItem } from '@/components/leads/activity-log'
import { EmailComposer } from '@/components/outreach/email-composer'
import { outreachStatusLabel, outreachStatusTone } from '@/components/outreach/outreach-drawer'
import { Avatar } from '@/components/ui/avatar'
import { Badge, ScoreBadge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select } from '@/components/ui/field'
import { Spinner } from '@/components/ui/progress'
import { toast } from '@/components/ui/toaster'
import { BriefScript } from './brief-script'

function Section({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string
  icon: typeof Mail
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-sm font-semibold">
          <Icon className="size-4 text-primary" />
          {title}
        </h2>
        {action}
      </div>
      {children}
    </Card>
  )
}

/**
 * Everything about one lead on a single screen: who they are, Claude's sales
 * script, the email (draft or the sent thread), calls, and the activity log.
 */
export function LeadHub({
  lead,
  brief: initialBrief,
  flagged,
  thread,
  calls,
  activities,
  canWrite,
  mailReady,
}: {
  lead: Lead
  brief: LeadAiBrief | null
  flagged: string | null
  thread: (OutreachThread & { messages: OutreachMessage[] }) | null
  calls: Call[]
  activities: ActivityItem[]
  canWrite: boolean
  mailReady: boolean
}) {
  const router = useRouter()
  const [brief, setBrief] = useState(initialBrief)
  const [researching, startResearch] = useTransition()
  const [savingStatus, startStatus] = useTransition()

  const research = () => {
    startResearch(async () => {
      const result = await generateLeadBrief(lead.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setBrief(result.brief)
      toast.success('Script ready. This lead now shows as researched in Outreach.')
      router.refresh()
    })
  }

  const changeStatus = (status: LeadStatus) => {
    startStatus(async () => {
      const result = await updateLeadStatus(lead.id, status)
      if (result.error) toast.error(result.error)
      else {
        toast.success(`Moved to ${status}.`)
        router.refresh()
      }
    })
  }

  const location = lead.location ?? ([lead.city, lead.country].filter(Boolean).join(', ') || null)
  const details = [
    { icon: Mail, label: 'Email', value: lead.email },
    { icon: Phone, label: 'Phone', value: lead.phone },
    { icon: Building2, label: 'Industry', value: lead.industry },
    { icon: MapPin, label: 'Location', value: location },
  ]

  return (
    <div className="mx-auto max-w-[1300px] space-y-5">
      <Link href="/targeting" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" />
        Targeting
      </Link>

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar name={lead.full_name} size="lg" />
          <div className="min-w-0">
            <h1 className="truncate font-display text-2xl font-semibold tracking-tight">{lead.full_name}</h1>
            <p className="truncate text-sm text-muted-foreground">
              {[lead.title, lead.company].filter(Boolean).join(' at ') || lead.source}
            </p>
          </div>
          <ScoreBadge score={lead.score} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={lead.status}
            onChange={(event) => changeStatus(event.target.value as LeadStatus)}
            disabled={!canWrite || savingStatus}
            className="w-40"
            aria-label="Pipeline stage"
          >
            {LEAD_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </Select>
          {lead.phone ? (
            <Link href={`/dialer?lead=${lead.id}`} className={buttonVariants({ variant: 'outline' })}>
              <PhoneCall className="size-4" />
              Call
            </Link>
          ) : null}
          <Link href={`/crm?lead=${lead.id}`} className={buttonVariants({ variant: 'ghost' })}>
            <Database className="size-4" />
            CRM
          </Link>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <div className="space-y-5">
          <Section title="Contact" icon={Building2}>
            <dl className="space-y-2 text-sm">
              {details.map((row) => (
                <div key={row.label} className="flex items-start justify-between gap-3">
                  <dt className="flex shrink-0 items-center gap-2 text-muted-foreground">
                    <row.icon className="size-3.5" />
                    {row.label}
                  </dt>
                  <dd className="min-w-0 truncate text-right">{row.value || '—'}</dd>
                </div>
              ))}
              <div className="flex items-start justify-between gap-3">
                <dt className="flex shrink-0 items-center gap-2 text-muted-foreground">
                  <Globe className="size-3.5" />
                  Website
                </dt>
                <dd className="min-w-0 truncate text-right">
                  {lead.website ? (
                    <a href={lead.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      {lead.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                    </a>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
            </dl>
            {lead.notes ? <p className="mt-4 rounded-lg bg-secondary/50 p-3 text-xs leading-5">{lead.notes}</p> : null}
          </Section>

          <Section title="Activity log" icon={RefreshCw}>
            <ActivityLog leadId={lead.id} activities={activities} canWrite={canWrite} />
          </Section>
        </div>

        <div className="space-y-5">
          <Section
            title="Sales script"
            icon={Sparkles}
            action={
              brief && canWrite ? (
                <Button variant="ghost" size="sm" onClick={research} disabled={researching}>
                  <RefreshCw className="size-3.5" />
                  Redo
                </Button>
              ) : null
            }
          >
            {researching ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <Spinner className="size-5 text-primary" />
                <p className="text-sm font-medium">Researching {lead.company ?? lead.full_name}…</p>
                <p className="text-xs text-muted-foreground">Usually 20-40 seconds.</p>
              </div>
            ) : brief ? (
              <BriefScript brief={brief} />
            ) : (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <p className="max-w-sm text-xs leading-5 text-muted-foreground">
                  Claude researches them and writes a short script: who they are, where to hit them, and which AI Savvy
                  service to offer. The email and the call coach use the same script.
                </p>
                {canWrite ? (
                  <Button variant="brand" size="sm" onClick={research}>
                    <Sparkles className="size-3.5" />
                    Research &amp; generate script
                  </Button>
                ) : null}
              </div>
            )}
          </Section>

          <Section
            title="Email"
            icon={Send}
            action={
              thread ? (
                <Badge tone={outreachStatusTone[thread.status]}>{outreachStatusLabel[thread.status]}</Badge>
              ) : null
            }
          >
            {thread ? (
              <div className="space-y-3">
                {thread.messages.map((message) => {
                  const inbound = message.direction === 'inbound'
                  return (
                    <div
                      key={message.id}
                      className={cn(
                        'rounded-xl border p-3',
                        inbound ? 'border-success/40 bg-success/[0.06]' : 'border-border bg-background/40',
                      )}
                    >
                      <p className={cn('mb-1 flex items-center gap-1.5 text-[11px] font-medium', inbound ? 'text-success' : 'text-primary')}>
                        {inbound ? <ArrowDownLeft className="size-3.5" /> : <ArrowUpRight className="size-3.5" />}
                        {inbound ? 'Their reply' : message.step === 0 ? 'First email' : message.step === null ? 'Your reply' : `Follow-up ${message.step}`}
                        <span className="ml-auto font-normal text-muted-foreground">{formatDateTime(message.sent_at)}</span>
                      </p>
                      <p className="mb-1 text-xs font-medium">{message.subject}</p>
                      <p className="text-sm leading-6 whitespace-pre-wrap break-words">{message.body}</p>
                    </div>
                  )
                })}
                <p className="text-xs text-muted-foreground">
                  {thread.status === 'active' && thread.next_followup_at
                    ? `Next follow-up ${formatRelative(thread.next_followup_at)}. `
                    : ''}
                  Reply or stop follow-ups from{' '}
                  <Link href="/outreach" className="text-primary hover:underline">
                    Outreach
                  </Link>
                  .
                </p>
              </div>
            ) : (
              <EmailComposer lead={lead} flagged={flagged} canWrite={canWrite} mailReady={mailReady} />
            )}
          </Section>

          {calls.length > 0 ? (
            <Section title="Calls" icon={Phone}>
              <ul className="space-y-3">
                {calls.map((call) => (
                  <li key={call.id} className="text-xs">
                    <p className="text-muted-foreground">
                      {formatRelative(call.started_at)} · {call.status}
                      {call.duration_seconds
                        ? ` · ${Math.floor(call.duration_seconds / 60)}:${String(call.duration_seconds % 60).padStart(2, '0')}`
                        : ''}
                    </p>
                    {call.summary ? <p className="mt-1 leading-5 whitespace-pre-wrap">{call.summary}</p> : null}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
        </div>
      </div>
    </div>
  )
}
