import Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import type { PlanId } from '@/lib/supabase/types'
import { provisionNumber, releaseNumberById, releasePlanNumber } from '@/lib/voice/numbers'
import { PHONE_NUMBER_PRICE, PLANS, planFor } from './plans'

/**
 * Stripe glue. Plans are created in Stripe automatically on first use (looked
 * up by lookup_key), so the only Stripe setup is the API key and webhook.
 */

let client: Stripe | null = null

export function stripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY)
}

export function stripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('Payments are not set up yet (STRIPE_SECRET_KEY).')
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY.trim())
  return client
}

const priceCache = new Map<string, string>()

/** The monthly price for a paid plan, created in Stripe the first time it's needed. */
export async function priceFor(planId: PlanId) {
  const plan = PLANS[planId]
  if (!plan || plan.price <= 0) throw new Error('That plan cannot be bought.')
  const lookupKey = `ai_savvy_${plan.id}_monthly_${plan.price}`
  const cached = priceCache.get(lookupKey)
  if (cached) return cached

  const { data } = await stripe().prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 })
  let priceId = data[0]?.id
  if (!priceId) {
    const product = await stripe().products.create({
      name: `AI Savvy Lead Scraper — ${plan.name}`,
      description: plan.highlights.join(' · '),
      metadata: { plan: plan.id },
    })
    const price = await stripe().prices.create({
      product: product.id,
      currency: 'usd',
      unit_amount: plan.price * 100,
      recurring: { interval: 'month' },
      lookup_key: lookupKey,
      metadata: { plan: plan.id },
    })
    priceId = price.id
  }
  priceCache.set(lookupKey, priceId)
  return priceId
}

/** The monthly price for one extra phone number, created in Stripe the first time it's needed. */
export async function phoneNumberPrice() {
  const lookupKey = `ai_savvy_phone_number_monthly_${PHONE_NUMBER_PRICE}`
  const cached = priceCache.get(lookupKey)
  if (cached) return cached

  const { data } = await stripe().prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 })
  let priceId = data[0]?.id
  if (!priceId) {
    const product = await stripe().products.create({
      name: 'AI Savvy Lead Scraper — Extra phone number',
      description: 'A US phone number for one teammate: calls with the AI coach and SMS.',
      metadata: { kind: 'phone_number' },
    })
    const price = await stripe().prices.create({
      product: product.id,
      currency: 'usd',
      unit_amount: PHONE_NUMBER_PRICE * 100,
      recurring: { interval: 'month' },
      lookup_key: lookupKey,
      metadata: { kind: 'phone_number' },
    })
    priceId = price.id
  }
  priceCache.set(lookupKey, priceId)
  return priceId
}

/** The workspace's Stripe customer, created on first checkout. */
export async function customerFor(orgId: string, { email, name }: { email: string; name: string }) {
  const admin = createAdminClient()
  const { data: billing } = await admin.from('org_billing').select('stripe_customer_id').eq('org_id', orgId).maybeSingle()
  if (billing?.stripe_customer_id) return billing.stripe_customer_id

  const customer = await stripe().customers.create({ email, name, metadata: { org_id: orgId } })
  await admin
    .from('org_billing')
    .update({ stripe_customer_id: customer.id, updated_at: new Date().toISOString() })
    .eq('org_id', orgId)
  return customer.id
}

function statusOf(subscription: Stripe.Subscription): 'active' | 'past_due' | 'canceled' {
  if (subscription.status === 'active' || subscription.status === 'trialing') return 'active'
  if (subscription.status === 'past_due' || subscription.status === 'unpaid' || subscription.status === 'incomplete') {
    return 'past_due'
  }
  return 'canceled'
}

/**
 * Mirrors a Stripe subscription onto the workspace: plan, status and billing
 * period (which also starts a fresh usage period), and gives or takes back
 * the phone number that comes with Growth and Pro.
 */
export async function applySubscription(subscription: Stripe.Subscription) {
  if (subscription.metadata?.kind === 'phone_number') return applyPhoneNumberSubscription(subscription)

  const admin = createAdminClient()
  let orgId: string | undefined = subscription.metadata?.org_id
  if (!orgId) {
    const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id
    const { data } = await admin.from('org_billing').select('org_id').eq('stripe_customer_id', customerId).maybeSingle()
    orgId = data?.org_id
  }
  if (!orgId) return

  const { data: current } = await admin.from('org_billing').select('plan').eq('org_id', orgId).maybeSingle()
  if (current?.plan === 'internal') return // the team's workspace is never billed

  const item = subscription.items.data[0]
  const planId = planFor(subscription.metadata?.plan ?? item?.price?.metadata?.plan).id
  const status = statusOf(subscription)

  if (status === 'canceled') {
    await admin
      .from('org_billing')
      .update({
        plan: 'free',
        status: 'active',
        stripe_subscription_id: null,
        period_start: new Date().toISOString(),
        period_end: null,
        updated_at: new Date().toISOString(),
      })
      .eq('org_id', orgId)
    await releasePlanNumber(orgId)
    return
  }

  await admin
    .from('org_billing')
    .update({
      plan: planId,
      status,
      stripe_subscription_id: subscription.id,
      ...(item?.current_period_start
        ? { period_start: new Date(item.current_period_start * 1000).toISOString() }
        : {}),
      ...(item?.current_period_end ? { period_end: new Date(item.current_period_end * 1000).toISOString() } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('org_id', orgId)

  // Growth and Pro come with their own calling number.
  if (status === 'active' && PLANS[planId].phoneNumber) {
    try {
      await provisionNumber(orgId)
    } catch (error) {
      console.error('[billing] could not buy a phone number', orgId, error)
    }
  } else if (!PLANS[planId].phoneNumber) {
    await releasePlanNumber(orgId)
  }
}

/**
 * An extra number bought for a teammate: its own monthly subscription. The
 * number is bought when the subscription starts and released when it ends.
 * If Twilio has nothing to sell, the subscription is cancelled so nobody pays
 * for a number they never got.
 */
async function applyPhoneNumberSubscription(subscription: Stripe.Subscription) {
  const admin = createAdminClient()
  const orgId = subscription.metadata?.org_id
  if (!orgId) return
  const { data: existing } = await admin
    .from('phone_numbers')
    .select('id')
    .eq('stripe_subscription_id', subscription.id)
    .maybeSingle()

  if (statusOf(subscription) === 'canceled') {
    if (existing) await releaseNumberById(existing.id)
    return
  }
  if (existing || statusOf(subscription) !== 'active') return

  const areaCode = Number(subscription.metadata?.area_code) || undefined
  try {
    await provisionNumber(orgId, {
      areaCode,
      friendlyName: subscription.metadata?.friendly_name?.trim() || 'Team number',
      assignedTo: subscription.metadata?.assigned_to || null,
      source: 'purchased',
      stripeSubscriptionId: subscription.id,
    })
  } catch (error) {
    console.error('[billing] could not buy an extra phone number', orgId, error)
    await stripe().subscriptions.cancel(subscription.id, { prorate: true })
  }
}

export async function syncSubscription(subscriptionId: string) {
  await applySubscription(await stripe().subscriptions.retrieve(subscriptionId))
}
