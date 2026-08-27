'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import {
  Download,
  LayoutGrid,
  List,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { bulkUpdateStatus, deleteLeads, exportLeadsCsv, updateLeadStatus } from '@/lib/actions/leads'
import { LEAD_SOURCES, LEAD_STATUSES, PAGE_SIZE } from '@/lib/constants'
import { formatCurrency, formatNumber, formatRelative } from '@/lib/format'
import type { LeadStatus } from '@/lib/supabase/types'
import type { LeadWithOwner } from '@/lib/queries'
import { Avatar } from '@/components/ui/avatar'
import { Badge, ScoreBadge, leadStatusColor, leadStatusTone } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, EmptyState, SectionHeading } from '@/components/ui/card'
import { Select } from '@/components/ui/field'
import { Modal } from '@/components/ui/modal'
import { Spinner } from '@/components/ui/progress'
import { toast } from '@/components/ui/toaster'
import { LeadForm, type MemberOption } from './lead-form'
import { LeadDrawer } from './lead-drawer'
import { cn } from '@/lib/utils'

type View = 'table' | 'board'

export function CrmWorkspace({
  leads,
  total,
  page,
  pageCount,
  view,
  members,
  canWrite,
  initialLeadId,
  stats,
}: {
  leads: LeadWithOwner[]
  total: number
  page: number
  pageCount: number
  view: View
  members: MemberOption[]
  canWrite: boolean
  initialLeadId?: string
  stats: { label: string; value: string; className?: string }[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [detailId, setDetailId] = useState<string | null>(initialLeadId ?? null)
  const [editing, setEditing] = useState<LeadWithOwner | null>(null)
  const [creating, setCreating] = useState(false)
  const [exporting, setExporting] = useState(false)

  const detailLead = useMemo(
    () => leads.find((lead) => lead.id === detailId) ?? null,
    [leads, detailId],
  )

  const setParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString())

      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === '' || value === 'all') params.delete(key)
        else params.set(key, value)
      }

      // Any filter change invalidates the current page offset.
      if (!('page' in updates)) params.delete('page')

      startTransition(() => {
        router.push(`/crm${params.toString() ? `?${params.toString()}` : ''}`, { scroll: false })
      })
    },
    [router, searchParams],
  )

  // Debounce the search box so typing does not fire a request per keystroke.
  useEffect(() => {
    const current = searchParams.get('q') ?? ''
    if (query === current) return

    const handle = window.setTimeout(() => setParams({ q: query || null }), 350)
    return () => window.clearTimeout(handle)
  }, [query, searchParams, setParams])

  useEffect(() => {
    setSelected(new Set())
  }, [leads])

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    setSelected((current) =>
      current.size === leads.length ? new Set() : new Set(leads.map((lead) => lead.id)),
    )
  }

  const changeStatus = (id: string, status: LeadStatus) => {
    startTransition(async () => {
      const result = await updateLeadStatus(id, status)
      if (result.error) toast.error(result.error)
    })
  }

  const bulkStatus = (status: LeadStatus) => {
    const ids = [...selected]
    startTransition(async () => {
      const result = await bulkUpdateStatus(ids, status)
      if (result.error) toast.error(result.error)
      else {
        toast.success(result.message!)
        setSelected(new Set())
      }
    })
  }

  const bulkDelete = () => {
    const ids = [...selected]
    if (!window.confirm(`Delete ${ids.length} lead${ids.length === 1 ? '' : 's'}? This cannot be undone.`)) {
      return
    }
    startTransition(async () => {
      const result = await deleteLeads(ids)
      if (result.error) toast.error(result.error)
      else {
        toast.success(result.message!)
        setSelected(new Set())
      }
    })
  }

  const exportCsv = async () => {
    setExporting(true)
    try {
      const { csv, filename } = await exportLeadsCsv()
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.click()
      URL.revokeObjectURL(url)
      toast.success('Export downloaded.')
    } catch {
      toast.error('Could not build the export.')
    } finally {
      setExporting(false)
    }
  }

  const activeFilters = ['status', 'source', 'owner'].filter(
    (key) => searchParams.get(key) && searchParams.get(key) !== 'all',
  ).length

  return (
    <>
      <SectionHeading
        eyebrow="Revenue workspace"
        title="CRM"
        description="Manage, qualify, and move your pipeline forward."
        action={
          <>
            <Button variant="outline" onClick={exportCsv} disabled={exporting}>
              {exporting ? <Spinner /> : <Download className="size-4" />}
              Export CSV
            </Button>
            {canWrite ? (
              <Button variant="brand" onClick={() => setCreating(true)}>
                <Plus className="size-4" />
                Add lead
              </Button>
            ) : null}
          </>
        }
      />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="p-4">
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <p className={cn('mt-1 font-mono text-2xl font-semibold', stat.className)}>
              {stat.value}
            </p>
          </Card>
        ))}
      </section>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-input bg-background/60 px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search leads, companies, email…"
              className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              aria-label="Search leads"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
            {pending ? <Spinner className="size-3.5 text-muted-foreground" /> : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={searchParams.get('status') ?? 'all'}
              onChange={(event) => setParams({ status: event.target.value })}
              className="h-9 w-auto text-xs"
              aria-label="Filter by status"
            >
              <option value="all">All statuses</option>
              {LEAD_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </Select>

            <Select
              value={searchParams.get('source') ?? 'all'}
              onChange={(event) => setParams({ source: event.target.value })}
              className="h-9 w-auto text-xs"
              aria-label="Filter by source"
            >
              <option value="all">All sources</option>
              {LEAD_SOURCES.map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </Select>

            <Select
              value={searchParams.get('owner') ?? 'all'}
              onChange={(event) => setParams({ owner: event.target.value })}
              className="hidden h-9 w-auto text-xs sm:block"
              aria-label="Filter by owner"
            >
              <option value="all">All owners</option>
              <option value="unassigned">Unassigned</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </Select>

            <Select
              value={searchParams.get('sort') ?? 'newest'}
              onChange={(event) => setParams({ sort: event.target.value })}
              className="hidden h-9 w-auto text-xs md:block"
              aria-label="Sort leads"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="score">Highest score</option>
              <option value="value">Highest value</option>
              <option value="name">Name A–Z</option>
            </Select>

            {activeFilters > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setParams({ status: null, source: null, owner: null })}
              >
                Clear ({activeFilters})
              </Button>
            ) : null}

            <div className="flex rounded-lg border border-border p-0.5">
              <button
                type="button"
                onClick={() => setParams({ view: null })}
                className={cn(
                  'rounded-md p-1.5 transition-colors',
                  view === 'table' ? 'bg-secondary text-foreground' : 'text-muted-foreground',
                )}
                aria-label="Table view"
                aria-pressed={view === 'table'}
              >
                <List className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => setParams({ view: 'board' })}
                className={cn(
                  'rounded-md p-1.5 transition-colors',
                  view === 'board' ? 'bg-secondary text-foreground' : 'text-muted-foreground',
                )}
                aria-label="Board view"
                aria-pressed={view === 'board'}
              >
                <LayoutGrid className="size-4" />
              </button>
            </div>
          </div>
        </div>

        {selected.size > 0 && canWrite ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-primary/[0.06] px-4 py-2.5">
            <span className="text-xs font-medium">
              {selected.size} selected
            </span>
            <Select
              defaultValue=""
              onChange={(event) => {
                if (event.target.value) bulkStatus(event.target.value as LeadStatus)
                event.target.value = ''
              }}
              className="h-8 w-auto text-xs"
              aria-label="Move selected leads to status"
            >
              <option value="">Move to…</option>
              {LEAD_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </Select>
            <Button variant="destructive" size="sm" onClick={bulkDelete} disabled={pending}>
              <Trash2 className="size-3.5" />
              Delete
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        ) : null}

        {leads.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No leads match these filters"
            description="Try a broader search, clear the filters, or add a lead to get started."
            action={
              canWrite ? (
                <Button variant="brand" onClick={() => setCreating(true)}>
                  <Plus className="size-4" />
                  Add lead
                </Button>
              ) : null
            }
          />
        ) : view === 'table' ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead className="border-b border-border bg-secondary/30 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  {canWrite ? (
                    <th className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.size === leads.length && leads.length > 0}
                        onChange={toggleAll}
                        className="size-3.5 accent-[var(--primary)]"
                        aria-label="Select all leads on this page"
                      />
                    </th>
                  ) : null}
                  <th className="px-4 py-3 font-medium">Lead</th>
                  <th className="px-4 py-3 font-medium">Company</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Score</th>
                  <th className="px-4 py-3 font-medium">Value</th>
                  <th className="px-4 py-3 font-medium">Owner</th>
                  <th className="px-4 py-3 font-medium">Last contact</th>
                  <th className="w-10 px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {leads.map((lead) => (
                  <tr key={lead.id} className="group transition-colors hover:bg-secondary/20">
                    {canWrite ? (
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(lead.id)}
                          onChange={() => toggle(lead.id)}
                          className="size-3.5 accent-[var(--primary)]"
                          aria-label={`Select ${lead.full_name}`}
                        />
                      </td>
                    ) : null}
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setDetailId(lead.id)}
                        className="flex items-center gap-3 text-left"
                      >
                        <Avatar name={lead.full_name} />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium group-hover:text-primary">
                            {lead.full_name}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {lead.title ?? lead.email ?? '—'}
                          </span>
                        </span>
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <span className="block truncate text-sm">{lead.company ?? '—'}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {lead.location ?? lead.source}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {canWrite ? (
                        <Select
                          value={lead.status}
                          onChange={(event) => changeStatus(lead.id, event.target.value as LeadStatus)}
                          className="h-8 w-auto border-0 bg-transparent px-2 text-xs shadow-none"
                          aria-label={`Status for ${lead.full_name}`}
                        >
                          {LEAD_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <Badge tone={leadStatusTone[lead.status]}>{lead.status}</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <ScoreBadge score={lead.score} />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {formatCurrency(lead.estimated_value)}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {lead.owner?.full_name ?? lead.owner?.email ?? 'Unassigned'}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {lead.last_contacted_at ? formatRelative(lead.last_contacted_at) : 'Never'}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setDetailId(lead.id)}
                        className="rounded-md p-1.5 text-muted-foreground opacity-0 transition hover:bg-secondary hover:text-foreground group-hover:opacity-100"
                        aria-label={`Open ${lead.full_name}`}
                      >
                        <MoreHorizontal className="size-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid gap-4 overflow-x-auto p-4 md:grid-cols-3 xl:grid-cols-6">
            {LEAD_STATUSES.map((column) => {
              const columnLeads = leads.filter((lead) => lead.status === column)
              return (
                <div key={column} className="min-w-[190px]">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="flex items-center gap-2 text-xs font-semibold">
                      <span className={`size-2 rounded-full ${leadStatusColor[column]}`} />
                      {column}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {columnLeads.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {columnLeads.slice(0, 12).map((lead) => (
                      <button
                        key={lead.id}
                        type="button"
                        onClick={() => setDetailId(lead.id)}
                        className="w-full rounded-lg border border-border bg-background/50 p-3 text-left transition-colors hover:border-primary/50"
                      >
                        <div className="flex items-center gap-2">
                          <Avatar name={lead.full_name} size="sm" />
                          <span className="truncate text-xs font-medium">{lead.full_name}</span>
                        </div>
                        <p className="mt-2 truncate text-xs text-muted-foreground">
                          {lead.company ?? '—'}
                        </p>
                        <div className="mt-3 flex items-center justify-between">
                          <span className="font-mono text-[10px] text-primary">
                            Score {lead.score}
                          </span>
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {formatCurrency(lead.estimated_value)}
                          </span>
                        </div>
                      </button>
                    ))}
                    {columnLeads.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-border py-6 text-center text-[11px] text-muted-foreground">
                        Empty
                      </p>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {view === 'table' && leads.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground">
            <span>
              Showing {formatNumber((page - 1) * PAGE_SIZE + 1)}–
              {formatNumber(Math.min(page * PAGE_SIZE, total))} of {formatNumber(total)} leads
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || pending}
                onClick={() => setParams({ page: String(page - 1) })}
              >
                Previous
              </Button>
              <span className="px-2 font-mono">
                {page} / {pageCount}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pageCount || pending}
                onClick={() => setParams({ page: String(page + 1) })}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      <LeadDrawer
        lead={detailLead}
        canWrite={canWrite}
        onClose={() => setDetailId(null)}
        onEdit={(lead) => {
          setDetailId(null)
          setEditing(lead)
        }}
      />

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Add a lead"
        description="Only a name is required — everything else can be filled in later."
        className="max-w-2xl"
      >
        <LeadForm members={members} onDone={() => setCreating(false)} />
      </Modal>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={`Edit ${editing?.full_name ?? 'lead'}`}
        className="max-w-2xl"
      >
        {editing ? (
          <LeadForm lead={editing} members={members} onDone={() => setEditing(null)} />
        ) : null}
      </Modal>
    </>
  )
}
