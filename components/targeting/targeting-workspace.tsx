'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Crosshair } from 'lucide-react'
import type { LeadWithOwner } from '@/lib/queries'
import { formatCurrency, formatRelative } from '@/lib/format'
import { Avatar } from '@/components/ui/avatar'
import { Badge, ScoreBadge, leadStatusTone } from '@/components/ui/badge'
import { Card, EmptyState, SectionHeading } from '@/components/ui/card'
import { Select } from '@/components/ui/field'
import { TargetingDrawer } from './targeting-drawer'

export function TargetingWorkspace({
  leads,
  members,
  activeRepId,
  activeRepName,
}: {
  leads: LeadWithOwner[]
  members: { id: string; name: string }[]
  activeRepId: string
  activeRepName: string
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<LeadWithOwner | null>(null)

  return (
    <div className="mx-auto max-w-[1200px] space-y-5">
      <SectionHeading
        eyebrow="Sales enablement"
        title={`${activeRepName === 'You' ? 'Your' : `${activeRepName}'s`} targeting queue`}
        description="Every lead assigned here, ready for Claude to research and script your approach before you reach out."
        action={
          members.length > 0 ? (
            <Select
              value={activeRepId}
              onChange={(event) => router.push(`/targeting?rep=${event.target.value}`)}
              className="w-56"
              aria-label="Viewing teammate"
            >
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </Select>
          ) : null
        }
      />

      {leads.length === 0 ? (
        <Card>
          <EmptyState
            icon={Crosshair}
            title="Nothing assigned yet"
            description="Leads assigned to this rep in the CRM will show up here, ready for a research brief."
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {leads.map((lead) => (
            <button
              key={lead.id}
              type="button"
              onClick={() => setSelected(lead)}
              className="hover-lift group text-left"
            >
              <Card className="h-full p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Avatar name={lead.full_name} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold group-hover:text-primary">
                        {lead.full_name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[lead.title, lead.company].filter(Boolean).join(' at ') || 'No company on file'}
                      </p>
                    </div>
                  </div>
                  <ScoreBadge score={lead.score} />
                </div>

                <div className="mt-4 flex items-center justify-between text-xs">
                  <Badge tone={leadStatusTone[lead.status]}>{lead.status}</Badge>
                  <span className="font-mono text-muted-foreground">
                    {formatCurrency(lead.estimated_value, false)}
                  </span>
                </div>

                <p className="mt-3 text-[11px] text-muted-foreground">
                  {lead.ai_brief
                    ? `Brief generated ${formatRelative(lead.ai_brief_generated_at!)}`
                    : 'No brief generated yet'}
                </p>
              </Card>
            </button>
          ))}
        </div>
      )}

      <TargetingDrawer lead={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
