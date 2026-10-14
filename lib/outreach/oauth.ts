import type { Mailbox } from './mailer'

/**
 * "Continue with Google / Microsoft" for connecting a sending inbox. The
 * customer signs in on the provider's own page; we keep only a refresh token
 * (encrypted, in mail_accounts.password_encrypted) and log in to SMTP/IMAP
 * with short-lived access tokens (XOAUTH2). No app password needed.
 */

export type OAuthProvider = 'google' | 'microsoft'

type ProviderConfig = {
  authorizeUrl: string
  tokenUrl: string
  scope: string
  clientId?: string
  clientSecret?: string
  extraAuthParams: Record<string, string>
}

function config(provider: OAuthProvider): ProviderConfig {
  if (provider === 'google') {
    return {
      authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      // Full mail scope is the one Google allows for IMAP + SMTP.
      scope: 'openid email https://mail.google.com/',
      clientId: process.env.GOOGLE_OAUTH_CLIENT_ID?.trim(),
      clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim(),
      extraAuthParams: { access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' },
    }
  }
  return {
    authorizeUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scope:
      'openid email offline_access https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/SMTP.Send',
    clientId: process.env.MICROSOFT_OAUTH_CLIENT_ID?.trim(),
    clientSecret: process.env.MICROSOFT_OAUTH_CLIENT_SECRET?.trim(),
    extraAuthParams: { prompt: 'select_account' },
  }
}

export function isOAuthProvider(value: string): value is OAuthProvider {
  return value === 'google' || value === 'microsoft'
}

export function oauthConfigured(provider: OAuthProvider) {
  const { clientId, clientSecret } = config(provider)
  return Boolean(clientId && clientSecret)
}

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
}

export function redirectUri(provider: OAuthProvider) {
  return `${siteUrl()}/api/mail/callback/${provider}`
}

export function authorizeUrl(provider: OAuthProvider, state: string, loginHint?: string) {
  const cfg = config(provider)
  const params = new URLSearchParams({
    client_id: cfg.clientId ?? '',
    redirect_uri: redirectUri(provider),
    response_type: 'code',
    scope: cfg.scope,
    state,
    ...cfg.extraAuthParams,
    ...(loginHint ? { login_hint: loginHint } : {}),
  })
  return `${cfg.authorizeUrl}?${params}`
}

type TokenResponse = {
  access_token: string
  refresh_token?: string
  expires_in?: number
  id_token?: string
  error?: string
  error_description?: string
}

async function tokenRequest(provider: OAuthProvider, body: Record<string, string>): Promise<TokenResponse> {
  const cfg = config(provider)
  const response = await fetch(cfg.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cfg.clientId ?? '', client_secret: cfg.clientSecret ?? '', ...body }),
    cache: 'no-store',
  })
  const json = (await response.json().catch(() => ({}))) as TokenResponse
  if (!response.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || `Token request failed (${response.status})`)
  }
  return json
}

/** The email address in the ID token we just received straight from the provider. */
function emailFromIdToken(idToken: string | undefined) {
  if (!idToken) return null
  try {
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8')) as {
      email?: string
      preferred_username?: string
    }
    const email = payload.email || payload.preferred_username
    return email && email.includes('@') ? email.toLowerCase() : null
  } catch {
    return null
  }
}

export async function exchangeCode(provider: OAuthProvider, code: string) {
  const tokens = await tokenRequest(provider, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(provider),
  })
  const email = emailFromIdToken(tokens.id_token)
  if (!email) throw new Error('The provider did not share the email address.')
  if (!tokens.refresh_token) throw new Error('The provider did not grant offline access. Please try again.')
  return { email, accessToken: tokens.access_token, refreshToken: tokens.refresh_token }
}

/** Fresh access token; Microsoft may also hand back a new refresh token. */
export async function refreshAccessToken(provider: OAuthProvider, refreshToken: string) {
  const tokens = await tokenRequest(provider, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    ...(provider === 'microsoft' ? { scope: config(provider).scope } : {}),
  })
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? null,
    expiresAt: Date.now() + Math.max(60, (tokens.expires_in ?? 3600) - 120) * 1000,
  }
}

const CONSUMER_MICROSOFT = /@(outlook|hotmail|live|msn)\.[a-z.]+$/i

/** SMTP/IMAP servers for an OAuth-connected inbox. */
export function oauthHosts(provider: OAuthProvider, email: string): Omit<Mailbox, 'user' | 'pass' | 'accessToken'> {
  if (provider === 'google') {
    return { provider: 'gmail', smtpHost: 'smtp.gmail.com', smtpPort: 465, imapHost: 'imap.gmail.com', imapPort: 993 }
  }
  return {
    provider: 'outlook',
    smtpHost: CONSUMER_MICROSOFT.test(email) ? 'smtp-mail.outlook.com' : 'smtp.office365.com',
    smtpPort: 587,
    imapHost: 'outlook.office365.com',
    imapPort: 993,
  }
}

/** Stored form of an OAuth connection (encrypted as a whole before saving). */
export type StoredOAuth = { kind: 'oauth'; provider: OAuthProvider; refreshToken: string }

export function parseStoredSecret(secret: string): StoredOAuth | null {
  if (!secret.startsWith('{')) return null
  try {
    const value = JSON.parse(secret) as StoredOAuth
    return value.kind === 'oauth' && isOAuthProvider(value.provider) && value.refreshToken ? value : null
  } catch {
    return null
  }
}
