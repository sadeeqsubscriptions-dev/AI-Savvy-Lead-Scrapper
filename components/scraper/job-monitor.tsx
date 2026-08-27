'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { Check, Download, Loader2, Sparkles, X } from 'lucide-react'
import { cancelScrapeJob, importJobRecords, rejectRecords } from '@/lib/actions/scraper'
import { createClient } from '@/lib/supabase/client'
import { formatNumber } from '@/lib/format'
import type { ScrapeJob, ScrapedRecord } from '@/lib/supabase/types'
import { Badge, ScoreBadge, jobStatusTone } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, EmptyState } from '@/components/ui/card'
import { Progress, Spinner } from '@/components/ui/progress'
import { toast } from '@/components/ui/toaster'

const ACTIVE_STATUSES = new Set(['queued', 'running'])

export function JobMonitor({ jobId, onClear }: { jobId: string; onClear: () => void }) {
  const router = useRouter()
  const [job, setJob] = useState<ScrapeJob | null>(null)
  const [records, setRecords] = useState<ScrapedRecord[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pending, startTransition] = useTransition()
  const triggered = useRef<string | null>(null)

  const load = useCallback(async () => {
    const supabase = createClient()

    const [{ data: jobRow }, { data: recordRows }] = await Promise.all([
      supabase.from('scrape_jobs').select('*').eq('id', jobId).maybeSingle(),
      supabase
        .from('scraped_records')
        .select('*')
        .eq('job_id', jobId)
        .order('score', { ascending: false })
        .limit(100),
    ])

    setJob(jobRow ?? null)
    setRecords((recordRows as ScrapedRecord[] | null) ?? [])
    return jobRow
  }, [jobId])

  // Kick off execution once per job, then poll until it settles.
  useEffect(() => {
    if (triggered.current === jobId) return
    triggered.current = jobId

    void fetch('/api/scraper/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId }),
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string }
          toast.error(payload.error ?? 'The scrape could not be started.')
        }
      })
      .catch(() => toast.error('Lost connection to the scraper.'))
  }, [jobId])

  useEffect(() => {
    let cancelled = false
    let timer: number

    const tick = async () => {
      const current = await load()
      if (cancelled) return

      if (current && ACTIVE_STATUSES.has(current.status)) {
        timer = window.setTimeout(tick, 1400)
      } else {
        router.refresh()
      }
    }

    void tick()

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [load, router])

  if (!job) {
    return (
      <Card className="flex items-center justify-center gap-3 p-8 text-sm text-muted-foreground">
        <Spinner />
        Loading scrape…
      </Card>
    )
  }

  const active = ACTIVE_STATUSES.has(job.status)
  const note = (job.config as { note?: string } | null)?.note
  const pendingRecords = records.filter((record) => record.status === 'pending')

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const importSelected = (ids?: string[]) => {
    startTransition(async () => {
      const result = await importJobRecords(jobId, ids)
      if (result.error) toast.error(result.error)
      else {
        toast.success(result.message!)
        setSelected(new Set())
        await load()
      }
    })
  }

  const discard = () => {
    const ids = [...selected]
    startTransition(async () => {
      const result = await rejectRecords(ids)
      if (result.error) toast.error(result.error)
      else {
        toast.success(result.message!)
        setSelected(new Set())
        await load()
      }
    })
  }

  const cancel = () => {
    startTransition(async () => {
      const result = await cancelScrapeJob(jobId)
      if (result.error) toast.error(result.error)
      else toast.success(result.message!)
      await load()
    })
  }

  return (
    <Card className="animate-in fade-in slide-in-from-bottom-2 duration-500">
      <CardHeader
        title={job.name}
        description={`${job.provider} · ${job.locations.length > 0 ? job.locations.join(', ') : 'anywhere'}`}
        action={
          <div className="flex items-center gap-2">
            <Badge tone={jobStatusTone[job.status]}>
              {active ? <Loader2 className="size-3 animate-spin" /> : null}
              {job.status}
            </Badge>
            {active ? (
              <Button variant="ghost" size="sm" onClick={cancel} disabled={pending}>
                Cancel
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={onClear}>
                Close
              </Button>
            )}
          </div>
        }
      />

      <div className="px-5 pb-4">
        <div className="mb-2 flex items-baseline justify-between text-xs">
          <span className="text-muted-foreground">{note ?? `Searching for “${job.query}”`}</span>
          <span className="font-mono">{job.progress}%</span>
        </div>
        <Progress value={job.progress} active={active} />
        <div className="mt-4 grid grid-cols-3 gap-3">
          {[
            { label: 'Found', value: formatNumber(job.total_found) },
            { label: 'Imported', value: formatNumber(job.total_imported) },
            { label: 'Awaiting review', value: formatNumber(pendingRecords.length) },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-lg border border-border bg-background/40 p-3 transition-all duration-300 hover:border-primary/30"
            >
              <p className="text-[11px] text-muted-foreground">{stat.label}</p>
              <p className="mt-0.5 font-mono text-lg font-semibold">{stat.value}</p>
            </div>
          ))}
        </div>

        {job.error ? (
          <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs leading-5 text-destructive">
            {job.error}
          </p>
        ) : null}
      </div>

      {records.length === 0 ? (
        active ? null : (
          <EmptyState
            icon={Sparkles}
            title="No records matched"
            description="Try a broader query, add more cities, or lower the minimum score."
          />
        )
      ) : (
        <>
          {selected.size > 0 ? (
            <div className="flex flex-wrap items-center gap-2 border-y border-border bg-primary/[0.06] px-5 py-2.5">
              <span className="text-xs font-medium">{selected.size} selected</span>
              <Button
                variant="brand"
                size="sm"
                onClick={() => importSelected([...selected])}
                disabled={pending}
              >
                <Download className="size-3.5" />
                Import
              </Button>
              <Button variant="destructive" size="sm" onClick={discard} disabled={pending}>
                <X className="size-3.5" />
                Discard
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
            </div>
          ) : pendingRecords.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-y border-border px-5 py-2.5">
              <span className="text-xs text-muted-foreground">
                {formatNumber(pendingRecords.length)} record
                {pendingRecords.length === 1 ? '' : 's'} waiting to be imported
              </span>
              <Button variant="brand" size="sm" onClick={() => importSelected()} disabled={pending}>
                <Download className="size-3.5" />
                Import all
              </Button>
            </div>
          ) : null}

          <div className="max-h-96 overflow-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead className="sticky top-0 border-b border-border bg-card text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="w-10 px-5 py-2.5" />
                  <th className="px-3 py-2.5 font-medium">Contact</th>
                  <th className="px-3 py-2.5 font-medium">Company</th>
                  <th className="px-3 py-2.5 font-medium">Email</th>
                  <th className="px-3 py-2.5 font-medium">Phone</th>
                  <th className="px-3 py-2.5 font-medium">Score</th>
                  <th className="px-3 py-2.5 font-medium">State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {records.map((record) => (
                  <tr key={record.id} className="transition-colors duration-150 hover:bg-secondary/20">
                    <td className="px-5 py-2.5">
                      {record.status === 'pending' ? (
                        <input
                          type="checkbox"
                          checked={selected.has(record.id)}
                          onChange={() => toggle(record.id)}
                          className="size-3.5 accent-[var(--primary)]"
                          aria-label={`Select ${record.company ?? record.full_name ?? 'record'}`}
                        />
                      ) : null}
                    </td>
                    <td className="max-w-[10rem] truncate px-3 py-2.5 text-sm">
                      {record.full_name ?? '—'}
                    </td>
                    <td className="max-w-[12rem] truncate px-3 py-2.5 text-sm">
                      {record.company ?? '—'}
                    </td>
                    <td className="max-w-[14rem] truncate px-3 py-2.5 text-xs text-muted-foreground">
                      {record.email ?? '—'}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {record.phone ?? '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <ScoreBadge score={record.score} />
                    </td>
                    <td className="px-3 py-2.5">
                      {record.status === 'imported' ? (
                        <Badge tone="success">
                          <Check className="size-3" />
                          Imported
                        </Badge>
                      ) : record.status === 'duplicate' ? (
                        <Badge tone="warning">Duplicate</Badge>
                      ) : record.status === 'rejected' ? (
                        <Badge tone="outline">Discarded</Badge>
                      ) : (
                        <Badge tone="info">Pending</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  )
}
