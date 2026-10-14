/**
 * Smart search — the default source.
 *
 * 1. Finds real local businesses on Google Maps (Apify, else Places API,
 *    else SerpApi), which gives name, phone, website, address and rating.
 * 2. Visits each business's own website (home + contact page) to find an
 *    email address and, when listed, the owner's name.
 *
 * Maps alone has no emails; web search alone finds articles and directories.
 * Together they give real businesses with a way to reach them.
 */

import { extractContact } from '../extract'
import { apifyProvider, apifyReady } from './apify'
import { googleMapsProvider } from './google-maps'
import { serpapiProvider } from './serpapi'
import { ScrapeError, type ScrapeContext, type ScrapeProvider, type ScrapedLeadInput } from '../types'

const SITE_TIMEOUT_MS = 9000
const PARALLEL_SITES = 6
const CONTACT_PATHS = ['/contact', '/contact-us', '/about', '/about-us']

export function smartSearchReady() {
  return Boolean(apifyReady() || process.env.GOOGLE_MAPS_API_KEY || process.env.SERPAPI_KEY)
}

async function fetchPage(url: string, signal: AbortSignal) {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(SITE_TIMEOUT_MS)]),
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AISavvyLeadBot/1.0; +https://aisavvy.us)',
        Accept: 'text/html,application/xhtml+xml',
      },
    })
    if (!response.ok) return null
    const type = response.headers.get('content-type') ?? ''
    if (!type.includes('html')) return null
    return (await response.text()).slice(0, 600_000)
  } catch {
    return null
  }
}

/** Firecrawl renders JavaScript-heavy sites the plain fetch can't read. Optional. */
async function fetchRendered(url: string, signal: AbortSignal) {
  const apiKey = process.env.FIRECRAWL_API_KEY
  if (!apiKey) return null
  const base = (process.env.FIRECRAWL_API_URL || 'https://api.firecrawl.dev').replace(/\/+$/, '')
  try {
    const response = await fetch(`${base}/v2/scrape`, {
      method: 'POST',
      signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ url, formats: ['markdown', 'rawHtml'], onlyMainContent: false }),
    })
    if (!response.ok) return null
    const payload = (await response.json()) as { data?: { markdown?: string; rawHtml?: string } }
    return [payload.data?.markdown, payload.data?.rawHtml].filter(Boolean).join('\n\n') || null
  } catch {
    return null
  }
}

/** Finds an email (and maybe a named contact) on the business's own site. */
async function enrich(lead: ScrapedLeadInput, signal: AbortSignal): Promise<ScrapedLeadInput> {
  if (lead.email || !lead.website) return lead

  let origin: string
  try {
    origin = new URL(lead.website).origin
  } catch {
    return lead
  }

  const visited: string[] = []
  let found = { email: null as string | null, name: null as string | null, title: null as string | null }

  const read = (content: string | null, url: string) => {
    if (!content) return
    visited.push(url)
    const contact = extractContact(content)
    found = {
      email: found.email ?? contact.emails[0] ?? null,
      name: found.name ?? contact.personName,
      title: found.title ?? contact.personTitle,
    }
  }

  read(await fetchPage(origin, signal), origin)
  for (const path of CONTACT_PATHS) {
    if (found.email || signal.aborted) break
    const url = `${origin}${path}`
    read(await fetchPage(url, signal), url)
  }
  // Last try for sites that build their page with JavaScript.
  if (!found.email && !signal.aborted) {
    read(await fetchRendered(`${origin}/contact`, signal), `${origin}/contact`)
  }

  return {
    ...lead,
    email: found.email,
    full_name: lead.full_name ?? found.name,
    title: lead.title ?? found.title,
    raw: { ...(lead.raw ?? {}), provider: 'smart', pages_checked: visited },
  }
}

export async function findEmailsOnWebsites(batch: ScrapedLeadInput[], signal: AbortSignal) {
  const results: ScrapedLeadInput[] = new Array(batch.length)
  let next = 0
  const worker = async () => {
    while (next < batch.length && !signal.aborted) {
      const index = next++
      results[index] = await enrich(batch[index], signal)
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL_SITES, batch.length) }, worker))
  return results.filter(Boolean)
}

export const smartProvider: ScrapeProvider = {
  id: 'smart',
  label: 'Smart search (recommended)',
  description:
    'Finds real local businesses on Google Maps, then visits each website to find an email and the owner’s name. Just enter what and where.',

  async run(context) {
    if (!smartSearchReady()) {
      throw new ScrapeError('Smart search needs APIFY_API_TOKEN, GOOGLE_MAPS_API_KEY or SERPAPI_KEY.')
    }

    let enriched = 0
    // Same job, but every batch of businesses is enriched before it is saved.
    const enrichingContext: ScrapeContext = {
      ...context,
      onProgress: (progress, note) =>
        context.onProgress(progress, note ? `${note} · ${enriched} websites checked for emails` : note),
      emit: async (batch) => {
        const ready = await findEmailsOnWebsites(batch, context.signal)
        enriched += ready.length
        return context.emit(ready)
      },
    }

    // Apify first: it handles the biggest searches; the others are fallbacks.
    const sources = [
      apifyReady() ? apifyProvider : null,
      process.env.GOOGLE_MAPS_API_KEY ? googleMapsProvider : null,
      process.env.SERPAPI_KEY ? serpapiProvider : null,
    ].filter((source): source is ScrapeProvider => source !== null)

    let lastError: unknown = null
    for (const source of sources) {
      try {
        await context.onProgress(4, `Searching Google Maps for “${context.query}”`)
        await source.run(enrichingContext)
        return
      } catch (error) {
        // e.g. Places API without billing: fall through to SerpApi.
        lastError = error
        if (context.signal.aborted || context.emitted() > 0) throw error
      }
    }
    throw lastError instanceof Error ? lastError : new ScrapeError('Smart search failed.')
  },
}
