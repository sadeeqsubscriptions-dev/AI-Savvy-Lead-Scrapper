'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Clock3, FileSearch, Trash2 } from 'lucide-react'
import { deleteScrapeJob } from '@/lib/actions/scraper'
import type { ProviderOption } from '@/lib/scraper/registry'
import { formatNumber, formatRelative } from '@/lib/format'
import type { ScrapeJob } from '@/lib/supabase/types'
import { Badge, jobStatusTone } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, EmptyState, SectionHeading } from '@/components/ui/card'
import { toast } from '@/components/ui/toaster'
import { JobMonitor } from './job-monitor'
import { ScrapeForm } from './scrape-form'

export function ScraperWorkspace({
  providers,
  jobs,
  canWrite,
  pendingReview,
}: {
  providers: ProviderOption[]
  jobs: ScrapeJob[]
  canWrite: boolean
  pendingReview: number
}) {
  const router = useRouter()
  const [activeJobId, setActiveJobId] = useState<string | null>(
    jobs.find((job) => job.status === 'queued' || job.status === 'running')?.id ?? null,
  )
  const [pending, startTransition] = useTransition()

  const remove = (jobId: string, name: string) => {
    if (!window.confirm(`Delete “${name}” and its results? Imported leads are kept.`)) return

    startTransition(async () => {
      const result = await deleteScrapeJob(jobId)
      if (result.error) toast.error(result.error)
      else {
        toast.success(result.message!)
        if (activeJobId === jobId) setActiveJobId(null)
        router.refresh()
      }
    })
  }

  const readyProviders = providers.filter((provider) => provider.ready).length

  return (
    <div className="mx-auto max-w-[1440px] space-y-5">
      <SectionHeading
        eyebrow="Lead discovery"
        title="Lead scraper"
        description="Find high-fit accounts by niche and city, score them automatically, then push them into the CRM."
        action={
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge tone="outline">
              {readyProviders} of {providers.length} sources ready
            </Badge>
            {pendingReview > 0 ? (
              <Badge tone="info">{formatNumber(pendingReview)} awaiting review</Badge>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.35fr]">
        <div className="space-y-5">
          {canWrite ? (
            <ScrapeForm providers={providers} onStarted={setActiveJobId} />
          ) : (
            <Card>
              <EmptyState
                icon={FileSearch}
                title="Read-only access"
                description="Your role can view scrape history but cannot start new runs."
              />
            </Card>
          )}
        </div>

        <div className="space-y-5">
          {activeJobId ? (
            <JobMonitor jobId={activeJobId} onClear={() => setActiveJobId(null)} />
          ) : null}

          <Card>
            <CardHeader title="Scrape history" description="Recent runs across the workspace" />
            {jobs.length === 0 ? (
              <EmptyState
                icon={Clock3}
                title="No scrapes yet"
                description="Your first run will show up here with its results and import status."
              />
            ) : (
              <ul className="divide-y divide-border">
                {jobs.map((job) => (
                  <li
                    key={job.id}
                    className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-secondary/20"
                  >
                    <button
                      type="button"
                      onClick={() => setActiveJobId(job.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="truncate text-sm font-medium">{job.name}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {job.provider} · {formatNumber(job.total_found)} found ·{' '}
                        {formatNumber(job.total_imported)} imported · {formatRelative(job.created_at)}
                      </p>
                    </button>
                    <Badge tone={jobStatusTone[job.status]}>{job.status}</Badge>
                    {canWrite ? (
                      <button
                        type="button"
                        onClick={() => remove(job.id, job.name)}
                        disabled={pending}
                        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive"
                        aria-label={`Delete ${job.name}`}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
