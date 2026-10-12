import type { Json } from '@/lib/supabase/types'

/**
 * Cheap, deterministic screening before any Claude credits are spent. Scrapers
 * pick up government offices, article titles and department inboxes that no
 * one reads for sales email; those go to 'Not a fit' instead of 'Ready'.
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

// Names that mean a public body rather than a business that buys services.
const PUBLIC_SECTOR_NAME =
  /\b(county|city of|town of|township|village of|borough of|department of|dept\.? of|state of|ministry|municipal|government|federal|commonwealth|public schools?|school district|school board|board of education|university|college|police|sheriff|fire (department|rescue)|courthouse|clerk of court|city hall|chamber of commerce|transit authority|port authority|housing authority|medicaid|medicare|social security)\b/i

function hostOf(value: string | null | undefined) {
  if (!value) return null
  try {
    return new URL(value.includes('://') ? value : `https://${value}`).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
}

/**
 * Government, military and school organisations, judged from the email
 * domain, website domain and name. Used by the scraper (to drop them before
 * review) and by outreach (to keep them out of 'Ready').
 */
export function publicSectorReason(lead: {
  email?: string | null
  website?: string | null
  company?: string | null
  full_name?: string | null
}): string | null {
  const domains = [lead.email?.split('@')[1]?.trim().toLowerCase(), hostOf(lead.website)].filter(
    (domain): domain is string => Boolean(domain),
  )
  if (domains.some((domain) => PUBLIC_SECTOR.some((pattern) => pattern.test(domain)))) {
    return 'Government or school address — not a business that buys AI services.'
  }
  const name = [lead.company, lead.full_name].filter(Boolean).join(' ')
  if (PUBLIC_SECTOR_NAME.test(name)) return 'Looks like a government body or school, not a business.'
  return null
}

const DEAD_INBOXES =
  /^(no-?reply|do-?not-?reply|donotreply|mailer-daemon|postmaster|abuse|privacy|legal|compliance|appeals|complaints|grievances?|careers|jobs|hr|recruiting|press|media|webmaster|security|dpo|gdpr|unsubscribe|dmca|dmcanotice|copyright|notices?|billing|invoices?|accounting|payroll|returns)([._-]|$)/

const PLACEHOLDER_DOMAINS = /^(example\.(com|org|net)|domain\.com|email\.com|yourdomain\.com|sentry\.io|wixpress\.com|sentry-next\.wixpress\.com)$/

// Search-result and article titles scraped in place of a business name.
const TITLE_LIKE = /(how to|phone number|near me|\bbest\b.*\bin\b|\btop \d+|\bguide\b|wikipedia|\||…|\.\.\.|\?|^\d+\s)/i

// Bare category words or page headings scraped instead of a business name.
const GENERIC_NAME =
  /^(agents?|realtors?|home|homepage|contact( us)?|about( us)?|our team|services|reading your emails|transportation|real estate( in [a-z ]+)?|[a-z ]+ in (florida|miami|[a-z]+, [a-z]{2}))$/i

// Scrapers sometimes capture an obfuscated address ("li*****@****.org").
const VALID_EMAIL = /^[a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,}$/

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
  if (!VALID_EMAIL.test(email)) return 'The address is masked or malformed, so it cannot be delivered.'

  const [local, domain] = email.split('@')
  const publicSector = publicSectorReason(lead)
  if (publicSector) return publicSector
  if (PLACEHOLDER_DOMAINS.test(domain)) return 'Placeholder address picked up by the scraper.'
  if (DEAD_INBOXES.test(local)) return `'${local}@' is a department inbox nobody reads for sales email.`

  const name = lead.company || lead.full_name
  if (name.length > 70 || TITLE_LIKE.test(name) || GENERIC_NAME.test(name.trim())) {
    return 'Name looks like a web page title, not a business.'
  }
  if (!lead.company && !lead.website && !lead.industry) {
    return 'Not enough information to write a personal email.'
  }

  return skipNote(lead.metadata)
}

/** Claude's own 'not a fit' verdict, saved on the lead so we don't pay to ask twice. */
export function skipNote(metadata: Json): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const note = (metadata as Record<string, Json | undefined>).outreach_skip
  if (!note || typeof note !== 'object' || Array.isArray(note)) return null
  const reason = (note as Record<string, Json | undefined>).reason
  return typeof reason === 'string' ? `Claude: ${reason}` : null
}

/** Sample leads from the demo dataset: never emailed by the autopilot. */
export function isDemoLead(metadata: Json): boolean {
  return Boolean(
    metadata && typeof metadata === 'object' && !Array.isArray(metadata) && (metadata as Record<string, Json | undefined>).demo,
  )
}
