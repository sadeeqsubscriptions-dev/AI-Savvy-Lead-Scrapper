import { recordInbound } from '@/lib/sms/messages'
import { createAdminClient } from '@/lib/supabase/admin'
import type { PhoneNumber } from '@/lib/supabase/types'
import { formParams, isTwilioRequest } from '@/lib/voice/twilio'

export const runtime = 'nodejs'

/** Empty TwiML: the text is stored, no auto-reply. */
function ok() {
  return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    headers: { 'Content-Type': 'text/xml' },
  })
}

/**
 * Twilio posts here when a text arrives on one of the workspace numbers
 * (set as the number's SMS webhook when it is bought or attached).
 */
export async function POST(request: Request) {
  const params = await formParams(request)
  if (!isTwilioRequest(request, params)) return new Response('Forbidden', { status: 403 })

  const to = params.To
  const from = params.From
  const sid = params.MessageSid ?? params.SmsSid
  if (!to || !from || !sid) return ok()

  const { data: number } = await createAdminClient().from('phone_numbers').select('*').eq('phone_number', to).maybeSingle()
  if (!number) return ok() // a number nobody attached yet; nothing to file it under

  // Media-only texts still show up, so a photo isn't silently dropped.
  const body = (params.Body ?? '').trim() || (Number(params.NumMedia) > 0 ? '[Attachment: open in Twilio]' : '')
  if (!body) return ok()

  await recordInbound({ number: number as PhoneNumber, from, body, twilioSid: sid })
  return ok()
}
