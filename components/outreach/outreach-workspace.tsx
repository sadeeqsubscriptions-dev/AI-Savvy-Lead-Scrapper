'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import {
  AlertTriangle,
  Ban,
  ChevronRight,
  Inbox,
  MailCheck,
  MessageSquareReply,
  PlugZap,
  RefreshCw,
  Send,
  Users,
} from 'lucide-react'
import { checkEmailConnection, sendOutreach, sendOutreachBatch, syncOutreach } from '@/lib/actions/outreach'
import type { DraftEmail } from '@/lib/outreach/compose'
import { ineligibleReason } from '@/lib/outreach/eligibility'
import type { OutreachLead, OutreachThreadWithMessages } from '@/lib/queries'
import { formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'
import { Badge, ScoreBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, EmptyState, SectionHeading } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { Spinner } from '@/components/ui/progress'
import { toast } from '@/components/ui/toaster'
import { LeadEmailDrawer } from './lead-email-drawer'
import { OutreachDrawer, outreachStatusLabel, outreachStatusTone } from './outreach-drawer'

type Tab = 'ready' | 'research' | 'active' | 'replied' | 'done' | 'skipped'

export function OutreachWorkspace({
  leads,
  threads,
  canSend,
  mail,
  totalSteps,
  batchSize,
}: {
  leads: OutreachLead[]
  threads: OutreachThreadWithMessages[]
  canSend: boolean
  mail: { configured: boolean; sender: string; sentToday: number; dailyLimit: number; webmailUrl: string }
  totalSteps: number
  batchSize: number
}) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('ready')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [previewLeadId, setPreviewLeadId] = useState<string | null>(null)
  // Drafts survive closing the drawer, so reopening a lead doesn't pay for a rewrite.
  const [drafts, setDrafts] = useState<Record<string, DraftEmail>>({})
  const [sendingLead, setSendingLead] = useState<string | null>(null)
  const [confirmBulk, setConfirmBulk] = useState(false)
  const [syncing, startSync] = useTransition()
  const [sending, startSend] = useTransition()
  const [testing, startTest] = useTransition()
  const autoSynced = useRef(false)

  const leadById = useMemo(() => new Map(leads.map((lead) => [lead.id, lead])), [leads])
  const contacted = useMemo(() => new Set(threads.map((thread) => thread.lead_id)), [threads])
  const uncontacted = leads.filter((lead) => !contacted.has(lead.id))
  const flags = useMemo(() => new Map(leads.map((lead) => [lead.id, ineligibleReason(lead)])), [leads])
  // Researched in Targeting = ready to email; the rest wait for research.
  const eligible = uncontacted.filter((lead) => !flags.get(lead.id))
  const ready = eligible.filter((lead) => lead.researched)
  const needsResearch = eligible.filter((lead) => !lead.researched)
  const skipped = uncontacted.filter((lead) => flags.get(lead.id))

  const groups = {
    active: threads.filter((thread) => thread.status === 'active'),
    replied: threads
      .filter((thread) => thread.status === 'replied')
      .sort((a, b) => (b.replied_at ?? '').localeCompare(a.replied_at ?? '')),
    done: threads.filter((thread) => ['completed', 'stopped', 'bounced'].includes(thread.status)),
  }

  const replyRate = threads.length > 0 ? Math.round((groups.replied.length / threads.length) * 100) : 0
  const remaining = Math.max(0, mail.dailyLimit - mail.sentToday)
  const canEmail = canSend && mail.configured
  const selected = threads.find((thread) => thread.id === selectedId) ?? null
  const previewLead = previewLeadId && !contacted.has(previewLeadId) ? (leadById.get(previewLeadId) ?? null) : null

  const sync = (silent = false) => {
    startSync(async () => {
      const result = await syncOutreach()
      if (result.errors.length > 0 && !silent) toast.error(result.errors[0])
      if (result.replies > 0) toast.success(`${result.replies} new ${result.replies === 1 ? 'reply' : 'replies'}.`)
      else if (!silent) {
        toast.success(
          result.followUps > 0 ? `Inbox checked. ${result.followUps} follow-up(s) sent.` : 'Inbox checked. No new replies.',
        )
      }
      router.refresh()
    })
  }

  // Pick up replies as soon as the page opens, without waiting for the cron.
  useEffect(() => {
    if (autoSynced.current || !canEmail || threads.length === 0) return
    autoSynced.current = true
    sync(true)
  }, [])

  const testConnection = () => {
    startTest(async () => {
      const result = await checkEmailConnection()
      if (result.ok) toast.success(result.message)
      else toast.error(result.error)
    })
  }

  const sendOne = (lead: OutreachLead) => {
    setSendingLead(lead.id)
    startSend(async () => {
      const result = await sendOutreach(lead.id)
      setSendingLead(null)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`Email sent to ${lead.full_name}.`)
      router.refresh()
    })
  }

  const sendBatch = () => {
    setConfirmBulk(false)
    const ids = ready.slice(0, Math.min(batchSize, remaining)).map((lead) => lead.id)
    startSend(async () => {
      const result = await sendOutreachBatch(ids)
      if (result.sent > 0 || result.skipped > 0) {
        toast.success(
          `Sent ${result.sent} email${result.sent === 1 ? '' : 's'}` +
            (result.skipped > 0 ? `, skipped ${result.skipped} that Claude judged not a fit.` : '.'),
        )
      }
      if (result.errors.length > 0) toast.error(result.errors[0])
      router.refresh()
    })
  }

  const batchCount = Math.min(batchSize, ready.length, remaining)

  const stats = [
    { label: 'Ready to email', value: ready.length, icon: Users },
    { label: 'In sequence', value: groups.active.length, icon: Send },
    { label: 'Replies', value: groups.replied.length, hint: `${replyRate}% reply rate`, icon: MessageSquareReply },
    { label: 'Sent today', value: `${mail.sentToday}/${mail.dailyLimit}`, hint: 'Daily safety cap', icon: MailCheck },
  ]

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'ready', label: 'Ready', count: ready.length },
    { key: 'research', label: 'Needs research', count: needsResearch.length },
    { key: 'active', label: 'In sequence', count: groups.active.length },
    { key: 'replied', label: 'Replied', count: groups.replied.length },
    { key: 'done', label: 'Finished', count: groups.done.length },
    { key: 'skipped', label: 'Not a fit', count: skipped.length },
  ]

  const leadTab = tab === 'ready' || tab === 'research' || tab === 'skipped'
  const threadRows = leadTab ? [] : groups[tab]
  const leadRows = tab === 'ready' ? ready : tab === 'research' ? needsResearch : skipped

  return (
    <div className="mx-auto max-w-[1200px] space-y-5">
      <SectionHeading
        eyebrow="Cold outreach"
        title="AI email outreach"
        description={`Leads researched in Targeting land in Ready. Generate the email from their script, send it from your inbox, and Claude follows up ${totalSteps - 1} times if they don't reply. Replies show up here automatically.`}
        action={
          canEmail ? (
            <>
              <Button variant="ghost" onClick={testConnection} disabled={testing}>
                {testing ? <Spinner className="size-4" /> : <PlugZap className="size-4" />}
                Test connection
              </Button>
              <Button variant="outline" onClick={() => sync()} disabled={syncing}>
                {syncing ? <Spinner className="size-4" /> : <RefreshCw className="size-4" />}
                Check inbox
              </Button>
              <Button variant="brand" onClick={() => setConfirmBulk(true)} disabled={sending || batchCount === 0}>
                <Send className="size-4" />
                Email {batchCount > 0 ? batchCount : ''} ready
              </Button>
            </>
          ) : null
        }
      />

      {!mail.configured ? (
        <Card className="flex items-start gap-3 border-warning/40 bg-warning/[0.06] p-4">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <div className="text-sm">
            <p className="font-medium">Connect a mailbox to start sending</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Set <code className="font-mono">EMAIL_USER</code> and <code className="font-mono">EMAIL_APP_PASSWORD</code>{' '}
              (an app-specific password from your Zoho account) in your environment, then redeploy. Emails go out from
              that address and replies are read from its inbox.
            </p>
          </div>
        </Card>
      ) : (
        <p className="text-xs text-muted-foreground">
          Sending as <span className="font-mono text-foreground">{mail.sender}</span>
          {syncing ? ' · checking inbox…' : ''}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="p-4">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs">{stat.label}</span>
              <stat.icon className="size-4" />
            </div>
            <p className="mt-2 font-display text-2xl font-semibold tracking-tight">{stat.value}</p>
            {stat.hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{stat.hint}</p> : null}
          </Card>
        ))}
      </div>

      <Card>
        <div className="flex gap-1 overflow-x-auto border-b border-border p-2" role="tablist">
          {tabs.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              onClick={() => setTab(item.key)}
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors',
                tab === item.key ? 'bg-secondary font-medium text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {item.label}
              <span className="font-mono text-[11px] text-muted-foreground">{item.count}</span>
            </button>
          ))}
        </div>

        {leadTab ? (
          leadRows.length === 0 ? (
            <EmptyState
              icon={tab === 'skipped' ? Ban : Users}
              title={
                tab === 'ready' ? 'Nothing researched yet' : tab === 'research' ? 'Everyone is researched' : 'Nothing screened out'
              }
              description={
                tab === 'ready'
                  ? 'Leads appear here once Claude has written their sales script in Targeting.'
                  : tab === 'research'
                    ? 'Every eligible lead with an email has a sales script.'
                    : 'Government offices, article titles and department inboxes land here instead of getting emailed.'
              }
            />
          ) : (
            <ul className="divide-y divide-border">
              {tab === 'skipped' ? (
                <li className="bg-secondary/30 px-4 py-2.5 text-xs text-muted-foreground">
                  These won&apos;t be emailed automatically. Open one to see why, or write an email anyway.
                </li>
              ) : tab === 'research' ? (
                <li className="bg-secondary/30 px-4 py-2.5 text-xs text-muted-foreground">
                  Research these in Targeting first, or open one and generate the email: Claude researches it on the way.
                </li>
              ) : null}
              {leadRows.map((lead) => (
                <li key={lead.id} className="flex flex-col gap-3 p-4 transition-colors hover:bg-secondary/40 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    onClick={() => setPreviewLeadId(lead.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <Avatar name={lead.full_name} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{lead.full_name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {tab === 'skipped'
                          ? flags.get(lead.id)
                          : drafts[lead.id]
                            ? `Draft ready · pitching ${drafts[lead.id].service}`
                            : [lead.company, lead.industry].filter(Boolean).join(' · ') || lead.source}
                      </span>
                    </span>
                    <span className="hidden truncate font-mono text-xs text-muted-foreground sm:block sm:w-56">
                      {lead.email}
                    </span>
                    <ScoreBadge score={lead.score} />
                    <ChevronRight className="hidden size-4 text-muted-foreground sm:block" />
                  </button>
                  {canEmail && tab === 'ready' ? (
                    <Button size="sm" onClick={() => sendOne(lead)} disabled={sending} className="sm:w-28">
                      {sendingLead === lead.id ? <Spinner className="size-3.5" /> : <Send className="size-3.5" />}
                      {sendingLead === lead.id ? 'Writing…' : 'Send now'}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )
        ) : threadRows.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={tab === 'replied' ? 'No replies yet' : 'Nothing here yet'}
            description={
              tab === 'replied'
                ? 'When a lead answers, their reply lands here and follow-ups stop automatically.'
                : 'Threads move here as emails go out.'
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {threadRows.map((thread) => {
              const lead = leadById.get(thread.lead_id)
              const lastReply = [...thread.messages].reverse().find((message) => message.direction === 'inbound')
              return (
                <li key={thread.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(thread.id)}
                    className="flex w-full flex-col gap-3 p-4 text-left transition-colors hover:bg-secondary/40 sm:flex-row sm:items-center"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <Avatar name={lead?.full_name ?? thread.to_email} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{lead?.full_name ?? thread.to_email}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {lastReply && thread.status === 'replied' ? `“${lastReply.body.slice(0, 90)}”` : thread.subject}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground sm:w-40">
                      {thread.status === 'replied'
                        ? `Replied ${formatRelative(thread.replied_at)}`
                        : thread.status === 'active' && thread.next_followup_at
                          ? `Next follow-up ${formatRelative(thread.next_followup_at)}`
                          : `Last sent ${formatRelative(thread.last_sent_at)}`}
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground sm:w-20">
                      {thread.emails_sent} of {totalSteps} sent
                    </span>
                    <Badge tone={outreachStatusTone[thread.status]} className="w-fit">
                      {outreachStatusLabel[thread.status]}
                    </Badge>
                  </button>
                  {thread.last_error && thread.status === 'active' ? (
                    <p className="px-4 pb-3 text-[11px] text-destructive">Retrying: {thread.last_error}</p>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <Modal
        open={confirmBulk}
        onClose={() => setConfirmBulk(false)}
        title={`Email ${batchCount} lead${batchCount === 1 ? '' : 's'}?`}
        description="Claude writes a personal email for each one and sends it from your inbox. This takes a few seconds per lead."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmBulk(false)}>
              Cancel
            </Button>
            <Button variant="brand" onClick={sendBatch}>
              <Send className="size-4" />
              Send {batchCount}
            </Button>
          </>
        }
      >
        <ul className="space-y-1.5 text-sm">
          {ready.slice(0, batchCount).map((lead) => (
            <li key={lead.id} className="flex justify-between gap-3">
              <span className="truncate">{lead.full_name}</span>
              <span className="truncate font-mono text-xs text-muted-foreground">{lead.email}</span>
            </li>
          ))}
        </ul>
      </Modal>

      {sending && !sendingLead ? (
        <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm shadow-lg">
          <Spinner className="size-4 text-primary" />
          Writing and sending emails…
        </div>
      ) : null}

      <OutreachDrawer
        thread={selected}
        lead={selected ? (leadById.get(selected.lead_id) ?? null) : null}
        totalSteps={totalSteps}
        canSend={canSend}
        webmailUrl={mail.webmailUrl}
        onClose={() => setSelectedId(null)}
      />

      <LeadEmailDrawer
        key={previewLead?.id}
        lead={previewLead}
        flagged={previewLead ? (flags.get(previewLead.id) ?? null) : null}
        draft={previewLead ? (drafts[previewLead.id] ?? null) : null}
        onDraft={(draft) => {
          if (!previewLead) return
          const id = previewLead.id
          setDrafts((current) => {
            const next = { ...current }
            if (draft) next[id] = draft
            else delete next[id]
            return next
          })
        }}
        canWrite={canSend}
        mailReady={mail.configured}
        onClose={() => setPreviewLeadId(null)}
      />
    </div>
  )
}
