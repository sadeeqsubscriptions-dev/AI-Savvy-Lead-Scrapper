import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

/**
 * Runs on every matched request to refresh the Supabase session cookie and
 * gate private routes. Replaces the deprecated `middleware.ts` convention.
 */
export default async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: [
    // Everything except Next.js internals and static asset requests.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
