import type Stripe from 'stripe'
import { NextResponse, type NextRequest } from 'next/server'
import { addBonus } from '@/lib/billing/entitlements'
import { TOP_UPS, type TopUpId } from '@/lib/billing/plans'
import { applySubscription, stripe, syncSubscription } from '@/lib/billing/stripe'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
// Buying a phone number happens here and can take a few seconds.
export const maxDuration = 60

/**
 * Stripe → workspace billing. Verified with STRIPE_WEBHOOK_SECRET; each event
 * is handled once (billing_events), because Stripe retries deliveries.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim()
  const signature = request.headers.get('stripe-signature')
  if (!secret || !signature) return NextResponse.json({ error: 'Not configured' }, { status: 400 })

  let event: Stripe.Event
  try {
    event = stripe().webhooks.constructEvent(await request.text(), signature, secret)
  } catch {
    return NextResponse.json({ error: 'Bad signature' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error: seen } = await admin.from('billing_events').insert({ id: event.id, type: event.type })
  if (seen) return NextResponse.json({ received: true, duplicate: true })

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        const orgId = session.metadata?.org_id ?? session.client_reference_id
        if (session.mode === 'subscription' && typeof session.subscription === 'string') {
          await syncSubscription(session.subscription)
        } else if (session.mode === 'payment' && orgId && session.payment_status === 'paid') {
          const topUp = TOP_UPS[session.metadata?.top_up as TopUpId]
          if (topUp) await addBonus(orgId, topUp.kind, topUp.amount)
        }
        break
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await applySubscription(event.data.object)
        break
      case 'invoice.paid':
      case 'invoice.payment_failed': {
        // A renewal starts a new usage period; a failed payment pauses premium features.
        const subscription = event.data.object.parent?.subscription_details?.subscription
        if (subscription) await syncSubscription(typeof subscription === 'string' ? subscription : subscription.id)
        break
      }
    }
  } catch (error) {
    // Let Stripe retry: forget this event so the retry is processed.
    await admin.from('billing_events').delete().eq('id', event.id)
    console.error('[stripe-webhook]', event.type, error)
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
