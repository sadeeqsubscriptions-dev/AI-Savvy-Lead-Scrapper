import { randomBytes } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { isAdmin, requireSession } from '@/lib/auth'
import { authorizeUrl, isOAuthProvider, oauthConfigured } from '@/lib/outreach/oauth'

const STATE_COOKIE = 'mail_oauth_state'

/** Sends the workspace admin to Google / Microsoft to approve sending from their inbox. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params
  const back = new URL('/setup', request.url)

  if (!isOAuthProvider(provider) || !oauthConfigured(provider)) {
    back.searchParams.set('mail_error', 'That sign-in option is not available yet. Use an app password instead.')
    return NextResponse.redirect(back)
  }
  const session = await requireSession()
  if (!isAdmin(session.role)) {
    back.searchParams.set('mail_error', 'Only the owner or an admin can connect the inbox.')
    return NextResponse.redirect(back)
  }

  const state = randomBytes(24).toString('base64url')
  const hint = request.nextUrl.searchParams.get('email') ?? undefined
  const response = NextResponse.redirect(authorizeUrl(provider, state, hint))
  // Tied to this browser and workspace; checked on the way back.
  response.cookies.set(STATE_COOKIE, `${state}.${session.organization.id}.${provider}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/mail',
    maxAge: 600,
  })
  return response
}
