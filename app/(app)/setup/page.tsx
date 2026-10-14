import type { Metadata } from 'next'
import Link from 'next/link'
import { isAdmin, requireSession } from '@/lib/auth'
import { getEntitlements } from '@/lib/billing/entitlements'
import { oauthConfigured } from '@/lib/outreach/oauth'
import { createAdminClient, hasAdminCredentials } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { MailboxForm, SalesProfileForm, type ConnectedMailbox } from '@/components/setup/setup-forms'

export const metadata: Metadata = { title: 'Sales setup' }

/** The two things a new workspace fills in before the AI can sell for it. */
export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ mail_connected?: string; mail_error?: string }>
}) {
  const params = await searchParams
  const session = await requireSession()
  const orgId = session.organization.id
  const supabase = await createClient()

  const [{ data: profile }, account, entitlements] = await Promise.all([
    supabase.from('sales_profiles').select('*').eq('org_id', orgId).maybeSingle(),
    hasAdminCredentials()
      ? createAdminClient()
          .from('mail_accounts')
          .select('email, provider, verified_at')
          .eq('org_id', orgId)
          .maybeSingle()
          .then(({ data }) => data)
      : Promise.resolve(null),
    getEntitlements(orgId),
  ])

  const mailbox: ConnectedMailbox = account
    ? { email: account.email, provider: account.provider, verifiedAt: account.verified_at }
    : null
  const internal = entitlements.plan.id === 'internal'
  const canEdit = isAdmin(session.role)

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Sales setup</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tell the AI what you sell and connect the inbox it sends from. Both take about two minutes.
        </p>
        {internal ? (
          <p className="mt-3 rounded-lg border border-border bg-secondary/40 p-3 text-xs text-muted-foreground">
            This is the AI Savvy team workspace: if nothing is filled in here it pitches AI Savvy and sends from the
            company inbox.
          </p>
        ) : !entitlements.plan.features.ai ? (
          <p className="mt-3 rounded-lg border border-border bg-secondary/40 p-3 text-xs text-muted-foreground">
            On the Free plan you can send emails you write yourself from your inbox. AI research and AI-written emails
            come with a{' '}
            <Link href="/billing" className="font-medium text-primary hover:underline">
              paid plan
            </Link>
            .
          </p>
        ) : null}
      </div>
      <SalesProfileForm profile={profile} canEdit={canEdit} fallback={internal} />
      <MailboxForm
        mailbox={mailbox}
        canEdit={canEdit}
        oauth={{ google: oauthConfigured('google'), microsoft: oauthConfigured('microsoft') }}
        notice={{ connected: params.mail_connected, error: params.mail_error }}
        fallback={internal}
      />
    </div>
  )
}
