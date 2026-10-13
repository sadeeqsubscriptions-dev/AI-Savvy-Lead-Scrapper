import Link from 'next/link'
import { Lock, SlidersHorizontal } from 'lucide-react'
import { blockedReason, getEntitlements } from '@/lib/billing/entitlements'
import { FEATURE_LABEL, planForFeature, type Feature } from '@/lib/billing/plans'
import { mailboxFor } from '@/lib/outreach/mailbox'
import { sellerFor } from '@/lib/outreach/seller'

/**
 * Banner at the top of a page whose main feature isn't on the workspace's
 * plan, or that needs the sales setup first. Renders nothing when all is set.
 */
export async function PlanNotice({
  orgId,
  feature,
  needsSetup = false,
}: {
  orgId: string
  feature: Feature
  needsSetup?: boolean
}) {
  const entitlements = await getEntitlements(orgId)
  const blocked = blockedReason(entitlements, feature)

  if (blocked) {
    const plan = planForFeature(feature)
    return (
      <div className="mb-6 flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Lock className="mt-0.5 size-4 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-medium">{FEATURE_LABEL[feature]} is a premium feature</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{blocked}</p>
          </div>
        </div>
        <Link
          href="/billing"
          className="shrink-0 rounded-lg bg-gradient-brand px-4 py-2 text-center text-sm font-medium text-white shadow-lg shadow-primary/25"
        >
          {entitlements.paused ? 'Fix payment' : `Unlock with ${plan.name} · $${plan.price}/mo`}
        </Link>
      </div>
    )
  }

  if (!needsSetup) return null
  const [seller, mailbox] = await Promise.all([sellerFor(orgId), mailboxFor(orgId)])
  if (seller && mailbox) return null

  const missing = [!seller ? 'what you sell' : null, !mailbox ? 'your sending inbox' : null].filter(Boolean).join(' and ')
  return (
    <div className="mb-6 flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <SlidersHorizontal className="mt-0.5 size-4 shrink-0 text-warning" />
        <div>
          <p className="text-sm font-medium">Finish your sales setup</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Add {missing} so the AI can write and send in your name.</p>
        </div>
      </div>
      <Link href="/setup" className="shrink-0 rounded-lg border border-border bg-card px-4 py-2 text-center text-sm font-medium">
        Open sales setup
      </Link>
    </div>
  )
}
