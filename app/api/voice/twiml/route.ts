import { createAdminClient } from '@/lib/supabase/admin'
import { VoiceResponse, callerId, formParams, isTwilioRequest, publicBaseUrl } from '@/lib/voice/twilio'

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
  if (!callId || !to) return reject('This call is missing details. Please try again from the dialer.')

  const supabase = createAdminClient()
  const { data: call } = await supabase.from('calls').select('*').eq('id', callId).maybeSingle()

  if (!call || call.status !== 'dialing' || call.to_number !== to || call.user_id !== identity) {
    return reject('This call could not be verified. Please try again from the dialer.')
  }

  await supabase
    .from('calls')
    .update({ status: 'in_progress', twilio_call_sid: params.CallSid ?? null })
    .eq('id', call.id)

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
    partialResults: false,
  })

  const dial = response.dial({
    callerId: callerId(),
    answerOnBridge: true,
    timeLimit: 60 * 60,
    action: `${base}/api/voice/status?callId=${call.id}`,
  })
  dial.number(to)

  return twiml(response.toString())
}
