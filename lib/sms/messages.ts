import { formatPhone } from '@/lib/phone'
import { createAdminClient } from '@/lib/supabase/admin'
import type { PhoneNumber, SmsMessage } from '@/lib/supabase/types'
import { publicBaseUrl } from '@/lib/voice/twilio'
import { twilioClient } from '@/lib/voice/numbers'
import type { SmsLeadRef } from './shape'

/**
 * Texts on the workspace's numbers. Every message is a row in sms_messages;
 * a conversation is one of our numbers plus one contact. Inbound texts arrive
 * through /api/sms/inbound; outbound ones are sent here.
 */

export { SMS_MAX_LENGTH, type SmsLeadRef, type SmsMessageWithLead } from './shape'

/** The lead with this phone number, if the workspace has one. */
export async function leadForPhone(orgId: string, e164: string): Promise<SmsLeadRef> {
  const last10 = e164.replace(/\D/g, '').slice(-10)
  if (last10.length < 7) return null
  const { data } = await createAdminClient()
    .from('leads')
    .select('id, full_name, company, phone')
    .eq('org_id', orgId)
    .ilike('phone', `%${last10.slice(-4)}%`)
    .limit(200)
  const lead = (data ?? []).find((row) => (row.phone ?? '').replace(/\D/g, '').endsWith(last10))
  return lead ? { id: lead.id, full_name: lead.full_name, company: lead.company } : null
}

/** Sends a text from one of the workspace's numbers and records it. */
export async function sendText({
  number,
  to,
  body,
  userId,
  leadId,
}: {
  number: PhoneNumber
  to: string
  body: string
  userId: string | null
  leadId?: string | null
}): Promise<SmsMessage> {
  const admin = createAdminClient()
  const lead = leadId ? { id: leadId } : await leadForPhone(number.org_id, to)
  const base = publicBaseUrl()

  let sid: string | null = null
  let status: SmsMessage['status'] = 'queued'
  let error: string | null = null
  try {
    const sent = await twilioClient().messages.create({
      from: number.phone_number,
      to,
      body,
      ...(base ? { statusCallback: `${base}/api/sms/status` } : {}),
    })
    sid = sent.sid
    if (sent.status === 'failed' || sent.status === 'undelivered') {
      status = 'failed'
      error = sent.errorMessage ?? 'Twilio could not send the text.'
    }
  } catch (sendError) {
    status = 'failed'
    error = sendError instanceof Error ? sendError.message : 'Twilio could not send the text.'
  }

  const { data, error: insertError } = await admin
    .from('sms_messages')
    .insert({
      org_id: number.org_id,
      phone_number_id: number.id,
      direction: 'outbound',
      contact_number: to,
      body,
      lead_id: lead?.id ?? null,
      user_id: userId,
      twilio_sid: sid,
      status,
      error,
      read_at: new Date().toISOString(),
    })
    .select('*')
    .single()
  if (insertError || !data) throw new Error(insertError?.message ?? 'Could not save the text.')

  if (lead && status !== 'failed') {
    await admin.from('lead_activities').insert({
      org_id: number.org_id,
      lead_id: lead.id,
      user_id: userId,
      type: 'note',
      title: `SMS sent · ${formatPhone(to)}`,
      body: body.slice(0, 500),
      metadata: { sms_id: data.id },
    })
    await admin.from('leads').update({ last_contacted_at: new Date().toISOString() }).eq('id', lead.id)
  }
  return data as SmsMessage
}

/**
 * Stores a text that arrived on one of our numbers, links it to the lead
 * with that phone number, and tells the teammate who owns the number (or
 * every admin, for a shared number).
 */
export async function recordInbound({
  number,
  from,
  body,
  twilioSid,
}: {
  number: PhoneNumber
  from: string
  body: string
  twilioSid: string
}) {
  const admin = createAdminClient()
  const lead = await leadForPhone(number.org_id, from)
  const { data, error } = await admin
    .from('sms_messages')
    .insert({
      org_id: number.org_id,
      phone_number_id: number.id,
      direction: 'inbound',
      contact_number: from,
      body,
      lead_id: lead?.id ?? null,
      twilio_sid: twilioSid,
      status: 'received',
    })
    .select('id')
    .single()
  // Twilio retries on errors; a duplicate sid means this one is already stored.
  if (error?.code === '23505') return
  if (error || !data) throw new Error(error?.message ?? 'Could not save the text.')

  if (lead) {
    await admin.from('lead_activities').insert({
      org_id: number.org_id,
      lead_id: lead.id,
      type: 'note',
      title: `SMS received · ${formatPhone(from)}`,
      body: body.slice(0, 500),
      metadata: { sms_id: data.id },
    })
  }

  let recipients = number.assigned_to ? [number.assigned_to] : []
  if (recipients.length === 0) {
    const { data: admins } = await admin
      .from('organization_members')
      .select('user_id')
      .eq('org_id', number.org_id)
      .in('role', ['owner', 'admin'])
    recipients = (admins ?? []).map((member) => member.user_id)
  }
  if (recipients.length > 0) {
    const who = lead ? `${lead.full_name}${lead.company ? ` (${lead.company})` : ''}` : formatPhone(from)
    await admin.from('notifications').insert(
      recipients.map((userId) => ({
        org_id: number.org_id,
        user_id: userId,
        title: `Text from ${who}`,
        body: body.slice(0, 240),
        href: `/sms?number=${number.id}&with=${encodeURIComponent(from)}`,
      })),
    )
  }
}

/** Twilio's delivery status for a text we sent. */
export async function updateDelivery(twilioSid: string, twilioStatus: string, errorMessage: string | null) {
  const status: SmsMessage['status'] | null =
    twilioStatus === 'delivered' ? 'delivered'
    : twilioStatus === 'sent' ? 'sent'
    : twilioStatus === 'failed' || twilioStatus === 'undelivered' ? 'failed'
    : null
  if (!status) return
  await createAdminClient()
    .from('sms_messages')
    .update({ status, ...(status === 'failed' ? { error: errorMessage ?? 'Not delivered.' } : {}) })
    .eq('twilio_sid', twilioSid)
    // Never move a delivered text back to "sent" when callbacks arrive out of order.
    .neq('status', 'delivered')
}
