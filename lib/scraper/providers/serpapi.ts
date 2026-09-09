import { ScrapeError, type ScrapeProvider, type ScrapedLeadInput } from '../types'

const ENDPOINT = 'https://serpapi.com/search.json'
const RESULTS_PER_PAGE = 20

type LocalResult = {
  title?: string
  address?: string
  phone?: string
  website?: string
  type?: string
  place_id?: string
  rating?: number
  reviews?: number
}

type MapsResponse = {
  error?: string
  local_results?: LocalResult[]
}

function cityFromAddress(address?: string) {
  if (!address) return null
  const parts = address.split(',').map((part) => part.trim())
  return parts.length >= 3 ? parts[parts.length - 3] : (parts[0] ?? null)
}

function countryFromAddress(address?: string) {
  if (!address) return null
  const parts = address.split(',').map((part) => part.trim())
  return parts.length >= 1 ? parts[parts.length - 1] : null
}

/**
 * SerpApi's Google Maps engine — a card-free alternative to the official
 * Google Places API. Same idea (real local businesses by term + city) via
 * SerpApi's own infrastructure instead of a Google Cloud billing account.
 * Free plan: 250 searches/month. https://serpapi.com/google-maps-api
 */
export const serpapiProvider: ScrapeProvider = {
  id: 'serpapi',
  label: 'Google Maps via SerpApi (free, no card)',
  description:
    'Local businesses by search term and city, sourced from Google Maps through SerpApi — no Google Cloud billing required. Free tier: 250 searches/month.',
  requiresEnv: 'SERPAPI_KEY',

  async run(context) {
    const apiKey = process.env.SERPAPI_KEY

    if (!apiKey) {
      throw new ScrapeError('SERPAPI_KEY is not set. Add it to .env.local to use this provider.')
    }

    const { query, locations, industry, maxResults, signal } = context
    const searches = locations.length > 0 ? locations : ['']

    for (const [searchIndex, location] of searches.entries()) {
      const perLocationBudget = Math.ceil(maxResults / searches.length)
      let start = 0
      let pagesForLocation = 0

      while (true) {
        if (signal.aborted) return
        if (context.emitted() >= maxResults) return

        const url = new URL(ENDPOINT)
        url.searchParams.set('engine', 'google_maps')
        url.searchParams.set('type', 'search')
        url.searchParams.set('q', location ? `${query} in ${location}` : query)
        url.searchParams.set('api_key', apiKey)
        if (start > 0) url.searchParams.set('start', String(start))

        const response = await fetch(url, { signal })

        if (!response.ok) {
          const detail = await response.text()
          throw new ScrapeError(`SerpApi returned ${response.status}. ${detail.slice(0, 300)}`)
        }

        const payload = (await response.json()) as MapsResponse

        if (payload.error) {
          throw new ScrapeError(`SerpApi: ${payload.error}`)
        }

        const results = payload.local_results ?? []

        const batch: ScrapedLeadInput[] = results
          .filter((place) => place.title)
          .map((place) => ({
            full_name: null,
            company: place.title ?? null,
            title: null,
            email: null,
            phone: place.phone ?? null,
            website: place.website ?? null,
            address: place.address ?? null,
            city: cityFromAddress(place.address) ?? (location.split(',')[0] || null),
            country: countryFromAddress(place.address),
            industry: industry ?? place.type ?? null,
            source_url: place.place_id
              ? `https://www.google.com/maps/place/?q=place_id:${place.place_id}`
              : null,
            raw: {
              provider: 'serpapi',
              place_id: place.place_id,
              rating: place.rating,
              review_count: place.reviews,
            },
          }))

        if (batch.length > 0) await context.emit(batch)

        pagesForLocation += 1

        await context.onProgress(
          Math.min(96, Math.round(((searchIndex + pagesForLocation / 3) / searches.length) * 100)),
          `Found ${context.emitted()} businesses`,
        )

        if (context.emitted() >= maxResults) return
        if (results.length < RESULTS_PER_PAGE) break
        if (pagesForLocation * RESULTS_PER_PAGE >= perLocationBudget) break

        start += RESULTS_PER_PAGE
      }
    }
  },
}
