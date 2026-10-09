import { MessageCircle, ShieldAlert, Sparkles, Target } from 'lucide-react'
import type { LeadAiBrief } from '@/lib/supabase/types'
import { Badge } from '@/components/ui/badge'

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      {children}
    </div>
  )
}

/**
 * The short sales script: who they are, where to hit them, what to offer.
 * Shared by the Targeting drawer and the dialer, so reps see the same thing.
 */
export function BriefScript({ brief, compact = false }: { brief: LeadAiBrief; compact?: boolean }) {
  return (
    <div className="space-y-4">
      <Section label="Who they are">
        <p className="text-sm leading-6">{brief.summary}</p>
      </Section>

      <Section label="Where to hit them">
        <ul className="space-y-1.5">
          {brief.pain_points.map((point, index) => (
            <li key={index} className="flex items-start gap-2 text-sm leading-6">
              <Target className="mt-1 size-3.5 shrink-0 text-primary" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section label="What we offer">
        <div className="rounded-lg border border-primary/25 bg-primary/[0.06] p-3">
          <Badge tone="brand">
            <Sparkles className="size-3" />
            {brief.offer.service}
          </Badge>
          <p className="mt-2 text-sm leading-6">{brief.offer.pitch}</p>
        </div>
      </Section>

      <Section label="Open with">
        <p className="flex items-start gap-2 text-sm leading-6">
          <MessageCircle className="mt-1 size-3.5 shrink-0 text-success" />
          <span>&ldquo;{brief.opener}&rdquo;</span>
        </p>
      </Section>

      {brief.objections.length > 0 ? (
        <Section label="If they say…">
          <div className="space-y-2">
            {brief.objections.map((item, index) => (
              <div key={index} className="rounded-lg border border-border bg-background/40 p-2.5">
                <p className="flex items-start gap-2 text-xs font-medium text-warning">
                  <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
                  {item.objection}
                </p>
                <p className="mt-1 pl-5.5 text-xs leading-5 text-muted-foreground">{item.response}</p>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {!compact && brief.sources.length > 0 ? (
        <Section label="Sources">
          <ul className="space-y-1">
            {brief.sources.map((source, index) => (
              <li key={index} className="truncate">
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline"
                >
                  {source.title || source.url}
                </a>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  )
}
