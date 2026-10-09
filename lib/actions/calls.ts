'use server'

import { revalidatePath } from 'next/cache'
import { currentBrief } from '@/lib/ai/brief-shape'
import { suggestReply, summarizeCall, type CallSuggestion } from '@/lib/ai/call-assist'
import { canWrite, requireSession } from '@/lib/auth'
import { toE164 } from '@/lib/phone'
import { createClient } from '@/lib/supabase/server'
import { missingVoiceSettings, voiceConfigured, voiceToken } from '@/lib/voice/twilio'

const OUTCOME_LABEL: Record<string, string> = {
  meeting_booked: 'Meeting booked',
  interested: 'Interested',
  call_back: 'Call back',
  not_interested: 'Not interested',
  no_conversation: 'No conversation',
}

/** Creates the call record and a browser token; the dialer then connects. */
export async function startCall(leadId: string, rawNumber: string) {
  const session = await requireSession()
  if (!canWrite(session.role)) return { ok: false as const, error: 'Viewers cannot place calls.' }
  if (!voiceConfigured()) {
    return { ok: false as const, error: `Calling isn't set up yet. Missing: ${missingVoiceSettings().join(', ')}.` }
  }

  const to = toE164(rawNumber)
  if (!to) return { ok: false as const, error: 'That phone number doesn’t look valid.' }

  const supabase = await createClient()
  const { data: lead } = await supabase
    .from('leads')
    .select('id')
    .eq('id', leadId)
    .eq('org_id', session.organization.id)
    .maybeSingle()
  if (!lead) return { ok: false as const, error: 'Lead not found.' }

  const { data: call, error } = await supabase
    .from('calls')
    .insert({ org_id: session.organization.id, lead_id: lead.id, user_id: session.userId, to_number: to })
    .select('id')
    .single()
  if (error || !call) return { ok: false as const, error: 'Could not start the call.' }

  return { ok: true as const, callId: call.id, to, token: voiceToken(session.userId) }
}

async function loadCall(callId: string) {
  const session = await requireSession()
  const supabase = await createClient()
  const { data: call } = await supabase
    .from('calls')
    .select('*')
    .eq('id', callId)
    .eq('org_id', session.organization.id)
    .maybeSingle()
  if (!call) return null

  const [{ data: lead }, { data: events }] = await Promise.all([
    call.lead_id ? supabase.from('leads').select('*').eq('id', call.lead_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase
      .from('call_events')
      .select('speaker, text, created_at')
      .eq('call_id', call.id)
      .eq('kind', 'transcript')
      .order('created_at'),
  ])
  return { session, supabase, call, lead, events: events ?? [] }
}

/** Claude's next line for the rep, based on everything said so far. */
export async function assistCall(
  callId: string,
): Promise<{ ok: true; suggestion: CallSuggestion } | { ok: false; error: string }> {
  const loaded = await loadCall(callId)
  if (!loaded || !loaded.lead) return { ok: false, error: 'Call not found.' }
  if (loaded.events.length === 0) return { ok: false, error: 'Nothing said yet.' }

  const result = await suggestReply(loaded.lead, currentBrief(loaded.lead.ai_brief), loaded.events)
  if (!result.ok) return result

  await loaded.supabase.from('call_events').insert({
    org_id: loaded.call.org_id,
    call_id: loaded.call.id,
    kind: 'suggestion',
    text: result.data.say,
    payload: result.data,
  })
  return { ok: true, suggestion: result.data }
}

/** Closes the call, writes Claude's notes, and logs it on the lead's timeline. */
export async function finishCall(callId: string, durationSeconds: number) {
  const loaded = await loadCall(callId)
  if (!loaded) return { ok: false as const, error: 'Call not found.' }
  const { supabase, call, lead, events, session } = loaded

  const duration = Math.max(0, Math.round(durationSeconds))
  let summary: string | null = null
  let outcome = 'no_conversation'

  if (lead && events.length > 0) {
    const result = await summarizeCall(lead, events)
    if (result.ok) {
      outcome = result.data.outcome
      summary = [result.data.summary, result.data.next_step ? `Next: ${result.data.next_step}` : null]
        .filter(Boolean)
        .join('\n')
    }
  }

  await supabase
    .from('calls')
    .update({
      status: call.status === 'failed' ? 'failed' : 'completed',
      ended_at: call.ended_at ?? new Date().toISOString(),
      duration_seconds: call.duration_seconds ?? duration,
      summary,
    })
    .eq('id', call.id)

  if (lead) {
    const minutes = Math.floor(duration / 60)
    const seconds = duration % 60
    await supabase.from('lead_activities').insert({
      org_id: call.org_id,
      lead_id: lead.id,
      user_id: session.userId,
      type: 'call',
      title: `Call · ${OUTCOME_LABEL[outcome] ?? 'Completed'} · ${minutes}:${String(seconds).padStart(2, '0')}`,
      body: summary,
      metadata: { call_id: call.id, outcome },
    })
    await supabase
      .from('leads')
      .update({
        last_contacted_at: new Date().toISOString(),
        ...(lead.status === 'New' && events.length > 0 ? { status: 'Contacted' as const } : {}),
      })
      .eq('id', lead.id)
  }

  revalidatePath('/dialer')
  revalidatePath('/crm')
  return { ok: true as const, summary, outcome: OUTCOME_LABEL[outcome] ?? outcome }
}
