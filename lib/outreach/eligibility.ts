import type { Json } from '@/lib/supabase/types'

/**
 * Cheap, deterministic screening before any Claude credits are spent. Scrapers
 * pick up government offices, article titles and department inboxes that no
 * one reads for sales email; those go to "Not a fit" instead of "Ready".
 * Claude makes the final call on anything that passes (see compose.ts).
 */

const PUBLIC_SECTOR = [
  /\.gov$/,
  /\.gov\.[a-z]{2}$/,
  /\.mil$/,
  /\.edu$/,
  /\.edu\.[a-z]{2}$/,
  /\.k12\.[a-z]{2}\.us$/,
  /\.state\.[a-z]{2}\.us$/,
  /\.(co|city|county|ci)\.[a-z-]+\.[a-z]{2}\.us$/,
]

const DEAD_INBOXES =
  /^(no-?reply|do-?not-?reply|donotreply|mailer-daemon|postmaster|abuse|privacy|legal|compliance|appeals|complaints|grievances?|careers|jobs|hr|recruiting|press|media|webmaster|security|dpo|gdpr|unsubscribe)([._-]|$)/

const PLACEHOLDER_DOMAINS = /^(example\.(com|org|net)|domain\.com|email\.com|yourdomain\.com|sentry\.io|wixpress\.com|sentry-next\.wixpress\.com)$/

// Search-result and article titles scraped in place of a business name.
const TITLE_LIKE = /(how to|phone number|near me|\bbest\b.*\bin\b|\btop \d+|\bguide\b|wikipedia|\||…|\.\.\.|\?|^\d+\s)/i

export type EligibilityLead = {
  full_name: string
  company: string | null
  website: string | null
  industry: string | null
  email: string | null
  metadata: Json
}

/** Why this lead should not get a cold email, or null when it's fine to send. */
export function ineligibleReason(lead: EligibilityLead): string | null {
  const email = (lead.email ?? '').trim().toLowerCase()
  if (!email.includes('@')) return 'No email address.'

  const [local, domain] = email.split('@')
  if (PUBLIC_SECTOR.some((pattern) => pattern.test(domain))) {
    return 'Government or school address — not a business that buys AI services.'
  }
  if (PLACEHOLDER_DOMAINS.test(domain)) return 'Placeholder address picked up by the scraper.'
  if (DEAD_INBOXES.test(local)) return `"${local}@" is a department inbox nobody reads for sales email.`

  const name = lead.company || lead.full_name
  if (name.length > 70 || TITLE_LIKE.test(name)) {
    return 'Name looks like a web page title, not a business.'
  }
  if (!lead.company && !lead.website && !lead.industry) {
    return 'Not enough information to write a personal email.'
  }

  return skipNote(lead.metadata)
}

/** Claude's own "not a fit" verdict, saved on the lead so we don't pay to ask twice. */
export function skipNote(metadata: Json): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const note = (metadata as Record<string, Json | undefined>).outreach_skip
  if (!note || typeof note !== 'object' || Array.isArray(note)) return null
  const reason = (note as Record<string, Json | undefined>).reason
  return typeof reason === 'string' ? `Claude: ${reason}` : null
}
