'use server'

import { revalidatePath } from 'next/cache'
import { generateBrief } from '@/lib/ai/brief'
import { isAdmin, requireSession } from '@/lib/auth'
import { queueOutreach } from '@/lib/outreach/engine'
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

  const result = await generateBrief(lead, session.userId)
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
  if (lead.email) {
    const queued = await queueOutreach(supabase, { orgId: session.organization.id, leadId, by: session.userId })
    if (queued.ok) scheduledFor = queued.label
    else queueNote = queued.error
  }

  revalidatePath('/targeting')
  revalidatePath('/crm')
  revalidatePath('/outreach')
  return { ok: true, brief: result.brief, scheduledFor, queueNote }
}
