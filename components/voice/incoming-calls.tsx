'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import type { Call as TwilioCall, Device } from '@twilio/voice-sdk'
import { Mic, MicOff, PhoneIncoming, PhoneOff, UserRound } from 'lucide-react'
import { callerInfo, incomingCallToken } from '@/lib/actions/calls'
import { formatPhone } from '@/lib/phone'
import type { SmsLeadRef } from '@/lib/sms/shape'
import { cn } from '@/lib/utils'
import { Button, buttonVariants } from '@/components/ui/button'
import { toast } from '@/components/ui/toaster'

type Ringing = { call: TwilioCall; from: string; lead: SmsLeadRef; phase: 'ringing' | 'live' }

function clock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/**
 * Rings in the app when someone calls the signed-in teammate's own number,
 * on whatever page they have open. Mounted once in the app layout for
 * teammates who have a number assigned to them.
 */
export function IncomingCalls() {
  const [ringing, setRinging] = useState<Ringing | null>(null)
  const [muted, setMuted] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [number, setNumber] = useState<string | null>(null)
  const deviceRef = useRef<Device | null>(null)
  const startedAt = useRef<number | null>(null)

  useEffect(() => {
    let cancelled = false

    const setup = async () => {
      const grant = await incomingCallToken()
      if (!grant.ok || cancelled) return
      const { Device } = await import('@twilio/voice-sdk')
      if (cancelled) return
      const device = new Device(grant.token, { closeProtection: true })
      deviceRef.current = device
      setNumber(grant.number)

      device.on('incoming', async (call: TwilioCall) => {
        const from = call.parameters.From ?? ''
        setMuted(false)
        setSeconds(0)
        setRinging({ call, from, lead: null, phase: 'ringing' })
        call.on('accept', () => {
          startedAt.current = Date.now()
          setRinging((current) => (current ? { ...current, phase: 'live' } : current))
        })
        const clear = () => {
          startedAt.current = null
          setRinging(null)
        }
        call.on('cancel', clear)
        call.on('disconnect', clear)
        call.on('reject', clear)
        call.on('error', (error: { message?: string }) => {
          toast.error(error.message ?? 'The call failed.')
          clear()
        })
        const lead = await callerInfo(from)
        setRinging((current) => (current && current.call === call ? { ...current, lead } : current))
      })
      // Tokens last an hour; swap in a fresh one before it runs out.
      device.on('tokenWillExpire', async () => {
        const fresh = await incomingCallToken()
        if (fresh.ok) device.updateToken(fresh.token)
      })
      device.on('error', (error: { message?: string; code?: number }) => {
        // 31005 = connection dropped; the SDK reconnects on its own.
        if (error.code !== 31005) console.warn('[incoming calls]', error.message)
      })
      try {
        await device.register()
      } catch (error) {
        console.warn('[incoming calls] could not register', error)
      }
    }
    void setup()

    return () => {
      cancelled = true
      deviceRef.current?.destroy()
      deviceRef.current = null
    }
  }, [])

  useEffect(() => {
    if (ringing?.phase !== 'live') return
    const timer = setInterval(() => {
      if (startedAt.current) setSeconds(Math.floor((Date.now() - startedAt.current) / 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [ringing?.phase])

  if (!ringing) return null
  const who = ringing.lead ? ringing.lead.full_name : formatPhone(ringing.from)
  const detail = ringing.lead
    ? [ringing.lead.company, formatPhone(ringing.from)].filter(Boolean).join(' · ')
    : 'Not in your CRM'

  return (
    <div
      role="dialog"
      aria-label={ringing.phase === 'ringing' ? `Incoming call from ${who}` : `On a call with ${who}`}
      className="fixed right-4 bottom-4 z-[90] w-[calc(100vw-2rem)] max-w-sm rounded-2xl border border-border bg-card p-4 shadow-2xl animate-in slide-in-from-bottom-4"
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-full',
            ringing.phase === 'ringing' ? 'animate-pulse bg-success/15 text-success' : 'bg-primary/15 text-primary',
          )}
        >
          <PhoneIncoming className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {ringing.phase === 'ringing' ? 'Incoming call' : `On call · ${clock(seconds)}`}
            {number ? ` · ${formatPhone(number)}` : ''}
          </p>
          <p className="truncate font-display text-base font-semibold">{who}</p>
          <p className="truncate text-xs text-muted-foreground">{detail}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {ringing.phase === 'ringing' ? (
          <>
            <Button className="flex-1 bg-success text-white hover:brightness-110" onClick={() => ringing.call.accept()}>
              <PhoneIncoming className="size-4" />
              Answer
            </Button>
            <Button variant="destructive" className="flex-1" onClick={() => ringing.call.reject()}>
              <PhoneOff className="size-4" />
              Decline
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="outline"
              onClick={() => {
                ringing.call.mute(!muted)
                setMuted(!muted)
              }}
            >
              {muted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
              {muted ? 'Unmute' : 'Mute'}
            </Button>
            <Button variant="destructive" className="flex-1" onClick={() => ringing.call.disconnect()}>
              <PhoneOff className="size-4" />
              Hang up
            </Button>
          </>
        )}
        {ringing.lead ? (
          <Link href={`/dialer/${ringing.lead.id}`} className={buttonVariants({ variant: 'ghost', size: 'icon' })} aria-label="Open lead" title="Open lead">
            <UserRound className="size-4" />
          </Link>
        ) : null}
      </div>
    </div>
  )
}
