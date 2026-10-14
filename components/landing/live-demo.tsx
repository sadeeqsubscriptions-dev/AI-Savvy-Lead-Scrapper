'use client'

import { useEffect, useState } from 'react'
import { CalendarCheck, Inbox, Mail, MapPin, Phone, Search, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

const QUERY = 'roofing companies in Dallas, TX'
const LEADS = [
  { name: 'Summit Roofing Co.', meta: '4.8 ★ · 212 reviews · summitroof.com' },
  { name: 'Lone Star Roof Pros', meta: '4.5 ★ · 96 reviews · lonestarroof.com' },
  { name: 'Red River Exteriors', meta: '4.9 ★ · 58 reviews · redriverext.com' },
]
const EMAIL =
  'Hi Mark — Summit has some of the best reviews in Dallas, but “roof repair Dallas” shows three competitors above you. We fix exactly that for roofers. Worth 15 minutes next week?'

/*
 * Timeline (ms). The demo plays the real flow: search → leads found → AI
 * researches → email written → sent → reply → meeting booked, then loops.
 */
const T = { type: 0, leads: 1700, research: 3200, write: 4300, sent: 7600, reply: 8800, booked: 10300, end: 13500 }

export function LiveDemo() {
  const [t, setT] = useState(0)
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setReduced(true)
      setT(T.end)
      return
    }
    // ~25 updates a second is plenty for typing text, and keeps the page light.
    let start = performance.now()
    const id = setInterval(() => {
      const now = performance.now()
      if (now - start > T.end) start = now
      setT(now - start)
    }, 40)
    return () => clearInterval(id)
  }, [])

  const typed = QUERY.slice(0, Math.floor((Math.min(t, T.leads - 300) / (T.leads - 300)) * QUERY.length))
  const leadsShown = t < T.leads ? 0 : Math.min(LEADS.length, 1 + Math.floor((t - T.leads) / 350))
  const researching = t >= T.research && t < T.write
  const emailChars = t < T.write ? 0 : Math.floor(Math.min(1, (t - T.write) / (T.sent - T.write - 300)) * EMAIL.length)
  const sent = t >= T.sent
  const replied = t >= T.reply
  const booked = t >= T.booked

  const status = (index: number) => {
    if (index !== 0) return t >= T.sent + 400 ? 'Emailed' : 'New'
    if (booked) return 'Meeting'
    if (replied) return 'Replied'
    if (sent) return 'Emailed'
    if (t >= T.research) return 'Researched'
    return 'New'
  }
  const tone: Record<string, string> = {
    New: 'bg-secondary text-muted-foreground',
    Researched: 'bg-chart-3/15 text-chart-3',
    Emailed: 'bg-primary/15 text-primary',
    Replied: 'bg-success/15 text-success',
    Meeting: 'bg-gradient-brand text-white',
  }

  return (
    <div className="relative mx-auto w-full max-w-xl" aria-label="Product demo: finding a lead, emailing them and booking a meeting">
      <div className="animate-float-slow absolute -left-10 -top-10 -z-10 size-56 rounded-full bg-primary/25 blur-3xl" />
      <div className="animate-float-slower absolute -bottom-12 -right-6 -z-10 size-64 rounded-full bg-chart-3/25 blur-3xl" />

      <div className="rounded-2xl border border-border bg-card/90 p-4 shadow-2xl shadow-primary/10 backdrop-blur sm:p-5">
        <div className="mb-3 flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-destructive/70" />
          <span className="size-2.5 rounded-full bg-warning/70" />
          <span className="size-2.5 rounded-full bg-success/70" />
          <span className="ml-3 truncate text-[11px] text-muted-foreground">Lead scraper · Google Maps</span>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-border bg-background/70 px-3 py-2.5 text-sm">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate">
            {reduced ? QUERY : typed}
            {t < T.leads && !reduced ? <span className="animate-caret ml-px inline-block h-4 w-px translate-y-0.5 bg-foreground" /> : null}
          </span>
          <span
            className={cn(
              'ml-auto shrink-0 rounded-md bg-gradient-brand px-2.5 py-1 text-[11px] font-medium text-white transition-transform',
              t > T.leads - 300 && t < T.leads + 100 && 'scale-95',
            )}
          >
            Find leads
          </span>
        </div>

        <ul className="mt-3 min-h-[11.5rem] space-y-2">
          {LEADS.slice(0, leadsShown).map((lead, index) => (
            <li
              key={lead.name}
              className={cn(
                'animate-pop-in flex items-center justify-between gap-3 rounded-lg border px-3 py-2 transition-colors duration-500',
                index === 0 && researching ? 'border-primary/50 bg-primary/5' : 'border-border',
              )}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <MapPin className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{lead.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{lead.meta}</p>
                </div>
              </div>
              <span
                key={status(index)}
                className={cn('animate-pop-in shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium', tone[status(index)])}
              >
                {status(index)}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-3 min-h-[8.5rem] rounded-lg border border-primary/30 bg-primary/5 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
            {researching ? (
              <>
                <Sparkles className="size-3 animate-pulse" /> Researching summitroof.com…
              </>
            ) : sent ? (
              <>
                <Mail className="size-3" /> Sent from you@yourcompany.com · 9:12 AM their time
              </>
            ) : (
              <>
                <Sparkles className="size-3" /> AI-written email
              </>
            )}
          </p>
          {emailChars > 0 || reduced ? (
            <>
              <p className="mt-2 text-sm font-medium">Summit’s 212 reviews vs. page 2 on Google</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {reduced ? EMAIL : EMAIL.slice(0, emailChars)}
                {!sent && !reduced ? <span className="animate-caret ml-px inline-block h-3 w-px bg-foreground" /> : null}
              </p>
            </>
          ) : (
            <div className="mt-3 space-y-2" aria-hidden>
              <div className="h-2.5 w-3/4 animate-pulse rounded bg-secondary" />
              <div className="h-2.5 w-full animate-pulse rounded bg-secondary" />
              <div className="h-2.5 w-2/3 animate-pulse rounded bg-secondary" />
            </div>
          )}
        </div>

        <div className="mt-3 grid min-h-[2.5rem] gap-2 sm:grid-cols-2">
          {replied ? (
            <div className="animate-pop-in flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2 text-xs text-success">
              <Inbox className="size-3.5 shrink-0" />
              <span className="truncate">
                <span className="font-medium">Mark replied:</span> “Tuesday works.”
              </span>
            </div>
          ) : null}
          {booked ? (
            <div className="animate-pop-in flex items-center gap-2 rounded-lg bg-gradient-brand px-3 py-2 text-xs font-medium text-white">
              <CalendarCheck className="size-3.5 shrink-0" /> Meeting booked · Tue 10:00
            </div>
          ) : null}
        </div>
      </div>

      <div
        className={cn(
          'absolute -bottom-6 -left-4 hidden items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs shadow-xl transition-all duration-700 sm:flex',
          booked ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0',
        )}
      >
        <Phone className="size-3.5 text-success" /> AI coach: “Ask about their storm-season backlog.”
      </div>
    </div>
  )
}
