'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import {
  Building2,
  Globe,
  Mail,
  MapPin,
  Phone,
  PhoneCall,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react'
import { generateLeadBrief } from '@/lib/actions/targeting'
import type { LeadWithOwner } from '@/lib/queries'
import { formatRelative } from '@/lib/format'
import { currentBrief } from '@/lib/ai/brief-shape'
import type { LeadAiBrief } from '@/lib/supabase/types'
import { Avatar } from '@/components/ui/avatar'
import { Button, buttonVariants } from '@/components/ui/button'
import { Drawer } from '@/components/ui/modal'
import { Spinner } from '@/components/ui/progress'
import { toast } from '@/components/ui/toaster'
import { cn } from '@/lib/utils'
import { BriefScript } from './brief-script'

function Brief({ brief, generatedAt }: { brief: LeadAiBrief; generatedAt: string | null }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/[0.06] px-3 py-2 text-xs text-primary">
        <Sparkles className="size-3.5 shrink-0" />
        {generatedAt ? `Researched ${formatRelative(generatedAt)}` : 'Freshly researched'}
      </div>
      <BriefScript brief={brief} />
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
    setBrief(currentBrief(lead?.ai_brief))
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

        {lead.phone ? (
          <Link href={`/dialer?lead=${lead.id}`} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'w-full')}>
            <PhoneCall className="size-3.5" />
            Call {lead.phone}
          </Link>
        ) : null}

        <div className={cn('rounded-xl border p-4', brief ? 'border-border' : 'border-primary/30 bg-primary/[0.04]')}>
          {pending ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <Spinner className="size-5 text-primary" />
              <p className="text-sm font-medium">Researching {lead.full_name}…</p>
              <p className="max-w-xs text-xs text-muted-foreground">
                Claude is checking the web and writing a short script. Usually 20-40 seconds.
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
                Claude researches {lead.company ?? lead.full_name} and writes a short script: who they are,
                where to hit them, and which AI Savvy service to offer.
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
