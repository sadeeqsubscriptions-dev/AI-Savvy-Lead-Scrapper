/**
 * Turns page content into contact records.
 *
 * Every crawler in `providers/` returns pages — markdown, HTML, or plain text —
 * not leads. This module is the shared step that pulls contact details out of
 * that content, so provider code stays thin and extraction rules are fixed in
 * one place.
 */

import type { ScrapedLeadInput } from './types'

// Deliberately conservative: a trailing-dot TLD of 2+ letters, no consecutive
// dots, and no leading/trailing punctuation in the local part.
const EMAIL_PATTERN = /[a-z0-9](?:[a-z0-9._%+-]{0,62}[a-z0-9])?@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z]{2,})+/gi

// North American and common international formats, requiring 7+ digits.
const PHONE_PATTERN = /(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)|\d{2,4})[\s.-]?\d{3,4}[\s.-]?\d{3,4}(?:[\s.-]?\d{2,4})?/g

/** Addresses that are never a human being worth contacting. */
const BLOCKED_LOCAL_PARTS = new Set([
  'noreply', 'no-reply', 'donotreply', 'do-not-reply', 'postmaster', 'mailer-daemon',
  'abuse', 'spam', 'unsubscribe', 'bounce', 'bounces', 'notifications', 'notification',
  'no_reply', 'root', 'webmaster', 'hostmaster', 'ssl-admin', 'dmarc', 'dmarc-reports',
])

/** Domains belonging to tooling, CDNs, and trackers rather than prospects. */
const BLOCKED_DOMAINS = [
  'example.com', 'example.org', 'example.net', 'test.com', 'domain.com', 'email.com',
  'yourdomain.com', 'company.com', 'sentry.io', 'sentry-cdn.com', 'wixpress.com',
  'squarespace.com', 'shopify.com', 'godaddy.com', 'cloudflare.com', 'googlemail.com',
  'google-analytics.com', 'doubleclick.net', 'facebook.net', 'gstatic.com', 'w3.org',
  'schema.org', 'jquery.com', 'bootstrapcdn.com', 'fontawesome.com', 'gravatar.com',
  'wordpress.com', 'wp.com', 'automattic.com', 'cdn.com', 'placeholder.com',
]

/** Extensions that show up when an image filename gets matched as an email. */
const ASSET_EXTENSIONS = /\.(png|jpe?g|gif|webp|svg|css|js|woff2?|ttf|eot|ico|mp4|pdf)$/i

const SOCIAL_HOSTS: Record<string, RegExp> = {
  linkedin: /(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/(?:in|company)\/[a-z0-9\-_%.]+/gi,
  twitter: /(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/[a-z0-9_]{2,15}/gi,
  facebook: /(?:https?:\/\/)?(?:www\.)?facebook\.com\/[a-z0-9.\-]{3,}/gi,
  instagram: /(?:https?:\/\/)?(?:www\.)?instagram\.com\/[a-z0-9_.]{2,30}/gi,
}

/** Roles that indicate a decision maker, used to pick the best contact. */
const ROLE_WORDS =
  'founders?|co-?founders?|owners?|proprietors?|ceo|chief executive(?: officer)?|coo|cto|cmo|cro|cfo|president|managing (?:director|partner)|partner|principal|vice president|vp|head of [a-z ]{3,30}|director of [a-z ]{3,30}|director|general manager|practice manager|office manager|marketing manager|sales manager'

const TITLE_PATTERN = new RegExp(String.raw`\b(${ROLE_WORDS})\b`, 'i')

/**
 * A capitalised name immediately before a role, as in "Dana Whitfield, Founder".
 * Matched case-insensitively so real-world capitalisation of the role does not
 * matter; the name half is then validated by `isPersonName`, because the `i`
 * flag also makes `[A-Z]` match lowercase.
 */
const NAME_NEAR_ROLE = new RegExp(
  String.raw`(?:(?:dr|mr|mrs|ms|prof)\.?\s+)?([a-z][a-z'’\-]{1,19}(?:\s+[a-z]\.)?\s+[a-z][a-z'’\-]{1,24})\s*(?:,|—|–|-|\||:|\n|\r)?\s*(?:is\s+(?:the\s+)?|the\s+)?(${ROLE_WORDS})\b`,
  'gi',
)

/** Capitalised words that turn up beside roles but are never someone's name. */
const NAME_STOPWORDS = new Set([
  'the', 'our', 'meet', 'about', 'contact', 'team', 'staff', 'company', 'group',
  'inc', 'llc', 'ltd', 'limited', 'corp', 'co', 'plc', 'gmbh', 'and', 'of',
  'read', 'more', 'view', 'profile', 'email', 'call', 'message', 'send',
  'home', 'services', 'why', 'choose', 'us', 'from', 'with', 'by',
])

/**
 * Rejects matches that are capitalised phrases rather than people. Requires two
 * to four words, each starting uppercase, with no stopwords.
 */
function isPersonName(value: string) {
  const words = value.trim().split(/\s+/)
  if (words.length < 2 || words.length > 4) return false

  return words.every((word) => {
    if (NAME_STOPWORDS.has(word.toLowerCase().replace(/\.$/, ''))) return false
    // Either a normal capitalised name or a middle initial.
    return /^[A-Z][a-z'’-]+$/.test(word) || /^[A-Z]\.?$/.test(word)
  })
}

export type ExtractedContact = {
  emails: string[]
  phones: string[]
  socials: Record<string, string>
  personName: string | null
  personTitle: string | null
}

function isUsefulEmail(email: string) {
  const lower = email.toLowerCase()

  if (ASSET_EXTENSIONS.test(lower)) return false
  if (lower.length > 100) return false

  const [local, domain] = lower.split('@')
  if (!local || !domain) return false
  if (BLOCKED_LOCAL_PARTS.has(local)) return false
  if (BLOCKED_DOMAINS.some((blocked) => domain === blocked || domain.endsWith(`.${blocked}`))) {
    return false
  }

  // Hashed or encoded addresses that sites use to hide real contacts.
  if (/^[0-9a-f]{16,}$/.test(local)) return false
  if (/^\d+$/.test(local)) return false

  return true
}

/** Prefers a named human address over a generic inbox. */
function rankEmail(email: string) {
  const local = email.split('@')[0]

  if (/^(info|contact|hello|hi|team|support|sales|admin|office|enquiries|inquiries|mail)$/.test(local)) {
    return 2
  }
  if (local.includes('.') || local.includes('_')) return 0 // likely first.last
  return 1
}

function normalizePhone(raw: string) {
  const trimmed = raw.trim()
  const digits = trimmed.replace(/\D/g, '')

  // Reject anything that is really a date, price, zip code, or tracking id.
  if (digits.length < 7 || digits.length > 15) return null
  if (/^(19|20)\d{2}$/.test(digits)) return null
  if (/^0+$/.test(digits)) return null
  if (new Set(digits).size <= 2) return null

  return trimmed.replace(/\s{2,}/g, ' ')
}

/** Strips markup, scripts, and styles so text patterns do not match code. */
export function htmlToText(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;|&rsquo;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Pulls every contact signal out of one page. `content` may be HTML, markdown,
 * or plain text — HTML is detected and stripped first.
 */
export function extractContact(content: string): ExtractedContact {
  const looksLikeHtml = /<\/?(html|body|div|p|a|span|table)\b/i.test(content)
  const text = looksLikeHtml ? htmlToText(content) : content

  // mailto: links survive markdown conversion and are the most reliable source.
  const mailtos = [...content.matchAll(/mailto:([^"'\s>)?&]+)/gi)].map((match) => match[1])
  const inline = text.match(EMAIL_PATTERN) ?? []

  const emails = [...new Set([...mailtos, ...inline].map((email) => email.toLowerCase().trim()))]
    .filter(isUsefulEmail)
    .sort((a, b) => rankEmail(a) - rankEmail(b))
    .slice(0, 5)

  const telLinks = [...content.matchAll(/tel:([+\d\s().-]{7,})/gi)].map((match) => match[1])
  const phoneCandidates = [...telLinks, ...(text.match(PHONE_PATTERN) ?? [])]

  const phones = [
    ...new Set(
      phoneCandidates
        .map(normalizePhone)
        .filter((phone): phone is string => phone !== null)
        // Compare on digits so formatting variants collapse together.
        .map((phone) => phone.trim()),
    ),
  ]
  const seenDigits = new Set<string>()
  const uniquePhones: string[] = []
  for (const phone of phones) {
    const digits = phone.replace(/\D/g, '').slice(-10)
    if (seenDigits.has(digits)) continue
    seenDigits.add(digits)
    uniquePhones.push(phone)
    if (uniquePhones.length >= 3) break
  }

  const socials: Record<string, string> = {}
  for (const [network, pattern] of Object.entries(SOCIAL_HOSTS)) {
    const match = content.match(pattern)
    if (match && match[0]) {
      const url = match[0].startsWith('http') ? match[0] : `https://${match[0]}`
      // Skip share/intent links, which point at the site's own content.
      if (!/\/(share|sharer|intent|home|login|signup)\b/i.test(url)) socials[network] = url
    }
  }

  let personName: string | null = null
  let personTitle: string | null = null

  NAME_NEAR_ROLE.lastIndex = 0
  for (let match = NAME_NEAR_ROLE.exec(text); match !== null; match = NAME_NEAR_ROLE.exec(text)) {
    const candidate = match[1].replace(/\s+/g, ' ').trim()
    if (!isPersonName(candidate)) continue

    personName = candidate
    personTitle = match[2].replace(/\s+/g, ' ').trim()
    break
  }
  NAME_NEAR_ROLE.lastIndex = 0

  if (!personTitle) {
    const title = text.match(TITLE_PATTERN)
    if (title) personTitle = title[0].trim()
  }

  return { emails, phones: uniquePhones, socials, personName, personTitle }
}

/** Words that describe the page rather than the business behind it. */
const PAGE_LABEL_PATTERN =
  /^(home|homepage|welcome|official site|official website|contact(?: us)?|about(?: us)?|our team|team|staff|people|leadership|services|pricing|blog|news|faqs?|impressum|kontakt)$/i

/**
 * Cleans up a page title into something usable as a company name. Titles are
 * usually "Page | Company" or "Company | Tagline", so each segment is tried in
 * turn and page labels like "Contact" are skipped.
 */
export function companyFromTitle(title: string | null | undefined, url?: string) {
  if (title && title.trim().length > 0) {
    const segments = title
      .split(/\s*[|–—·»]\s*|\s+[-:]\s+/)
      .map((segment) => segment.replace(/\s{2,}/g, ' ').trim())
      .filter((segment) => segment.length > 0)

    for (const segment of segments) {
      if (PAGE_LABEL_PATTERN.test(segment)) continue
      if (segment.length < 2 || segment.length > 120) continue
      return segment
    }
  }

  if (url) return companyFromDomain(url)
  return null
}

/** Falls back to a title-cased version of the registrable domain. */
export function companyFromDomain(url: string) {
  try {
    const host = new URL(url.startsWith('http') ? url : `https://${url}`).hostname
    const bare = host.replace(/^www\./, '').split('.')[0]
    if (!bare || bare.length < 2) return null

    return bare
      .replace(/[-_]+/g, ' ')
      .replace(/\b[a-z]/g, (character) => character.toUpperCase())
  } catch {
    return null
  }
}

/**
 * Builds one lead per page. Returns null when a page yields no way to reach
 * anyone, so the runner never stores an unusable record.
 */
export function contactToLead(
  page: { url: string; title?: string | null; content: string },
  context: { industry?: string | null; city?: string | null; requireContact?: boolean } = {},
): ScrapedLeadInput | null {
  const contact = extractContact(page.content)
  const requireContact = context.requireContact ?? true

  if (requireContact && contact.emails.length === 0 && contact.phones.length === 0) return null

  const company = companyFromTitle(page.title, page.url)
  let website: string | null = null
  try {
    website = new URL(page.url).origin
  } catch {
    website = page.url
  }

  return {
    full_name: contact.personName,
    company,
    title: contact.personTitle,
    email: contact.emails[0] ?? null,
    phone: contact.phones[0] ?? null,
    website,
    city: context.city ?? null,
    industry: context.industry ?? null,
    source_url: page.url,
    raw: {
      page_title: page.title ?? null,
      all_emails: contact.emails,
      all_phones: contact.phones,
      socials: contact.socials,
    },
  }
}

/**
 * Combines two leads found on the same domain.
 *
 * A business often spreads its details across pages — the phone on /contact, the
 * owner's name on /about — so crawl-based providers merge per domain instead of
 * keeping whichever page they hit last.
 */
export function mergeLeads(base: ScrapedLeadInput, incoming: ScrapedLeadInput): ScrapedLeadInput {
  const baseEmail = base.email ?? null
  const incomingEmail = incoming.email ?? null

  // A named address beats a generic inbox even if the generic one came first.
  const email =
    baseEmail && incomingEmail
      ? rankEmail(incomingEmail) < rankEmail(baseEmail)
        ? incomingEmail
        : baseEmail
      : (baseEmail ?? incomingEmail)

  const baseRaw = (base.raw ?? {}) as Record<string, unknown>
  const incomingRaw = (incoming.raw ?? {}) as Record<string, unknown>

  const mergeList = (key: string) => {
    const merged = [
      ...(Array.isArray(baseRaw[key]) ? (baseRaw[key] as string[]) : []),
      ...(Array.isArray(incomingRaw[key]) ? (incomingRaw[key] as string[]) : []),
    ]
    return [...new Set(merged)]
  }

  return {
    ...base,
    full_name: base.full_name ?? incoming.full_name ?? null,
    company: base.company ?? incoming.company ?? null,
    title: base.title ?? incoming.title ?? null,
    email,
    phone: base.phone ?? incoming.phone ?? null,
    website: base.website ?? incoming.website ?? null,
    address: base.address ?? incoming.address ?? null,
    city: base.city ?? incoming.city ?? null,
    country: base.country ?? incoming.country ?? null,
    industry: base.industry ?? incoming.industry ?? null,
    // Point at whichever page actually supplied the winning email.
    source_url:
      email && email === incomingEmail && email !== baseEmail
        ? (incoming.source_url ?? base.source_url ?? null)
        : (base.source_url ?? incoming.source_url ?? null),
    raw: {
      ...incomingRaw,
      ...baseRaw,
      all_emails: mergeList('all_emails'),
      all_phones: mergeList('all_phones'),
      socials: {
        ...((incomingRaw.socials as Record<string, string>) ?? {}),
        ...((baseRaw.socials as Record<string, string>) ?? {}),
      },
    },
  }
}

/** Pages most likely to carry contact details, in the order worth trying. */
export const CONTACT_PATH_HINTS = [
  'contact', 'contact-us', 'contactus', 'about', 'about-us', 'aboutus',
  'team', 'our-team', 'staff', 'people', 'leadership', 'impressum',
]

export function looksLikeContactPage(url: string) {
  const path = url.toLowerCase()
  return CONTACT_PATH_HINTS.some((hint) => path.includes(hint))
}
