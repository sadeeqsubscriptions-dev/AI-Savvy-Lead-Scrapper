import { createAdminClient, hasAdminCredentials } from '@/lib/supabase/admin'
import type { OrgBilling, OrgUsage } from '@/lib/supabase/types'
import { FEATURE_LABEL, PLANS, capFor, isUnlimited, planFor, planForFeature, type Feature, type Plan, type UsageKind } from './plans'

/**
 * What a workspace may do right now, and how much it has used. Reads and
 * meters through the service role: billing rows are read-only for users, so
 * nobody can grant themselves a plan or reset their usage.
 */

export type Entitlements = {
  plan: Plan
  billing: OrgBilling | null
  /** Paid plan but payment failing / canceled: premium features are paused. */
  paused: boolean
  period: string
  usage: { leadsFound: number; aiLeads: number; callSeconds: number }
  bonus: { leadsFound: number; aiLeads: number; callSeconds: number }
  remaining: { leadsFound: number; aiLeads: number; callMinutes: number }
}

function monthStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

/** The period usage is counted in: the Stripe billing period, else the calendar month. */
function periodOf(billing: OrgBilling | null) {
  if (billing && billing.plan !== 'free' && billing.plan !== 'internal' && billing.period_start) {
    return new Date(billing.period_start).toISOString()
  }
  return monthStart()
}

export async function getEntitlements(orgId: string): Promise<Entitlements> {
  const admin = createAdminClient()
  const { data: found, error } = await admin.from('org_billing').select('*').eq('org_id', orgId).maybeSingle()
  // Fail closed: if billing can't be read, the workspace gets the Free plan
  // for this request, never someone else's allowance.
  if (error) console.error('[entitlements] could not read billing', orgId, error.message)
  const billing = error ? null : found

  const paused = Boolean(billing && billing.plan !== 'internal' && billing.plan !== 'free' && billing.status !== 'active')
  const plan = paused ? PLANS.free : planFor(billing?.plan)
  const period = periodOf(billing)

  const { data: row } = await admin
    .from('org_usage')
    .select('*')
    .eq('org_id', orgId)
    .eq('period_start', period)
    .maybeSingle()
  const usage = row as OrgUsage | null

  const used = {
    leadsFound: usage?.leads_found ?? 0,
    aiLeads: usage?.ai_leads ?? 0,
    callSeconds: usage?.call_seconds ?? 0,
  }
  const bonus = {
    leadsFound: usage?.bonus_leads ?? 0,
    aiLeads: usage?.bonus_ai_leads ?? 0,
    callSeconds: usage?.bonus_call_seconds ?? 0,
  }
  const left = (cap: number, extra: number, spent: number) =>
    isUnlimited(cap) ? cap : Math.max(0, cap + extra - spent)

  return {
    plan,
    billing: (billing as OrgBilling | null) ?? null,
    paused,
    period,
    usage: used,
    bonus,
    remaining: {
      leadsFound: left(plan.limits.leadsFound, bonus.leadsFound, used.leadsFound),
      aiLeads: left(plan.limits.aiLeads, bonus.aiLeads, used.aiLeads),
      callMinutes: isUnlimited(plan.limits.callMinutes)
        ? plan.limits.callMinutes
        : Math.max(0, Math.floor((plan.limits.callMinutes * 60 + bonus.callSeconds - used.callSeconds) / 60)),
    },
  }
}

/** Null when allowed; otherwise a message telling the user what to buy. */
export function blockedReason(entitlements: Entitlements, feature: Feature): string | null {
  if (entitlements.plan.features[feature]) return null
  if (entitlements.paused) {
    return `${FEATURE_LABEL[feature]} is paused because the last payment didn't go through. Update your card on the Billing page.`
  }
  const needed = planForFeature(feature)
  return `${FEATURE_LABEL[feature]} is on the ${needed.name} plan ($${needed.price}/month) and up. Upgrade on the Billing page.`
}

export async function requireFeature(orgId: string, feature: Feature) {
  const entitlements = await getEntitlements(orgId)
  const reason = blockedReason(entitlements, feature)
  return reason ? ({ ok: false, error: reason } as const) : ({ ok: true, entitlements } as const)
}

const LIMIT_MESSAGE: Record<UsageKind, string> = {
  leads_found: 'You have used all the leads in your plan this month.',
  ai_leads: 'You have used all the AI-worked leads in your plan this month.',
  call_seconds: 'You have used all the call minutes in your plan this month.',
}

/**
 * Spends `amount` of an allowance. Returns how much was granted (all of it,
 * part of it when `partial`, or 0 when the plan is used up).
 */
export async function consumeUsage(
  orgId: string,
  kind: UsageKind,
  amount: number,
  { partial = false }: { partial?: boolean } = {},
) {
  if (amount <= 0) return 0
  if (!hasAdminCredentials()) return 0 // without the service key nothing can be metered, so nothing is granted
  const entitlements = await getEntitlements(orgId)
  const cap = capFor(entitlements.plan, kind)
  if (isUnlimited(cap)) return amount

  const { data, error } = await createAdminClient().rpc('consume_usage', {
    target_org: orgId,
    period: entitlements.period,
    kind,
    amount: Math.ceil(amount),
    cap,
    partial,
  })
  if (error) throw new Error(`Usage check failed: ${error.message}`)
  return typeof data === 'number' ? data : 0
}

export function limitMessage(kind: UsageKind) {
  return `${LIMIT_MESSAGE[kind]} Buy a top-up or upgrade on the Billing page.`
}

export async function addBonus(orgId: string, kind: UsageKind, amount: number) {
  const entitlements = await getEntitlements(orgId)
  await createAdminClient().rpc('add_usage_bonus', {
    target_org: orgId,
    period: entitlements.period,
    kind,
    amount,
  })
}

/** How many more leads the workspace may store (Free holds 250). */
export async function storedLeadsRoom(orgId: string) {
  const entitlements = await getEntitlements(orgId)
  const cap = entitlements.plan.limits.storedLeads
  if (isUnlimited(cap)) return { room: cap, cap, plan: entitlements.plan }
  const { count } = await createAdminClient()
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
  return { room: Math.max(0, cap - (count ?? 0)), cap, plan: entitlements.plan }
}

export function storedLeadsMessage(cap: number) {
  return `Your plan holds up to ${cap.toLocaleString('en-US')} leads. Upgrade on the Billing page to add more.`
}

/** Seats left: members plus pending invites, against the plan's users. */
export async function seatsLeft(orgId: string) {
  const entitlements = await getEntitlements(orgId)
  const admin = createAdminClient()
  const [{ count: members }, { count: invites }] = await Promise.all([
    admin.from('organization_members').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
    admin.from('invitations').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'pending'),
  ])
  return {
    left: Math.max(0, entitlements.plan.limits.seats - (members ?? 0) - (invites ?? 0)),
    seats: entitlements.plan.limits.seats,
    plan: entitlements.plan,
  }
}
