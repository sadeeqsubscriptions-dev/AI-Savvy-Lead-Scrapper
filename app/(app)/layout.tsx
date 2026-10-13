import { AppShell } from '@/components/app-shell'
import { requireSession } from '@/lib/auth'
import { getEntitlements } from '@/lib/billing/entitlements'
import { isUnlimited } from '@/lib/billing/plans'
import { createClient } from '@/lib/supabase/server'

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await requireSession()
  const supabase = await createClient()

  const [{ count }, entitlements] = await Promise.all([
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('org_id', session.organization.id),
    getEntitlements(session.organization.id),
  ])
  const { plan, usage, bonus, remaining } = entitlements
  const paid = plan.price > 0

  return (
    <AppShell
      user={{
        id: session.userId,
        name: session.profile.full_name ?? session.email,
        email: session.email,
        role: session.role,
      }}
      organization={{ id: session.organization.id, name: session.organization.name }}
      usage={{
        plan: plan.name,
        paid,
        unlimited: isUnlimited(plan.limits.leadsFound),
        aiLeft: remaining.aiLeads,
        // Paid plans count leads found this month; Free counts leads stored.
        leadsUsed: paid ? usage.leadsFound : (count ?? 0),
        leadsCap: paid ? plan.limits.leadsFound + bonus.leadsFound : plan.limits.storedLeads,
      }}
    >
      {children}
    </AppShell>
  )
}
