import Link from 'next/link'
import type { Metadata } from 'next'
import {
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  Flame,
  Gauge,
  Plus,
  Sparkles,
  Target,
} from 'lucide-react'
import { TrendChart } from '@/components/charts/trend-chart'
import { Avatar } from '@/components/ui/avatar'
import { Badge, leadStatusColor } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, EmptyState } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { requireSession } from '@/lib/auth'
import { LEAD_STATUSES } from '@/lib/constants'
import { formatCurrency, formatDelta, formatNumber, formatPercent, formatRelative, formatTime, greetingFor } from '@/lib/format'
import {
  getDashboardMetrics,
  getLeadStatusCounts,
  getLeadTrend,
  getRecentActivity,
  getTeamPerformance,
  getUpcomingMeetings,
} from '@/lib/queries'

export const metadata: Metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const session = await requireSession()
  const orgId = session.organization.id

  const [metrics, trend, activity, team, meetings, statusCounts] = await Promise.all([
    getDashboardMetrics(orgId),
    getLeadTrend(orgId, 30),
    getRecentActivity(orgId, 6),
    getTeamPerformance(orgId),
    getUpcomingMeetings(orgId, 4),
    getLeadStatusCounts(orgId),
  ])

  const firstName = (session.profile.full_name ?? session.email).split(' ')[0].split('@')[0]
  const closedTotal = metrics.won_leads + metrics.lost_leads
  const winRate = closedTotal > 0 ? (metrics.won_leads / closedTotal) * 100 : 0
  const weekDelta = formatDelta(metrics.leads_this_week, metrics.leads_prev_week)
  const topPerformer = team[0]
  const maxWon = Math.max(1, ...team.map((member) => Number(member.won_leads)))

  const cards = [
    {
      label: 'Open pipeline',
      value: formatCurrency(metrics.pipeline_value),
      hint: `${formatNumber(metrics.qualified_leads)} qualified`,
      icon: CircleDollarSign,
    },
    {
      label: 'Total leads',
      value: formatNumber(metrics.total_leads),
      hint: weekDelta ? `${weekDelta} week over week` : 'No prior week to compare',
      icon: Target,
    },
    {
      label: 'Win rate',
      value: formatPercent(winRate),
      hint: `${formatNumber(metrics.won_leads)} won · ${formatCurrency(metrics.won_value)}`,
      icon: Flame,
    },
    {
      label: 'Average score',
      value: String(metrics.avg_score),
      hint: `${formatNumber(metrics.needs_attention)} need a first touch`,
      icon: Gauge,
    },
  ]

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      <section className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
            <span className="size-2 rounded-full bg-success" />
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            {greetingFor()}, {firstName}.
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Here is what is moving across {session.organization.name} today.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/scraper">
            <Button variant="brand">
              <Plus className="size-4" />
              Find leads
            </Button>
          </Link>
          <Link href="/calendar">
            <Button variant="outline">
              <CalendarDays className="size-4" />
              Schedule
            </Button>
          </Link>
        </div>
      </section>

      {metrics.total_leads === 0 ? (
        <Card className="border-primary/30 bg-primary/[0.05]">
          <EmptyState
            icon={Sparkles}
            title="Your workspace is ready — now fill the pipeline"
            description="Run a scrape to discover accounts, add a lead by hand, or load a sample dataset from Settings to explore the app with realistic data."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Link href="/scraper">
                  <Button variant="brand">Run your first scrape</Button>
                </Link>
                <Link href="/crm">
                  <Button variant="outline">Add a lead manually</Button>
                </Link>
                <Link href="/settings?tab=workspace">
                  <Button variant="ghost">Load sample data</Button>
                </Link>
              </div>
            }
          />
        </Card>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card, index) => {
          const Icon = card.icon
          return (
            <Card
              key={card.label}
              className="hover-lift animate-in fade-in slide-in-from-bottom-3 p-4 duration-500 [animation-fill-mode:backwards]"
              style={{ animationDelay: `${index * 80}ms` }}
            >
              <div className="mb-3 flex items-start justify-between">
                <span className="flex size-9 items-center justify-center rounded-lg bg-primary/12 text-primary transition-transform duration-300 hover:scale-110">
                  <Icon className="size-4" />
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{card.label}</p>
              <p className="mt-1 font-mono text-2xl font-semibold tracking-tight">{card.value}</p>
              <p className="mt-2 text-[11px] text-muted-foreground">{card.hint}</p>
            </Card>
          )
        })}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.55fr_1fr] animate-in fade-in slide-in-from-bottom-3 duration-500 [animation-delay:150ms] [animation-fill-mode:backwards]">
        <Card className="hover-lift">
          <CardHeader
            title="Pipeline performance"
            description="Leads added over the last 30 days"
            action={
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-primary" />
                  Added
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-chart-2" />
                  Won
                </span>
              </div>
            }
          />
          <div className="px-3 pb-4">
            <TrendChart points={trend} />
          </div>
        </Card>

        <Card className="hover-lift">
          <CardHeader
            title="Recent activity"
            description="Every touch across the workspace"
            action={
              <Link href="/crm" className="text-xs font-medium text-primary hover:underline">
                View CRM
              </Link>
            }
          />
          <div className="px-5 pb-5">
            {activity.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">
                Activity will appear here as your team works the pipeline.
              </p>
            ) : (
              <ul className="space-y-4">
                {activity.map((item) => (
                  <li key={item.id} className="flex gap-3">
                    <Avatar name={item.actor?.full_name ?? item.actor?.email ?? 'System'} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-snug">{item.title}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {item.actor?.full_name ?? item.actor?.email ?? 'Automation'} ·{' '}
                        {formatRelative(item.created_at)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3 animate-in fade-in slide-in-from-bottom-3 duration-500 [animation-delay:250ms] [animation-fill-mode:backwards]">
        <Card className="hover-lift">
          <CardHeader title="Pipeline by stage" description="Where every lead sits right now" />
          <div className="space-y-3 px-5 pb-5">
            {LEAD_STATUSES.map((status) => {
              const count = statusCounts[status] ?? 0
              const share = metrics.total_leads > 0 ? (count / metrics.total_leads) * 100 : 0
              return (
                <div key={status}>
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2">
                      <span className={`size-2 rounded-full ${leadStatusColor[status]}`} />
                      {status}
                    </span>
                    <span className="font-mono text-muted-foreground">{formatNumber(count)}</span>
                  </div>
                  <Progress
                    value={share}
                    barClassName={leadStatusColor[status].replace('bg-', 'bg-')}
                  />
                </div>
              )
            })}
          </div>
        </Card>

        <Card className="hover-lift">
          <CardHeader
            title="Team leaderboard"
            description="Closed won by owner"
            action={
              <Link href="/team" className="text-xs font-medium text-primary hover:underline">
                Full report
              </Link>
            }
          />
          <div className="px-5 pb-5">
            {team.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">
                Invite teammates to compare performance.
              </p>
            ) : (
              <ul className="space-y-4">
                {team.slice(0, 5).map((member, index) => (
                  <li key={member.user_id} className="flex items-center gap-3">
                    <span className="w-3 font-mono text-xs text-muted-foreground">{index + 1}</span>
                    <Avatar name={member.full_name ?? member.email} />
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between gap-2">
                        <span className="truncate text-sm font-medium">
                          {member.full_name ?? member.email}
                        </span>
                        <span className="shrink-0 font-mono text-xs">
                          {formatNumber(member.won_leads)} won
                        </span>
                      </div>
                      <Progress
                        value={(Number(member.won_leads) / maxWon) * 100}
                        className="mt-2"
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card className="hover-lift">
          <CardHeader
            title="Upcoming meetings"
            description="Next four on the calendar"
            action={
              <Link href="/calendar" className="text-xs font-medium text-primary hover:underline">
                Open calendar
              </Link>
            }
          />
          <div className="px-5 pb-5">
            {meetings.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">
                Nothing scheduled. Book time with a qualified lead to keep momentum.
              </p>
            ) : (
              <ul className="space-y-3">
                {meetings.map((meeting) => (
                  <li
                    key={meeting.id}
                    className="rounded-lg border border-border bg-background/40 p-3 transition-all duration-200 hover:border-primary/30 hover:bg-background/70"
                  >
                    <p className="truncate text-sm font-medium">{meeting.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(meeting.starts_at).toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}{' '}
                      · {formatTime(meeting.starts_at)}
                    </p>
                    {meeting.lead ? (
                      <p className="mt-1.5 truncate text-[11px] text-muted-foreground">
                        {meeting.lead.full_name}
                        {meeting.lead.company ? ` · ${meeting.lead.company}` : ''}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </section>

      {metrics.needs_attention > 0 ? (
        <Card className="animate-in fade-in slide-in-from-bottom-3 border-primary/30 bg-primary/[0.06] p-5 duration-500 [animation-delay:350ms] [animation-fill-mode:backwards]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="mb-3 flex size-9 items-center justify-center rounded-lg bg-gradient-brand text-white">
                <Sparkles className="size-4" />
              </span>
              <h2 className="font-display font-semibold">
                {formatNumber(metrics.needs_attention)} leads are going cold
              </h2>
              <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
                These came in more than three days ago and still have no first touch.
                {topPerformer
                  ? ` ${topPerformer.full_name ?? topPerformer.email} is converting at ${formatPercent(topPerformer.conversion)} — worth routing a few their way.`
                  : ''}
              </p>
            </div>
            <ArrowUpRight className="size-5 shrink-0 text-primary" />
          </div>
          <Link
            href="/crm?status=New&sort=oldest"
            className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
          >
            Work the new leads
            <ChevronRight className="size-4" />
          </Link>
        </Card>
      ) : null}
    </div>
  )
}
