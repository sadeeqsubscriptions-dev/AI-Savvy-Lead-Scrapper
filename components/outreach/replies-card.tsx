import Link from 'next/link'
import { CalendarClock, MailCheck, MessageSquareReply } from 'lucide-react'
import { formatRelative } from '@/lib/format'
import { Avatar } from '@/components/ui/avatar'
import { Card } from '@/components/ui/card'

export type RecentReply = {
  leadId: string
  name: string
  company: string | null
  text: string
  at: string
}

/** Dashboard summary of email outreach: who replied, what's going out, today's count. */
export function RepliesCard({
  replies,
  scheduled,
  sentToday,
  dailyTarget,
}: {
  replies: RecentReply[]
  scheduled: number
  sentToday: number
  dailyTarget: number
}) {
  return (
    <Card className={replies.length > 0 ? 'border-success/40' : undefined}>
      <div className="flex flex-col gap-4 p-5 md:flex-row md:items-start">
        <div className="md:w-56 md:shrink-0">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold">
            <MessageSquareReply className="size-4 text-success" />
            {replies.length > 0 ? `${replies.length} new repl${replies.length === 1 ? 'y' : 'ies'}` : 'No new replies'}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">Last 7 days of email outreach</p>
          <div className="mt-4 space-y-2 text-xs text-muted-foreground">
            <p className="flex items-center gap-2">
              <MailCheck className="size-3.5" />
              {sentToday}/{dailyTarget} new leads emailed today
            </p>
            <p className="flex items-center gap-2">
              <CalendarClock className="size-3.5" />
              {scheduled} up next on autopilot
            </p>
            <Link href="/outreach" className="inline-block text-primary hover:underline">
              Open Outreach →
            </Link>
          </div>
        </div>

        {replies.length > 0 ? (
          <ul className="min-w-0 flex-1 divide-y divide-border rounded-xl border border-border">
            {replies.map((reply) => (
              <li key={`${reply.leadId}-${reply.at}`}>
                <Link href={`/targeting/${reply.leadId}`} className="flex gap-3 p-3 hover:bg-secondary/40">
                  <Avatar name={reply.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate font-medium">
                        {reply.name}
                        {reply.company && reply.company !== reply.name ? (
                          <span className="font-normal text-muted-foreground"> · {reply.company}</span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{formatRelative(reply.at)}</span>
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted-foreground">{reply.text}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex-1 self-center text-xs text-muted-foreground">
            When a lead answers, their reply appears here and in the bell at the top.
          </p>
        )}
      </div>
    </Card>
  )
}
