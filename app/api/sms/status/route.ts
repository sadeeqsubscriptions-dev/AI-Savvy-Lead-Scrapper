import { updateDelivery } from '@/lib/sms/messages'
import { formParams, isTwilioRequest } from '@/lib/voice/twilio'

export const runtime = 'nodejs'

/** Twilio reports whether a text we sent was delivered. */
export async function POST(request: Request) {
  const params = await formParams(request)
  if (!isTwilioRequest(request, params)) return new Response('Forbidden', { status: 403 })

  const sid = params.MessageSid ?? params.SmsSid
  if (sid && params.MessageStatus) await updateDelivery(sid, params.MessageStatus, params.ErrorMessage ?? null)
  return new Response(null, { status: 204 })
}
