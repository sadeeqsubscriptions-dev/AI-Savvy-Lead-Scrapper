'use client'

import { useRouter } from 'next/navigation'
import { useActionState, useEffect, useRef } from 'react'
import { CalendarDays, Mail, MessageSquare, Phone, RefreshCw, Sparkles, StickyNote, UserPlus } from 'lucide-react'
import { logActivity } from '@/lib/actions/leads'
import type { ActionState } from '@/lib/actions/state'
import { formatDateTime } from '@/lib/format'
import type { ActivityType } from '@/lib/supabase/types'
import { Button } from '@/components/ui/button'
import { Input, Select, Textarea } from '@/components/ui/field'
import { toast } from '@/components/ui/toaster'

export type ActivityItem = {
  id: string
  type: ActivityType
  title: string
  body: string | null
  created_at: string
  actor: { full_name: string | null; email: string } | null
}

const icons: Record<ActivityType, typeof Mail> = {
  created: Sparkles,
  imported: Sparkles,
  note: StickyNote,
  email: Mail,
  call: Phone,
  meeting: CalendarDays,
  status_change: RefreshCw,
  assigned: UserPlus,
}

/** The lead's timeline plus a form to log what happened (call, email, meeting, note). */
export function ActivityLog({
  leadId,
  activities,
  canWrite,
  compact = false,
}: {
  leadId: string
  activities: ActivityItem[]
  canWrite: boolean
  compact?: boolean
}) {
  const router = useRouter()
  const form = useRef<HTMLFormElement>(null)
  const [state, formAction, pending] = useActionState<ActionState, FormData>(logActivity, {})

  useEffect(() => {
    if (state.ok) {
      toast.success(state.message ?? 'Logged.')
      form.current?.reset()
      router.refresh()
    } else if (state.error) {
      toast.error(state.error)
    }
  }, [state, router])

  return (
    <div className="space-y-4">
      {canWrite ? (
        <form ref={form} action={formAction} className="space-y-2 rounded-xl border border-border p-3">
          <input type="hidden" name="lead_id" value={leadId} />
          <div className="flex gap-2">
            <Select name="type" defaultValue="note" className="w-32" aria-label="What happened">
              <option value="note">Note</option>
              <option value="call">Call</option>
              <option value="email">Email</option>
              <option value="meeting">Meeting</option>
            </Select>
            <Input name="title" placeholder="e.g. Replied — wants a demo next week" aria-label="Summary" required />
          </div>
          <Textarea name="body" placeholder="Details (optional)" rows={2} className="min-h-16" aria-label="Details" />
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={pending}>
              <MessageSquare className="size-3.5" />
              Add to log
            </Button>
          </div>
        </form>
      ) : null}

      {activities.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nothing logged yet.</p>
      ) : (
        <ol className={compact ? 'max-h-80 space-y-3 overflow-y-auto pr-1' : 'space-y-3'}>
          {activities.map((activity) => {
            const Icon = icons[activity.type] ?? StickyNote
            return (
              <li key={activity.id} className="flex gap-3">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                  <Icon className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{activity.title}</p>
                  {activity.body ? (
                    <p className="mt-0.5 text-xs leading-5 whitespace-pre-wrap text-muted-foreground">{activity.body}</p>
                  ) : null}
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {formatDateTime(activity.created_at)}
                    {activity.actor ? ` · ${activity.actor.full_name ?? activity.actor.email}` : ''}
                  </p>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
