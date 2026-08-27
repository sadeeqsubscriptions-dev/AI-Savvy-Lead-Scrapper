import { AppShell } from '@/components/app-shell'
import { requireSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await requireSession()
  const supabase = await createClient()

  const { count } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', session.organization.id)

  return (
    <AppShell
      user={{
        name: session.profile.full_name ?? session.email,
        email: session.email,
        role: session.role,
      }}
      organization={{ id: session.organization.id, name: session.organization.name }}
      usage={{ used: count ?? 0, quota: session.organization.lead_quota }}
    >
      {children}
    </AppShell>
  )
}
