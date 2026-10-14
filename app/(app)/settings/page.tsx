import type { Metadata } from 'next'
import { SettingsWorkspace, type WorkspaceIntegrations } from '@/components/settings/settings-workspace'
import { isAdmin, requireSession } from '@/lib/auth'
import { getEntitlements } from '@/lib/billing/entitlements'
import { envMailbox } from '@/lib/outreach/mailer'
import { oauthConfigured } from '@/lib/outreach/oauth'
import { listProviders } from '@/lib/scraper/registry'
import { createAdminClient, hasAdminCredentials } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { callerIdFor } from '@/lib/voice/numbers'

export const metadata: Metadata = { title: 'Settings' }

export default async function SettingsPage() {
  const session = await requireSession()
  const supabase = await createClient()
  const orgId = session.organization.id

  const [{ count: leadCount }, { count: memberCount }, entitlements, account, profile, phoneNumber] = await Promise.all([
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
    supabase.from('organization_members').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
    getEntitlements(orgId),
    hasAdminCredentials()
      ? createAdminClient()
          .from('mail_accounts')
          .select('email, provider, verified_at')
          .eq('org_id', orgId)
          .maybeSingle()
          .then(({ data }) => data)
      : Promise.resolve(null),
    supabase.from('sales_profiles').select('company_name, services').eq('org_id', orgId).maybeSingle(),
    callerIdFor(orgId),
  ])

  const internal = entitlements.plan.id === 'internal'
  const integrations: WorkspaceIntegrations = {
    mailbox: account ? { email: account.email, provider: account.provider, verifiedAt: account.verified_at } : null,
    // The team workspace falls back to the company inbox when none is connected.
    fallbackSender: internal ? (envMailbox()?.user ?? null) : null,
    oauth: { google: oauthConfigured('google'), microsoft: oauthConfigured('microsoft') },
    phoneNumber,
    planName: entitlements.plan.name,
    callingIncluded: entitlements.plan.features.calling,
    salesProfile: profile.data?.company_name
      ? {
          companyName: profile.data.company_name,
          services: profile.data.services.split(/\r?\n/).filter((line) => line.trim()).length,
        }
      : null,
    internal,
  }

  return (
    <SettingsWorkspace
      profile={session.profile}
      organization={{
        ...session.organization,
        plan: entitlements.plan.name,
        lead_quota: entitlements.plan.limits.storedLeads,
      }}
      role={session.role}
      email={session.email}
      leadCount={leadCount ?? 0}
      memberCount={memberCount ?? 0}
      // Data-source wiring is operator detail: only the team workspace sees it.
      providers={internal ? listProviders() : []}
      integrations={integrations}
      isAdmin={isAdmin(session.role)}
    />
  )
}
