import twilio from 'twilio'
import { PHONE_NUMBER_PRICE } from '@/lib/billing/plans'
import { createAdminClient } from '@/lib/supabase/admin'
import type { PhoneNumber, PhoneNumberSource } from '@/lib/supabase/types'
import { publicBaseUrl } from './twilio'

/**
 * Phone numbers per workspace (table phone_numbers). Growth and Pro
 * subscribers get a number when they subscribe ('plan'); an admin can buy more
 * for the team ('purchased', billed separately) or, on the AI Savvy workspace,
 * attach numbers the company already owns in Twilio ('attached'). A number
 * assigned to a teammate is the caller ID for their calls and the line their
 * texts go out from. The AI Savvy workspace itself keeps TWILIO_CALLER_ID as
 * the fallback for anyone without their own number.
 */

export function twilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const keySid = process.env.TWILIO_API_KEY_SID
  const keySecret = process.env.TWILIO_API_KEY_SECRET?.trim()
  if (!accountSid || !keySid || !keySecret) throw new Error('Twilio is not configured.')
  return twilio(keySid, keySecret, { accountSid })
}

export function twilioReady() {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_API_KEY_SID && process.env.TWILIO_API_KEY_SECRET?.trim())
}

export async function listNumbers(orgId: string): Promise<PhoneNumber[]> {
  const { data } = await createAdminClient()
    .from('phone_numbers')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at')
  return (data as PhoneNumber[] | null) ?? []
}

/**
 * The number a teammate calls and texts from: their own, else the
 * workspace's first unassigned number, else (team workspace only) the company
 * line. Null when the workspace has none (yet).
 */
export async function numberFor(orgId: string, userId?: string | null): Promise<PhoneNumber | null> {
  const numbers = await listNumbers(orgId)
  if (userId) {
    const own = numbers.find((number) => number.assigned_to === userId)
    if (own) return own
  }
  return numbers.find((number) => !number.assigned_to) ?? numbers[0] ?? null
}

/** The caller ID for this teammate's calls, or null if the workspace has no number. */
export async function callerIdFor(orgId: string, userId?: string | null): Promise<string | null> {
  const own = await numberFor(orgId, userId)
  if (own?.voice) return own.phone_number
  const { data: billing, error } = await createAdminClient().from('org_billing').select('plan').eq('org_id', orgId).maybeSingle()
  // Unreadable billing = no number: a customer never calls from the company line.
  if (error || !billing) return null
  return billing.plan === 'internal' ? process.env.TWILIO_CALLER_ID || null : null
}

/** Where Twilio sends texts: the live site. Localhost can't receive webhooks. */
function webhookBase() {
  const base = publicBaseUrl()
  if (!base) throw new Error('Set NEXT_PUBLIC_SITE_URL to the live https address so Twilio can reach the app.')
  return base
}

/** Points the number's voice and SMS webhooks at this app. */
async function configureInTwilio(sid: string) {
  const base = webhookBase()
  await twilioClient().incomingPhoneNumbers(sid).update({
    voiceApplicationSid: process.env.TWILIO_TWIML_APP_SID,
    smsUrl: `${base}/api/sms/inbound`,
    smsMethod: 'POST',
  })
}

/**
 * Buys a local number (US by default, near `areaCode` when given), wires its
 * webhooks and saves it. For the plan number this is idempotent: a workspace
 * that already has one gets it back without buying another.
 */
export async function provisionNumber(
  orgId: string,
  {
    country = 'US',
    areaCode,
    friendlyName = 'Workspace number',
    assignedTo = null,
    source = 'plan',
    stripeSubscriptionId = null,
  }: {
    country?: string
    areaCode?: number
    friendlyName?: string
    assignedTo?: string | null
    source?: PhoneNumberSource
    stripeSubscriptionId?: string | null
  } = {},
): Promise<PhoneNumber> {
  const admin = createAdminClient()
  if (source === 'plan') {
    const { data: existing } = await admin.from('phone_numbers').select('*').eq('org_id', orgId).eq('source', 'plan').maybeSingle()
    if (existing) return existing as PhoneNumber
  }

  const client = twilioClient()
  const search = (code?: number) =>
    client.availablePhoneNumbers(country).local.list({ voiceEnabled: true, smsEnabled: true, limit: 1, ...(code ? { areaCode: code } : {}) })

  const candidates = (areaCode ? await search(areaCode) : []).concat(await search())
  const pick = candidates[0]
  if (!pick) throw new Error(`No ${country} numbers available right now.`)

  const base = webhookBase()
  const bought = await client.incomingPhoneNumbers.create({
    phoneNumber: pick.phoneNumber,
    friendlyName: `AI Savvy ${friendlyName} (${orgId.slice(0, 8)})`,
    voiceApplicationSid: process.env.TWILIO_TWIML_APP_SID,
    smsUrl: `${base}/api/sms/inbound`,
    smsMethod: 'POST',
  })

  const { data, error } = await admin
    .from('phone_numbers')
    .insert({
      org_id: orgId,
      phone_number: bought.phoneNumber,
      twilio_sid: bought.sid,
      friendly_name: friendlyName,
      assigned_to: assignedTo,
      source,
      stripe_subscription_id: stripeSubscriptionId,
      monthly_price_cents: source === 'purchased' ? PHONE_NUMBER_PRICE * 100 : 0,
      voice: pick.capabilities?.voice ?? true,
      sms: pick.capabilities?.sms ?? true,
      configured_at: new Date().toISOString(),
    })
    .select('*')
    .single()
  if (error || !data) {
    // Don't keep paying for a number nobody can see.
    await client.incomingPhoneNumbers(bought.sid).remove().catch(() => {})
    throw new Error(error?.message ?? 'Could not save the number.')
  }
  return data as PhoneNumber
}

/**
 * Adds a number the company already owns in the Twilio account (team
 * workspace only): looks it up, points its webhooks here and saves it.
 */
export async function attachNumber(
  orgId: string,
  phoneNumber: string,
  { friendlyName, assignedTo = null }: { friendlyName: string; assignedTo?: string | null },
): Promise<PhoneNumber> {
  const [owned] = await twilioClient().incomingPhoneNumbers.list({ phoneNumber, limit: 1 })
  if (!owned) throw new Error(`${phoneNumber} is not in the Twilio account. Buy it in the Twilio console first.`)

  await configureInTwilio(owned.sid)
  const { data, error } = await createAdminClient()
    .from('phone_numbers')
    .upsert(
      {
        org_id: orgId,
        phone_number: owned.phoneNumber,
        twilio_sid: owned.sid,
        friendly_name: friendlyName,
        assigned_to: assignedTo,
        source: 'attached',
        voice: owned.capabilities?.voice ?? true,
        sms: owned.capabilities?.sms ?? true,
        configured_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'phone_number' },
    )
    .select('*')
    .single()
  if (error || !data) throw new Error(error?.message ?? 'Could not save the number.')
  return data as PhoneNumber
}

/**
 * Numbers saved without their Twilio details (seeded by hand) get looked up
 * and wired the first time the team page or SMS page loads with Twilio keys
 * available. Returns the numbers, repaired where possible.
 */
export async function syncNumbers(orgId: string): Promise<PhoneNumber[]> {
  const numbers = await listNumbers(orgId)
  if (!twilioReady() || numbers.every((number) => number.configured_at)) return numbers

  const admin = createAdminClient()
  for (const number of numbers) {
    if (number.configured_at) continue
    try {
      let sid = number.twilio_sid
      let capabilities: { voice?: boolean; sms?: boolean } | undefined
      if (!sid) {
        const [owned] = await twilioClient().incomingPhoneNumbers.list({ phoneNumber: number.phone_number, limit: 1 })
        if (!owned) continue
        sid = owned.sid
        capabilities = owned.capabilities
      }
      await configureInTwilio(sid)
      const patch = {
        twilio_sid: sid,
        configured_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...(capabilities ? { voice: capabilities.voice ?? true, sms: capabilities.sms ?? true } : {}),
      }
      await admin.from('phone_numbers').update(patch).eq('id', number.id)
      Object.assign(number, patch)
    } catch (error) {
      console.error('[numbers] could not configure', number.phone_number, error)
    }
  }
  return numbers
}

/**
 * Gives a number back to Twilio and forgets it. Attached company numbers are
 * only forgotten here, never released: they belong to the AI Savvy account.
 */
export async function releaseNumberById(numberId: string) {
  const admin = createAdminClient()
  const { data: number } = await admin.from('phone_numbers').select('*').eq('id', numberId).maybeSingle()
  if (!number) return
  if (number.source !== 'attached' && number.twilio_sid) {
    try {
      await twilioClient().incomingPhoneNumbers(number.twilio_sid).remove()
    } catch {
      // Already released in the Twilio console; just forget it here.
    }
  }
  await admin.from('phone_numbers').delete().eq('id', number.id)
}

/** Releases the number that came with the plan (on cancel or downgrade). */
export async function releasePlanNumber(orgId: string) {
  const { data: number } = await createAdminClient()
    .from('phone_numbers')
    .select('id')
    .eq('org_id', orgId)
    .eq('source', 'plan')
    .maybeSingle()
  if (number) await releaseNumberById(number.id)
}
