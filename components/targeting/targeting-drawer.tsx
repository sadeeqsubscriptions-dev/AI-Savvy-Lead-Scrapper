'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import {
  Building2,
  Globe,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Target,
  X,
} from 'lucide-react'
import { generateLeadBrief } from '@/lib/actions/targeting'
import type { LeadWithOwner } from '@/lib/queries'
import { formatRelative } from '@/lib/format'
import type { LeadAiBrief } from '@/lib/supabase/types'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Drawer } from '@/components/ui/modal'
import { Spinner } from '@/components/ui/progress'
import { toast } from '@/components/ui/toaster'
import { cn } from '@/lib/utils'

function BriefSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  )
}

function Brief({ brief, generatedAt }: { brief: LeadAiBrief; generatedAt: string | null }) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/[0.06] px-3 py-2 text-xs text-primary">
        <Sparkles className="size-3.5 shrink-0" />
        {generatedAt ? `Researched ${formatRelative(generatedAt)}` : 'Freshly researched'}
      </div>

      <BriefSection label="Who they are">
        <p className="text-sm leading-6 text-muted-foreground">{brief.summary}</p>
      </BriefSection>

      <BriefSection label="Company context">
        <p className="text-sm leading-6 text-muted-foreground">{brief.company_context}</p>
      </BriefSection>

      <BriefSection label="Talking points">
        <ul className="space-y-2">
          {brief.talking_points.map((point, index) => (
            <li key={index} className="flex items-start gap-2.5 text-sm leading-6">
              <Target className="mt-0.5 size-3.5 shrink-0 text-primary" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </BriefSection>

      {brief.objections.length > 0 ? (
        <BriefSection label="Likely objections">
          <div className="space-y-3">
            {brief.objections.map((item, index) => (
              <div key={index} className="rounded-lg border border-border bg-background/40 p-3">
                <p className="flex items-start gap-2 text-xs font-medium text-warning">
                  <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
                  {item.objection}
                </p>
                <p className="mt-1.5 pl-5.5 text-xs leading-5 text-muted-foreground">
                  {item.response}
                </p>
              </div>
            ))}
          </div>
        </BriefSection>
      ) : null}

      <BriefSection label="Closing strategy">
        <p className="text-sm leading-6 text-muted-foreground">{brief.closing_strategy}</p>
      </BriefSection>

      {brief.sources.length > 0 ? (
        <BriefSection label="Sources">
          <ul className="space-y-1.5">
            {brief.sources.map((source, index) => (
              <li key={index}>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate text-xs text-primary hover:underline"
                >
                  {source.title || source.url}
                </a>
              </li>
            ))}
          </ul>
        </BriefSection>
      ) : null}
    </div>
  )
}

export function TargetingDrawer({
  lead,
  onClose,
}: {
  lead: LeadWithOwner | null
  onClose: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [brief, setBrief] = useState<LeadAiBrief | null>(null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)

  useEffect(() => {
    setBrief(lead?.ai_brief ?? null)
    setGeneratedAt(lead?.ai_brief_generated_at ?? null)
  }, [lead])

  if (!lead) return null

  const generate = () => {
    startTransition(async () => {
      const result = await generateLeadBrief(lead.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setBrief(result.brief)
      setGeneratedAt(new Date().toISOString())
      toast.success('Brief generated.')
      router.refresh()
    })
  }

  return (
    <Drawer open onClose={onClose} label={`${lead.full_name} targeting brief`}>
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
        <dl className="space-y-2 text-sm">
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
        </dl>

        <div className={cn('rounded-xl border p-4', brief ? 'border-border' : 'border-primary/30 bg-primary/[0.04]')}>
          {pending ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <Spinner className="size-5 text-primary" />
              <p className="text-sm font-medium">Researching {lead.full_name}…</p>
              <p className="max-w-xs text-xs text-muted-foreground">
                Claude is searching the web and writing the brief. This can take up to a minute.
              </p>
            </div>
          ) : brief ? (
            <>
              <Brief brief={brief} generatedAt={generatedAt} />
              <Button
                variant="outline"
                size="sm"
                className="mt-5 w-full"
                onClick={generate}
                disabled={pending}
              >
                <RefreshCw className="size-3.5" />
                Regenerate brief
              </Button>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-brand text-white">
                <Sparkles className="size-5" />
              </span>
              <p className="text-sm font-medium">No brief yet</p>
              <p className="max-w-xs text-xs leading-5 text-muted-foreground">
                Claude will search the web for {lead.full_name} and {lead.company ?? 'their company'},
                then write talking points, likely objections, and a closing strategy.
              </p>
              <Button variant="brand" size="sm" onClick={generate} disabled={pending}>
                <Sparkles className="size-3.5" />
                Research &amp; generate script
              </Button>
            </div>
          )}
        </div>
      </div>
    </Drawer>
  )
}
