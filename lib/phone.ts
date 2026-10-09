/**
 * Scraped phone numbers come in every shape ("(305) 555-0100", "18504142000)").
 * Twilio needs E.164 ("+13055550100"). Numbers without a country code are
 * assumed to be US/Canada, which is where the scraper is pointed.
 */
export function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length === 0) return null

  let candidate: string
  if (trimmed.startsWith('+')) candidate = `+${digits}`
  else if (digits.length === 10) candidate = `+1${digits}`
  else if (digits.length === 11 && digits.startsWith('1')) candidate = `+${digits}`
  else candidate = `+${digits}`

  return /^\+[1-9]\d{7,14}$/.test(candidate) ? candidate : null
}

export function formatPhone(e164: string) {
  const us = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/)
  return us ? `+1 (${us[1]}) ${us[2]}-${us[3]}` : e164
}
