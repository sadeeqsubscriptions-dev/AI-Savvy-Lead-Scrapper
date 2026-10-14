import { timingSafeEqual } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { NextResponse, type NextRequest } from 'next/server'
import { isAdmin, requireSession } from '@/lib/auth'
import { forgetMailboxToken } from '@/lib/outreach/mailbox'
import { testMailConnection } from '@/lib/outreach/mailer'
import { exchangeCode, isOAuthProvider, oauthHosts, type StoredOAuth } from '@/lib/outreach/oauth'
import { encryptSecret } from '@/lib/security/secrets'
import { createAdminClient } from '@/lib/supabase/admin'

const STATE_COOKIE = 'mail_oauth_state'

function same(a: string, b: string) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/** Google / Microsoft send the admin back here after they approve access. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params
  // Back to the page the sign-in started from (Sales setup or Settings → Integrations).
  const from = (request.cookies.get(STATE_COOKIE)?.value ?? '').split('.')[3]
  const back = new URL(from === 'integrations' ? '/settings?tab=integrations' : '/setup', request.url)
  const fail = (message: string) => {
    back.searchParams.set('mail_error', message)
    const response = NextResponse.redirect(back)
    response.cookies.delete({ name: STATE_COOKIE, path: '/api/mail' })
    return response
  }

  if (!isOAuthProvider(provider)) return fail('Unknown sign-in provider.')
  const query = request.nextUrl.searchParams
  if (query.get('error')) {
    return fail(
      query.get('error') === 'access_denied'
        ? 'Access was not granted, so the inbox was not connected.'
        : (query.get('error_description') ?? 'Sign-in was cancelled.'),
    )
  }

  const session = await requireSession()
  if (!isAdmin(session.role)) return fail('Only the owner or an admin can connect the inbox.')

  const [state, orgId, expectedProvider] = (request.cookies.get(STATE_COOKIE)?.value ?? '').split('.')
  const returned = query.get('state') ?? ''
  if (!state || !returned || !same(state, returned) || orgId !== session.organization.id || expectedProvider !== provider) {
    return fail('The sign-in link expired. Please try again.')
  }
  const code = query.get('code')
  if (!code) return fail('The provider did not return a sign-in code.')

  let connected
  try {
    connected = await exchangeCode(provider, code)
  } catch (error) {
    return fail(`Could not finish signing in: ${error instanceof Error ? error.message : 'unknown error'}`)
  }

  const hosts = oauthHosts(provider, connected.email)
  const check = await testMailConnection({ ...hosts, user: connected.email, pass: '', accessToken: connected.accessToken })
  const problems = [check.smtp, check.imap].filter(Boolean)
  if (problems.length > 0) {
    return fail(
      provider === 'microsoft'
        ? `Signed in, but the mailbox refused the connection. Ask your Microsoft 365 admin to allow "Authenticated SMTP" and IMAP for ${connected.email}. (${problems.join(' ')})`
        : `Signed in, but the mailbox refused the connection. Make sure IMAP is on in Gmail settings. (${problems.join(' ')})`,
    )
  }

  const stored: StoredOAuth = { kind: 'oauth', provider, refreshToken: connected.refreshToken }
  const { error } = await createAdminClient()
    .from('mail_accounts')
    .upsert(
      {
        org_id: session.organization.id,
        email: connected.email,
        provider: hosts.provider,
        smtp_host: hosts.smtpHost,
        smtp_port: hosts.smtpPort,
        imap_host: hosts.imapHost,
        imap_port: hosts.imapPort,
        password_encrypted: encryptSecret(JSON.stringify(stored)),
        verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'org_id' },
    )
  if (error) return fail(error.message)

  forgetMailboxToken(session.organization.id)
  revalidatePath('/setup')
  revalidatePath('/outreach')
  back.searchParams.set('mail_connected', connected.email)
  const response = NextResponse.redirect(back)
  response.cookies.delete({ name: STATE_COOKIE, path: '/api/mail' })
  return response
}
