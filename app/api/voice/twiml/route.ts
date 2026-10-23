import { createAdminClient } from '@/lib/supabase/admin'
import { getEntitlements } from '@/lib/billing/entitlements'
import { formatPhone, toE164 } from '@/lib/phone'
import { leadForPhone } from '@/lib/sms/messages'
import { callerIdFor } from '@/lib/voice/numbers'
import { VoiceResponse, formParams, isTwilioRequest, publicBaseUrl } from '@/lib/voice/twilio'

export const runtime = 'nodejs'

function twiml(body: string, status = 200) {
  return new Response(body, { status, headers: { 'Content-Type': 'text/xml' } })
}

function reject(message: string) {
  const response = new VoiceResponse()
  response.say(message)
  response.hangup()
  return twiml(response.toString())
}

/**
 * Twilio asks this route what to do when the rep's browser places a call.
 * Only calls created by `startCall` (a `calls` row in "dialing" state, placed
 * by the same user, to the same number) are put through.
 */
export async function POST(request: Request) {
  const params = await formParams(request)
  if (!isTwilioRequest(request, params)) return new Response('Forbidden', { status: 403 })

  const callId = params.CallId
  const to = params.To
  const identity = (params.From ?? '').replace(/^client:/, '')
  const supabase = createAdminClient()

  // Someone calling one of the team's numbers: ring the teammate it belongs
  // to in the app (any page they have open) and on the mobile from their
  // profile at the same time; whichever answers first takes it. Logged as a
  // call on the matching lead.
  if (!callId && params.Direction === 'inbound' && to) {
    const from = params.From ?? ''
    const { data: number } = await supabase.from('phone_numbers').select('*').eq('phone_number', to).maybeSingle()
    if (!number) return reject('This number is not set up for calls yet.')

    const { data: owner } = number.assigned_to
      ? await supabase.from('profiles').select('phone').eq('id', number.assigned_to).maybeSingle()
      : { data: null }
    // Outbound-only numbers take no calls at all; the caller is asked to text instead.
    if (!number.ring_in_app) {
      return reject('This number does not take incoming calls. Please send a text to this number and we will get back to you.')
    }
    const mobile = owner?.phone ? toE164(owner.phone) : null
    const ringBrowser = Boolean(number.assigned_to)
    if (!ringBrowser && !mobile) {
      return reject('Thanks for calling. Nobody can pick up right now; please send a text to this number and we will get back to you.')
    }

    const lead = from ? await leadForPhone(number.org_id, from) : null
    const { data: call } = await supabase
      .from('calls')
      .insert({
        org_id: number.org_id,
        lead_id: lead?.id ?? null,
        user_id: number.assigned_to,
        to_number: from || to,
        status: 'in_progress',
        twilio_call_sid: params.CallSid ?? null,
      })
      .select('id')
      .single()
    if (lead) {
      await supabase.from('lead_activities').insert({
        org_id: number.org_id,
        lead_id: lead.id,
        user_id: number.assigned_to,
        type: 'call',
        title: `Incoming call · ${formatPhone(from)}`,
        metadata: { call_id: call?.id ?? null, direction: 'inbound' },
      })
    }

    const base = publicBaseUrl(request)
    const response = new VoiceResponse()
    const dial = response.dial({
      // The caller's own number is shown, as Twilio allows when forwarding a call it received.
      callerId: from || to,
      timeout: 25,
      answerOnBridge: true,
      action: `${base}/api/voice/status?callId=${call?.id ?? ''}&inbound=1`,
    })
    if (ringBrowser) dial.client(number.assigned_to!)
    if (mobile) dial.number(mobile)
    return twiml(response.toString())
  }

  if (!callId || !to) return reject('This call is missing details. Please try again from the dialer.')

  const { data: call } = await supabase.from('calls').select('*').eq('id', callId).maybeSingle()

  if (!call || call.status !== 'dialing' || call.to_number !== to || call.user_id !== identity) {
    return reject('This call could not be verified. Please try again from the dialer.')
  }

  await supabase
    .from('calls')
    .update({ status: 'in_progress', twilio_call_sid: params.CallSid ?? null })
    .eq('id', call.id)

  // Call from the rep's own number (or the workspace's), and never past the minutes it has left.
  const [fromNumber, entitlements] = await Promise.all([callerIdFor(call.org_id, call.user_id), getEntitlements(call.org_id)])
  const minutesLeft = entitlements.remaining.callMinutes
  if (!fromNumber || !entitlements.plan.features.calling || minutesLeft < 1) {
    return reject('Calling is not available on this workspace right now. Please check your plan.')
  }

  const base = publicBaseUrl(request)
  const response = new VoiceResponse()

  // Transcribe both sides. The rep's browser is the caller here, so the
  // inbound track is the rep and the outbound track is the lead.
  response.start().transcription({
    statusCallbackUrl: `${base}/api/voice/transcription?callId=${call.id}`,
    track: 'both_tracks',
    inboundTrackLabel: 'rep',
    outboundTrackLabel: 'lead',
    languageCode: 'en-US',
    // Deepgram Nova-3 finalises sentences faster than the default engine,
    // which is what the live coach waits on.
    transcriptionEngine: 'deepgram',
    speechModel: 'nova-3',
    partialResults: false,
  })

  const dial = response.dial({
    callerId: fromNumber,
    answerOnBridge: true,
    timeLimit: Math.max(60, Math.min(60 * 60, minutesLeft * 60)),
    action: `${base}/api/voice/status?callId=${call.id}`,
  })
  dial.number(to)

  return twiml(response.toString())
}
