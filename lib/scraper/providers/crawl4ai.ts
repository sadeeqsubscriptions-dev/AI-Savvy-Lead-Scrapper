/**
 * Crawl4AI provider — https://github.com/unclecode/crawl4ai
 *
 * Crawl4AI is a Python library, so it cannot run inside this Next.js process.
 * Instead this talks to its Docker API server over HTTP:
 *
 *   docker run -d -p 11235:11235 --shm-size=1g unclecode/crawl4ai:latest
 *
 * Then set CRAWL4AI_URL=http://localhost:11235 (and CRAWL4AI_TOKEN if you
 * enabled auth — it is on by default since v0.9).
 *
 * Where Crawlee sends plain HTTP requests, Crawl4AI drives a real headless
 * browser, so reach for this provider when target sites render contact details
 * with JavaScript or sit behind bot protection.
 */

import { contactToLead, looksLikeContactPage, mergeLeads } from '../extract'
import { MISSING_SEEDS_MESSAGE, collectSeeds, domainOf } from '../seeds'
import { ScrapeError, type ScrapeProvider, type ScrapedLeadInput } from '../types'

/** The browser pool handles a handful of pages at a time comfortably. */
const URLS_PER_REQUEST = 8

type Crawl4aiResult = {
  url?: string
  success?: boolean
  html?: string
  cleaned_html?: string
  markdown?: string | { raw_markdown?: string; fit_markdown?: string }
  metadata?: { title?: string; description?: string }
  links?: {
    internal?: Array<{ href?: string; text?: string }>
    external?: Array<{ href?: string; text?: string }>
  }
  error_message?: string
}

type Crawl4aiResponse = {
  success?: boolean
  results?: Crawl4aiResult[]
  detail?: string | { msg?: string }
  task_id?: string
}

function baseUrl() {
  return (process.env.CRAWL4AI_URL || '').replace(/\/+$/, '')
}

function markdownOf(result: Crawl4aiResult) {
  const { markdown } = result

  if (typeof markdown === 'string') return markdown
  if (markdown) return markdown.raw_markdown ?? markdown.fit_markdown ?? ''
  return ''
}

function contentOf(result: Crawl4aiResult) {
  // Raw HTML keeps mailto: and tel: links that markdown conversion can drop.
  return [result.html ?? result.cleaned_html ?? '', markdownOf(result)]
    .filter((part) => part.length > 0)
    .join('\n\n')
}

async function crawlBatch(urls: string[], signal: AbortSignal): Promise<Crawl4aiResult[]> {
  const token = process.env.CRAWL4AI_TOKEN

  let response: Response
  try {
    response = await fetch(`${baseUrl()}/crawl`, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        urls,
        browser_config: { type: 'BrowserConfig', params: { headless: true } },
        crawler_config: {
          type: 'CrawlerRunConfig',
          params: { cache_mode: 'bypass', page_timeout: 25000 },
        },
      }),
    })
  } catch (error) {
    if (signal.aborted) return []
    throw new ScrapeError(
      `Could not reach the Crawl4AI server at ${baseUrl()}. Is the Docker container running? (${
        error instanceof Error ? error.message : 'connection failed'
      })`,
    )
  }

  if (!response.ok) {
    const detail = await response.text()

    if (response.status === 401 || response.status === 403) {
      throw new ScrapeError(
        'Crawl4AI rejected the request. Auth is enabled by default since v0.9 — set CRAWL4AI_TOKEN.',
      )
    }

    throw new ScrapeError(`Crawl4AI returned ${response.status}. ${detail.slice(0, 300)}`)
  }

  const payload = (await response.json()) as Crawl4aiResponse

  if (payload.task_id && !payload.results) {
    throw new ScrapeError(
      'This Crawl4AI build queues crawls asynchronously, which this provider does not support yet. Use a v0.7+ image.',
    )
  }

  return payload.results ?? []
}

function chunk<T>(items: T[], size: number) {
  const batches: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size))
  }
  return batches
}

export const crawl4aiProvider: ScrapeProvider = {
  id: 'crawl4ai',
  label: 'Crawl4AI (self-hosted, JS rendering)',
  description:
    'Renders pages in a real browser via your local Crawl4AI Docker server. Use for JavaScript-heavy or bot-protected sites. Needs seed URLs.',
  requiresEnv: 'CRAWL4AI_URL',

  async run(context) {
    const { query, locations, industry, maxResults, config, signal } = context

    if (!baseUrl()) {
      throw new ScrapeError('CRAWL4AI_URL is not set. Point it at your Crawl4AI Docker server.')
    }

    const seeds = collectSeeds(config, query)
    if (seeds.length === 0) throw new ScrapeError(MISSING_SEEDS_MESSAGE)

    const perDomainBest = new Map<string, ScrapedLeadInput>()
    const followUps: string[] = []
    const batches = chunk(seeds, URLS_PER_REQUEST)
    let done = 0

    const absorb = (result: Crawl4aiResult, fallbackUrl: string) => {
      const url = result.url ?? fallbackUrl
      const lead = contactToLead(
        { url, title: result.metadata?.title ?? null, content: contentOf(result) },
        { industry, city: locations[0] ?? null },
      )

      if (!lead) return false

      const domain = domainOf(url)
      const tagged = { ...lead, raw: { ...lead.raw, provider: 'crawl4ai', seed_domain: domain } }
      const existing = perDomainBest.get(domain)

      // One record per domain, built up from every page that had details.
      perDomainBest.set(domain, existing ? mergeLeads(existing, tagged) : tagged)
      return true
    }

    for (const batch of batches) {
      if (signal.aborted) return

      await context.onProgress(
        4 + Math.round((done / seeds.length) * 60),
        `Rendering ${done + batch.length} of ${seeds.length} sites`,
      )

      const results = await crawlBatch(batch, signal)

      for (const [index, result] of results.entries()) {
        const fallbackUrl = batch[index] ?? ''
        const found = absorb(result, fallbackUrl)

        // No contact on the landing page: queue the site's own contact links.
        if (!found) {
          const links = [...(result.links?.internal ?? []), ...(result.links?.external ?? [])]
          const candidates = links
            .map((link) => link.href)
            .filter((href): href is string => typeof href === 'string' && looksLikeContactPage(href))
            .slice(0, 2)

          for (const candidate of candidates) {
            try {
              followUps.push(new URL(candidate, result.url ?? fallbackUrl).toString())
            } catch {
              // Malformed href, nothing to follow.
            }
          }
        }
      }

      done += batch.length
    }

    // Second pass over the discovered contact pages.
    const uniqueFollowUps = [...new Set(followUps)].slice(0, 40)

    for (const [index, batch] of chunk(uniqueFollowUps, URLS_PER_REQUEST).entries()) {
      if (signal.aborted) break
      if (perDomainBest.size >= maxResults) break

      await context.onProgress(
        66 + Math.round((index / Math.max(1, uniqueFollowUps.length / URLS_PER_REQUEST)) * 26),
        `Checking ${uniqueFollowUps.length} contact pages`,
      )

      try {
        const results = await crawlBatch(batch, signal)
        results.forEach((result, position) => absorb(result, batch[position] ?? ''))
      } catch {
        // Follow-ups are best effort; the primary pass already produced results.
        break
      }
    }

    const leads = [...perDomainBest.values()].slice(0, maxResults)
    if (leads.length > 0) await context.emit(leads)
    else await context.onProgress(96, 'Crawl4AI found no contact details on those sites')
  },
}
