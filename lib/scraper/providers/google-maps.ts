import { ScrapeError, type ScrapeProvider, type ScrapedLeadInput } from '../types'

const ENDPOINT = 'https://places.googleapis.com/v1/places:searchText'

const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.rating',
  'places.userRatingCount',
  'places.primaryTypeDisplayName',
  'places.googleMapsUri',
  'nextPageToken',
].join(',')

type Place = {
  id?: string
  displayName?: { text?: string }
  formattedAddress?: string
  internationalPhoneNumber?: string
  websiteUri?: string
  rating?: number
  userRatingCount?: number
  primaryTypeDisplayName?: { text?: string }
  googleMapsUri?: string
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
 * Google Places Text Search. Returns businesses rather than named contacts, so
 * records arrive with a company, phone, and site but usually no email — good raw
 * material for an enrichment step.
 */
export const googleMapsProvider: ScrapeProvider = {
  id: 'google-maps',
  label: 'Google Maps (Places API)',
  description: 'Local businesses by search term and city. Returns company, phone, and website.',
  requiresEnv: 'GOOGLE_MAPS_API_KEY',

  async run(context) {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY

    if (!apiKey) {
      throw new ScrapeError('GOOGLE_MAPS_API_KEY is not set. Add it to .env.local to use this provider.')
    }

    const { query, locations, industry, maxResults, signal } = context
    const searches = locations.length > 0 ? locations : ['']
    let processed = 0

    for (const [searchIndex, location] of searches.entries()) {
      let pageToken: string | undefined
      let pagesForLocation = 0
      const perLocationBudget = Math.ceil(maxResults / searches.length)

      do {
        if (signal.aborted) return

        const response = await fetch(ENDPOINT, {
          method: 'POST',
          signal,
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': FIELD_MASK,
          },
          body: JSON.stringify({
            textQuery: location ? `${query} in ${location}` : query,
            pageSize: 20,
            ...(pageToken ? { pageToken } : {}),
          }),
        })

        if (!response.ok) {
          const detail = await response.text()
          throw new ScrapeError(
            `Google Places returned ${response.status}. ${detail.slice(0, 300)}`,
          )
        }

        const payload = (await response.json()) as { places?: Place[]; nextPageToken?: string }
        const places = payload.places ?? []

        const batch: ScrapedLeadInput[] = places.map((place) => ({
          full_name: null,
          company: place.displayName?.text ?? null,
          title: null,
          email: null,
          phone: place.internationalPhoneNumber ?? null,
          website: place.websiteUri ?? null,
          address: place.formattedAddress ?? null,
          city: cityFromAddress(place.formattedAddress) ?? (location.split(',')[0] || null),
          country: countryFromAddress(place.formattedAddress),
          industry: industry ?? place.primaryTypeDisplayName?.text ?? null,
          source_url: place.googleMapsUri ?? null,
          raw: {
            provider: 'google-maps',
            place_id: place.id,
            rating: place.rating,
            review_count: place.userRatingCount,
          },
        }))

        if (batch.length > 0) await context.emit(batch)

        processed += places.length
        pagesForLocation += 1
        pageToken = payload.nextPageToken

        await context.onProgress(
          Math.min(
            96,
            Math.round(((searchIndex + pagesForLocation / 3) / searches.length) * 100),
          ),
          `Found ${context.emitted()} businesses`,
        )

        if (context.emitted() >= maxResults) return
        if (pagesForLocation * 20 >= perLocationBudget) break
      } while (pageToken)
    }

    if (processed === 0) {
      await context.onProgress(96, 'No results for that query')
    }
  },
}
