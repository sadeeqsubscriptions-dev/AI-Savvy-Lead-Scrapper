'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import type { Call as TwilioCall, Device } from '@twilio/voice-sdk'
import type { RealtimeChannel } from '@supabase/supabase-js'
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  CalendarCheck,
  CalendarClock,
  ExternalLink,
  Mail,
  MessageSquare,
  Mic,
  MicOff,
  PhoneCall,
  PhoneMissed,
  PhoneOff,
  Send,
  Sparkles,
  ThumbsDown,
} from 'lucide-react'
import type { CallSuggestion } from '@/lib/ai/call-assist'
import {
  bookMeeting,
  draftCallEmail,
  finishCall,
  logCallOutcome,
  scheduleCallback,
  sendCallEmail,
  startCall,
} from '@/lib/actions/calls'
import { generateLeadBrief } from '@/lib/actions/targeting'
import { formatRelative } from '@/lib/format'
import { describeSendTime, isoToZonedInput, zoneAbbreviation, zonedInputToIso } from '@/lib/outreach/schedule'
import { formatPhone, toE164 } from '@/lib/phone'
import { createClient } from '@/lib/supabase/client'
import type { Call, CallEvent, LeadAiBrief, LeadStatus } from '@/lib/supabase/types'
import { cn } from '@/lib/utils'
import { BriefScript } from '@/components/targeting/brief-script'
import { Avatar } from '@/components/ui/avatar'
import { Badge, leadStatusTone } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Select, Textarea } from '@/components/ui/field'
import { Modal } from '@/components/ui/modal'
import { Spinner } from '@/components/ui/progress'
import { toast } from '@/components/ui/toaster'

export type CallLead = {
  id: string
  full_name: string
  company: string | null
  industry: string | null
  phone: string | null
  email: string | null
  website: string | null
  status: LeadStatus
  /** The lead's own time zone; every time on this page is shown in it. */
  timeZone: string
}

type Suggestion = { id: number; heard: string; say: string; next: string }
type Detected = { meetingTime: string | null; callbackTime: string | null; wantsEmail: boolean }
type Phase = 'idle' | 'connecting' | 'live' | 'ending' | 'ended'

function clock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function validIso(value: string | null | undefined) {
  if (!value) return null
  const time = Date.parse(value)
  return Number.isNaN(time) ? null : new Date(time).toISOString()
}

/** Tomorrow 10:00 in the lead's time zone, as a picker value. */
function defaultSlot(timeZone: string) {
  const tomorrow = isoToZonedInput(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), timeZone)
  return `${tomorrow.slice(0, 10)}T10:00`
}

function Panel({
  title,
  icon: Icon,
  action,
  className,
  children,
}: {
  title: string
  icon: typeof Bot
  action?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <Card className={cn('flex flex-col p-4', className)}>
      <div className="mb-3 flex items-center gap-2">
        <Icon className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">{title}</h2>
        {action ? <div className="ml-auto">{action}</div> : null}
      </div>
      {children}
    </Card>
  )
}

export function CallWorkspace({
  lead,
  brief: initialBrief,
  recentCalls,
  canWrite,
  voice,
  mailReady,
}: {
  lead: CallLead
  brief: LeadAiBrief | null
  recentCalls: Call[]
  canWrite: boolean
  voice: { configured: boolean; missing: string[] }
  mailReady: boolean
}) {
  const router = useRouter()
  const zone = lead.timeZone
  const zoneLabel = zoneAbbreviation(zone)

  const [number, setNumber] = useState(() => {
    const e164 = toE164(lead.phone)
    return e164 ? formatPhone(e164) : (lead.phone ?? '')
  })
  const [phase, setPhase] = useState<Phase>('idle')
  const [callId, setCallId] = useState<string | null>(null)
  const [transcript, setTranscript] = useState<CallEvent[]>([])
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [thinking, setThinking] = useState(false)
  const [muted, setMuted] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [result, setResult] = useState<{ summary: string | null; outcome: string } | null>(null)
  const [detected, setDetected] = useState<Detected>({ meetingTime: null, callbackTime: null, wantsEmail: false })
  const [brief, setBrief] = useState(initialBrief)
  const [briefPending, startBrief] = useTransition()
  const [acting, startAction] = useTransition()

  // Next-step dialogs.
  const [meetingOpen, setMeetingOpen] = useState(false)
  const [meetingAt, setMeetingAt] = useState('')
  const [meetingMinutes, setMeetingMinutes] = useState('15')
  const [sendInvite, setSendInvite] = useState(Boolean(lead.email))
  const [callbackOpen, setCallbackOpen] = useState(false)
  const [callbackAt, setCallbackAt] = useState('')
  const [callbackNote, setCallbackNote] = useState('')
  const [emailOpen, setEmailOpen] = useState(false)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [drafting, startDraft] = useTransition()

  const deviceRef = useRef<Device | null>(null)
  const callRef = useRef<TwilioCall | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const startedAtRef = useRef<number | null>(null)
  const endingRef = useRef(false)
  const assistRef = useRef({ running: false, pending: false })
  const transcriptEnd = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (phase !== 'live') return
    const timer = setInterval(() => {
      if (startedAtRef.current) setSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [phase])

  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [transcript.length])

  // Leaving the page mid-call hangs up instead of leaving an orphaned call.
  useEffect(() => {
    return () => {
      callRef.current?.disconnect()
      deviceRef.current?.destroy()
      channelRef.current?.unsubscribe()
    }
  }, [])

  const remember = (found: { meeting?: string | null; callback?: string | null; wantsEmail?: boolean }) => {
    setDetected((current) => ({
      meetingTime: validIso(found.meeting) ?? current.meetingTime,
      callbackTime: validIso(found.callback) ?? current.callbackTime,
      wantsEmail: current.wantsEmail || Boolean(found.wantsEmail),
    }))
  }

  const askCoach = (id: string) => {
    const state = assistRef.current
    if (state.running) {
      state.pending = true
      return
    }
    state.running = true
    setThinking(true)
    // A plain route, not a server action, so it never queues behind other clicks.
    void fetch('/api/calls/assist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callId: id }),
    })
      .then((reply) => reply.json() as Promise<{ ok: true; suggestion: CallSuggestion } | { ok: false; error: string }>)
      .then((response) => {
        if (!response.ok) return
        const { heard, say, next, meeting_time, callback_time, wants_email } = response.suggestion
        setSuggestions((current) => [{ id: Date.now(), heard, say, next }, ...current].slice(0, 6))
        remember({ meeting: meeting_time, callback: callback_time, wantsEmail: wants_email })
      })
      .finally(() => {
        state.running = false
        setThinking(false)
        // The lead kept talking while Claude answered: answer the latest.
        if (state.pending) {
          state.pending = false
          askCoach(id)
        }
      })
  }

  const listen = (id: string) => {
    channelRef.current = createClient()
      .channel(`call-${id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'call_events', filter: `call_id=eq.${id}` },
        (payload) => {
          const event = payload.new as CallEvent
          if (event.kind !== 'transcript') return
          setTranscript((current) => (current.some((item) => item.id === event.id) ? current : [...current, event]))
          if (event.speaker === 'lead') askCoach(id)
        },
      )
      .subscribe()
  }

  const end = async (id: string | null) => {
    if (endingRef.current) return
    endingRef.current = true
    setPhase('ending')

    deviceRef.current?.destroy()
    deviceRef.current = null
    callRef.current = null
    channelRef.current?.unsubscribe()
    channelRef.current = null

    if (id) {
      const duration = startedAtRef.current ? (Date.now() - startedAtRef.current) / 1000 : 0
      const response = await finishCall(id, duration)
      if (response.ok) {
        setResult({ summary: response.summary, outcome: response.outcome })
        remember({ meeting: response.meetingTime, callback: response.callbackTime, wantsEmail: response.wantsEmail })
      }
    }
    setPhase('ended')
    router.refresh()
  }

  const placeCall = async () => {
    endingRef.current = false
    startedAtRef.current = null
    setTranscript([])
    setSuggestions([])
    setResult(null)
    setSeconds(0)
    setMuted(false)
    setPhase('connecting')

    const started = await startCall(lead.id, number)
    if (!started.ok) {
      toast.error(started.error)
      setPhase('idle')
      return
    }
    setCallId(started.callId)
    listen(started.callId)

    try {
      const { Device } = await import('@twilio/voice-sdk')
      const device = new Device(started.token)
      deviceRef.current = device
      device.on('error', (error: { message?: string }) => toast.error(error.message ?? 'Calling error.'))

      const call = await device.connect({ params: { To: started.to, CallId: started.callId } })
      callRef.current = call
      call.on('accept', () => {
        startedAtRef.current = Date.now()
        setPhase('live')
      })
      call.on('disconnect', () => void end(started.callId))
      call.on('error', (error: { message?: string }) => {
        toast.error(error.message ?? 'The call failed.')
        void end(started.callId)
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not start the call. Allow microphone access.')
      void end(started.callId)
    }
  }

  const hangUp = () => {
    if (callRef.current) callRef.current.disconnect()
    else void end(callId)
  }

  const toggleMute = () => {
    if (!callRef.current) return
    callRef.current.mute(!muted)
    setMuted(!muted)
  }

  const writeBrief = () => {
    startBrief(async () => {
      const response = await generateLeadBrief(lead.id)
      if (!response.ok) toast.error(response.error)
      else setBrief(response.brief)
    })
  }

  // ─── Next steps ───────────────────────────────────────────────────────────

  const done = (response: { ok: true; message: string } | { ok: false; error: string }) => {
    if (!response.ok) {
      toast.error(response.error)
      return false
    }
    toast.success(response.message)
    router.refresh()
    return true
  }

  const openMeeting = () => {
    setMeetingAt(detected.meetingTime ? isoToZonedInput(detected.meetingTime, zone) : defaultSlot(zone))
    setMeetingOpen(true)
  }

  const saveMeeting = () => {
    const iso = zonedInputToIso(meetingAt, zone)
    if (!iso) return toast.error('Pick a date and time.')
    startAction(async () => {
      if (done(await bookMeeting(lead.id, { startsAt: iso, minutes: Number(meetingMinutes), sendInvite }))) {
        setMeetingOpen(false)
      }
    })
  }

  const openCallback = () => {
    setCallbackAt(detected.callbackTime ? isoToZonedInput(detected.callbackTime, zone) : defaultSlot(zone))
    setCallbackOpen(true)
  }

  const saveCallback = () => {
    const iso = zonedInputToIso(callbackAt, zone)
    if (!iso) return toast.error('Pick a date and time.')
    startAction(async () => {
      if (done(await scheduleCallback(lead.id, iso, callbackNote))) {
        setCallbackOpen(false)
        setCallbackNote('')
      }
    })
  }

  const markOutcome = (outcome: 'no_answer' | 'not_interested') => {
    if (outcome === 'not_interested' && !window.confirm(`Mark ${lead.full_name} as not interested? Automatic emails stop.`)) {
      return
    }
    startAction(async () => {
      done(await logCallOutcome(lead.id, outcome))
    })
  }

  const openEmail = () => {
    setEmailOpen(true)
    if (subject || body) return
    startDraft(async () => {
      const response = await draftCallEmail(lead.id, callId, detected.meetingTime)
      if (!response.ok) {
        toast.error(response.error)
        return
      }
      setSubject(response.subject)
      setBody(response.body)
    })
  }

  const redraft = () => {
    startDraft(async () => {
      const response = await draftCallEmail(lead.id, callId, detected.meetingTime)
      if (!response.ok) toast.error(response.error)
      else {
        setSubject(response.subject)
        setBody(response.body)
      }
    })
  }

  const sendEmail = () => {
    startAction(async () => {
      if (done(await sendCallEmail(lead.id, subject, body))) {
        setEmailOpen(false)
        setSubject('')
        setBody('')
      }
    })
  }

  const onCall = phase === 'connecting' || phase === 'live'
  const latest = suggestions[0]
  const statusText =
    phase === 'connecting'
      ? 'Ringing…'
      : phase === 'live'
        ? 'On call'
        : phase === 'ending'
          ? 'Saving call notes…'
          : phase === 'ended'
            ? 'Call ended'
            : 'Ready to call'

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 pb-28">
      <Link href="/dialer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" />
        All leads
      </Link>

      {/* ── Call bar: who, number, timer and the call buttons, in one line ── */}
      <Card
        className={cn(
          'sticky top-20 z-20 flex flex-col gap-3 p-3 backdrop-blur md:flex-row md:items-center',
          phase === 'live' ? 'border-success/50 bg-card/95' : 'bg-card/95',
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar name={lead.full_name} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate font-display text-lg font-semibold tracking-tight">{lead.full_name}</h1>
              <Badge tone={leadStatusTone[lead.status]}>{lead.status}</Badge>
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {[lead.company !== lead.full_name ? lead.company : null, lead.industry].filter(Boolean).join(' · ') ||
                'No company on file'}
              {' · '}
              {/* Rendered on the server and again in the browser; the minute can differ. */}
              <span suppressHydrationWarning>
                their time {describeSendTime(new Date(), zone).replace(/^\w+,?\s*/, '')}
              </span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onCall || phase === 'ending' ? (
            <span className="font-mono text-sm text-muted-foreground">{number}</span>
          ) : (
            <Input
              value={number}
              onChange={(event) => setNumber(event.target.value)}
              className="h-9 w-44 font-mono"
              aria-label="Phone number"
            />
          )}

          <span
            className={cn(
              'flex items-center gap-2 rounded-lg border px-3 py-1.5',
              phase === 'live' ? 'border-success/40 text-success' : 'border-border text-muted-foreground',
            )}
          >
            <span
              className={cn(
                'size-2 rounded-full',
                phase === 'live' ? 'animate-pulse bg-success' : onCall ? 'bg-warning' : 'bg-muted-foreground/40',
              )}
            />
            <span className="text-xs">{statusText}</span>
            <span className="font-mono text-base tabular-nums text-foreground">{clock(seconds)}</span>
          </span>

          {onCall ? (
            <>
              <Button variant="outline" size="sm" onClick={toggleMute} disabled={phase !== 'live'}>
                {muted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
                {muted ? 'Unmute' : 'Mute'}
              </Button>
              <Button size="sm" onClick={hangUp} className="bg-destructive text-white hover:brightness-110">
                <PhoneOff className="size-4" />
                Hang up
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              onClick={placeCall}
              disabled={!canWrite || !voice.configured || phase === 'ending' || !toE164(number)}
              className="bg-success text-white hover:brightness-110"
            >
              <PhoneCall className="size-4" />
              Call
            </Button>
          )}

          <Link
            href={toE164(number) ? `/sms?to=${encodeURIComponent(toE164(number)!)}&lead=${lead.id}` : '/sms'}
            className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
            aria-label="Text this number"
            title="Text"
          >
            <MessageSquare className="size-4" />
          </Link>
          <Link
            href={`/targeting/${lead.id}`}
            className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
            aria-label="Open lead page"
            title="Lead page"
          >
            <ExternalLink className="size-4" />
          </Link>
        </div>
      </Card>

      {!voice.configured ? (
        <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/[0.06] p-3 text-xs leading-5">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
          <span>
            Browser calling needs Twilio ({voice.missing.join(', ')}). You can still call from your phone and use the
            buttons below to log the outcome, book the meeting and send the email.
          </span>
        </p>
      ) : null}
      {!toE164(number) && number && !onCall ? (
        <p className="text-xs text-destructive">Use the full number with area code, e.g. +1 305 555 0100.</p>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
        {/* ── Focus: what to say, then what was said ── */}
        <div className="space-y-4">
          <Card
            className={cn(
              'p-5',
              latest || thinking ? 'border-primary/40' : undefined,
            )}
          >
            <div className="mb-3 flex items-center gap-2">
              <Bot className="size-4 text-primary" />
              <h2 className="text-sm font-semibold">Say this</h2>
              {thinking ? (
                <span className="flex items-center gap-1.5 text-xs text-primary">
                  <Spinner className="size-3.5" />
                  Listening to the lead…
                </span>
              ) : null}
              {phase === 'live' && callId && !thinking ? (
                <Button variant="ghost" size="sm" className="ml-auto" onClick={() => askCoach(callId)}>
                  <Sparkles className="size-3.5" />
                  Ask now
                </Button>
              ) : null}
            </div>

            {latest ? (
              <>
                {latest.heard ? <p className="mb-2 text-sm font-medium text-warning">They said: {latest.heard}</p> : null}
                <p className="text-2xl leading-snug font-semibold tracking-tight">{latest.say}</p>
                {latest.next ? <p className="mt-3 text-sm text-muted-foreground">Tip: {latest.next}</p> : null}
                {suggestions.length > 1 ? (
                  <details className="mt-4 text-xs text-muted-foreground">
                    <summary className="cursor-pointer select-none hover:text-foreground">
                      Earlier suggestions ({suggestions.length - 1})
                    </summary>
                    <ul className="mt-2 space-y-1.5">
                      {suggestions.slice(1).map((item) => (
                        <li key={item.id}>
                          {item.heard ? <span className="text-foreground">{item.heard} → </span> : null}
                          {item.say}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {phase === 'live'
                  ? 'Listening… when the lead speaks, what to say back appears here.'
                  : 'Start the call. Claude listens and tells you what to say whenever the lead speaks.'}
              </p>
            )}
          </Card>

          <Panel title="Live transcript" icon={Mic}>
            {transcript.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                {onCall ? 'Waiting for the first words…' : 'The conversation appears here as you talk.'}
              </p>
            ) : (
              <div className="h-80 space-y-2 overflow-y-auto pr-1">
                {transcript.map((line) => (
                  <div key={line.id} className={cn('flex', line.speaker === 'rep' ? 'justify-end' : 'justify-start')}>
                    <p
                      className={cn(
                        'max-w-[80%] rounded-xl px-3 py-2 text-sm leading-6',
                        line.speaker === 'rep' ? 'bg-primary/15' : 'bg-secondary',
                      )}
                    >
                      <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-muted-foreground">
                        {line.speaker === 'rep' ? 'You' : lead.full_name}
                      </span>
                      {line.text}
                    </p>
                  </div>
                ))}
                <div ref={transcriptEnd} />
              </div>
            )}
          </Panel>

          {result || recentCalls.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {result ? (
                <Panel title="Call notes" icon={Bot} action={<Badge tone="brand">{result.outcome}</Badge>}>
                  <p className="text-sm leading-6 whitespace-pre-wrap text-muted-foreground">
                    {result.summary ?? 'No conversation was transcribed.'}
                  </p>
                  <p className="mt-2 text-[11px] text-muted-foreground">Saved to the lead&apos;s timeline.</p>
                </Panel>
              ) : null}
              {recentCalls.length > 0 ? (
                <Panel title="Previous calls" icon={PhoneCall}>
                  <ul className="max-h-64 space-y-3 overflow-y-auto pr-1">
                    {recentCalls.map((call) => (
                      <li key={call.id} className="text-xs">
                        <p className="text-muted-foreground">
                          {formatRelative(call.started_at)} · {call.status}
                          {call.duration_seconds ? ` · ${clock(call.duration_seconds)}` : ''}
                        </p>
                        {call.summary ? <p className="mt-1 leading-5 whitespace-pre-wrap">{call.summary}</p> : null}
                      </li>
                    ))}
                  </ul>
                </Panel>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* ── Reference: the script, out of the way ── */}
        <Panel
          title="Call script"
          icon={Sparkles}
          className="lg:sticky lg:top-44 lg:max-h-[calc(100vh-14rem)] lg:overflow-y-auto"
          action={
            brief && canWrite ? (
              <Button variant="ghost" size="sm" onClick={writeBrief} disabled={briefPending}>
                Redo
              </Button>
            ) : null
          }
        >
          {briefPending ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Spinner className="size-5 text-primary" />
              <p className="text-xs text-muted-foreground">Researching and writing the script…</p>
            </div>
          ) : brief ? (
            <BriefScript brief={brief} compact />
          ) : (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <p className="text-xs leading-5 text-muted-foreground">
                No script yet. Claude writes a short one: who they are, where to hit them, what to offer.
              </p>
              <Button size="sm" variant="brand" onClick={writeBrief} disabled={!canWrite}>
                <Sparkles className="size-3.5" />
                Write script
              </Button>
            </div>
          )}
        </Panel>
      </div>

      {/* ── Next steps: always at the bottom, out of the way until needed ── */}
      <div className="fixed inset-x-0 bottom-0 z-30 lg:left-64">
        <div className="mx-auto max-w-[1400px] px-4 pb-4 sm:px-6 lg:px-8">
          <Card className="flex flex-col gap-3 bg-card/95 p-3 shadow-2xl backdrop-blur md:flex-row md:items-center">
            <div className="min-w-0 flex-1 text-xs">
              {detected.meetingTime || detected.callbackTime || detected.wantsEmail ? (
                <p className="truncate text-primary">
                  <Sparkles className="mr-1 inline size-3.5" />
                  Claude heard:{' '}
                  {[
                    detected.meetingTime ? `meeting ${describeSendTime(new Date(detected.meetingTime), zone)}` : null,
                    detected.callbackTime ? `call back ${describeSendTime(new Date(detected.callbackTime), zone)}` : null,
                    detected.wantsEmail ? 'wants an email' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              ) : (
                <p className="truncate text-muted-foreground">
                  Next step — times mentioned on the call are filled in for you.
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="brand" size="sm" onClick={openMeeting} disabled={!canWrite}>
                <CalendarCheck className="size-3.5" />
                Schedule meeting
              </Button>
              <Button
                variant={detected.wantsEmail ? 'default' : 'outline'}
                size="sm"
                onClick={openEmail}
                disabled={!canWrite || !lead.email}
                title={lead.email ? undefined : 'No email address on file'}
              >
                <Mail className="size-3.5" />
                Send email
              </Button>
              <Button variant="outline" size="sm" onClick={openCallback} disabled={!canWrite}>
                <CalendarClock className="size-3.5" />
                Call back later
              </Button>
              <Button variant="outline" size="sm" onClick={() => markOutcome('no_answer')} disabled={!canWrite || acting}>
                <PhoneMissed className="size-3.5" />
                No answer
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => markOutcome('not_interested')}
                disabled={!canWrite || acting}
              >
                <ThumbsDown className="size-3.5" />
                Not interested
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {/* ── Dialogs ── */}
      <Modal
        open={meetingOpen}
        onClose={() => setMeetingOpen(false)}
        title="Schedule meeting"
        description={`Time is in ${lead.full_name}'s time zone (${zoneLabel}). It goes on your calendar${lead.email ? ' and they get a calendar invite by email' : ''}.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setMeetingOpen(false)}>
              Cancel
            </Button>
            <Button variant="brand" onClick={saveMeeting} disabled={acting}>
              {acting ? <Spinner className="size-4" /> : <CalendarCheck className="size-4" />}
              Book meeting
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {detected.meetingTime ? (
            <p className="rounded-lg bg-primary/[0.08] p-2.5 text-xs text-primary">
              Filled in from the call: {describeSendTime(new Date(detected.meetingTime), zone)}
            </p>
          ) : null}
          <label className="block space-y-1.5 text-sm">
            <span className="text-xs text-muted-foreground">Date and time ({zoneLabel})</span>
            <Input type="datetime-local" value={meetingAt} onChange={(event) => setMeetingAt(event.target.value)} />
          </label>
          <label className="block space-y-1.5 text-sm">
            <span className="text-xs text-muted-foreground">Length</span>
            <Select value={meetingMinutes} onChange={(event) => setMeetingMinutes(event.target.value)}>
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
              <option value="45">45 minutes</option>
              <option value="60">1 hour</option>
            </Select>
          </label>
          {lead.email ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={sendInvite && mailReady}
                onChange={(event) => setSendInvite(event.target.checked)}
                disabled={!mailReady}
                className="size-4 accent-[var(--primary)]"
              />
              Email a calendar invite to {lead.email}
            </label>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={callbackOpen}
        onClose={() => setCallbackOpen(false)}
        title="Call back later"
        description={`They asked you to call at another time. It's added to your calendar as a reminder (${zoneLabel}, their time).`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCallbackOpen(false)}>
              Cancel
            </Button>
            <Button variant="brand" onClick={saveCallback} disabled={acting}>
              {acting ? <Spinner className="size-4" /> : <CalendarClock className="size-4" />}
              Set call-back
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {detected.callbackTime ? (
            <p className="rounded-lg bg-primary/[0.08] p-2.5 text-xs text-primary">
              Filled in from the call: {describeSendTime(new Date(detected.callbackTime), zone)}
            </p>
          ) : null}
          <label className="block space-y-1.5 text-sm">
            <span className="text-xs text-muted-foreground">Date and time ({zoneLabel})</span>
            <Input type="datetime-local" value={callbackAt} onChange={(event) => setCallbackAt(event.target.value)} />
          </label>
          <label className="block space-y-1.5 text-sm">
            <span className="text-xs text-muted-foreground">Note (optional)</span>
            <Textarea
              value={callbackNote}
              onChange={(event) => setCallbackNote(event.target.value)}
              rows={3}
              placeholder="e.g. Ask for the owner, Mike. Busy before lunch."
            />
          </label>
        </div>
      </Modal>

      <Modal
        open={emailOpen}
        onClose={() => setEmailOpen(false)}
        title="Follow-up email"
        description={`Claude wrote this from the call. Edit anything, then send to ${lead.email ?? 'the lead'}.`}
        className="max-w-2xl"
        footer={
          <>
            <Button variant="ghost" onClick={redraft} disabled={drafting || acting}>
              <Sparkles className="size-4" />
              Rewrite
            </Button>
            <Button variant="brand" onClick={sendEmail} disabled={drafting || acting || !mailReady || !subject}>
              {acting ? <Spinner className="size-4" /> : <Send className="size-4" />}
              Send now
            </Button>
          </>
        }
      >
        {drafting ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Spinner className="size-5 text-primary" />
            <p className="text-xs text-muted-foreground">Writing the email from your call…</p>
          </div>
        ) : (
          <div className="space-y-3">
            <Input value={subject} onChange={(event) => setSubject(event.target.value)} aria-label="Subject" placeholder="Subject" />
            <Textarea value={body} onChange={(event) => setBody(event.target.value)} rows={14} aria-label="Email" />
            {!mailReady ? <p className="text-xs text-destructive">Email isn&apos;t connected, so this can&apos;t be sent.</p> : null}
          </div>
        )}
      </Modal>
    </div>
  )
}
