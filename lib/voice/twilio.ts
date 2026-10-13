import twilio from 'twilio'

/**
 * Browser calling through Twilio Voice. The rep's browser connects to Twilio
 * with an access token; Twilio asks /api/voice/twiml what to do, which dials
 * the lead and starts real-time transcription that posts every finished
 * sentence to /api/voice/transcription.
 */

function env() {
  return {
    accountSid: process.env.TWILIO_ACCOUNT_SID ?? '',
    authToken: (process.env.TWILIO_AUTH_TOKEN ?? '').trim(),
    apiKeySid: process.env.TWILIO_API_KEY_SID ?? '',
    apiKeySecret: (process.env.TWILIO_API_KEY_SECRET ?? '').trim(),
    twimlAppSid: process.env.TWILIO_TWIML_APP_SID ?? '',
    callerId: process.env.TWILIO_CALLER_ID ?? '',
  }
}

export function voiceConfigured() {
  const config = env()
  return Object.values(config).every((value) => value.length > 0)
}

export function missingVoiceSettings() {
  const config = env()
  const names: Record<keyof typeof config, string> = {
    accountSid: 'TWILIO_ACCOUNT_SID',
    authToken: 'TWILIO_AUTH_TOKEN',
    apiKeySid: 'TWILIO_API_KEY_SID',
    apiKeySecret: 'TWILIO_API_KEY_SECRET',
    twimlAppSid: 'TWILIO_TWIML_APP_SID',
    callerId: 'TWILIO_CALLER_ID',
  }
  return (Object.keys(config) as (keyof typeof config)[]).filter((key) => !config[key]).map((key) => names[key])
}

/** Short-lived token that lets this rep's browser place outgoing calls. */
export function voiceToken(identity: string) {
  const config = env()
  const { AccessToken } = twilio.jwt
  const token = new AccessToken(config.accountSid, config.apiKeySid, config.apiKeySecret, {
    identity,
    ttl: 60 * 60,
  })
  token.addGrant(new AccessToken.VoiceGrant({ outgoingApplicationSid: config.twimlAppSid }))
  return token.toJwt()
}

export function callerId() {
  return env().callerId
}

/**
 * Public base URL Twilio calls back to. Uses NEXT_PUBLIC_SITE_URL when it is a
 * real https address; otherwise (unset, or left at localhost) the address the
 * request came in on, which on Vercel is the live site.
 */
export function publicBaseUrl(request?: Request) {
  const configured = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/$/, '')
  if (/^https:\/\//.test(configured) && !/localhost|127\.0\.0\.1/.test(configured)) return configured
  return request ? new URL(request.url).origin : configured
}

/**
 * Twilio signs every webhook with the auth token. Behind Vercel the request
 * URL can differ from the one Twilio signed, so the public base URL is tried
 * as well.
 */
export function isTwilioRequest(request: Request, params: Record<string, string>) {
  const signature = request.headers.get('x-twilio-signature')
  const { authToken } = env()
  if (!signature || !authToken) return false

  const url = new URL(request.url)
  const candidates = [request.url, `${publicBaseUrl(request)}${url.pathname}${url.search}`]
  return candidates.some((candidate) => twilio.validateRequest(authToken, signature, candidate, params))
}

export async function formParams(request: Request) {
  const form = await request.formData()
  const params: Record<string, string> = {}
  form.forEach((value, key) => {
    if (typeof value === 'string') params[key] = value
  })
  return params
}

export const { VoiceResponse } = twilio.twiml
