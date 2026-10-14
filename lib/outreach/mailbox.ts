import { decryptSecret, encryptSecret } from '@/lib/security/secrets'
import { createAdminClient, hasAdminCredentials } from '@/lib/supabase/admin'
import { envMailbox, type MailProvider, type Mailbox } from './mailer'
import { parseStoredSecret, refreshAccessToken } from './oauth'

// Access tokens live about an hour; reuse them across sends in one instance.
const tokenCache = new Map<string, { accessToken: string; expiresAt: number }>()

/**
 * The mailbox a workspace sends from and reads replies in:
 *  - the inbox the customer connected on Sales setup — either with Google /
 *    Microsoft sign-in (refresh token stored encrypted) or an app password
 *    (stored encrypted);
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
      const secret = decryptSecret(account.password_encrypted)
      const mailbox: Mailbox = {
        provider: account.provider as MailProvider,
        user: account.email,
        pass: '',
        smtpHost: account.smtp_host,
        smtpPort: account.smtp_port,
        imapHost: account.imap_host,
        imapPort: account.imap_port,
      }
      const oauth = parseStoredSecret(secret)
      if (!oauth) return { ...mailbox, pass: secret }

      const cached = tokenCache.get(orgId)
      if (cached && cached.expiresAt > Date.now()) return { ...mailbox, accessToken: cached.accessToken }

      const fresh = await refreshAccessToken(oauth.provider, oauth.refreshToken)
      tokenCache.set(orgId, { accessToken: fresh.accessToken, expiresAt: fresh.expiresAt })
      if (fresh.refreshToken && fresh.refreshToken !== oauth.refreshToken) {
        // Microsoft rotates refresh tokens: keep the newest one.
        await admin
          .from('mail_accounts')
          .update({
            password_encrypted: encryptSecret(JSON.stringify({ ...oauth, refreshToken: fresh.refreshToken })),
            updated_at: new Date().toISOString(),
          })
          .eq('org_id', orgId)
      }
      return { ...mailbox, accessToken: fresh.accessToken }
    } catch (error) {
      console.error('[mailbox] could not open the connected inbox', orgId, error)
      return null
    }
  }

  const { data: billing, error } = await admin.from('org_billing').select('plan').eq('org_id', orgId).maybeSingle()
  // Before the billing migration (single-workspace setup) the env mailbox is theirs.
  if (error || billing?.plan === 'internal') return envMailbox()
  return null
}

/** Forget a cached token after the inbox is changed or disconnected. */
export function forgetMailboxToken(orgId: string) {
  tokenCache.delete(orgId)
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
