import { createAdminClient } from '@/lib/supabase/admin'
import { VoiceResponse, formParams, isTwilioRequest } from '@/lib/voice/twilio'

export const runtime = 'nodejs'

/**
 * Twilio calls this when the dialed leg ends (answered or not). Records the
 * outcome even if the rep closed the tab before the dialer could.
 */
export async function POST(request: Request) {
  const params = await formParams(request)
  if (!isTwilioRequest(request, params)) return new Response('Forbidden', { status: 403 })

  const callId = new URL(request.url).searchParams.get('callId')
  if (callId) {
    const answered = params.DialCallStatus === 'completed'
    const supabase = createAdminClient()
    await supabase
      .from('calls')
      .update({
        status: answered ? 'completed' : 'failed',
        ended_at: new Date().toISOString(),
        duration_seconds: Number(params.DialCallDuration) || 0,
      })
      .eq('id', callId)
      .in('status', ['dialing', 'in_progress'])
  }

  const response = new VoiceResponse()
  response.hangup()
  return new Response(response.toString(), { headers: { 'Content-Type': 'text/xml' } })
}
