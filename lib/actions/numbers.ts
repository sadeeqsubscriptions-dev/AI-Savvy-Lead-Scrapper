'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { isAdmin, requireSession } from '@/lib/auth'
import { getEntitlements } from '@/lib/billing/entitlements'
import { PHONE_NUMBER_PRICE } from '@/lib/billing/plans'
import { customerFor, phoneNumberPrice, stripe, stripeConfigured } from '@/lib/billing/stripe'
import { toE164 } from '@/lib/phone'
import { createAdminClient } from '@/lib/supabase/admin'
import { attachNumber, provisionNumber, releaseNumberById, twilioReady } from '@/lib/voice/numbers'

type Done = { ok: true; message: string } | { ok: true; url: string } | { ok: false; error: string }

const nameSchema = z.string().trim().min(1, 'Give the number a name.').max(60, 'Keep the name under 60 characters.')

async function numbersAdmin() {
  const session = await requireSession()
  if (!isAdmin(session.role)) return { ok: false as const, error: 'Only the workspace owner or an admin can manage phone numbers.' }
  return { ok: true as const, session }
}

/** True when `userId` is a member of the workspace (so a number can be assigned to them). */
async function isMember(orgId: string, userId: string) {
  const { count } = await createAdminClient()
    .from('organization_members')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('user_id', userId)
  return (count ?? 0) > 0
}

function refresh() {
  revalidatePath('/team')
  revalidatePath('/sms')
  revalidatePath('/billing')
  revalidatePath('/settings')
}

/**
 * Buys a number for a teammate. On the AI Savvy workspace it's bought right
 * away on the company Twilio account; customers pay $PHONE_NUMBER_PRICE a
 * month through Stripe Checkout, and the number is bought when the
 * subscription starts (see applyPhoneNumberSubscription).
 */
export async function buyNumber(input: { name: string; areaCode: string; assignTo: string | null }): Promise<Done> {
  const gate = await numbersAdmin()
  if (!gate.ok) return gate
  const { session } = gate
  const orgId = session.organization.id

  const name = nameSchema.safeParse(input.name)
  if (!name.success) return { ok: false, error: name.error.issues[0].message }
  const areaCode = input.areaCode.trim()
  if (areaCode && !/^\d{3}$/.test(areaCode)) return { ok: false, error: 'An area code is three digits, e.g. 305.' }
  const assignTo = input.assignTo || null
  if (assignTo && !(await isMember(orgId, assignTo))) return { ok: false, error: 'Pick someone on the team.' }

  const entitlements = await getEntitlements(orgId)
  if (!entitlements.plan.features.calling) {
    return { ok: false, error: 'Phone numbers come with the Growth and Pro plans. Upgrade on the Billing page first.' }
  }

  if (entitlements.plan.id === 'internal') {
    if (!twilioReady()) return { ok: false, error: 'Twilio is not configured on the server.' }
    try {
      const number = await provisionNumber(orgId, {
        areaCode: areaCode ? Number(areaCode) : undefined,
        friendlyName: name.data,
        assignedTo: assignTo,
        source: 'attached',
      })
      refresh()
      return { ok: true, message: `${number.phone_number} is ready.` }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Could not buy a number.' }
    }
  }

  if (!stripeConfigured()) return { ok: false, error: 'Payments are not set up yet. Please contact support.' }
  if (entitlements.paused) return { ok: false, error: 'Update your card on the Billing page before adding numbers.' }

  const customer = await customerFor(orgId, { email: session.email, name: session.organization.name })
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  const metadata = {
    kind: 'phone_number',
    org_id: orgId,
    friendly_name: name.data,
    area_code: areaCode,
    assigned_to: assignTo ?? '',
  }
  const checkout = await stripe().checkout.sessions.create({
    mode: 'subscription',
    customer,
    client_reference_id: orgId,
    line_items: [{ price: await phoneNumberPrice(), quantity: 1 }],
    subscription_data: { metadata },
    metadata,
    success_url: `${siteUrl}/team?number=new`,
    cancel_url: `${siteUrl}/team`,
  })
  if (!checkout.url) return { ok: false, error: 'Stripe did not return a checkout page.' }
  return { ok: true, url: checkout.url }
}

/** Team workspace only: a number the company already owns in Twilio. */
export async function attachExistingNumber(input: { phoneNumber: string; name: string; assignTo: string | null }): Promise<Done> {
  const gate = await numbersAdmin()
  if (!gate.ok) return gate
  const { session } = gate
  const orgId = session.organization.id

  const entitlements = await getEntitlements(orgId)
  if (entitlements.plan.id !== 'internal') return { ok: false, error: 'Only the AI Savvy workspace can attach company numbers.' }
  if (!twilioReady()) return { ok: false, error: 'Twilio is not configured on the server.' }

  const e164 = toE164(input.phoneNumber)
  if (!e164) return { ok: false, error: 'Enter the full number with area code, e.g. +1 754 227 1288.' }
  const name = nameSchema.safeParse(input.name)
  if (!name.success) return { ok: false, error: name.error.issues[0].message }
  const assignTo = input.assignTo || null
  if (assignTo && !(await isMember(orgId, assignTo))) return { ok: false, error: 'Pick someone on the team.' }

  try {
    await attachNumber(orgId, e164, { friendlyName: name.data, assignedTo: assignTo })
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not attach the number.' }
  }
  refresh()
  return { ok: true, message: `${e164} is attached and ready for calls and texts.` }
}

async function ownedNumber(numberId: string, orgId: string) {
  const { data } = await createAdminClient().from('phone_numbers').select('*').eq('id', numberId).eq('org_id', orgId).maybeSingle()
  return data
}

export async function renameNumber(numberId: string, name: string): Promise<Done> {
  const gate = await numbersAdmin()
  if (!gate.ok) return gate
  const parsed = nameSchema.safeParse(name)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  if (!(await ownedNumber(numberId, gate.session.organization.id))) return { ok: false, error: 'Number not found.' }

  const { error } = await createAdminClient()
    .from('phone_numbers')
    .update({ friendly_name: parsed.data, updated_at: new Date().toISOString() })
    .eq('id', numberId)
  if (error) return { ok: false, error: error.message }
  refresh()
  return { ok: true, message: 'Number renamed.' }
}

/** Gives the number to one teammate (or nobody): their calls and texts use it. */
export async function assignNumber(numberId: string, userId: string | null): Promise<Done> {
  const gate = await numbersAdmin()
  if (!gate.ok) return gate
  const orgId = gate.session.organization.id
  if (!(await ownedNumber(numberId, orgId))) return { ok: false, error: 'Number not found.' }
  if (userId && !(await isMember(orgId, userId))) return { ok: false, error: 'Pick someone on the team.' }

  const { error } = await createAdminClient()
    .from('phone_numbers')
    .update({ assigned_to: userId, updated_at: new Date().toISOString() })
    .eq('id', numberId)
  if (error) return { ok: false, error: error.message }
  refresh()
  return { ok: true, message: userId ? 'Number assigned.' : 'Number is now shared by the team.' }
}

/**
 * Removes a number: purchased numbers are released in Twilio and their
 * subscription ends; attached company numbers are just taken off the team.
 * The plan's own number can't be removed here (it goes with the plan).
 */
export async function removeNumber(numberId: string): Promise<Done> {
  const gate = await numbersAdmin()
  if (!gate.ok) return gate
  const number = await ownedNumber(numberId, gate.session.organization.id)
  if (!number) return { ok: false, error: 'Number not found.' }
  if (number.source === 'plan') return { ok: false, error: 'This number comes with your plan and stays as long as the plan does.' }

  if (number.stripe_subscription_id && stripeConfigured()) {
    try {
      // The webhook for the cancelled subscription releases the number too; releasing here as well is harmless.
      await stripe().subscriptions.cancel(number.stripe_subscription_id, { prorate: true })
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Could not end the number’s subscription.' }
    }
  }
  await releaseNumberById(number.id)
  refresh()
  return {
    ok: true,
    message:
      number.source === 'purchased'
        ? `${number.phone_number} released. The $${PHONE_NUMBER_PRICE}/month charge has stopped.`
        : `${number.phone_number} removed from the team.`,
  }
}
