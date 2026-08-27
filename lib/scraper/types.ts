/**
 * Scraper provider contract.
 *
 * To add a provider, implement `ScrapeProvider` and register it in
 * `lib/scraper/registry.ts`. The runner owns persistence, de-duplication,
 * progress reporting, and importing into the CRM — a provider only has to
 * discover records and hand them to `emit`.
 */

export type ScrapedLeadInput = {
  full_name?: string | null
  company?: string | null
  title?: string | null
  email?: string | null
  phone?: string | null
  website?: string | null
  address?: string | null
  city?: string | null
  country?: string | null
  industry?: string | null
  /** 0–100. Omit to let the runner score the record heuristically. */
  score?: number | null
  source_url?: string | null
  /** Untouched provider payload, stored for debugging and re-processing. */
  raw?: Record<string, unknown>
}

export type ScrapeContext = {
  query: string
  locations: string[]
  industry: string | null
  maxResults: number
  minScore: number
  /** Free-form per-job options captured from the scrape form. */
  config: Record<string, unknown>
  signal: AbortSignal
  /** Report 0–100 completion; the UI polls this. */
  onProgress: (progress: number, note?: string) => Promise<void>
  /** Persist a batch of discovered records. Safe to call repeatedly. */
  emit: (leads: ScrapedLeadInput[]) => Promise<number>
  /** How many records have been accepted so far. */
  emitted: () => number
}

export type ScrapeProvider = {
  id: string
  label: string
  description: string
  /** Env var that must be present for this provider to run. */
  requiresEnv?: string
  run: (context: ScrapeContext) => Promise<void>
}

export class ScrapeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ScrapeError'
  }
}
