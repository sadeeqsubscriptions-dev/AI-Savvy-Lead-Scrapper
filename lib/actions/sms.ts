'use server'

import { revalidatePath } from 'next/cache'
import { canWrite, requireSession } from '@/lib/auth'
import { toE164 } from '@/lib/phone'
import { SMS_MAX_LENGTH, sendText } from '@/lib/sms/messages'
import { createAdminClient } from '@/lib/supabase/admin'
import type { PhoneNumber, SmsMessage } from '@/lib/supabase/types'
import { twilioReady } from '@/lib/voice/numbers'

type SendResult = { ok: true; message: SmsMessage } | { ok: false; error: string }

/** Sends a text from one of the workspace's numbers. */
export async function sendSms(input: { numberId: string; to: string; body: string; leadId?: string | null }): Promise<SendResult> {
  const session = await requireSession()
  if (!canWrite(session.role)) return { ok: false, error: 'Viewers cannot send texts.' }
  if (!twilioReady()) return { ok: false, error: 'Texting is not set up on the server yet.' }

  const to = toE164(input.to)
  if (!to) return { ok: false, error: 'Enter the full number with area code, e.g. +1 305 555 0100.' }
  const body = input.body.trim()
  if (!body) return { ok: false, error: 'Write a message first.' }
  if (body.length > SMS_MAX_LENGTH) return { ok: false, error: `Keep it under ${SMS_MAX_LENGTH} characters.` }

  const { data: number } = await createAdminClient()
    .from('phone_numbers')
    .select('*')
    .eq('id', input.numberId)
    .eq('org_id', session.organization.id)
    .maybeSingle()
  if (!number) return { ok: false, error: 'Pick one of your workspace numbers.' }
  if (!number.sms) return { ok: false, error: `${number.phone_number} cannot send texts.` }
  if (to === number.phone_number) return { ok: false, error: 'That is your own number.' }

  try {
    const message = await sendText({ number: number as PhoneNumber, to, body, userId: session.userId, leadId: input.leadId })
    revalidatePath('/sms')
    if (message.status === 'failed') return { ok: false, error: message.error ?? 'Twilio could not send the text.' }
    return { ok: true, message }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not send the text.' }
  }
}

/** Opening a conversation marks its unread texts as read for the whole team. */
export async function markConversationRead(numberId: string, contact: string) {
  const session = await requireSession()
  await createAdminClient()
    .from('sms_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('org_id', session.organization.id)
    .eq('phone_number_id', numberId)
    .eq('contact_number', contact)
    .eq('direction', 'inbound')
    .is('read_at', null)
}
