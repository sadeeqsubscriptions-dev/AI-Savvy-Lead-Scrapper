/**
 * Crawlee provider — https://github.com/apify/crawlee
 *
 * Crawlee is a crawler, not a search engine: it needs somewhere to start. Give
 * it seed URLs (company sites, or a directory/listing page) and it walks each
 * one, prioritising contact and team pages, and extracts a contact per domain.
 *
 * Uses CheerioCrawler — plain HTTP plus an HTML parser, no browser binary — so
 * it runs anywhere Node runs, including serverless. Crawlee is configured with
 * in-memory storage because the default `./storage` directory is not writable
 * on most hosts.
 *
 * Imports `@crawlee/cheerio` rather than the `crawlee` meta-package: the latter
 * re-exports the Puppeteer and Playwright adapters, whose optional peer
 * dependencies break the production build.
 */

import { contactToLead, looksLikeContactPage, mergeLeads } from '../extract'
import { MISSING_SEEDS_MESSAGE, collectSeeds, domainOf } from '../seeds'
import { ScrapeError, type ScrapeProvider, type ScrapedLeadInput } from '../types'

/** Pages fetched per seed domain before moving on. */
const PAGES_PER_DOMAIN = 6

export const crawleeProvider: ScrapeProvider = {
  id: 'crawlee',
  label: 'Crawlee (crawl your own URL list)',
  description:
    'Crawls websites you supply and pulls contacts off their contact, about, and team pages. No API key needed — add seed URLs below.',

  async run(context) {
    const { query, locations, industry, maxResults, config, signal } = context

    const seeds = collectSeeds(config, query)

    if (seeds.length === 0) throw new ScrapeError(MISSING_SEEDS_MESSAGE)

    // Loaded on demand: Crawlee is a heavy dependency and only this provider needs it.
    const { CheerioCrawler, Configuration } = await import('@crawlee/cheerio')

    const crawlExternal = config.crawl_external === true
    const perDomainBest = new Map<string, ScrapedLeadInput>()
    const visitedDomains = new Set<string>()
    let pagesDone = 0

    const totalBudget = Math.min(seeds.length * PAGES_PER_DOMAIN, maxResults * PAGES_PER_DOMAIN, 400)

    const crawler = new CheerioCrawler(
      {
        maxRequestsPerCrawl: totalBudget,
        maxConcurrency: 5,
        maxRequestRetries: 1,
        requestHandlerTimeoutSecs: 30,
        navigationTimeoutSecs: 20,

        async requestHandler({ request, $, body, enqueueLinks }) {
          if (signal.aborted || context.emitted() >= maxResults) {
            await crawler.autoscaledPool?.abort()
            return
          }

          pagesDone += 1

          const html = typeof body === 'string' ? body : body.toString('utf-8')
          const title = $('title').first().text().trim() || null
          const domain = domainOf(request.url)
          visitedDomains.add(domain)

          const lead = contactToLead(
            { url: request.url, title, content: html },
            { industry, city: locations[0] ?? null },
          )

          if (lead) {
            const tagged = { ...lead, raw: { ...lead.raw, provider: 'crawlee', seed_domain: domain } }
            const existing = perDomainBest.get(domain)

            // One record per domain, built up from every page that had details.
            perDomainBest.set(domain, existing ? mergeLeads(existing, tagged) : tagged)
          }

          // Only the first page of a domain fans out, and only to likely contact pages.
          if (request.userData.depth === undefined || Number(request.userData.depth) < 1) {
            await enqueueLinks({
              strategy: crawlExternal ? 'all' : 'same-domain',
              limit: PAGES_PER_DOMAIN,
              transformRequestFunction(candidate) {
                if (!looksLikeContactPage(candidate.url)) return false
                candidate.userData = { depth: 1 }
                return candidate
              },
            })
          }

          await context.onProgress(
            Math.min(92, 4 + Math.round((pagesDone / totalBudget) * 88)),
            `Crawled ${pagesDone} pages across ${visitedDomains.size} sites`,
          )
        },

        // A dead or blocked seed is normal; log it and keep the job alive.
        failedRequestHandler({ request, log }) {
          log.warning(`Crawlee gave up on ${request.url}`)
        },
      },
      // Memory-only storage: the default ./storage path is read-only on Vercel.
      new Configuration({ persistStorage: false }),
    )

    try {
      await crawler.run(seeds)
    } finally {
      await crawler.teardown().catch(() => {})
    }

    const leads = [...perDomainBest.values()]
    if (leads.length > 0) await context.emit(leads)

    if (leads.length === 0) {
      await context.onProgress(
        96,
        `Crawled ${pagesDone} pages but found no contact details`,
      )
    }
  },
}
