'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Building2, Globe, Mail, MapPin, Phone, PhoneCall, RefreshCw, Send, ShieldAlert, Sparkles, X } from 'lucide-react'
import { previewOutreachEmail, sendOutreach } from '@/lib/actions/outreach'
import type { DraftEmail } from '@/lib/outreach/compose'
import type { OutreachLead } from '@/lib/queries'
import { Avatar } from '@/components/ui/avatar'
import { Badge, ScoreBadge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/field'
import { Drawer } from '@/components/ui/modal'
import { Spinner } from '@/components/ui/progress'
import { toast } from '@/components/ui/toaster'

/**
 * A lead that hasn't been emailed yet: its details, why it was screened out
 * (if it was), and Claude's draft to read, edit and send.
 */
export function LeadEmailDrawer({
  lead,
  flagged,
  draft,
  onDraft,
  canWrite,
  mailReady,
  onClose,
}: {
  lead: OutreachLead | null
  flagged: string | null
  draft: DraftEmail | null
  onDraft: (draft: DraftEmail | null) => void
  /** Can use Claude to draft (any non-viewer). */
  canWrite: boolean
  /** A mailbox is connected, so drafts can actually be sent. */
  mailReady: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const [writing, startWriting] = useTransition()
  const [sending, startSending] = useTransition()
  const [notAFit, setNotAFit] = useState<string | null>(null)

  if (!lead) return null

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
      onDraft(result.email)
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
      toast.success(`Email sent to ${lead.full_name}. Follow-ups are scheduled.`)
      onDraft(null)
      onClose()
      router.refresh()
    })
  }

  const location = lead.location ?? ([lead.city, lead.country].filter(Boolean).join(', ') || null)
  const warning = notAFit ? `Claude: ${notAFit}` : flagged

  return (
    <Drawer open onClose={onClose} label={`Email for ${lead.full_name}`}>
      <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-card/95 p-5 backdrop-blur">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={lead.full_name} size="lg" />
          <div className="min-w-0">
            <h2 className="truncate font-display text-base font-semibold">{lead.full_name}</h2>
            <p className="truncate text-sm text-muted-foreground">
              {[lead.title, lead.company].filter(Boolean).join(' at ') || lead.source}
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

      <div className="space-y-5 p-5">
        <dl className="space-y-2 text-sm">
          {[
            { icon: Mail, label: 'Email', value: lead.email },
            { icon: Phone, label: 'Phone', value: lead.phone },
            { icon: Building2, label: 'Industry', value: lead.industry },
            { icon: MapPin, label: 'Location', value: location },
          ].map((row) => (
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
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Fit score</dt>
            <dd>
              <ScoreBadge score={lead.score} />
            </dd>
          </div>
        </dl>

        {lead.phone ? (
          <Link href={`/dialer?lead=${lead.id}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            <PhoneCall className="size-3.5" />
            Call instead
          </Link>
        ) : null}

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
                Claude researches {lead.company ?? lead.full_name}, writes the sales brief (the same one
                Targeting shows), then the email. Up to a minute.
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
                <label htmlFor="draft-subject" className="text-xs font-medium text-muted-foreground">
                  Subject
                </label>
                <Input
                  id="draft-subject"
                  value={draft.subject}
                  onChange={(event) => onDraft({ ...draft, subject: event.target.value })}
                  disabled={!canWrite}
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="draft-body" className="text-xs font-medium text-muted-foreground">
                  Email
                </label>
                <Textarea
                  id="draft-body"
                  value={draft.body}
                  onChange={(event) => onDraft({ ...draft, body: event.target.value })}
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
                    Send this email
                  </Button>
                </div>
              ) : null}
              <p className="text-[11px] text-muted-foreground">
                {mailReady
                  ? `Sends to ${lead.email}. If they don't reply, Claude writes two follow-ups in the same thread.`
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
                Claude researches them, picks the AI Savvy service they most need (same as their Targeting script), and
                drafts a personal email asking for a 15-minute call. You can edit it before sending.
              </p>
              {canWrite ? (
                <Button variant={warning ? 'outline' : 'brand'} size="sm" onClick={() => write(Boolean(warning))}>
                  <Sparkles className="size-3.5" />
                  {warning ? 'Write one anyway' : 'Write email with Claude'}
                </Button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </Drawer>
  )
}
