'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { RefreshCw, Send, ShieldAlert, Sparkles } from 'lucide-react'
import { previewOutreachEmail, sendOutreach } from '@/lib/actions/outreach'
import type { DraftEmail } from '@/lib/outreach/compose'
import { describeSendTime, inSendWindow, leadTimezone, nextSendWindow } from '@/lib/outreach/schedule'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/field'
import { Spinner } from '@/components/ui/progress'
import { toast } from '@/components/ui/toaster'

/**
 * Claude's first email for a lead: write, read, edit, send. Used in the
 * Outreach side panel and on the lead's full page.
 */
export function EmailComposer({
  lead,
  flagged,
  draft: controlledDraft,
  onDraft,
  canWrite,
  mailReady,
  onSent,
}: {
  lead: {
    id: string
    full_name: string
    company: string | null
    email: string | null
    location?: string | null
    city?: string | null
    country?: string | null
  }
  /** Why screening kept this lead out of automatic sending, if it did. */
  flagged: string | null
  /** Pass draft + onDraft to keep the draft outside (e.g. across drawer opens). */
  draft?: DraftEmail | null
  onDraft?: (draft: DraftEmail | null) => void
  canWrite: boolean
  mailReady: boolean
  onSent?: () => void
}) {
  const router = useRouter()
  const [writing, startWriting] = useTransition()
  const [sending, startSending] = useTransition()
  const [notAFit, setNotAFit] = useState<string | null>(null)
  const [localDraft, setLocalDraft] = useState<DraftEmail | null>(null)

  const draft = controlledDraft !== undefined ? controlledDraft : localDraft
  const setDraft = onDraft ?? setLocalDraft
  const warning = notAFit ? `Claude: ${notAFit}` : flagged
  // Emails only go out on weekdays, 9-4 in the lead's own time zone.
  const zone = leadTimezone(lead)
  const openNow = inSendWindow(zone)
  const sendLabel = openNow ? 'Send now' : `Schedule for ${describeSendTime(nextSendWindow(zone), zone)}`

  const write = (force: boolean) => {
    setNotAFit(null)
    startWriting(async () => {
      const result = await previewOutreachEmail(lead.id, force)
      if (!result.ok) {
        if ('notAFit' in result && result.notAFit) {
          setNotAFit(result.notAFit)
          router.refresh()
        } else {
          toast.error(result.error)
        }
        return
      }
      setDraft(result.email)
    })
  }

  const send = () => {
    if (!draft) return
    startSending(async () => {
      const result = await sendOutreach(lead.id, { subject: draft.subject, body: draft.body })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(
        result.scheduledFor
          ? `Scheduled for ${result.scheduledFor} (their time). It sends automatically.`
          : `Email sent to ${lead.full_name}. Follow-ups are scheduled.`,
      )
      setDraft(null)
      onSent?.()
      router.refresh()
    })
  }

  if (!lead.email) {
    return (
      <p className="rounded-xl border border-border p-4 text-xs text-muted-foreground">
        No email address on file. Add one in the CRM to send an email, or call them instead.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {warning ? (
        <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/[0.06] p-3 text-xs leading-5">
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
          <div>
            <p className="font-medium text-warning">Not emailed automatically</p>
            <p className="mt-0.5 text-muted-foreground">{warning}</p>
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-border p-4">
        {writing ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <Spinner className="size-5 text-primary" />
            <p className="text-sm font-medium">Writing the email…</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Claude uses the sales script for {lead.company ?? lead.full_name} (researching first if there is none),
              then writes the email. Up to a minute.
            </p>
          </div>
        ) : draft ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Badge tone="brand">
                <Sparkles className="size-3" />
                Pitching: {draft.service}
              </Badge>
              {draft.why ? <p className="text-xs leading-5 text-muted-foreground">{draft.why}</p> : null}
            </div>

            <div className="space-y-1.5">
              <label htmlFor={`subject-${lead.id}`} className="text-xs font-medium text-muted-foreground">
                Subject
              </label>
              <Input
                id={`subject-${lead.id}`}
                value={draft.subject}
                onChange={(event) => setDraft({ ...draft, subject: event.target.value })}
                disabled={!canWrite}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor={`body-${lead.id}`} className="text-xs font-medium text-muted-foreground">
                Email
              </label>
              <Textarea
                id={`body-${lead.id}`}
                value={draft.body}
                onChange={(event) => setDraft({ ...draft, body: event.target.value })}
                rows={16}
                disabled={!canWrite}
              />
            </div>

            {canWrite ? (
              <div className="flex flex-wrap justify-between gap-2">
                <Button variant="outline" size="sm" onClick={() => write(Boolean(warning))} disabled={sending}>
                  <RefreshCw className="size-3.5" />
                  Rewrite
                </Button>
                <Button variant="brand" size="sm" onClick={send} disabled={sending || !mailReady}>
                  {sending ? <Spinner className="size-3.5" /> : <Send className="size-3.5" />}
                  {sendLabel}
                </Button>
              </div>
            ) : null}
            <p className="text-[11px] text-muted-foreground">
              {mailReady
                ? `${openNow ? 'Sends' : 'Goes out on schedule'} to ${lead.email}. If they don't reply, Claude writes two follow-ups in the same thread (weekdays, business hours).`
                : 'Connect a mailbox (EMAIL_USER / EMAIL_APP_PASSWORD) to send this.'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-brand text-white">
              <Sparkles className="size-5" />
            </span>
            <p className="text-sm font-medium">No email written yet</p>
            <p className="max-w-xs text-xs leading-5 text-muted-foreground">
              Claude writes a personal email from their sales script: their needs, the AI Savvy service that fits,
              and a request for a 15-minute call. You can edit it before sending.
            </p>
            {canWrite ? (
              <Button variant={warning ? 'outline' : 'brand'} size="sm" onClick={() => write(Boolean(warning))}>
                <Sparkles className="size-3.5" />
                {warning ? 'Write one anyway' : 'Generate email'}
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
