import { redirect } from 'next/navigation'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { MemberRole, Organization, Profile } from '@/lib/supabase/types'

export type Session = {
  userId: string
  email: string
  profile: Profile
  organization: Organization
  role: MemberRole
}

/**
 * Resolves the signed-in user together with their active workspace.
 * `cache` dedupes the queries across a single render pass, so layouts and
 * pages can each call this without extra round trips.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const [{ data: profile }, { data: membership }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    supabase
      .from('organization_members')
      .select('role, organizations(*)')
      .eq('user_id', user.id)
      .order('created_at')
      .limit(1)
      .maybeSingle(),
  ])

  const organization = (membership?.organizations ?? null) as Organization | null

  if (!profile || !organization) return null

  return {
    userId: user.id,
    email: user.email ?? profile.email,
    profile,
    organization,
    role: membership!.role,
  }
})

/** Guards an authenticated page. Redirects to login, or onboarding if the user has no workspace. */
export async function requireSession(): Promise<Session> {
  const session = await getSession()
  if (session) return session

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Signed in but not yet attached to a workspace.
  if (user) redirect('/onboarding')
  redirect('/login')
}

export async function requireAdmin(): Promise<Session> {
  const session = await requireSession()
  if (session.role !== 'owner' && session.role !== 'admin') redirect('/dashboard')
  return session
}

export function canWrite(role: MemberRole) {
  return role === 'owner' || role === 'admin' || role === 'member'
}

export function isAdmin(role: MemberRole) {
  return role === 'owner' || role === 'admin'
}
