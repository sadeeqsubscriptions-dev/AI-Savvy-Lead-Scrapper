import { timingSafeEqual } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { runOutreachCycle } from '@/lib/outreach/engine'
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
 * Scheduled run: reads replies from the inbox, then sends due follow-ups for
 * every workspace. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`
 * automatically; external schedulers (cron-job.org) must send the same header.
 */
export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!hasAdminCredentials()) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not set' }, { status: 500 })
  }

  const result = await runOutreachCycle(createAdminClient())
  return NextResponse.json(result)
}
