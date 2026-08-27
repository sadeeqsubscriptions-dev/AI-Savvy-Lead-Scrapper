import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runScrapeJob } from '@/lib/scraper/runner'

// Scrapes are long-running; Node runtime keeps provider libraries available.
export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * Executes a queued scrape job. Called by the scraper UI right after the job
 * row is created, then the client polls the row for progress. Runs under the
 * caller's session so RLS still scopes every write to their workspace.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  let jobId: string

  try {
    const body = (await request.json()) as { jobId?: unknown }
    if (typeof body.jobId !== 'string' || body.jobId.length === 0) {
      return NextResponse.json({ error: 'jobId is required' }, { status: 400 })
    }
    jobId = body.jobId
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body' }, { status: 400 })
  }

  try {
    const result = await runScrapeJob(supabase, jobId)
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The scrape failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
