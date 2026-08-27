/**
 * Apollo.io provider — People Search + optional email enrichment.
 * https://docs.apollo.io/reference/people-search
 *
 * Search returns matching people, but most plans mask the email address
 * (`email_not_unlocked@domain.com`) until it is unlocked via the People
 * Enrichment endpoint, which spends one Apollo credit per contact. To keep
 * spend predictable, enrichment is capped at MAX_ENRICHMENT_CALLS per job —
 * set `config.reveal_emails = false` on the job to search without unlocking.
 */

import { ScrapeError, type ScrapeProvider, type ScrapedLeadInput } from '../types'

const SEARCH_ENDPOINT = 'https://api.apollo.io/api/v1/mixed_people/search'
const MATCH_ENDPOINT = 'https://api.apollo.io/api/v1/people/match'

const PER_PAGE = 25
const MAX_ENRICHMENT_CALLS = 30
const PLACEHOLDER_EMAIL = /^email_not_unlocked/i

type ApolloOrganization = {
  name?: string
  website_url?: string
  primary_domain?: string
  industry?: string
  phone?: string
}

type ApolloPerson = {
  id: string
  name?: string
  first_name?: string
  last_name?: string
  title?: string
  email?: string | null
  linkedin_url?: string
  city?: string
  state?: string
  country?: string
  organization?: ApolloOrganization
}

type SearchResponse = {
  people?: ApolloPerson[]
  pagination?: { page: number; per_page: number; total_entries: number; total_pages: number }
  error?: string
}

type MatchResponse = {
  person?: ApolloPerson
  error?: string
}

async function callApollo<T>(url: string, body: unknown, signal: AbortSignal): Promise<T> {
  const apiKey = process.env.APOLLO_API_KEY

  const response = await fetch(url, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'x-api-key': apiKey ?? '',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const detail = await response.text()

    if (response.status === 401) {
      throw new ScrapeError('Apollo rejected the API key. Check APOLLO_API_KEY.')
    }
    if (response.status === 403) {
      throw new ScrapeError("Apollo's API returned 403 — your plan may not include API access to this endpoint.")
    }
    if (response.status === 429) {
      throw new ScrapeError('Apollo rate limit reached. Try a smaller job or wait a minute.')
    }

    throw new ScrapeError(`Apollo returned ${response.status}. ${detail.slice(0, 300)}`)
  }

  return (await response.json()) as T
}

function personToLead(person: ApolloPerson, industry: string | null): ScrapedLeadInput {
  const org = person.organization
  const email = person.email && !PLACEHOLDER_EMAIL.test(person.email) ? person.email : null

  return {
    full_name: person.name ?? ([person.first_name, person.last_name].filter(Boolean).join(' ') || null),
    company: org?.name ?? null,
    title: person.title ?? null,
    email,
    phone: org?.phone ?? null,
    website: org?.website_url ?? (org?.primary_domain ? `https://${org.primary_domain}` : null),
    address: null,
    city: person.city ?? null,
    country: person.country ?? null,
    industry: industry ?? org?.industry ?? null,
    source_url: person.linkedin_url ?? null,
    raw: { provider: 'apollo', apollo_id: person.id, state: person.state },
  }
}

export const apolloProvider: ScrapeProvider = {
  id: 'apollo',
  label: 'Apollo.io (people search)',
  description:
    'Searches Apollo\'s 275M+ contact database by role and location. Emails are unlocked via a capped number of enrichment calls, which spend Apollo credits.',
  requiresEnv: 'APOLLO_API_KEY',

  async run(context) {
    const apiKey = process.env.APOLLO_API_KEY
    if (!apiKey) {
      throw new ScrapeError('APOLLO_API_KEY is not set. Add it to .env.local to use this provider.')
    }

    const { query, locations, industry, maxResults, config, signal } = context
    const revealEmails = config.reveal_emails !== false

    let page = 1
    let totalPages = 1
    let enrichmentCalls = 0
    let anyResults = false

    while (page <= totalPages) {
      if (signal.aborted) return
      if (context.emitted() >= maxResults) return

      const payload = await callApollo<SearchResponse>(
        SEARCH_ENDPOINT,
        {
          q_keywords: query,
          ...(locations.length > 0 ? { person_locations: locations } : {}),
          page,
          per_page: PER_PAGE,
        },
        signal,
      )

      const people = payload.people ?? []
      if (people.length > 0) anyResults = true
      totalPages = payload.pagination?.total_pages ?? page

      const batch: ScrapedLeadInput[] = []

      for (const person of people) {
        if (context.emitted() + batch.length >= maxResults) break

        let lead = personToLead(person, industry)

        if (!lead.email && revealEmails && enrichmentCalls < MAX_ENRICHMENT_CALLS) {
          enrichmentCalls += 1
          try {
            const matched = await callApollo<MatchResponse>(
              MATCH_ENDPOINT,
              { id: person.id, reveal_personal_emails: true },
              signal,
            )
            if (matched.person) lead = personToLead(matched.person, industry)
          } catch (error) {
            // A single failed unlock should not sink the whole job.
            if (signal.aborted) return
            if (error instanceof ScrapeError && /API key|rate limit/i.test(error.message)) throw error
          }
        }

        batch.push(lead)
      }

      if (batch.length > 0) await context.emit(batch)

      await context.onProgress(
        Math.min(96, Math.round((page / Math.max(totalPages, 1)) * 100)),
        `Found ${context.emitted()} people`,
      )

      if (people.length === 0) break
      page += 1
    }

    if (!anyResults) {
      await context.onProgress(96, 'Apollo returned no results for that query')
    }
  },
}
