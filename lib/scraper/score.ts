import type { ScrapedLeadInput } from './types'

const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'aol.com',
  'icloud.com',
  'proton.me',
])

const SENIOR_TITLE = /\b(founder|owner|ceo|coo|cro|cto|cmo|president|partner|principal|vp|vice president|head of|director|chief)\b/i

/**
 * Heuristic fit score used when a provider does not supply one. Weighted toward
 * reachability (a work email and phone) and seniority of the contact.
 */
export function scoreLead(lead: ScrapedLeadInput): number {
  let score = 35

  const email = lead.email?.trim().toLowerCase()
  if (email && email.includes('@')) {
    const domain = email.split('@')[1] ?? ''
    score += FREE_EMAIL_DOMAINS.has(domain) ? 8 : 22
  }

  if (lead.phone && lead.phone.replace(/\D/g, '').length >= 7) score += 12
  if (lead.website) score += 8
  if (lead.company) score += 6
  if (lead.full_name) score += 5
  if (lead.title) score += SENIOR_TITLE.test(lead.title) ? 12 : 4
  if (lead.address || lead.city) score += 4

  const rating = Number((lead.raw as { rating?: unknown } | undefined)?.rating)
  if (Number.isFinite(rating) && rating > 0) score += Math.round((rating / 5) * 6)

  return Math.max(0, Math.min(100, score))
}

/** Normalizes a provider record into the shape `scraped_records` expects. */
export function normalizeLead(lead: ScrapedLeadInput) {
  const trim = (value?: string | null) => {
    const text = value?.trim()
    return text && text.length > 0 ? text.slice(0, 500) : null
  }

  const email = trim(lead.email)?.toLowerCase() ?? null

  return {
    full_name: trim(lead.full_name),
    company: trim(lead.company),
    title: trim(lead.title),
    email: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
    phone: trim(lead.phone),
    website: trim(lead.website),
    address: trim(lead.address),
    city: trim(lead.city),
    country: trim(lead.country),
    industry: trim(lead.industry),
    source_url: trim(lead.source_url),
    score:
      typeof lead.score === 'number' && Number.isFinite(lead.score)
        ? Math.max(0, Math.min(100, Math.round(lead.score)))
        : scoreLead(lead),
    raw: (lead.raw ?? {}) as Record<string, unknown>,
  }
}

/** Stable identity for de-duplication within a single run. */
export function dedupeKey(lead: { email: string | null; company: string | null; full_name: string | null; phone: string | null }) {
  if (lead.email) return `email:${lead.email}`
  if (lead.phone) return `phone:${lead.phone.replace(/\D/g, '')}`
  return `name:${(lead.full_name ?? '').toLowerCase()}|${(lead.company ?? '').toLowerCase()}`
}
