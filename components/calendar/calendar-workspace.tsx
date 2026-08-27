'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  LayoutGrid,
  List,
  Plus,
  Trash2,
  Video,
} from 'lucide-react'
import { deleteMeeting } from '@/lib/actions/meetings'
import { formatDate, formatRelative, formatTime } from '@/lib/format'
import type { MeetingWithLead } from '@/lib/queries'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, EmptyState, SectionHeading } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { toast } from '@/components/ui/toaster'
import { MeetingForm, type LeadOption } from './meeting-form'
import { cn } from '@/lib/utils'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

/** Six-week grid covering the month, padded with leading/trailing days. */
function buildGrid(year: number, month: number) {
  const firstOfMonth = new Date(year, month, 1)
  const start = new Date(year, month, 1 - firstOfMonth.getDay())

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return date
  })
}

export function CalendarWorkspace({
  meetings,
  upcoming,
  leads,
  year,
  month,
  canWrite,
}: {
  meetings: MeetingWithLead[]
  upcoming: MeetingWithLead[]
  leads: LeadOption[]
  year: number
  month: number
  canWrite: boolean
}) {
  const router = useRouter()
  const [view, setView] = useState<'month' | 'list'>('month')
  const [scheduling, setScheduling] = useState<Date | null>(null)
  const [pending, startTransition] = useTransition()

  const grid = useMemo(() => buildGrid(year, month), [year, month])

  const byDay = useMemo(() => {
    const map = new Map<string, MeetingWithLead[]>()
    for (const meeting of meetings) {
      const date = new Date(meeting.starts_at)
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
      map.set(key, [...(map.get(key) ?? []), meeting])
    }
    return map
  }, [meetings])

  const current = new Date(year, month, 1)
  const today = new Date()
  const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`

  const goToMonth = (offset: number) => {
    const target = new Date(year, month + offset, 1)
    startTransition(() => router.push(`/calendar?month=${monthKey(target)}`, { scroll: false }))
  }

  const cancel = (meeting: MeetingWithLead) => {
    if (!window.confirm(`Cancel “${meeting.title}”?`)) return

    startTransition(async () => {
      const result = await deleteMeeting(meeting.id)
      if (result.error) toast.error(result.error)
      else {
        toast.success(result.message!)
        router.refresh()
      }
    })
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-5">
      <SectionHeading
        eyebrow="Team schedule"
        title="Calendar"
        description="Every call and demo booked across the workspace."
        action={
          <>
            <div className="flex rounded-lg border border-border p-0.5">
              <button
                type="button"
                onClick={() => setView('month')}
                className={cn(
                  'rounded-md p-2 transition-colors',
                  view === 'month' ? 'bg-secondary text-foreground' : 'text-muted-foreground',
                )}
                aria-label="Month view"
                aria-pressed={view === 'month'}
              >
                <LayoutGrid className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => setView('list')}
                className={cn(
                  'rounded-md p-2 transition-colors',
                  view === 'list' ? 'bg-secondary text-foreground' : 'text-muted-foreground',
                )}
                aria-label="List view"
                aria-pressed={view === 'list'}
              >
                <List className="size-4" />
              </button>
            </div>
            {canWrite ? (
              <Button variant="brand" onClick={() => setScheduling(new Date())}>
                <Plus className="size-4" />
                Schedule
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader
            title={current.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            description={`${meetings.length} meeting${meetings.length === 1 ? '' : 's'} this month`}
            action={
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => goToMonth(-1)}
                  disabled={pending}
                  aria-label="Previous month"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    startTransition(() =>
                      router.push(`/calendar?month=${monthKey(new Date())}`, { scroll: false }),
                    )
                  }
                  disabled={pending}
                >
                  Today
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => goToMonth(1)}
                  disabled={pending}
                  aria-label="Next month"
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            }
          />

          {view === 'month' ? (
            <div className="px-5 pb-5">
              <div className="mb-1 grid grid-cols-7 gap-1">
                {WEEKDAYS.map((day) => (
                  <div
                    key={day}
                    className="py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {grid.map((date) => {
                  const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
                  const dayMeetings = byDay.get(key) ?? []
                  const inMonth = date.getMonth() === month
                  const isToday = key === todayKey

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => canWrite && setScheduling(date)}
                      className={cn(
                        'min-h-20 rounded-lg border p-1.5 text-left align-top transition-colors',
                        inMonth
                          ? 'border-border bg-background/40 hover:border-primary/40'
                          : 'border-transparent bg-transparent text-muted-foreground/50',
                        isToday && 'border-primary/60 bg-primary/[0.08]',
                        !canWrite && 'cursor-default',
                      )}
                    >
                      <span
                        className={cn(
                          'font-mono text-[11px]',
                          isToday && 'font-semibold text-primary',
                        )}
                      >
                        {date.getDate()}
                      </span>
                      <span className="mt-1 block space-y-1">
                        {dayMeetings.slice(0, 2).map((meeting) => (
                          <span
                            key={meeting.id}
                            className="block truncate rounded bg-gradient-brand px-1.5 py-0.5 text-[10px] font-medium text-white"
                          >
                            {formatTime(meeting.starts_at)} {meeting.title}
                          </span>
                        ))}
                        {dayMeetings.length > 2 ? (
                          <span className="block text-[10px] text-muted-foreground">
                            +{dayMeetings.length - 2} more
                          </span>
                        ) : null}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : meetings.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="Nothing booked this month"
              description="Schedule time with a qualified lead to keep deals moving."
            />
          ) : (
            <ul className="divide-y divide-border">
              {meetings.map((meeting) => (
                <li key={meeting.id} className="flex items-start gap-4 px-5 py-4">
                  <div className="w-14 shrink-0 text-center">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {new Date(meeting.starts_at).toLocaleDateString('en-US', { month: 'short' })}
                    </p>
                    <p className="font-mono text-xl font-semibold">
                      {new Date(meeting.starts_at).getDate()}
                    </p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{meeting.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatTime(meeting.starts_at)} – {formatTime(meeting.ends_at)}
                      {meeting.lead ? ` · ${meeting.lead.full_name}` : ''}
                      {meeting.lead?.company ? ` (${meeting.lead.company})` : ''}
                    </p>
                    {meeting.description ? (
                      <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-muted-foreground">
                        {meeting.description}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {meeting.meeting_url ? (
                      <a
                        href={meeting.meeting_url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                        aria-label="Join meeting"
                      >
                        <Video className="size-3.5" />
                      </a>
                    ) : null}
                    {meeting.lead ? (
                      <Link
                        href={`/crm?lead=${meeting.lead.id}`}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                        aria-label="Open lead"
                      >
                        <ExternalLink className="size-3.5" />
                      </Link>
                    ) : null}
                    {canWrite ? (
                      <button
                        type="button"
                        onClick={() => cancel(meeting)}
                        disabled={pending}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-destructive"
                        aria-label="Cancel meeting"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Up next" description="Your closest five meetings" />
          {upcoming.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="No upcoming meetings"
              description="Once you book time it will show up here with a join link."
              action={
                canWrite ? (
                  <Button variant="brand" onClick={() => setScheduling(new Date())}>
                    Schedule a meeting
                  </Button>
                ) : null
              }
            />
          ) : (
            <ul className="space-y-3 px-5 pb-5">
              {upcoming.map((meeting) => (
                <li key={meeting.id} className="rounded-xl border border-border bg-background/40 p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-medium">{meeting.title}</p>
                    <Badge tone="brand">{formatRelative(meeting.starts_at)}</Badge>
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {formatDate(meeting.starts_at)} · {formatTime(meeting.starts_at)}
                  </p>
                  {meeting.lead ? (
                    <p className="mt-1 truncate text-[11px] text-muted-foreground">
                      {meeting.lead.full_name}
                      {meeting.lead.company ? ` · ${meeting.lead.company}` : ''}
                    </p>
                  ) : null}
                  {meeting.meeting_url ? (
                    <a
                      href={meeting.meeting_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                    >
                      <Video className="size-3.5" />
                      Join call
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Modal
        open={Boolean(scheduling)}
        onClose={() => setScheduling(null)}
        title="Schedule a meeting"
        description="Attendees are notified by your calendar provider once the link is shared."
        className="max-w-xl"
      >
        {scheduling ? (
          <MeetingForm
            leads={leads}
            defaultDate={scheduling}
            onDone={() => {
              setScheduling(null)
              router.refresh()
            }}
          />
        ) : null}
      </Modal>
    </div>
  )
}
