import type { Metadata } from 'next'
import { isAdmin, requireSession } from '@/lib/auth'
import { getEntitlements, seatsLeft } from '@/lib/billing/entitlements'
import { stripeConfigured } from '@/lib/billing/stripe'
import { callerIdFor } from '@/lib/voice/numbers'
import { BillingWorkspace } from '@/components/billing/billing-workspace'

export const metadata: Metadata = { title: 'Plan & billing' }

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string; topup?: string }>
}) {
  const session = await requireSession()
  const orgId = session.organization.id
  const [params, entitlements, seats, phoneNumber] = await Promise.all([
    searchParams,
    getEntitlements(orgId),
    seatsLeft(orgId),
    callerIdFor(orgId),
  ])
  const billing = entitlements.billing

  return (
    <BillingWorkspace
      currentPlan={billing?.plan ?? entitlements.plan.id}
      status={billing?.status ?? 'active'}
      paused={entitlements.paused}
      periodEnd={billing?.period_end ?? null}
      hasCustomer={Boolean(billing?.stripe_customer_id)}
      phoneNumber={phoneNumber}
      usage={entitlements.usage}
      bonus={entitlements.bonus}
      seats={{ used: seats.seats - seats.left, total: seats.seats }}
      canManage={isAdmin(session.role)}
      paymentsReady={stripeConfigured()}
      notice={params.welcome ? { kind: 'plan', id: params.welcome } : params.topup ? { kind: 'topup', id: params.topup } : null}
    />
  )
}
