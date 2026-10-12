'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { AlertTriangle, ChevronRight, Phone, PhoneCall, Search } from 'lucide-react'
import { formatRelative } from '@/lib/format'
import type { LeadStatus } from '@/lib/supabase/types'
import { Avatar } from '@/components/ui/avatar'
import { Badge, ScoreBadge, leadStatusTone } from '@/components/ui/badge'
import { Card, EmptyState, SectionHeading } from '@/components/ui/card'
import { Input } from '@/components/ui/field'

export type DialerListLead = {
  id: string
  full_name: string
  company: string | null
  phone: string | null
  industry: string | null
  score: number
  status: LeadStatus
  last_contacted_at: string | null
}

/** Every lead with a phone number. Clicking one opens its own call page. */
export function DialerList({
  leads,
  voice,
}: {
  leads: DialerListLead[]
  voice: { configured: boolean; missing: string[] }
}) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return leads
    return leads.filter((lead) =>
      [lead.full_name, lead.company, lead.phone, lead.industry, lead.status].some((value) =>
        value?.toLowerCase().includes(term),
      ),
    )
  }, [leads, query])

  return (
    <div className="mx-auto max-w-[1200px] space-y-5">
      <SectionHeading
        eyebrow="Calling"
        title="Dialer"
        description="Pick a lead to open its call page. Claude listens during the call, suggests what to say, and picks up meeting times and call-backs for you."
      />

      {!voice.configured ? (
        <Card className="flex items-start gap-3 border-warning/40 bg-warning/[0.06] p-4">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <div className="text-sm">
            <p className="font-medium">Browser calling isn&apos;t connected yet</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Add these Twilio settings in Vercel, then redeploy:{' '}
              <span className="font-mono text-foreground">{voice.missing.join(', ')}</span>. Until then you can call from
              your phone and still log outcomes, book meetings and send emails from each lead&apos;s call page.
            </p>
          </div>
        </Card>
      ) : null}

      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, company, phone, stage"
              className="pl-9"
              aria-label="Search leads"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {filtered.length} of {leads.length} leads with a phone number
          </p>
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon={Phone} title="No leads to call" description="Leads with a phone number show up here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Lead</th>
                  <th className="px-3 py-3 font-medium">Phone</th>
                  <th className="px-3 py-3 font-medium">Stage</th>
                  <th className="px-3 py-3 font-medium">Last contact</th>
                  <th className="px-3 py-3 font-medium">Score</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((lead) => (
                  <tr key={lead.id} className="group hover:bg-secondary/30">
                    <td className="px-4 py-3">
                      <Link href={`/dialer/${lead.id}`} className="flex items-center gap-3">
                        <Avatar name={lead.full_name} />
                        <span className="min-w-0">
                          <span className="block max-w-72 truncate text-sm font-medium group-hover:text-primary">
                            {lead.full_name}
                          </span>
                          <span className="block max-w-72 truncate text-xs text-muted-foreground">
                            {[lead.company !== lead.full_name ? lead.company : null, lead.industry]
                              .filter(Boolean)
                              .join(' · ') || '—'}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs">{lead.phone}</td>
                    <td className="px-3 py-3">
                      <Badge tone={leadStatusTone[lead.status]}>{lead.status}</Badge>
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">
                      {lead.last_contacted_at ? formatRelative(lead.last_contacted_at) : 'Never'}
                    </td>
                    <td className="px-3 py-3">
                      <ScoreBadge score={lead.score} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/dialer/${lead.id}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:border-success/50 hover:text-success"
                      >
                        <PhoneCall className="size-3.5" />
                        Open
                        <ChevronRight className="size-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
