import { createAdminClient } from '@/lib/supabase/admin'
import { formParams, isTwilioRequest } from '@/lib/voice/twilio'

export const runtime = 'nodejs'

/**
 * Twilio real-time transcription posts each finished sentence here. It is
 * stored as a call event, which Supabase Realtime pushes to the open dialer;
 * the dialer then asks Claude for a suggestion when the lead has spoken.
 */
export async function POST(request: Request) {
  const params = await formParams(request)
  if (!isTwilioRequest(request, params)) return new Response('Forbidden', { status: 403 })

  if (params.TranscriptionEvent !== 'transcription-content' || params.Final !== 'true') {
    return new Response(null, { status: 204 })
  }

  let transcript = ''
  try {
    const data = JSON.parse(params.TranscriptionData ?? '{}') as { transcript?: unknown }
    transcript = typeof data.transcript === 'string' ? data.transcript.trim() : ''
  } catch {
    return new Response(null, { status: 204 })
  }
  if (!transcript) return new Response(null, { status: 204 })

  const callId = new URL(request.url).searchParams.get('callId')
  if (!callId) return new Response(null, { status: 204 })

  const supabase = createAdminClient()
  const { data: call } = await supabase
    .from('calls')
    .select('id, org_id, twilio_call_sid')
    .eq('id', callId)
    .maybeSingle()

  // The callId comes from our own TwiML; also require the Twilio call to match.
  if (!call || (call.twilio_call_sid && params.CallSid && call.twilio_call_sid !== params.CallSid)) {
    return new Response(null, { status: 204 })
  }

  await supabase.from('call_events').insert({
    org_id: call.org_id,
    call_id: call.id,
    kind: 'transcript',
    speaker: params.Track === 'inbound_track' ? 'rep' : 'lead',
    text: transcript,
    payload: { sequence: Number(params.SequenceId) || 0, track: params.Track ?? null },
  })

  return new Response(null, { status: 204 })
}
