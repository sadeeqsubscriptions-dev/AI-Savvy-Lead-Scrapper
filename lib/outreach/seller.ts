import { createAdminClient, hasAdminCredentials } from '@/lib/supabase/admin'
import { COMPANY, senderConfig } from './config'

/**
 * Who is selling and what: everything the AI needs to pitch on a workspace's
 * behalf. The AI Savvy team's workspace uses the built-in AI Savvy profile;
 * every other workspace fills in its own sales profile in Settings.
 */
export type Seller = {
  companyName: string
  website: string | null
  /** One paragraph: what the company does and for whom. */
  positioning: string
  /** Optional extra credibility line (founder, years in business…). */
  credibility: string | null
  services: { name: string; pitch: string }[]
  bookingUrl: string | null
  senderName: string
  senderTitle: string
  postalAddress: string | null
}

export function aiSavvySeller(): Seller {
  const sender = senderConfig()
  return {
    companyName: COMPANY.name,
    website: COMPANY.website,
    positioning: COMPANY.positioning,
    credibility: COMPANY.founder,
    services: COMPANY.services.map((service) => ({ name: service.name, pitch: service.pitch })),
    bookingUrl: COMPANY.bookingUrl,
    senderName: sender.name,
    senderTitle: sender.title,
    postalAddress: sender.postalAddress,
  }
}

/** "Name: what it does" per line → services. */
export function parseServices(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-•*\d.)\s]+/, '').trim())
    .filter(Boolean)
    .slice(0, 12)
    .map((line) => {
      const match = line.match(/^(.{2,80}?)\s*[:—–-]\s+(.+)$/)
      return match ? { name: match[1].trim(), pitch: match[2].trim() } : { name: line.slice(0, 80), pitch: line }
    })
}

/** The workspace's seller, or null when it hasn't filled in its sales profile yet. */
export async function sellerFor(orgId: string): Promise<Seller | null> {
  if (!hasAdminCredentials()) return null
  const admin = createAdminClient()

  const [{ data: profile }, { data: billing, error }] = await Promise.all([
    admin.from('sales_profiles').select('*').eq('org_id', orgId).maybeSingle(),
    admin.from('org_billing').select('plan').eq('org_id', orgId).maybeSingle(),
  ])

  if (profile && profile.company_name && profile.services.trim()) {
    return {
      companyName: profile.company_name,
      website: profile.website,
      positioning: profile.description || `${profile.company_name}.`,
      credibility: null,
      services: parseServices(profile.services),
      bookingUrl: profile.booking_url,
      senderName: profile.sender_name || profile.company_name,
      senderTitle: profile.sender_title || profile.company_name,
      postalAddress: profile.postal_address,
    }
  }
  // Only the team's own workspace pitches AI Savvy; customers pitch what they sell.
  if (!error && billing?.plan === 'internal') return aiSavvySeller()
  return null
}

export const NO_PROFILE_ERROR =
  'Tell the AI what you sell first: fill in your sales profile in Settings (company, services, booking link).'

/** Prompt block describing the seller. */
export function sellerBrief(seller: Seller) {
  return [
    `${seller.companyName}${seller.website ? ` (${seller.website})` : ''}: ${seller.positioning}`,
    seller.credibility ? `Credibility: ${seller.credibility}` : null,
    `Services ${seller.companyName} sells:`,
    ...seller.services.map((service) => `- ${service.name}: ${service.pitch}`),
    seller.bookingUrl
      ? `Goal: book a free 15-minute call. Booking link: ${seller.bookingUrl}`
      : 'Goal: get them to reply and agree to a short call.',
  ]
    .filter(Boolean)
    .join('\n')
}
