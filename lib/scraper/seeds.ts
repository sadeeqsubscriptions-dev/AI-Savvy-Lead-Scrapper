/**
 * Seed-URL handling shared by the crawl-based providers.
 *
 * Crawlee and Crawl4AI both fetch pages rather than search the web, so they
 * need a starting point. Both accept the same input: a seed-URL list from the
 * scrape form, or URLs typed into the query.
 */

export function normalizeSeed(value: string) {
  const trimmed = value.trim().replace(/^[<(]+|[>)]+$/g, '').replace(/[.,;]+$/, '')
  if (trimmed.length === 0) return null

  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    // Reject bare words that are not really hostnames.
    if (!url.hostname.includes('.')) return null
    return url.toString()
  } catch {
    return null
  }
}

/** Seeds come from the form's seed-URL box, falling back to URLs in the query. */
export function collectSeeds(config: Record<string, unknown>, query: string, limit = 50) {
  const raw: string[] = []
  const fromConfig = config.seed_urls

  if (Array.isArray(fromConfig)) {
    raw.push(...fromConfig.filter((item): item is string => typeof item === 'string'))
  } else if (typeof fromConfig === 'string') {
    raw.push(...fromConfig.split(/[\s,\n]+/))
  }

  if (raw.length === 0) raw.push(...query.split(/[\s,\n]+/))

  const seeds = raw.map(normalizeSeed).filter((item): item is string => item !== null)

  return [...new Set(seeds)].slice(0, limit)
}

export function domainOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export const MISSING_SEEDS_MESSAGE =
  'This source crawls pages rather than searching the web, so it needs a starting point. Add one or more seed URLs (company sites or a directory page) in the "Seed URLs" field.'
