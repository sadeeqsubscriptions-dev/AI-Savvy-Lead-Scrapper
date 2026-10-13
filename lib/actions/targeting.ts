'use server'

import { revalidatePath } from 'next/cache'
import { generateBrief } from '@/lib/ai/brief'
import { isAdmin, requireSession } from '@/lib/auth'
import { requireFeature } from '@/lib/billing/entitlements'
import { chargeAiLead, queueOutreach } from '@/lib/outreach/engine'
import { NO_PROFILE_ERROR, sellerFor } from '@/lib/outreach/seller'
import { createClient } from '@/lib/supabase/server'
import type { LeadAiBrief } from '@/lib/supabase/types'

type BriefResult =
  | { ok: true; brief: LeadAiBrief; scheduledFor: string | null; queueNote: string | null }
  | { ok: false; error: string }

export async function generateLeadBrief(leadId: string): Promise<BriefResult> {
  const session = await requireSession()

  const supabase = await createClient()
  const { data: lead } = await supabase
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .eq('org_id', session.organization.id)
    .maybeSingle()

  if (!lead) return { ok: false, error: 'Lead not found.' }
  if (lead.owner_id !== session.userId && !isAdmin(session.role)) {
    return { ok: false, error: 'This lead is not assigned to you.' }
  }

  const allowed = await requireFeature(session.organization.id, 'ai')
  if (!allowed.ok) return allowed
  const seller = await sellerFor(session.organization.id)
  if (!seller) return { ok: false, error: NO_PROFILE_ERROR }
  // Research counts as this lead's one AI-worked unit (its emails come free after).
  const charged = await chargeAiLead(supabase, lead)
  if (!charged.ok) return charged

  const result = await generateBrief(lead, session.userId, seller)
  if (!result.ok) return result

  await supabase
    .from('leads')
    .update({ ai_brief: result.brief, ai_brief_generated_at: new Date().toISOString() })
    .eq('id', leadId)
    .eq('org_id', session.organization.id)

  // Researched = ready to email: queue the first email for the lead's next
  // business-hours window (weekdays, their time zone, 25 new per day).
  let scheduledFor: string | null = null
  let queueNote: string | null = null
  if (lead.email && allowed.entitlements.plan.features.autopilot) {
    const queued = await queueOutreach(supabase, { orgId: session.organization.id, leadId, by: session.userId })
    if (queued.ok) scheduledFor = queued.label
    else queueNote = queued.error
  }

  revalidatePath('/targeting')
  revalidatePath('/crm')
  revalidatePath('/outreach')
  return { ok: true, brief: result.brief, scheduledFor, queueNote }
}
