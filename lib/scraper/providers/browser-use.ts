/**
 * Browser Use provider — https://github.com/browser-use/browser-use
 *
 * The library is Python, so this talks to the Browser Use Cloud v4 REST API,
 * where an AI agent drives a real browser and reports back what it found.
 *
 * The v4 API has no output-schema parameter: `run.result` comes back as a plain
 * string, so the task prompt asks for JSON only and the response is validated
 * here before anything is trusted.
 *
 * Unlike the other providers this one is agentic — it can navigate directories,
 * paginate, and fill search boxes on its own, which makes it the best option for
 * awkward sources and the slowest and most expensive per lead. Keep max results
 * low.
 */

import { z } from 'zod'
import { ScrapeError, type ScrapeProvider, type ScrapedLeadInput } from '../types'

const API_BASE = 'https://api.browser-use.com/api/v4'

const POLL_INTERVAL_MS = 4000

/** Agent runs are slow; stay under the runner's own 4-minute ceiling. */
const MAX_WAIT_MS = 3.5 * 60 * 1000

const TERMINAL_STATUSES = new Set(['completed', 'finished', 'failed', 'cancelled', 'stopped', 'error'])
const FAILED_STATUSES = new Set(['failed', 'cancelled', 'stopped', 'error'])

/** The agent is instructed to emit exactly this shape. */
const leadSchema = z.object({
  name: z.string().trim().max(120).nullish(),
  company: z.string().trim().max(160).nullish(),
  title: z.string().trim().max(120).nullish(),
  email: z.string().trim().max(160).nullish(),
  phone: z.string().trim().max(60).nullish(),
  website: z.string().trim().max(300).nullish(),
  city: z.string().trim().max(120).nullish(),
  source_url: z.string().trim().max(500).nullish(),
})

const payloadSchema = z.union([
  z.array(leadSchema),
  z.object({ leads: z.array(leadSchema) }),
  z.object({ results: z.array(leadSchema) }),
])

function headers() {
  const apiKey = process.env.BROWSER_USE_API_KEY
  if (!apiKey) throw new ScrapeError('BROWSER_USE_API_KEY is not set.')

  return { 'X-Browser-Use-API-Key': apiKey, 'Content-Type': 'application/json' }
}

function buildTask(query: string, location: string, wanted: number, seedHint: string) {
  const where = location ? ` in ${location}` : ''

  return [
    `Find up to ${wanted} business contacts for: ${query}${where}.`,
    seedHint,
    'For each business open its website and look for a real contact email or phone number, checking the contact or about page when the home page does not show one.',
    'Skip any business where you cannot find an email or a phone number.',
    'Return ONLY a JSON array and no other text, using exactly this shape:',
    '[{"name":null,"company":"Acme Ltd","title":null,"email":"hi@acme.com","phone":"+1 555 0100","website":"https://acme.com","city":"Austin, TX","source_url":"https://acme.com/contact"}]',
    'Use null for anything you cannot find. Do not invent or guess an email address.',
  ]
    .filter((line) => line.length > 0)
    .join(' ')
}

/** Pulls the JSON array out of a reply that may be wrapped in prose or fences. */
function parseLeads(result: string) {
  const trimmed = result.trim()
  const withoutFences = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')

  const candidates = [withoutFences]

  // Fall back to the outermost array or object if the agent added commentary.
  const array = withoutFences.match(/\[[\s\S]*\]/)
  if (array) candidates.push(array[0])
  const object = withoutFences.match(/\{[\s\S]*\}/)
  if (object) candidates.push(object[0])

  for (const candidate of candidates) {
    try {
      const parsed = payloadSchema.safeParse(JSON.parse(candidate))
      if (parsed.success) {
        return Array.isArray(parsed.data)
          ? parsed.data
          : 'leads' in parsed.data
            ? parsed.data.leads
            : parsed.data.results
      }
    } catch {
      // Try the next candidate.
    }
  }

  return null
}

async function request(path: string, init: RequestInit & { signal: AbortSignal }) {
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers: headers() })

  if (!response.ok) {
    const detail = await response.text()

    if (response.status === 401 || response.status === 403) {
      throw new ScrapeError(
        'Browser Use rejected the API key. Check BROWSER_USE_API_KEY, and note that projects with Zero Data Retention cannot use the v4 API.',
      )
    }
    if (response.status === 402) {
      throw new ScrapeError('Your Browser Use account is out of credits.')
    }
    if (response.status === 429) {
      throw new ScrapeError('Browser Use rate limit reached. Wait a moment and retry.')
    }

    throw new ScrapeError(`Browser Use returned ${response.status}. ${detail.slice(0, 300)}`)
  }

  return response.json()
}

async function waitForRun(runId: string, signal: AbortSignal, deadline: number) {
  while (Date.now() < deadline) {
    if (signal.aborted) return null

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    if (signal.aborted) return null

    // Status is the cheap indexed lookup; the full run is only fetched once.
    const status = (await request(`/runs/${runId}/status`, { method: 'GET', signal })) as {
      status?: string
    }

    const value = (status.status ?? '').toLowerCase()
    if (!TERMINAL_STATUSES.has(value)) continue

    if (FAILED_STATUSES.has(value)) {
      const summary = (await request(`/runs/${runId}`, { method: 'GET', signal })) as {
        error?: string | null
      }
      throw new ScrapeError(
        `The Browser Use agent ${value}. ${summary.error ?? ''}`.trim(),
      )
    }

    return (await request(`/runs/${runId}`, { method: 'GET', signal })) as {
      result?: string | null
      error?: string | null
    }
  }

  throw new ScrapeError(
    'The Browser Use agent did not finish in time. Try a narrower query or a lower max results.',
  )
}

export const browserUseProvider: ScrapeProvider = {
  id: 'browser-use',
  label: 'Browser Use (AI browser agent)',
  description:
    'An AI agent browses and hunts for contacts on its own — handles directories and search forms. Slowest and most expensive, so keep max results small.',
  requiresEnv: 'BROWSER_USE_API_KEY',

  async run(context) {
    const { query, locations, industry, maxResults, config, signal } = context

    const seedUrls = Array.isArray(config.seed_urls)
      ? config.seed_urls.filter((item): item is string => typeof item === 'string')
      : typeof config.seed_urls === 'string'
        ? config.seed_urls.split(/[\s,\n]+/).filter(Boolean)
        : []

    const seedHint =
      seedUrls.length > 0 ? `Start from these pages: ${seedUrls.slice(0, 5).join(', ')}.` : ''

    // Each agent run is slow, so one run per location and never more than three.
    const searches = (locations.length > 0 ? locations : ['']).slice(0, 3)
    const perRun = Math.max(3, Math.ceil(maxResults / searches.length))
    const deadline = Date.now() + MAX_WAIT_MS

    for (const [index, location] of searches.entries()) {
      if (signal.aborted) return
      if (context.emitted() >= maxResults) return

      await context.onProgress(
        4 + Math.round((index / searches.length) * 88),
        location ? `Agent is researching ${location}` : 'Agent is researching your query',
      )

      const created = (await request('/runs', {
        method: 'POST',
        signal,
        body: JSON.stringify({
          task: buildTask(query, location, perRun, seedHint),
          ...(process.env.BROWSER_USE_MODEL ? { model: process.env.BROWSER_USE_MODEL } : {}),
        }),
      })) as { id?: string }

      if (!created.id) throw new ScrapeError('Browser Use did not return a run id.')

      const finished = await waitForRun(created.id, signal, deadline)
      if (!finished) return

      const leads = parseLeads(finished.result ?? '')

      if (!leads) {
        await context.onProgress(
          Math.round(((index + 1) / searches.length) * 88) + 4,
          'The agent replied without usable JSON',
        )
        continue
      }

      const batch: ScrapedLeadInput[] = leads
        // An agent with nothing to report should not create empty records.
        .filter((lead) => lead.email || lead.phone)
        .map((lead) => ({
          full_name: lead.name ?? null,
          company: lead.company ?? null,
          title: lead.title ?? null,
          email: lead.email ?? null,
          phone: lead.phone ?? null,
          website: lead.website ?? null,
          city: lead.city ?? (location || null),
          industry,
          source_url: lead.source_url ?? lead.website ?? null,
          raw: { provider: 'browser-use', run_id: created.id },
        }))

      if (batch.length > 0) await context.emit(batch)
    }
  },
}
