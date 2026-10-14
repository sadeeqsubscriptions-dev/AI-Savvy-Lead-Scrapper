/**
 * Apify — Google Maps Scraper (compass/crawler-google-places).
 *
 * Handles big searches (thousands of places) reliably and cheaply. We start a
 * run, then page through its dataset while it's still going so leads appear
 * in the job as they're found. Emails are found by our own website check in
 * smart.ts, so Apify's paid contact add-on stays off.
 */

import { ScrapeError, type ScrapeContext, type ScrapeProvider, type ScrapedLeadInput } from '../types'

const API = 'https://api.apify.com/v2'
const ACTOR = process.env.APIFY_MAPS_ACTOR?.trim() || 'compass~crawler-google-places'
const POLL_MS = 4000
const PAGE = 100

type Place = {
  title?: string
  phone?: string
  phoneUnformatted?: string
  website?: string
  address?: string
  street?: string
  city?: string
  state?: string
  countryCode?: string
  categoryName?: string
  totalScore?: number
  reviewsCount?: number
  url?: string
  placeId?: string
  permanentlyClosed?: boolean
  emails?: string[]
}

export function apifyReady() {
  return Boolean(process.env.APIFY_API_TOKEN?.trim())
}

async function apify<T>(path: string, init: RequestInit & { signal: AbortSignal }): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.APIFY_API_TOKEN?.trim()}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    if (response.status === 401) throw new ScrapeError('Apify rejected the API token (APIFY_API_TOKEN).')
    if (response.status === 402) throw new ScrapeError('The Apify account is out of credit. Top it up at console.apify.com.')
    throw new ScrapeError(`Apify request failed (${response.status}): ${body.slice(0, 200)}`)
  }
  return (await response.json()) as T
}

function toLead(place: Place, industry: string | null): ScrapedLeadInput | null {
  if (!place.title || place.permanentlyClosed) return null
  const rating = typeof place.totalScore === 'number' ? place.totalScore : null
  const reviews = place.reviewsCount ?? 0
  return {
    company: place.title,
    phone: place.phone ?? place.phoneUnformatted ?? null,
    website: place.website ?? null,
    email: place.emails?.[0] ?? null,
    address: place.address ?? place.street ?? null,
    city: place.city ?? null,
    country: place.countryCode ?? null,
    industry: industry ?? place.categoryName ?? null,
    source_url: place.url ?? null,
    raw: {
      provider: 'apify',
      place_id: place.placeId,
      category: place.categoryName,
      rating,
      reviews,
      state: place.state,
    },
  }
}

export const apifyProvider: ScrapeProvider = {
  id: 'apify',
  label: 'Google Maps via Apify',
  description: 'Large Google Maps searches (thousands of businesses) with phone, website, address and rating.',
  requiresEnv: 'APIFY_API_TOKEN',

  async run(context: ScrapeContext) {
    if (!apifyReady()) throw new ScrapeError('Apify needs APIFY_API_TOKEN.')
    const { signal } = context
    const locations = context.locations.length > 0 ? context.locations : ['United States']
    const perLocation = Math.max(1, Math.ceil(context.maxResults / locations.length))

    for (const [index, location] of locations.entries()) {
      if (signal.aborted || context.emitted() >= context.maxResults) return
      const want = Math.min(perLocation, context.maxResults - context.emitted())

      const { data: run } = await apify<{ data: { id: string; defaultDatasetId: string } }>(`/acts/${ACTOR}/runs`, {
        method: 'POST',
        signal,
        body: JSON.stringify({
          searchStringsArray: [context.query],
          locationQuery: location,
          // Ask for a little extra: some places are closed or duplicates.
          maxCrawledPlacesPerSearch: Math.ceil(want * 1.15) + 5,
          language: 'en',
          skipClosedPlaces: true,
          scrapePlaceDetailPage: false,
          scrapeContacts: false,
          maxReviews: 0,
          maxImages: 0,
        }),
      })

      const abort = () => {
        void fetch(`${API}/actor-runs/${run.id}/abort`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.APIFY_API_TOKEN?.trim()}` },
        }).catch(() => undefined)
      }
      signal.addEventListener('abort', abort, { once: true })

      let offset = 0
      let accepted = 0
      try {
        for (;;) {
          const { data: status } = await apify<{ data: { status: string; statusMessage?: string } }>(
            `/actor-runs/${run.id}`,
            { method: 'GET', signal },
          )
          const finished = !['READY', 'RUNNING'].includes(status.status)

          // Drain whatever the run has found so far.
          for (;;) {
            const items = await apify<Place[]>(
              `/datasets/${run.defaultDatasetId}/items?clean=true&offset=${offset}&limit=${PAGE}`,
              { method: 'GET', signal },
            )
            if (items.length === 0) break
            offset += items.length
            const leads = items.map((place) => toLead(place, context.industry)).filter((lead) => lead !== null)
            if (leads.length > 0) accepted += await context.emit(leads)
            if (accepted >= want) break
          }

          const share = 100 / locations.length
          await context.onProgress(
            Math.min(95, Math.round(index * share + Math.min(1, accepted / want) * share)),
            `Google Maps: ${offset} businesses found in ${location}`,
          )

          if (accepted >= want) {
            if (!finished) abort()
            break
          }
          if (finished) {
            if (status.status !== 'SUCCEEDED' && offset === 0) {
              throw new ScrapeError(`Apify run ${status.status.toLowerCase()}: ${status.statusMessage ?? 'no details'}`)
            }
            break
          }
          await new Promise((resolve) => setTimeout(resolve, POLL_MS))
          if (signal.aborted) return
        }
      } finally {
        signal.removeEventListener('abort', abort)
      }
    }
  },
}
