import twilio from 'twilio'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Phone numbers per workspace. Growth and Pro subscribers get their own
 * Twilio number (bought when they subscribe, released when they cancel), so
 * leads see a number belonging to that business. The AI Savvy team's own
 * workspace keeps TWILIO_CALLER_ID.
 */

function client() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const keySid = process.env.TWILIO_API_KEY_SID
  const keySecret = process.env.TWILIO_API_KEY_SECRET?.trim()
  if (!accountSid || !keySid || !keySecret) throw new Error('Twilio is not configured.')
  return twilio(keySid, keySecret, { accountSid })
}

/** The number this workspace calls from, or null if it has none (yet). */
export async function callerIdFor(orgId: string): Promise<string | null> {
  const { data: billing, error } = await createAdminClient()
    .from('org_billing')
    .select('plan, twilio_number')
    .eq('org_id', orgId)
    .maybeSingle()
  // Unreadable billing = no number: a customer never calls from the company line.
  if (error || !billing) return null
  if (billing.plan === 'internal') return process.env.TWILIO_CALLER_ID || null
  return billing.twilio_number ?? null
}

/**
 * Buys a local number for the workspace (US by default, near `areaCode` when
 * given) and saves it. Idempotent: does nothing if one is already assigned.
 */
export async function provisionNumber(orgId: string, { country = 'US', areaCode }: { country?: string; areaCode?: number } = {}) {
  const admin = createAdminClient()
  const { data: billing } = await admin.from('org_billing').select('twilio_number').eq('org_id', orgId).maybeSingle()
  if (billing?.twilio_number) return billing.twilio_number

  const twilioClient = client()
  const search = (code?: number) =>
    twilioClient.availablePhoneNumbers(country).local.list({ voiceEnabled: true, limit: 1, ...(code ? { areaCode: code } : {}) })

  const candidates = (areaCode ? await search(areaCode) : []).concat(await search())
  const pick = candidates[0]
  if (!pick) throw new Error(`No ${country} numbers available right now.`)

  const bought = await twilioClient.incomingPhoneNumbers.create({
    phoneNumber: pick.phoneNumber,
    friendlyName: `AI Savvy workspace ${orgId.slice(0, 8)}`,
    voiceApplicationSid: process.env.TWILIO_TWIML_APP_SID,
  })

  await admin
    .from('org_billing')
    .update({ twilio_number: bought.phoneNumber, twilio_number_sid: bought.sid, updated_at: new Date().toISOString() })
    .eq('org_id', orgId)
  return bought.phoneNumber
}

/** Gives the workspace's number back to Twilio (on cancel or downgrade). */
export async function releaseNumber(orgId: string) {
  const admin = createAdminClient()
  const { data: billing } = await admin
    .from('org_billing')
    .select('plan, twilio_number_sid')
    .eq('org_id', orgId)
    .maybeSingle()
  if (!billing?.twilio_number_sid || billing.plan === 'internal') return

  try {
    await client().incomingPhoneNumbers(billing.twilio_number_sid).remove()
  } catch {
    // Already released in the Twilio console; just forget it here.
  }
  await admin
    .from('org_billing')
    .update({ twilio_number: null, twilio_number_sid: null, updated_at: new Date().toISOString() })
    .eq('org_id', orgId)
}
