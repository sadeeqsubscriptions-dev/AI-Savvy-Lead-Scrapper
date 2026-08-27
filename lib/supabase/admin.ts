import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'

/**
 * Service-role client. Bypasses RLS, so it must only ever be constructed in
 * trusted server code (scraper worker, webhooks) — never in a route that
 * echoes data straight back to an unauthenticated caller.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!key) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set. Add it to .env.local to run background jobs.',
    )
  }

  return createSupabaseClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export function hasAdminCredentials() {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
}
