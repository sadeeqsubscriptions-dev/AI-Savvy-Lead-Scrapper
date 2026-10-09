import type { Json, LeadAiBrief } from '@/lib/supabase/types'

/**
 * The lead's brief if it's in the current (v2) format, else null. Kept apart
 * from brief.ts so client components can use it without bundling the SDK.
 */
export function currentBrief(value: LeadAiBrief | Json | null | undefined): LeadAiBrief | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const brief = value as Partial<LeadAiBrief>
  return brief.version === 2 && brief.offer && Array.isArray(brief.pain_points) ? (brief as LeadAiBrief) : null
}
