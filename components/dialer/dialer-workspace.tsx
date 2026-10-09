'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import type { Call as TwilioCall, Device } from '@twilio/voice-sdk'
import type { RealtimeChannel } from '@supabase/supabase-js'
import {
  AlertTriangle,
  Bot,
  Mic,
  MicOff,
  Phone,
  PhoneCall,
  PhoneOff,
  Search,
  Sparkles,
} from 'lucide-react'
import { assistCall, finishCall, startCall } from '@/lib/actions/calls'
import { generateLeadBrief } from '@/lib/actions/targeting'
import { formatRelative } from '@/lib/format'
import { formatPhone, toE164 } from '@/lib/phone'
import { createClient } from '@/lib/supabase/client'
import type { Call, CallEvent, LeadAiBrief, LeadStatus } from '@/lib/supabase/types'
import { cn } from '@/lib/utils'
import { BriefScript } from '@/components/targeting/brief-script'
import { Avatar } from '@/components/ui/avatar'
import { Badge, ScoreBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, EmptyState, SectionHeading } from '@/components/ui/card'
import { Input } from '@/components/ui/field'
import { Spinner } from '@/components/ui/progress'
import { toast } from '@/components/ui/toaster'

export type DialerLead = {
  id: string
  full_name: string
  company: string | null
  industry: string | null
  phone: string | null
  website: string | null
  email: string | null
  brief: LeadAiBrief | null
}

type PickerLead = {
  id: string
  full_name: string
  company: string | null
  phone: string | null
  industry: string | null
  score: number
  status: LeadStatus
}

type Suggestion = { id: number; heard: string; say: string; next: string }
type Phase = 'idle' | 'connecting' | 'live' | 'ending' | 'ended'

function clock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function LeadPicker({
  leads,
  selectedId,
  locked,
}: {
  leads: PickerLead[]
  selectedId: string | null
  /** During a call, switching leads would hang up. */
  locked: boolean
}) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return leads
    return leads.filter((lead) =>
      [lead.full_name, lead.company, lead.phone, lead.industry].some((value) => value?.toLowerCase().includes(term)),
    )
  }, [leads, query])

  return (
    <Card className={cn(locked && 'pointer-events-none opacity-60')}>
      <div className="border-b border-border p-3">
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${leads.length} leads with a phone`}
            className="pl-9"
            aria-label="Search leads"
          />
        </div>
      </div>
      {filtered.length === 0 ? (
        <EmptyState icon={Phone} title="No leads to call" description="Leads with a phone number show up here." />
      ) : (
        <ul className="max-h-[75vh] divide-y divide-border overflow-y-auto">
          {filtered.map((lead) => (
            <li key={lead.id}>
              <Link
                href={`/dialer?lead=${lead.id}`}
                aria-current={lead.id === selectedId ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 p-3 transition-colors hover:bg-secondary/40',
                  lead.id === selectedId && 'bg-primary/10',
                )}
              >
                <Avatar name={lead.full_name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{lead.full_name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[lead.company !== lead.full_name ? lead.company : null, lead.status].filter(Boolean).join(' · ')}
                  </span>
                  <span className="block truncate font-mono text-xs text-muted-foreground">{lead.phone}</span>
                </span>
                <ScoreBadge score={lead.score} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export function DialerWorkspace({
  leads,
  lead,
  recentCalls,
  canCall,
  voice,
}: {
  leads: PickerLead[]
  lead: DialerLead | null
  recentCalls: Call[]
  canCall: boolean
  voice: { configured: boolean; missing: string[] }
}) {
  const router = useRouter()
  const [number, setNumber] = useState(() => {
    const e164 = toE164(lead?.phone)
    return e164 ? formatPhone(e164) : (lead?.phone ?? '')
  })
  const [phase, setPhase] = useState<Phase>('idle')
  const [callId, setCallId] = useState<string | null>(null)
  const [transcript, setTranscript] = useState<CallEvent[]>([])
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [thinking, setThinking] = useState(false)
  const [muted, setMuted] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [result, setResult] = useState<{ summary: string | null; outcome: string } | null>(null)
  const [brief, setBrief] = useState<LeadAiBrief | null>(lead?.brief ?? null)
  const [briefPending, startBrief] = useTransition()

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

  const askCoach = (id: string) => {
    const state = assistRef.current
    if (state.running) {
      state.pending = true
      return
    }
    state.running = true
    setThinking(true)
    void assistCall(id)
      .then((response) => {
        if (response.ok) {
          setSuggestions((current) => [{ id: Date.now(), ...response.suggestion }, ...current].slice(0, 6))
        }
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
    const supabase = createClient()
    channelRef.current = supabase
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
      if (response.ok) setResult({ summary: response.summary, outcome: response.outcome })
    }
    setPhase('ended')
    router.refresh()
  }

  const placeCall = async () => {
    if (!lead) return
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
    if (!lead) return
    startBrief(async () => {
      const response = await generateLeadBrief(lead.id)
      if (!response.ok) toast.error(response.error)
      else setBrief(response.brief)
    })
  }

  const onCall = phase === 'connecting' || phase === 'live'
  const latest = suggestions[0]

  return (
    <div className="mx-auto max-w-[1300px] space-y-5">
      <SectionHeading
        eyebrow="Calling"
        title="Dialer"
        description="Call leads from your browser. Claude listens to the call and shows you what to say when they ask a question or push back."
      />

      {!voice.configured ? (
        <Card className="flex items-start gap-3 border-warning/40 bg-warning/[0.06] p-4">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <div className="text-sm">
            <p className="font-medium">Calling isn&apos;t connected yet</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Add these Twilio settings in Vercel, then redeploy:{' '}
              <span className="font-mono text-foreground">{voice.missing.join(', ')}</span>
            </p>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <LeadPicker leads={leads} selectedId={lead?.id ?? null} locked={onCall} />

        {!lead ? (
          <Card>
            <EmptyState
              icon={PhoneCall}
              title="Pick a lead to call"
              description="Choose someone from the list. Their sales script stays on screen while Claude listens and suggests answers."
            />
          </Card>
        ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
          <div className="order-2 space-y-4">
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <Avatar name={lead.full_name} size="lg" />
                <div className="min-w-0">
                  <p className="truncate font-display text-base font-semibold">{lead.full_name}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {[lead.company, lead.industry].filter(Boolean).join(' · ') || 'No company on file'}
                  </p>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="size-4 text-primary" />
                Call script
              </p>
              {briefPending ? (
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                  <Spinner className="size-5 text-primary" />
                  <p className="text-xs text-muted-foreground">Researching and writing the script…</p>
                </div>
              ) : brief ? (
                <BriefScript brief={brief} compact />
              ) : (
                <div className="flex flex-col items-center gap-3 py-4 text-center">
                  <p className="text-xs leading-5 text-muted-foreground">
                    No script yet. Claude writes a short one: who they are, where to hit them, what to offer.
                  </p>
                  <Button size="sm" variant="brand" onClick={writeBrief} disabled={!canCall}>
                    <Sparkles className="size-3.5" />
                    Write script
                  </Button>
                </div>
              )}
            </Card>
          </div>

          <div className="order-1 space-y-4">
            <Card className="p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Input
                  value={number}
                  onChange={(event) => setNumber(event.target.value)}
                  disabled={onCall}
                  className="font-mono sm:max-w-64"
                  aria-label="Phone number"
                />
                {onCall ? (
                  <>
                    <Button variant="destructive" onClick={hangUp}>
                      <PhoneOff className="size-4" />
                      Hang up
                    </Button>
                    <Button variant="outline" onClick={toggleMute} disabled={phase !== 'live'}>
                      {muted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
                      {muted ? 'Unmute' : 'Mute'}
                    </Button>
                  </>
                ) : (
                  <Button
                    onClick={placeCall}
                    disabled={!canCall || !voice.configured || phase === 'ending' || !toE164(number)}
                    className="bg-success text-white hover:brightness-110"
                  >
                    <PhoneCall className="size-4" />
                    Call
                  </Button>
                )}
                <span className="font-mono text-sm text-muted-foreground sm:ml-auto">
                  {phase === 'connecting'
                    ? 'Ringing…'
                    : phase === 'live'
                      ? clock(seconds)
                      : phase === 'ending'
                        ? 'Saving notes…'
                        : phase === 'ended'
                          ? 'Call ended'
                          : 'Ready'}
                </span>
              </div>
              {!toE164(number) && number ? (
                <p className="mt-2 text-xs text-destructive">Enter the number with area code, e.g. +1 305 555 0100.</p>
              ) : null}
            </Card>

            <div className="grid gap-4 xl:grid-cols-2">
              <Card className="flex min-h-80 flex-col p-4">
                <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <Bot className="size-4 text-primary" />
                  AI coach
                  {thinking ? <Spinner className="ml-auto size-3.5 text-primary" /> : null}
                </p>
                {latest ? (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-primary/30 bg-primary/[0.07] p-4">
                      {latest.heard ? (
                        <p className="mb-2 text-xs font-medium text-warning">They asked: {latest.heard}</p>
                      ) : null}
                      <p className="text-lg leading-7 font-medium">{latest.say}</p>
                      {latest.next ? <p className="mt-2 text-xs text-muted-foreground">Tip: {latest.next}</p> : null}
                    </div>
                    {suggestions.slice(1).map((item) => (
                      <div key={item.id} className="rounded-lg border border-border p-2.5 text-xs text-muted-foreground">
                        {item.heard ? <span className="text-foreground">{item.heard} → </span> : null}
                        {item.say}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs leading-5 text-muted-foreground">
                    {phase === 'live'
                      ? 'Listening… when the lead asks something, the answer appears here.'
                      : 'During a call, Claude suggests what to say whenever the lead speaks.'}
                  </p>
                )}
                {phase === 'live' && callId ? (
                  <Button variant="ghost" size="sm" className="mt-auto self-start" onClick={() => askCoach(callId)}>
                    <Sparkles className="size-3.5" />
                    Ask now
                  </Button>
                ) : null}
              </Card>

              <Card className="flex min-h-80 flex-col p-4">
                <p className="mb-3 text-sm font-semibold">Live transcript</p>
                {transcript.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {onCall ? 'Waiting for the first words…' : 'The conversation appears here as you talk.'}
                  </p>
                ) : (
                  <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
                    {transcript.map((line) => (
                      <div
                        key={line.id}
                        className={cn('flex', line.speaker === 'rep' ? 'justify-end' : 'justify-start')}
                      >
                        <p
                          className={cn(
                            'max-w-[85%] rounded-xl px-3 py-2 text-sm leading-6',
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
              </Card>
            </div>

            {result ? (
              <Card className="p-4">
                <div className="mb-2 flex items-center gap-2">
                  <p className="text-sm font-semibold">Call notes</p>
                  <Badge tone="brand">{result.outcome}</Badge>
                </div>
                <p className="text-sm leading-6 whitespace-pre-wrap text-muted-foreground">
                  {result.summary ?? 'No conversation was transcribed.'}
                </p>
                <p className="mt-2 text-[11px] text-muted-foreground">Saved to the lead&apos;s timeline in the CRM.</p>
              </Card>
            ) : null}

            {recentCalls.length > 0 ? (
              <Card className="p-4">
                <p className="mb-3 text-sm font-semibold">Previous calls</p>
                <ul className="space-y-3">
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
              </Card>
            ) : null}
          </div>
        </div>
        )}
      </div>
    </div>
  )
}
