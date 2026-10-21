import type { PlanId } from '@/lib/supabase/types'

/**
 * Plans and limits. Safe to import in the browser (no secrets).
 *
 * Cost model behind these numbers (per unit, what WE pay):
 *   lead found (Maps + website email)        ≈ $0.006
 *   AI-worked lead (research + 3 emails)     ≈ $0.10
 *   call minute with live AI                 ≈ $0.08
 *   phone number                             ≈ $1.15 / month
 * At full use every paid plan keeps ~50% margin after Stripe fees.
 */

export type Feature = 'scraping' | 'ai' | 'autopilot' | 'calling'

export type Plan = {
  id: PlanId
  name: string
  /** USD per month. */
  price: number
  tagline: string
  limits: {
    /** Leads found by the scraper per billing period. */
    leadsFound: number
    /** Leads Claude researches and emails per period. */
    aiLeads: number
    /** Calling minutes per period (with the live AI coach). */
    callMinutes: number
    /** People in the workspace. */
    seats: number
    /** Leads stored in the CRM at once. */
    storedLeads: number
  }
  features: Record<Feature, boolean>
  /** Gets its own Twilio number when subscribed. */
  phoneNumber: boolean
  highlights: string[]
}

const UNLIMITED = 1_000_000_000

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: 'free',
    name: 'Free',
    price: 0,
    tagline: 'Organise the leads you already have',
    limits: { leadsFound: 0, aiLeads: 0, callMinutes: 0, seats: 1, storedLeads: 250 },
    features: { scraping: false, ai: false, autopilot: false, calling: false },
    phoneNumber: false,
    highlights: [
      'CRM, pipeline status and calendar',
      'Import leads from Excel / CSV',
      'Write and send emails from your own inbox',
      'Up to 250 leads',
    ],
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    price: 59,
    tagline: 'Find leads and let AI email them',
    limits: { leadsFound: 1500, aiLeads: 150, callMinutes: 0, seats: 1, storedLeads: UNLIMITED },
    features: { scraping: true, ai: true, autopilot: true, calling: false },
    phoneNumber: false,
    highlights: [
      '1,500 leads found per month (Google Maps + emails)',
      '150 leads researched and emailed by AI',
      'Email autopilot with follow-ups and reply tracking',
      '1 user',
    ],
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    price: 199,
    tagline: 'Add calling with a live AI coach',
    limits: { leadsFound: 5000, aiLeads: 400, callMinutes: 300, seats: 2, storedLeads: UNLIMITED },
    features: { scraping: true, ai: true, autopilot: true, calling: true },
    phoneNumber: true,
    highlights: [
      '5,000 leads found per month',
      '400 leads researched and emailed by AI',
      'Your own phone number + 300 call minutes with AI coach',
      '2 users',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price: 499,
    tagline: 'For teams prospecting every day',
    limits: { leadsFound: 10000, aiLeads: 1000, callMinutes: 800, seats: 3, storedLeads: UNLIMITED },
    features: { scraping: true, ai: true, autopilot: true, calling: true },
    phoneNumber: true,
    highlights: [
      '10,000 leads found per month',
      '1,000 leads researched and emailed by AI',
      'Your own phone number + 800 call minutes with AI coach',
      '3 users',
    ],
  },
  internal: {
    id: 'internal',
    name: 'Owner',
    price: 0,
    tagline: 'AI Savvy team workspace',
    limits: { leadsFound: UNLIMITED, aiLeads: UNLIMITED, callMinutes: UNLIMITED, seats: 50, storedLeads: UNLIMITED },
    features: { scraping: true, ai: true, autopilot: true, calling: true },
    phoneNumber: true,
    highlights: ['Unlimited, never billed'],
  },
}

export const PAID_PLANS = [PLANS.starter, PLANS.growth, PLANS.pro]

export type TopUpId = 'leads_1000' | 'ai_100' | 'minutes_100'

export const TOP_UPS: Record<TopUpId, { id: TopUpId; name: string; price: number; kind: UsageKind; amount: number }> = {
  leads_1000: { id: 'leads_1000', name: '+1,000 leads found', price: 15, kind: 'leads_found', amount: 1000 },
  ai_100: { id: 'ai_100', name: '+100 AI-worked leads', price: 25, kind: 'ai_leads', amount: 100 },
  minutes_100: { id: 'minutes_100', name: '+100 call minutes', price: 20, kind: 'call_seconds', amount: 100 * 60 },
}

export type UsageKind = 'leads_found' | 'ai_leads' | 'call_seconds'

/**
 * USD per month for each extra phone number an admin buys for a teammate,
 * billed as its own Stripe subscription next to the plan. Free on the AI
 * Savvy workspace (its numbers live in the company Twilio account).
 */
export const PHONE_NUMBER_PRICE = 10

export function planFor(id: string | null | undefined): Plan {
  return PLANS[(id as PlanId) in PLANS ? (id as PlanId) : 'free']
}

export function isUnlimited(value: number) {
  return value >= UNLIMITED
}

/** Cap in the same unit consume_usage() counts in. */
export function capFor(plan: Plan, kind: UsageKind) {
  if (kind === 'leads_found') return plan.limits.leadsFound
  if (kind === 'ai_leads') return plan.limits.aiLeads
  return isUnlimited(plan.limits.callMinutes) ? UNLIMITED : plan.limits.callMinutes * 60
}

export const FEATURE_LABEL: Record<Feature, string> = {
  scraping: 'Lead scraping',
  ai: 'AI research and emails',
  autopilot: 'Email autopilot',
  calling: 'Calling with the AI coach',
}

/** The cheapest plan that unlocks a feature. */
export function planForFeature(feature: Feature): Plan {
  return PAID_PLANS.find((plan) => plan.features[feature]) ?? PLANS.pro
}
