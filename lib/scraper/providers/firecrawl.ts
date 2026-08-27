/**
 * Firecrawl provider — https://github.com/firecrawl/firecrawl
 *
 * Uses the `/v2/search` endpoint, which finds sources and returns their page
 * content in one call, so a niche plus a city is enough to discover prospects
 * without knowing any URLs upfront. Pages that reveal no contact details get a
 * follow-up scrape of their likely contact page.
 *
 * Works against Firecrawl Cloud or a self-hosted instance (set FIRECRAWL_API_URL).
 */

import { contactToLead } from '../extract'
import { ScrapeError, type ScrapeProvider, type ScrapedLeadInput } from '../types'

const DEFAULT_BASE_URL = 'https://api.firecrawl.dev'

/** Search returns content inline, so one request covers discovery and fetching. */
const RESULTS_PER_REQUEST = 20

/** Cap on follow-up scrapes, which cost a credit each. */
const MAX_CONTACT_PAGE_FETCHES = 25

type SearchDocument = {
  url?: string
  title?: string
  description?: string
  markdown?: string
  html?: string
  rawHtml?: string
  metadata?: { title?: string; sourceURL?: string; description?: string }
}

type SearchResponse = {
  success?: boolean
  error?: string
  data?: { web?: SearchDocument[] } | SearchDocument[]
}

type ScrapeResponse = {
  success?: boolean
  error?: string
  data?: SearchDocument
}

function baseUrl() {
  return (process.env.FIRECRAWL_API_URL || DEFAULT_BASE_URL).replace(/\/+$/, '')
}

async function callFirecrawl<T>(path: string, body: unknown, signal: AbortSignal): Promise<T> {
  const apiKey = process.env.FIRECRAWL_API_KEY

  const response = await fetch(`${baseUrl()}${path}`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      // Self-hosted instances often run without auth; only send the header when set.
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const detail = await response.text()

    if (response.status === 401 || response.status === 403) {
      throw new ScrapeError('Firecrawl rejected the API key. Check FIRECRAWL_API_KEY.')
    }
    if (response.status === 402) {
      throw new ScrapeError('Your Firecrawl account is out of credits.')
    }
    if (response.status === 429) {
      throw new ScrapeError('Firecrawl rate limit reached. Try a smaller job or wait a minute.')
    }

    throw new ScrapeError(`Firecrawl returned ${response.status}. ${detail.slice(0, 300)}`)
  }

  return (await response.json()) as T
}

/** The `data` field is an object keyed by source on v2 but an array on older builds. */
function documentsFrom(payload: SearchResponse): SearchDocument[] {
  if (Array.isArray(payload.data)) return payload.data
  return payload.data?.web ?? []
}

function contentOf(document: SearchDocument) {
  return [document.markdown, document.rawHtml, document.html, document.description]
    .filter(Boolean)
    .join('\n\n')
}

export const firecrawlProvider: ScrapeProvider = {
  id: 'firecrawl',
  label: 'Firecrawl (web search + scrape)',
  description:
    'Searches the open web for your niche, then pulls contact details off each result. Best all-round source — no seed URLs needed.',
  requiresEnv: 'FIRECRAWL_API_KEY',

  async run(context) {
    const { query, locations, industry, maxResults, config, signal } = context

    const searches = locations.length > 0 ? locations : ['']
    const perSearch = Math.min(
      RESULTS_PER_REQUEST,
      Math.max(5, Math.ceil(maxResults / searches.length)),
    )
    const followContactPages = config.follow_contact_pages !== false

    let contactFetches = 0
    let anyResults = false

    for (const [index, location] of searches.entries()) {
      if (signal.aborted) return
      if (context.emitted() >= maxResults) return

      // "contact" biases results toward pages that actually list an address.
      const searchQuery = location ? `${query} in ${location} contact` : `${query} contact`

      await context.onProgress(
        Math.round((index / searches.length) * 90) + 4,
        location ? `Searching ${location}` : 'Searching the web',
      )

      const payload = await callFirecrawl<SearchResponse>(
        '/v2/search',
        {
          query: searchQuery,
          limit: perSearch,
          scrapeOptions: { formats: ['markdown'], onlyMainContent: false },
        },
        signal,
      )

      const documents = documentsFrom(payload)
      if (documents.length > 0) anyResults = true

      const batch: ScrapedLeadInput[] = []
      const needsContactPage: SearchDocument[] = []

      for (const document of documents) {
        const url = document.url ?? document.metadata?.sourceURL
        if (!url) continue

        const lead = contactToLead(
          {
            url,
            title: document.title ?? document.metadata?.title ?? null,
            content: contentOf(document),
          },
          { industry, city: location || null },
        )

        if (lead) {
          batch.push({ ...lead, raw: { ...lead.raw, provider: 'firecrawl' } })
        } else {
          needsContactPage.push(document)
        }
      }

      if (batch.length > 0) await context.emit(batch)

      // Marketing home pages routinely hide the address one click away.
      if (followContactPages) {
        for (const document of needsContactPage) {
          if (signal.aborted) return
          if (contactFetches >= MAX_CONTACT_PAGE_FETCHES) break
          if (context.emitted() >= maxResults) return

          const url = document.url ?? document.metadata?.sourceURL
          if (!url) continue

          let contactUrl: string
          try {
            contactUrl = new URL('/contact', url).toString()
          } catch {
            continue
          }

          contactFetches += 1

          try {
            const scraped = await callFirecrawl<ScrapeResponse>(
              '/v2/scrape',
              { url: contactUrl, formats: ['markdown'], onlyMainContent: false },
              signal,
            )

            const document2 = scraped.data
            if (!document2) continue

            const lead = contactToLead(
              {
                url: contactUrl,
                title: document.title ?? document2.metadata?.title ?? null,
                content: contentOf(document2),
              },
              { industry, city: location || null },
            )

            if (lead) {
              await context.emit([{ ...lead, raw: { ...lead.raw, provider: 'firecrawl' } }])
            }
          } catch (error) {
            // A missing /contact page is expected and must not fail the job.
            if (signal.aborted) return
            if (error instanceof ScrapeError && /out of credits|rate limit|API key/i.test(error.message)) {
              throw error
            }
          }
        }
      }

      await context.onProgress(
        Math.round(((index + 1) / searches.length) * 90) + 4,
        `Found ${context.emitted()} contacts`,
      )
    }

    if (!anyResults) {
      await context.onProgress(96, 'Firecrawl returned no results for that query')
    }
  },
}
