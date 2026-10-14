'use client'

import { useEffect, useState } from 'react'
import { Timer } from 'lucide-react'
import { cn } from '@/lib/utils'

function remaining(ms: number) {
  if (ms <= 0) return null
  const total = Math.floor(ms / 1000)
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h ${minutes}m ${String(seconds).padStart(2, '0')}s`
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`
}

/**
 * Live "sends in 1h 04m 12s" timer. The time is an estimate from the
 * scheduler's rules; hovering shows the exact moment in the lead's time zone.
 */
export function Countdown({
  to,
  label = 'Sends in',
  timeZone,
  className,
}: {
  to: string
  label?: string
  timeZone?: string
  className?: string
}) {
  const target = new Date(to).getTime()
  const [now, setNow] = useState<number | null>(null)

  // Start ticking after mount so the server and browser render the same text.
  useEffect(() => {
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const left = now === null ? null : remaining(target - now)
  const exact = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(to))

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[11px] text-primary tabular-nums',
        className,
      )}
      // The server formats in UTC, the browser in local time: add the hint after mount.
      title={now === null ? undefined : `Estimated: ${exact}`}
    >
      <Timer className="size-3" />
      {/* Server time zone differs from the browser's: show the time only once mounted. */}
      {now === null ? `${label} …` : left ? `${label} ${left}` : 'Sending now…'}
    </span>
  )
}
