'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { canWrite, requireSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { SEED_URL_PROVIDERS, getProvider, isProviderReady } from '@/lib/scraper/registry'
import { collectSeeds } from '@/lib/scraper/seeds'
import { failure, optionalText, type ActionState } from '@/lib/actions/state'

const jobSchema = z.object({
  name: z.string().trim().max(160).optional(),
  provider: z.string().trim().min(1),
  query: z.string().trim().min(2, 'Describe what you are looking for').max(200),
  locations: z
    .string()
    .trim()
    .transform((value) =>
      value
        .split(/[,\n]/)
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
        .slice(0, 20),
    ),
  seed_urls: z.string().trim().default(''),
  industry: optionalText,
  min_score: z.coerce.number().int().min(0).max(100).default(0),
  max_results: z.coerce.number().int().min(1).max(1000).default(100),
  auto_import: z.coerce.boolean().default(true),
})

export type CreateJobState = ActionState & { jobId?: string }

export async function createScrapeJob(
  _prev: CreateJobState,
  formData: FormData,
): Promise<CreateJobState> {
  const session = await requireSession()
  if (!canWrite(session.role)) return { error: 'Your role cannot start scrapes.' }

  const parsed = jobSchema.safeParse({
    name: formData.get('name') ?? undefined,
    provider: formData.get('provider') ?? 'sample',
    query: formData.get('query') ?? '',
    locations: formData.get('locations') ?? '',
    seed_urls: formData.get('seed_urls') ?? '',
    industry: formData.get('industry') ?? '',
    min_score: formData.get('min_score') ?? 0,
    max_results: formData.get('max_results') ?? 100,
    auto_import: formData.get('auto_import') === 'on',
  })

  if (!parsed.success) return failure(parsed.error)

  const provider = getProvider(parsed.data.provider)
  if (!provider) return { error: 'Pick a valid data source.' }

  if (!isProviderReady(provider)) {
    return {
      error: provider.requiresEnv
        ? `${provider.label} needs ${provider.requiresEnv} in your environment.`
        : `${provider.label} is not configured yet.`,
    }
  }

  const { name, locations, seed_urls: seedInput, ...rest } = parsed.data

  const seedUrls = collectSeeds({ seed_urls: seedInput }, '')

  if (SEED_URL_PROVIDERS.has(provider.id) && seedUrls.length === 0) {
    return {
      error: `${provider.label} crawls pages you supply rather than searching the web. Add at least one seed URL.`,
      fieldErrors: { seed_urls: 'Add at least one website or directory URL.' },
    }
  }

  const label =
    name && name.length > 0
      ? name
      : `${parsed.data.query}${locations.length > 0 ? ` — ${locations[0]}` : ''}`

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('scrape_jobs')
    .insert({
      ...rest,
      locations,
      config: seedUrls.length > 0 ? { seed_urls: seedUrls } : {},
      name: label.slice(0, 160),
      org_id: session.organization.id,
      created_by: session.userId,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  revalidatePath('/scraper')
  return { ok: true, jobId: data.id, message: 'Scrape queued.' }
}

export async function importJobRecords(jobId: string, recordIds?: string[]): Promise<ActionState> {
  const session = await requireSession()
  if (!canWrite(session.role)) return { error: 'Your role cannot import leads.' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('import_scraped_records', {
    target_job: jobId,
    ...(recordIds && recordIds.length > 0 ? { record_ids: recordIds } : {}),
  })

  if (error) return { error: error.message }

  revalidatePath('/scraper')
  revalidatePath('/crm')
  revalidatePath('/dashboard')

  const count = typeof data === 'number' ? data : 0
  return {
    ok: true,
    message:
      count === 0
        ? 'Nothing new to import — those records are already in your CRM.'
        : `Imported ${count} lead${count === 1 ? '' : 's'}.`,
  }
}

export async function rejectRecords(recordIds: string[]): Promise<ActionState> {
  const session = await requireSession()
  if (!canWrite(session.role)) return { error: 'Your role cannot change results.' }
  if (recordIds.length === 0) return { error: 'Nothing selected.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('scraped_records')
    .update({ status: 'rejected' })
    .in('id', recordIds)
    .eq('org_id', session.organization.id)

  if (error) return { error: error.message }

  revalidatePath('/scraper')
  return { ok: true, message: `Discarded ${recordIds.length} result${recordIds.length === 1 ? '' : 's'}.` }
}

export async function cancelScrapeJob(jobId: string): Promise<ActionState> {
  const session = await requireSession()
  if (!canWrite(session.role)) return { error: 'Your role cannot cancel scrapes.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('scrape_jobs')
    .update({ status: 'cancelled', completed_at: new Date().toISOString() })
    .eq('id', jobId)
    .eq('org_id', session.organization.id)
    .in('status', ['queued', 'running'])

  if (error) return { error: error.message }

  revalidatePath('/scraper')
  return { ok: true, message: 'Scrape cancelled.' }
}

export async function deleteScrapeJob(jobId: string): Promise<ActionState> {
  const session = await requireSession()
  if (!canWrite(session.role)) return { error: 'Your role cannot delete scrapes.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('scrape_jobs')
    .delete()
    .eq('id', jobId)
    .eq('org_id', session.organization.id)

  if (error) return { error: error.message }

  revalidatePath('/scraper')
  return { ok: true, message: 'Scrape deleted.' }
}
