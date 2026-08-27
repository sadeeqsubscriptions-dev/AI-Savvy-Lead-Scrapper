import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, ScrapeJob } from '@/lib/supabase/types'
import { getProvider, isProviderReady } from './registry'
import { dedupeKey, normalizeLead } from './score'
import { ScrapeError, type ScrapeContext, type ScrapedLeadInput } from './types'

type Client = SupabaseClient<Database>

export type RunResult = {
  found: number
  imported: number
  status: ScrapeJob['status']
  error?: string
}

/** Hard ceiling so a runaway provider can't hold a serverless invocation open. */
const MAX_RUN_MS = 4 * 60 * 1000

export async function runScrapeJob(supabase: Client, jobId: string): Promise<RunResult> {
  const { data: job, error: loadError } = await supabase
    .from('scrape_jobs')
    .select('*')
    .eq('id', jobId)
    .maybeSingle()

  if (loadError || !job) {
    throw new ScrapeError('That scrape job could not be found.')
  }

  if (job.status === 'running') {
    return { found: job.total_found, imported: job.total_imported, status: 'running' }
  }

  if (job.status === 'completed') {
    return { found: job.total_found, imported: job.total_imported, status: 'completed' }
  }

  const provider = getProvider(job.provider)

  if (!provider) {
    await fail(supabase, jobId, `Unknown scrape provider "${job.provider}".`)
    return { found: 0, imported: 0, status: 'failed', error: 'Unknown provider' }
  }

  if (!isProviderReady(provider)) {
    const reason = provider.requiresEnv
      ? `${provider.label} needs ${provider.requiresEnv} to be set.`
      : `${provider.label} is not configured yet.`
    await fail(supabase, jobId, reason)
    return { found: 0, imported: 0, status: 'failed', error: reason }
  }

  await supabase
    .from('scrape_jobs')
    .update({ status: 'running', progress: 4, started_at: new Date().toISOString(), error: null })
    .eq('id', jobId)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), MAX_RUN_MS)

  const seen = new Set<string>()
  let emitted = 0

  const emit: ScrapeContext['emit'] = async (leads: ScrapedLeadInput[]) => {
    const remaining = job.max_results - emitted
    if (remaining <= 0) return 0

    const rows: Database['public']['Tables']['scraped_records']['Insert'][] = []

    for (const lead of leads) {
      if (rows.length >= remaining) break

      const normalized = normalizeLead(lead)
      if (normalized.score < job.min_score) continue

      // Something identifiable is required, or the record is unusable.
      if (!normalized.company && !normalized.full_name && !normalized.email) continue

      const key = dedupeKey(normalized)
      if (seen.has(key)) continue
      seen.add(key)

      rows.push({
        ...normalized,
        raw: normalized.raw as Database['public']['Tables']['scraped_records']['Insert']['raw'],
        org_id: job.org_id,
        job_id: job.id,
      })
    }

    if (rows.length === 0) return 0

    const { error } = await supabase.from('scraped_records').insert(rows)
    if (error) throw new ScrapeError(`Could not save results: ${error.message}`)

    emitted += rows.length
    await supabase.from('scrape_jobs').update({ total_found: emitted }).eq('id', jobId)

    return rows.length
  }

  const onProgress: ScrapeContext['onProgress'] = async (progress, note) => {
    await supabase
      .from('scrape_jobs')
      .update({
        progress: Math.max(4, Math.min(96, Math.round(progress))),
        ...(note ? { config: { ...(job.config as object), note } } : {}),
      })
      .eq('id', jobId)
  }

  try {
    await provider.run({
      query: job.query,
      locations: job.locations,
      industry: job.industry,
      maxResults: job.max_results,
      minScore: job.min_score,
      config: (job.config ?? {}) as Record<string, unknown>,
      signal: controller.signal,
      onProgress,
      emit,
      emitted: () => emitted,
    })
  } catch (error) {
    clearTimeout(timeout)

    const message =
      controller.signal.aborted
        ? 'The scrape timed out before it finished.'
        : error instanceof Error
          ? error.message
          : 'The scrape failed for an unknown reason.'

    await fail(supabase, jobId, message)
    return { found: emitted, imported: 0, status: 'failed', error: message }
  }

  clearTimeout(timeout)

  let imported = 0

  if (job.auto_import && emitted > 0) {
    await supabase.from('scrape_jobs').update({ progress: 98 }).eq('id', jobId)

    const { data, error } = await supabase.rpc('import_scraped_records', { target_job: jobId })
    if (!error && typeof data === 'number') imported = data
  }

  await supabase
    .from('scrape_jobs')
    .update({
      status: 'completed',
      progress: 100,
      total_found: emitted,
      completed_at: new Date().toISOString(),
    })
    .eq('id', jobId)

  return { found: emitted, imported, status: 'completed' }
}

async function fail(supabase: Client, jobId: string, message: string) {
  await supabase
    .from('scrape_jobs')
    .update({
      status: 'failed',
      error: message.slice(0, 500),
      completed_at: new Date().toISOString(),
    })
    .eq('id', jobId)
}
