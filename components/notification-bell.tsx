'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { formatRelative } from '@/lib/format'
import { createClient } from '@/lib/supabase/client'
import type { Notification } from '@/lib/supabase/types'
import { cn } from '@/lib/utils'

const POLL_MS = 60_000

/** Header bell: replies and other alerts for the signed-in user. */
export function NotificationBell({ userId }: { userId: string }) {
  const [items, setItems] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const panel = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(15)
    setItems((data as Notification[] | null) ?? [])
  }, [userId])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), POLL_MS)
    return () => window.clearInterval(timer)
  }, [load])

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (panel.current && !panel.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const unread = items.filter((item) => !item.read_at)

  const toggle = async () => {
    const next = !open
    setOpen(next)
    if (next && unread.length > 0) {
      const now = new Date().toISOString()
      setItems((current) => current.map((item) => (item.read_at ? item : { ...item, read_at: now })))
      await createClient()
        .from('notifications')
        .update({ read_at: now })
        .in(
          'id',
          unread.map((item) => item.id),
        )
    }
  }

  return (
    <div ref={panel} className="relative">
      <button
        type="button"
        onClick={() => void toggle()}
        className="relative rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        aria-label={unread.length > 0 ? `${unread.length} new notifications` : 'Notifications'}
        aria-expanded={open}
      >
        <Bell className="size-4" />
        {unread.length > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">
            {unread.length}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
          <p className="border-b border-border px-4 py-2.5 text-xs font-semibold">Notifications</p>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-muted-foreground">
              Nothing yet. Replies to your emails show up here.
            </p>
          ) : (
            <ul className="max-h-96 divide-y divide-border overflow-y-auto">
              {items.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.href ?? '/outreach'}
                    onClick={() => setOpen(false)}
                    className={cn('block px-4 py-3 hover:bg-secondary/40', !item.read_at && 'bg-primary/[0.05]')}
                  >
                    <p className="text-sm font-medium">{item.title}</p>
                    {item.body ? <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.body}</p> : null}
                    <p className="mt-1 text-[11px] text-muted-foreground">{formatRelative(item.created_at)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}
