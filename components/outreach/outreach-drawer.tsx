'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { ArrowDownLeft, ArrowUpRight, CircleStop, ExternalLink, Reply, X } from 'lucide-react'
import { replyOutreach, stopOutreach } from '@/lib/actions/outreach'
import type { OutreachLead, OutreachThreadWithMessages } from '@/lib/queries'
import { formatDateTime, formatRelative } from '@/lib/format'
import type { OutreachStatus } from '@/lib/supabase/types'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/field'
import { Drawer } from '@/components/ui/modal'
import { Spinner } from '@/components/ui/progress'
import { toast } from '@/components/ui/toaster'

export const outreachStatusTone: Record<OutreachStatus, 'brand' | 'success' | 'neutral' | 'warning' | 'danger'> = {
  active: 'brand',
  replied: 'success',
  completed: 'neutral',
  stopped: 'warning',
  bounced: 'danger',
}

export const outreachStatusLabel: Record<OutreachStatus, string> = {
  active: 'In sequence',
  replied: 'Replied',
  completed: 'No reply',
  stopped: 'Stopped',
  bounced: 'Bounced',
}

export function OutreachDrawer({
  thread,
  lead,
  totalSteps,
  canSend,
  webmailUrl,
  onClose,
}: {
  thread: OutreachThreadWithMessages | null
  lead: OutreachLead | null
  totalSteps: number
  canSend: boolean
  webmailUrl: string
  onClose: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [draft, setDraft] = useState('')

  // A half-written reply belongs to one thread; switching leads clears it.
  useEffect(() => setDraft(''), [thread?.id])

  if (!thread) return null

  const name = lead?.full_name ?? thread.to_email
  const hasReply = thread.messages.some((message) => message.direction === 'inbound')

  const stop = () => {
    startTransition(async () => {
      const result = await stopOutreach(thread.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Follow-ups stopped.')
      router.refresh()
    })
  }

  const send = () => {
    startTransition(async () => {
      const result = await replyOutreach(thread.id, draft)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setDraft('')
      toast.success('Reply sent.')
      router.refresh()
    })
  }

  return (
    <Drawer open onClose={onClose} label={`Email thread with ${name}`}>
      <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-card/95 p-5 backdrop-blur">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={name} size="lg" />
          <div className="min-w-0">
            <h2 className="truncate font-display text-base font-semibold">{name}</h2>
            <p className="truncate font-mono text-xs text-muted-foreground">{thread.to_email}</p>
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

      <div className="space-y-5 p-5">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge tone={outreachStatusTone[thread.status]}>{outreachStatusLabel[thread.status]}</Badge>
          <span className="text-muted-foreground">
            {thread.emails_sent} of {totalSteps} emails sent
            {thread.status === 'active' && thread.next_followup_at
              ? ` · next ${formatRelative(thread.next_followup_at)}`
              : ''}
          </span>
        </div>

        {thread.last_error && thread.status === 'active' ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/[0.06] p-3 text-xs text-destructive">
            Last attempt failed, retrying automatically: {thread.last_error}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <a
            href={webmailUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-medium hover:bg-secondary"
          >
            <ExternalLink className="size-3.5" />
            Open mailbox
          </a>
          {canSend && thread.status === 'active' ? (
            <Button variant="outline" size="sm" onClick={stop} disabled={pending}>
              <CircleStop className="size-3.5" />
              Stop follow-ups
            </Button>
          ) : null}
        </div>

        <ol className="space-y-3">
          {thread.messages.map((message) => {
            const inbound = message.direction === 'inbound'
            return (
              <li
                key={message.id}
                className={cn(
                  'rounded-xl border p-4',
                  inbound ? 'border-success/40 bg-success/[0.06]' : 'border-border bg-background/40',
                )}
              >
                <div className="mb-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span className={cn('flex items-center gap-1.5 font-medium', inbound ? 'text-success' : 'text-primary')}>
                    {inbound ? <ArrowDownLeft className="size-3.5" /> : <ArrowUpRight className="size-3.5" />}
                    {inbound
                      ? 'Their reply'
                      : message.step === null
                        ? 'Your reply'
                        : message.step === 0
                          ? 'First email'
                          : `Follow-up ${message.step}`}
                  </span>
                  <time dateTime={message.sent_at}>{formatDateTime(message.sent_at)}</time>
                </div>
                <p className="mb-2 text-xs font-medium">{message.subject}</p>
                <p className="text-sm leading-6 whitespace-pre-wrap break-words">{message.body}</p>
              </li>
            )
          })}
        </ol>

        {canSend && thread.status !== 'bounced' ? (
          <div className="space-y-2 rounded-xl border border-border p-3">
            <label htmlFor="outreach-reply" className="flex items-center gap-1.5 text-xs font-medium">
              <Reply className="size-3.5" />
              {hasReply ? 'Reply to their message' : 'Write to them yourself'}
            </label>
            <Textarea
              id="outreach-reply"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Your signature is added automatically."
              rows={5}
            />
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">
                Sends in the same thread{thread.status === 'active' ? ' and stops automatic follow-ups' : ''}.
              </p>
              <Button size="sm" onClick={send} disabled={pending || draft.trim().length < 2}>
                {pending ? <Spinner className="size-3.5" /> : <Reply className="size-3.5" />}
                Send reply
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </Drawer>
  )
}
