'use server'

import { revalidatePath } from 'next/cache'
import { isAdmin, requireSession } from '@/lib/auth'
import { getEntitlements } from '@/lib/billing/entitlements'
import { PLANS, TOP_UPS, type TopUpId } from '@/lib/billing/plans'
import { customerFor, priceFor, stripe, stripeConfigured, syncSubscription } from '@/lib/billing/stripe'
import type { PlanId } from '@/lib/supabase/types'

type UrlResult = { ok: true; url: string } | { ok: true; message: string } | { ok: false; error: string }

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
}

async function billingAdmin() {
  const session = await requireSession()
  if (!isAdmin(session.role)) {
    return { ok: false as const, error: 'Only the workspace owner or an admin can manage billing.' }
  }
  if (!stripeConfigured()) return { ok: false as const, error: 'Payments are not set up yet. Please contact support.' }
  return { ok: true as const, session }
}

/**
 * Subscribe to a plan, or switch plans. New subscribers go to Stripe Checkout;
 * existing subscribers are moved to the new plan straight away (Stripe
 * prorates the difference on the next invoice).
 */
export async function choosePlan(planId: PlanId): Promise<UrlResult> {
  const gate = await billingAdmin()
  if (!gate.ok) return gate
  const { session } = gate
  const plan = PLANS[planId]
  if (!plan || plan.price <= 0 || planId === 'internal') return { ok: false, error: 'Pick a paid plan.' }

  const entitlements = await getEntitlements(session.organization.id)
  const billing = entitlements.billing
  if (billing?.plan === 'internal') return { ok: false, error: 'This workspace is on the owner plan and is never billed.' }
  const price = await priceFor(planId)

  if (billing?.stripe_subscription_id) {
    const subscription = await stripe().subscriptions.retrieve(billing.stripe_subscription_id)
    const item = subscription.items.data[0]
    if (subscription.status !== 'canceled' && item) {
      await stripe().subscriptions.update(subscription.id, {
        items: [{ id: item.id, price }],
        proration_behavior: 'create_prorations',
        metadata: { org_id: session.organization.id, plan: planId },
      })
      await syncSubscription(subscription.id)
      revalidatePath('/billing')
      return { ok: true, message: `You're now on ${plan.name}.` }
    }
  }

  const customer = await customerFor(session.organization.id, {
    email: session.email,
    name: session.organization.name,
  })
  const checkout = await stripe().checkout.sessions.create({
    mode: 'subscription',
    customer,
    client_reference_id: session.organization.id,
    line_items: [{ price, quantity: 1 }],
    allow_promotion_codes: true,
    subscription_data: { metadata: { org_id: session.organization.id, plan: planId } },
    metadata: { org_id: session.organization.id, plan: planId },
    success_url: `${siteUrl()}/billing?welcome=${planId}`,
    cancel_url: `${siteUrl()}/billing`,
  })
  if (!checkout.url) return { ok: false, error: 'Stripe did not return a checkout page.' }
  return { ok: true, url: checkout.url }
}

/** One-time top-up for this billing period. Paid plans only. */
export async function buyTopUp(topUpId: TopUpId): Promise<UrlResult> {
  const gate = await billingAdmin()
  if (!gate.ok) return gate
  const { session } = gate
  const topUp = TOP_UPS[topUpId]
  if (!topUp) return { ok: false, error: 'Unknown top-up.' }

  const entitlements = await getEntitlements(session.organization.id)
  if (entitlements.plan.price <= 0 || entitlements.paused) {
    return { ok: false, error: 'Top-ups are for paid plans. Choose a plan first.' }
  }
  if (topUp.kind === 'call_seconds' && !entitlements.plan.features.calling) {
    return { ok: false, error: 'Call minutes come with the Growth and Pro plans.' }
  }

  const customer = await customerFor(session.organization.id, {
    email: session.email,
    name: session.organization.name,
  })
  const checkout = await stripe().checkout.sessions.create({
    mode: 'payment',
    customer,
    client_reference_id: session.organization.id,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: topUp.price * 100,
          product_data: { name: `AI Savvy Lead Scraper — ${topUp.name}` },
        },
      },
    ],
    metadata: { org_id: session.organization.id, top_up: topUp.id },
    success_url: `${siteUrl()}/billing?topup=${topUp.id}`,
    cancel_url: `${siteUrl()}/billing`,
  })
  if (!checkout.url) return { ok: false, error: 'Stripe did not return a checkout page.' }
  return { ok: true, url: checkout.url }
}

/** Stripe's own page to update the card, see invoices or cancel. */
export async function openBillingPortal(): Promise<UrlResult> {
  const gate = await billingAdmin()
  if (!gate.ok) return gate
  const { session } = gate
  const entitlements = await getEntitlements(session.organization.id)
  const customer = entitlements.billing?.stripe_customer_id
  if (!customer) return { ok: false, error: 'No billing account yet. Choose a plan first.' }

  const portal = await stripe().billingPortal.sessions.create({ customer, return_url: `${siteUrl()}/billing` })
  return { ok: true, url: portal.url }
}
