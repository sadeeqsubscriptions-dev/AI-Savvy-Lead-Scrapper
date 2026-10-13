import { decryptSecret } from '@/lib/security/secrets'
import { createAdminClient, hasAdminCredentials } from '@/lib/supabase/admin'
import { envMailbox, type MailProvider, type Mailbox } from './mailer'

/**
 * The mailbox a workspace sends from and reads replies in:
 *  - the inbox the customer connected in Settings (password stored encrypted);
 *  - otherwise, for the AI Savvy team's own workspace, the env mailbox.
 * Customers without a connected inbox can't send — nothing ever goes out from
 * someone else's address.
 */
export async function mailboxFor(orgId: string): Promise<Mailbox | null> {
  if (!hasAdminCredentials()) return envMailbox()
  const admin = createAdminClient()

  const { data: account } = await admin.from('mail_accounts').select('*').eq('org_id', orgId).maybeSingle()
  if (account) {
    try {
      return {
        provider: account.provider as MailProvider,
        user: account.email,
        pass: decryptSecret(account.password_encrypted),
        smtpHost: account.smtp_host,
        smtpPort: account.smtp_port,
        imapHost: account.imap_host,
        imapPort: account.imap_port,
      }
    } catch {
      return null
    }
  }

  const { data: billing, error } = await admin.from('org_billing').select('plan').eq('org_id', orgId).maybeSingle()
  // Before the billing migration (single-workspace setup) the env mailbox is theirs.
  if (error || billing?.plan === 'internal') return envMailbox()
  return null
}

/** Workspaces that can send right now: connected inboxes plus the team's own. */
export async function orgsWithMailbox(): Promise<string[]> {
  const admin = createAdminClient()
  const [{ data: accounts }, { data: internal, error }] = await Promise.all([
    admin.from('mail_accounts').select('org_id'),
    admin.from('org_billing').select('org_id').eq('plan', 'internal'),
  ])
  const ids = new Set((accounts ?? []).map((row) => row.org_id))
  if (envMailbox()) {
    if (error) {
      // Pre-migration: every workspace (there is only the team's) uses env.
      const { data: orgs } = await admin.from('organizations').select('id')
      for (const org of orgs ?? []) ids.add(org.id)
    } else {
      for (const row of internal ?? []) ids.add(row.org_id)
    }
  }
  return [...ids]
}
