import type { Metadata } from 'next'
import { SettingsWorkspace } from '@/components/settings/settings-workspace'
import { isAdmin, requireSession } from '@/lib/auth'
import { listProviders } from '@/lib/scraper/registry'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Settings' }

export default async function SettingsPage() {
  const session = await requireSession()
  const supabase = await createClient()

  const [{ count: leadCount }, { count: memberCount }] = await Promise.all([
    supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', session.organization.id),
    supabase
      .from('organization_members')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', session.organization.id),
  ])

  return (
    <SettingsWorkspace
      profile={session.profile}
      organization={session.organization}
      role={session.role}
      email={session.email}
      leadCount={leadCount ?? 0}
      memberCount={memberCount ?? 0}
      providers={listProviders()}
      isAdmin={isAdmin(session.role)}
    />
  )
}
