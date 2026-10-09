'use client'

import Link from 'next/link'
import { Building2, Globe, Mail, MapPin, Phone, PhoneCall, X } from 'lucide-react'
import type { DraftEmail } from '@/lib/outreach/compose'
import type { OutreachLead } from '@/lib/queries'
import { Avatar } from '@/components/ui/avatar'
import { ScoreBadge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Drawer } from '@/components/ui/modal'
import { EmailComposer } from './email-composer'

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
  if (!lead) return null

  const location = lead.location ?? ([lead.city, lead.country].filter(Boolean).join(', ') || null)

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

        <EmailComposer
          lead={lead}
          flagged={flagged}
          draft={draft}
          onDraft={onDraft}
          canWrite={canWrite}
          mailReady={mailReady}
          onSent={onClose}
        />
      </div>
    </Drawer>
  )
}
