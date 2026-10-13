import { timingSafeEqual } from 'node:crypto'
import { NextResponse, after, type NextRequest } from 'next/server'
import { runAllWorkspaces } from '@/lib/outreach/engine'
import { createAdminClient, hasAdminCredentials } from '@/lib/supabase/admin'

// IMAP + SMTP need raw TCP sockets, and each follow-up waits on Claude.
export const runtime = 'nodejs'
export const maxDuration = 300

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const header = request.headers.get('authorization') ?? ''
  const expected = Buffer.from(`Bearer ${secret}`)
  const given = Buffer.from(header)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

/**
 * Scheduled run, every ~15 minutes: reads replies from the inbox, sends due
 * follow-ups, then sends queued first emails to leads whose local time is a
 * weekday 9-4 (up to the daily target). Callers send
 * `Authorization: Bearer $CRON_SECRET` (Vercel Cron does it automatically;
 * the Supabase pg_cron job in supabase/setup/outreach-cron.sql does too).
 *
 * Responds at once and works in `after()`, so a scheduler with a short
 * HTTP timeout never cuts a send off half-way.
 */
export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!hasAdminCredentials()) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not set' }, { status: 500 })
  }

  // Leave headroom under maxDuration (300s) for the send in flight to finish.
  const deadline = Date.now() + 200_000
  after(async () => {
    // Every workspace with a connected inbox: its replies, follow-ups and
    // new leads, each with its own inbox, sales profile and plan limits.
    const results = await runAllWorkspaces(createAdminClient(), deadline)
    console.log('[outreach-cron]', JSON.stringify(results))
  })
  return NextResponse.json({ started: true }, { status: 202 })
}
