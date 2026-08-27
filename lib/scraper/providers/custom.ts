import { ScrapeError, type ScrapeProvider } from '../types'

/**
 * Drop-in slot for your own scraping code.
 *
 * Replace the body of `run` with your logic. The runner handles everything
 * else — job status, progress, the staging table, scoring, de-duplication, and
 * importing into the CRM — so all this function needs to do is discover records
 * and hand them to `context.emit`.
 *
 *   export const customProvider: ScrapeProvider = {
 *     id: 'custom',
 *     label: 'My scraper',
 *     description: '…',
 *     async run(context) {
 *       const { query, locations, maxResults, signal } = context
 *
 *       for (const location of locations) {
 *         const rows = await myScraper({ query, location, signal })
 *
 *         await context.emit(
 *           rows.map((row) => ({
 *             full_name: row.contactName,
 *             company: row.businessName,
 *             email: row.email,
 *             phone: row.phone,
 *             website: row.url,
 *             city: location,
 *             source_url: row.profileUrl,
 *             raw: row,            // kept verbatim for debugging
 *           })),
 *         )
 *
 *         await context.onProgress(50, `Found ${context.emitted()} records`)
 *         if (context.emitted() >= maxResults) break
 *       }
 *     },
 *   }
 *
 * Notes:
 *  - `emit` de-duplicates and returns how many records were actually stored.
 *  - Respect `signal.aborted` in long loops so cancellation works.
 *  - Omit `score` and the runner scores each record heuristically.
 *  - Anything needing Node APIs (playwright, cheerio) is fine; this runs
 *    server-side only.
 */
export const customProvider: ScrapeProvider = {
  id: 'custom',
  label: 'Custom scraper',
  description: 'Your own scraping code. Implement lib/scraper/providers/custom.ts to enable.',

  async run() {
    throw new ScrapeError(
      'The custom provider has no implementation yet. Add your scraping code to lib/scraper/providers/custom.ts.',
    )
  },
}

/** Flip to true once `run` above is implemented, to list it as ready in the UI. */
export const CUSTOM_PROVIDER_READY = false
