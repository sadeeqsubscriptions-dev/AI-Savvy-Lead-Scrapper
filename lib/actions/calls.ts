'use server'

import { revalidatePath } from 'next/cache'
import { currentBrief } from '@/lib/ai/brief-shape'
import { summarizeCall, writeCallEmail } from '@/lib/ai/call-assist'
import { canWrite, requireSession } from '@/lib/auth'
import { limitMessage, requireFeature } from '@/lib/billing/entitlements'
import { signature } from '@/lib/outreach/compose'
import { NO_MAILBOX_ERROR, replyToThread, startOutreach } from '@/lib/outreach/engine'
import { mailboxFor } from '@/lib/outreach/mailbox'
import { calendarInvite, newMessageId, sendMail } from '@/lib/outreach/mailer'
import { NO_PROFILE_ERROR, sellerFor } from '@/lib/outreach/seller'
import { leadForPhone } from '@/lib/sms/messages'
import { callerIdFor, numberFor } from '@/lib/voice/numbers'
import { withQueue } from '@/lib/outreach/queue-shape'
import { leadTimezone } from '@/lib/outreach/schedule'
import { formatPhone, toE164 } from '@/lib/phone'
import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/lib/supabase/types'
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

  const allowed = await requireFeature(session.organization.id, 'calling')
  if (!allowed.ok) return allowed
  if (allowed.entitlements.remaining.callMinutes < 1) return { ok: false as const, error: limitMessage('call_seconds') }
  if (!(await callerIdFor(session.organization.id, session.userId))) {
    return { ok: false as const, error: 'Your phone number is still being set up. Try again in a minute, or contact support.' }
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

/**
 * Token for the browser to *receive* calls on the rep's own number. Only
 * teammates with a number assigned to them get one.
 */
export async function incomingCallToken() {
  const session = await requireSession()
  if (!voiceConfigured()) return { ok: false as const, error: 'Calling is not set up.' }
  const own = await numberFor(session.organization.id, session.userId)
  if (!own || own.assigned_to !== session.userId || !own.voice) return { ok: false as const, error: 'No number assigned to you.' }
  return { ok: true as const, token: voiceToken(session.userId), number: own.phone_number }
}

/** Who is calling: the lead with that number, if any. */
export async function callerInfo(rawNumber: string) {
  const session = await requireSession()
  const e164 = toE164(rawNumber)
  if (!e164) return null
  return leadForPhone(session.organization.id, e164)
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

/** Closes the call, writes Claude's notes, and logs it on the lead's timeline. */
export async function finishCall(callId: string, durationSeconds: number) {
  const loaded = await loadCall(callId)
  if (!loaded) return { ok: false as const, error: 'Call not found.' }
  const { supabase, call, lead, events, session } = loaded

  const duration = Math.max(0, Math.round(durationSeconds))
  let summary: string | null = null
  let outcome = 'no_conversation'
  let detected: { meetingTime: string | null; callbackTime: string | null; wantsEmail: boolean } = {
    meetingTime: null,
    callbackTime: null,
    wantsEmail: false,
  }

  const seller = lead && events.length > 0 ? await sellerFor(call.org_id) : null
  if (lead && seller && events.length > 0) {
    const result = await summarizeCall(lead, events, seller)
    if (result.ok) {
      outcome = result.data.outcome
      detected = {
        meetingTime: validTime(result.data.meeting_time),
        callbackTime: validTime(result.data.callback_time),
        wantsEmail: result.data.wants_email,
      }
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
  return { ok: true as const, summary, outcome: OUTCOME_LABEL[outcome] ?? outcome, ...detected }
}

// ─── After-call actions ─────────────────────────────────────────────────────

/** A real future-ish timestamp from Claude, or null. */
function validTime(value: string | null | undefined) {
  if (!value) return null
  const time = Date.parse(value)
  return Number.isNaN(time) ? null : new Date(time).toISOString()
}

function inLeadTime(iso: string, lead: { location: string | null; city: string | null; country: string | null }) {
  const zone = leadTimezone(lead)
  return new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(iso))
}

async function loadLeadFor(leadId: string) {
  const session = await requireSession()
  if (!canWrite(session.role)) return null
  const supabase = await createClient()
  const { data: lead } = await supabase
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .eq('org_id', session.organization.id)
    .maybeSingle()
  return lead ? { session, supabase, lead } : null
}

function refreshLead(leadId: string) {
  revalidatePath('/dialer')
  revalidatePath(`/dialer/${leadId}`)
  revalidatePath(`/targeting/${leadId}`)
  revalidatePath('/status')
  revalidatePath('/crm')
  revalidatePath('/calendar')
  revalidatePath('/dashboard')
}

type Done = { ok: true; message: string } | { ok: false; error: string }

/** "No answer" or "Not interested" from the call screen (works for calls made on any phone). */
export async function logCallOutcome(leadId: string, outcome: 'no_answer' | 'not_interested'): Promise<Done> {
  const loaded = await loadLeadFor(leadId)
  if (!loaded) return { ok: false, error: 'Lead not found.' }
  const { session, supabase, lead } = loaded

  await supabase.from('lead_activities').insert({
    org_id: lead.org_id,
    lead_id: lead.id,
    user_id: session.userId,
    type: 'call',
    title: outcome === 'no_answer' ? 'Call · No answer' : 'Call · Not interested',
    body: null,
  })

  if (outcome === 'no_answer') {
    await supabase
      .from('leads')
      .update({ last_contacted_at: new Date().toISOString(), ...(lead.status === 'New' ? { status: 'Contacted' as const } : {}) })
      .eq('id', lead.id)
  } else {
    // Not interested: close it out everywhere, including automatic emails
    // (the skip note keeps the autopilot from picking it up again).
    const meta = withQueue(lead.metadata, null) as Record<string, unknown>
    await supabase
      .from('leads')
      .update({
        status: 'Lost',
        last_contacted_at: new Date().toISOString(),
        metadata: { ...meta, outreach_skip: { reason: 'Said not interested on a call.', at: new Date().toISOString() } } as Json,
      })
      .eq('id', lead.id)
    await supabase
      .from('outreach_threads')
      .update({ status: 'stopped', next_followup_at: null })
      .eq('lead_id', lead.id)
      .eq('status', 'active')
  }

  refreshLead(lead.id)
  return { ok: true, message: outcome === 'no_answer' ? 'Logged: no answer.' : 'Marked not interested. Emails stopped.' }
}

/** "Call me back at …": a reminder on the calendar and a note on the lead. */
export async function scheduleCallback(leadId: string, startsAt: string, note: string): Promise<Done> {
  const loaded = await loadLeadFor(leadId)
  if (!loaded) return { ok: false, error: 'Lead not found.' }
  const { session, supabase, lead } = loaded
  const when = validTime(startsAt)
  if (!when) return { ok: false, error: 'Pick a valid date and time.' }

  const start = new Date(when)
  const { error } = await supabase.from('meetings').insert({
    org_id: lead.org_id,
    lead_id: lead.id,
    created_by: session.userId,
    title: `Call back: ${lead.full_name}`,
    description: [note.trim() || null, lead.phone ? `Phone: ${lead.phone}` : null].filter(Boolean).join('\n') || null,
    starts_at: start.toISOString(),
    ends_at: new Date(start.getTime() + 15 * 60_000).toISOString(),
    status: 'scheduled',
  })
  if (error) return { ok: false, error: error.message }

  await supabase.from('lead_activities').insert({
    org_id: lead.org_id,
    lead_id: lead.id,
    user_id: session.userId,
    type: 'call',
    title: `Call · Asked to call back ${inLeadTime(when, lead)}`,
    body: note.trim() || null,
  })
  await supabase
    .from('leads')
    .update({ last_contacted_at: new Date().toISOString(), ...(lead.status === 'New' ? { status: 'Contacted' as const } : {}) })
    .eq('id', lead.id)

  refreshLead(lead.id)
  return { ok: true, message: `Call-back set for ${inLeadTime(when, lead)}. It's on your calendar.` }
}

/** Books the meeting discussed on the call: calendar entry, lead → Qualified, optional email invite. */
export async function bookMeeting(
  leadId: string,
  { startsAt, minutes, sendInvite }: { startsAt: string; minutes: number; sendInvite: boolean },
): Promise<Done> {
  const loaded = await loadLeadFor(leadId)
  if (!loaded) return { ok: false, error: 'Lead not found.' }
  const { session, supabase, lead } = loaded
  const when = validTime(startsAt)
  if (!when) return { ok: false, error: 'Pick a valid date and time.' }
  const length = Math.min(120, Math.max(10, Math.round(minutes)))

  const start = new Date(when)
  const [seller, mailbox] = await Promise.all([sellerFor(lead.org_id), mailboxFor(lead.org_id)])
  const companyName = seller?.companyName ?? session.organization.name
  const senderName = seller?.senderName ?? session.profile.full_name ?? session.email
  const { data: meeting, error } = await supabase
    .from('meetings')
    .insert({
      org_id: lead.org_id,
      lead_id: lead.id,
      created_by: session.userId,
      title: `${companyName} intro call: ${lead.company ?? lead.full_name}`,
      description: `Booked on a call by ${senderName}.`,
      starts_at: start.toISOString(),
      ends_at: new Date(start.getTime() + length * 60_000).toISOString(),
      attendees: lead.email ? [lead.email] : [],
      status: 'scheduled',
    })
    .select('id')
    .single()
  if (error || !meeting) return { ok: false, error: error?.message ?? 'Could not save the meeting.' }

  let invited = false
  let inviteError: string | null = null
  if (sendInvite && lead.email && mailbox) {
    const whenText = inLeadTime(when, lead)
    try {
      await sendMail(mailbox, {
        fromName: senderName,
        to: lead.email,
        subject: `Confirmed: ${length}-minute call with ${companyName}, ${whenText}`,
        text: `Hi ${lead.full_name.split(' ')[0]},\n\nThanks for your time on the phone. As discussed, here's our ${length}-minute call on ${whenText}. The invite is attached so you can add it to your calendar.\n\nIf that time stops working, just reply and we'll find another.\n${seller ? signature(seller) : ''}`,
        messageId: newMessageId(mailbox),
        invite: calendarInvite({
          uid: `${meeting.id}@ai-savvy-crm`,
          organizer: mailbox.user,
          start,
          minutes: length,
          title: `${companyName} x ${lead.company ?? lead.full_name}`,
          description: `${length}-minute intro call with ${senderName}, ${companyName}.`,
          attendee: { name: lead.full_name, email: lead.email },
        }),
      })
      invited = true
    } catch (sendError) {
      inviteError = sendError instanceof Error ? sendError.message : 'Invite email failed.'
    }
  }

  await supabase.from('lead_activities').insert({
    org_id: lead.org_id,
    lead_id: lead.id,
    user_id: session.userId,
    type: 'meeting',
    title: `Meeting booked · ${inLeadTime(when, lead)}`,
    body: invited ? `Calendar invite emailed to ${lead.email}.` : null,
  })
  await supabase
    .from('leads')
    .update({
      last_contacted_at: new Date().toISOString(),
      metadata: withQueue(lead.metadata, null),
      ...(lead.status === 'New' || lead.status === 'Contacted' ? { status: 'Qualified' as const } : {}),
    })
    .eq('id', lead.id)
  // A booked meeting replaces the cold sequence.
  await supabase
    .from('outreach_threads')
    .update({ status: 'stopped', next_followup_at: null })
    .eq('lead_id', lead.id)
    .eq('status', 'active')

  refreshLead(lead.id)
  if (inviteError) return { ok: true, message: `Meeting saved, but the invite email failed: ${inviteError}` }
  return { ok: true, message: `Meeting booked for ${inLeadTime(when, lead)}${invited ? ' and invite sent' : ''}.` }
}

/** Claude drafts the after-call email from the transcript (or the script, for outside calls). */
export async function draftCallEmail(leadId: string, callId: string | null, meetingTime: string | null) {
  const loaded = await loadLeadFor(leadId)
  if (!loaded) return { ok: false as const, error: 'Lead not found.' }
  const { supabase, lead } = loaded
  const allowed = await requireFeature(lead.org_id, 'ai')
  if (!allowed.ok) return allowed
  const seller = await sellerFor(lead.org_id)
  if (!seller) return { ok: false as const, error: NO_PROFILE_ERROR }

  let events: { speaker: 'rep' | 'lead' | null; text: string }[] = []
  if (callId) {
    const { data } = await supabase
      .from('call_events')
      .select('speaker, text')
      .eq('call_id', callId)
      .eq('kind', 'transcript')
      .order('created_at')
    events = data ?? []
  }

  const when = validTime(meetingTime)
  const result = await writeCallEmail(
    lead,
    currentBrief(lead.ai_brief),
    events,
    { meetingTime: when ? inLeadTime(when, lead) : null },
    seller,
  )
  if (!result.ok) return result
  return { ok: true as const, subject: result.data.subject, body: `${result.data.body.trim()}\n${signature(seller)}` }
}

/** Sends the after-call email now (in the existing thread if there is one). */
export async function sendCallEmail(leadId: string, subject: string, body: string): Promise<Done> {
  const loaded = await loadLeadFor(leadId)
  if (!loaded) return { ok: false, error: 'Lead not found.' }
  const { session, supabase, lead } = loaded
  if (!lead.email) return { ok: false, error: 'This lead has no email address.' }
  if (!(await mailboxFor(lead.org_id))) return { ok: false, error: NO_MAILBOX_ERROR }
  if (subject.trim().length === 0 || body.trim().length < 10) return { ok: false, error: 'Write a subject and a message.' }

  const { data: thread } = await supabase
    .from('outreach_threads')
    .select('id')
    .eq('org_id', lead.org_id)
    .eq('lead_id', lead.id)
    .maybeSingle()

  if (thread) {
    // replyToThread adds the signature itself; drop the one in the draft.
    const seller = await sellerFor(lead.org_id)
    const sig = seller ? signature(seller).trim() : ''
    const text = sig && body.trim().endsWith(sig) ? body.trim().slice(0, -sig.length).trim() : body.trim()
    const result = await replyToThread(supabase, { orgId: lead.org_id, threadId: thread.id, userId: session.userId, body: text })
    if (!result.ok) return result
  } else {
    const result = await startOutreach(supabase, {
      orgId: lead.org_id,
      leadId: lead.id,
      userId: session.userId,
      draft: { subject: subject.trim(), body: body.trim() },
      force: true,
    })
    if (!result.ok) return result
    // A person is talking to this lead now: no automatic follow-ups.
    await supabase
      .from('outreach_threads')
      .update({ status: 'stopped', next_followup_at: null })
      .eq('lead_id', lead.id)
      .eq('status', 'active')
  }

  refreshLead(lead.id)
  return { ok: true, message: `Email sent to ${lead.email}.` }
}

/**
 * "Dial a number": finds the lead with this phone number, or adds one, and
 * returns its id so the dialer can open its call page.
 */
export async function leadForNumber(rawNumber: string, name: string) {
  const session = await requireSession()
  if (!canWrite(session.role)) return { ok: false as const, error: 'Viewers cannot place calls.' }

  const e164 = toE164(rawNumber)
  if (!e164) return { ok: false as const, error: 'Enter the full number with area code, e.g. +1 305 555 0100.' }

  const supabase = await createClient()
  const orgId = session.organization.id
  const digits = e164.replace(/\D/g, '')
  const last10 = digits.slice(-10)

  // Phones are stored as scraped ("(305) 555-0100"), so compare digits.
  const { data: candidates } = await supabase
    .from('leads')
    .select('id, phone')
    .eq('org_id', orgId)
    .ilike('phone', `%${last10.slice(-4)}%`)
    .limit(200)
  const existing = (candidates ?? []).find((lead) => (lead.phone ?? '').replace(/\D/g, '').endsWith(last10))
  if (existing) return { ok: true as const, leadId: existing.id, created: false }

  const label = name.trim() || formatPhone(e164)
  const { data: lead, error } = await supabase
    .from('leads')
    .insert({
      org_id: orgId,
      full_name: label.slice(0, 160),
      phone: e164,
      source: 'Manual',
      created_by: session.userId,
      owner_id: session.userId,
    })
    .select('id')
    .single()
  if (error || !lead) return { ok: false as const, error: error?.message ?? 'Could not add the lead.' }

  revalidatePath('/dialer')
  revalidatePath('/crm')
  return { ok: true as const, leadId: lead.id, created: true }
}
