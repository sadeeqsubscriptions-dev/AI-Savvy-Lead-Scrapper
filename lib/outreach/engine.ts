import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Lead, OutreachThread } from '@/lib/supabase/types'
import { composeEmail, signature, type DraftEmail, type PriorEmail } from './compose'
import { FOLLOW_UP_DELAYS_DAYS, TOTAL_STEPS, senderConfig } from './config'
import { ineligibleReason } from './eligibility'
import {
  mailConfigured,
  messageIdsIn,
  newMessageId,
  readInbox,
  sendMail,
  senderAddress,
  stripQuotedReply,
} from './mailer'

type Client = SupabaseClient<Database>
type Result = { ok: true } | { ok: false; error: string }

const DAY_MS = 24 * 60 * 60 * 1000
/** How far back the inbox scan looks for replies. */
const REPLY_WINDOW_DAYS = 45
/** Back-off before retrying a follow-up that failed to send. */
const RETRY_MS = 2 * 60 * 60 * 1000

function inDays(days: number) {
  return new Date(Date.now() + days * DAY_MS).toISOString()
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

/** Outbound emails across the whole mailbox in the last 24h, for the daily cap. */
export async function sentInLast24h(supabase: Client) {
  const { count } = await supabase
    .from('outreach_messages')
    .select('id', { count: 'exact', head: true })
    .eq('direction', 'outbound')
    .gte('sent_at', new Date(Date.now() - DAY_MS).toISOString())
  return count ?? 0
}

async function remainingToday(supabase: Client) {
  return Math.max(0, senderConfig().dailyLimit - (await sentInLast24h(supabase)))
}

async function logActivity(
  supabase: Client,
  row: { orgId: string; leadId: string; userId: string | null; title: string; body: string },
) {
  await supabase.from('lead_activities').insert({
    org_id: row.orgId,
    lead_id: row.leadId,
    user_id: row.userId,
    type: 'email',
    title: row.title,
    body: row.body,
  })
}

// ─── First email ────────────────────────────────────────────────────────────

async function loadLead(supabase: Client, orgId: string, leadId: string) {
  const { data } = await supabase.from('leads').select('*').eq('id', leadId).eq('org_id', orgId).maybeSingle()
  return data
}

/** Saves Claude's "not a fit" verdict so the lead leaves the Ready list. */
async function markNotAFit(supabase: Client, lead: Lead, reason: string) {
  const metadata = lead.metadata && typeof lead.metadata === 'object' && !Array.isArray(lead.metadata) ? lead.metadata : {}
  await supabase
    .from('leads')
    .update({ metadata: { ...metadata, outreach_skip: { reason, at: new Date().toISOString() } } })
    .eq('id', lead.id)
}

/** Writes the first email without sending it, so a rep can read and edit it. */
export async function previewOutreach(
  supabase: Client,
  { orgId, leadId, force = false }: { orgId: string; leadId: string; force?: boolean },
): Promise<{ ok: true; email: DraftEmail } | { ok: false; error: string; notAFit?: string }> {
  const lead = await loadLead(supabase, orgId, leadId)
  if (!lead) return { ok: false, error: 'Lead not found.' }
  if (!lead.email) return { ok: false, error: `${lead.full_name} has no email address.` }

  const draft = await composeEmail(lead, 0, [], { force })
  if (!draft.ok && draft.notAFit) await markNotAFit(supabase, lead, draft.notAFit)
  return draft
}

export async function startOutreach(
  supabase: Client,
  {
    orgId,
    leadId,
    userId,
    draft: reviewed,
    force = false,
  }: {
    orgId: string
    leadId: string
    userId: string
    /** A preview the rep read (and maybe edited); skips writing a new one. */
    draft?: { subject: string; body: string }
    /** The rep chose to email a lead the screening flagged. */
    force?: boolean
  },
): Promise<Result> {
  if (!mailConfigured()) return { ok: false, error: 'Email is not connected. Set EMAIL_USER and EMAIL_APP_PASSWORD.' }

  const lead = await loadLead(supabase, orgId, leadId)

  if (!lead) return { ok: false, error: 'Lead not found.' }
  if (!lead.email) return { ok: false, error: `${lead.full_name} has no email address.` }
  const flagged = ineligibleReason(lead)
  if (flagged && !force && !reviewed) return { ok: false, error: `Skipped ${lead.full_name}: ${flagged}` }
  if ((await remainingToday(supabase)) <= 0) {
    return { ok: false, error: `Daily send limit (${senderConfig().dailyLimit}) reached. Try again tomorrow.` }
  }

  // Claim the lead before spending anything: the unique (org_id, lead_id)
  // index makes a double click or a second tab fail here, not in the inbox.
  const { data: thread, error: claimError } = await supabase
    .from('outreach_threads')
    .insert({ org_id: orgId, lead_id: leadId, to_email: lead.email.toLowerCase(), created_by: userId })
    .select('*')
    .single()

  if (claimError || !thread) {
    return {
      ok: false,
      error: claimError?.code === '23505' ? `${lead.full_name} is already in a sequence.` : 'Could not start outreach.',
    }
  }

  const release = async (error: string): Promise<Result> => {
    await supabase.from('outreach_threads').delete().eq('id', thread.id)
    return { ok: false, error }
  }

  let draft: { ok: true; email: { subject: string; body: string } }
  if (reviewed) {
    draft = { ok: true, email: { subject: reviewed.subject.trim(), body: reviewed.body.trim() } }
  } else {
    const written = await composeEmail(lead, 0, [], { force })
    if (!written.ok) {
      if (written.notAFit) await markNotAFit(supabase, lead, written.notAFit)
      return release(written.error)
    }
    draft = written
  }

  const messageId = newMessageId()
  try {
    await sendMail({
      fromName: senderConfig().name,
      to: lead.email,
      subject: draft.email.subject,
      text: draft.email.body,
      messageId,
    })
  } catch (error) {
    return release(`Sending failed: ${errorText(error)}`)
  }

  const sentAt = new Date().toISOString()
  await supabase.from('outreach_messages').insert({
    org_id: orgId,
    thread_id: thread.id,
    direction: 'outbound',
    step: 0,
    subject: draft.email.subject,
    body: draft.email.body,
    message_id: messageId,
    from_email: senderAddress(),
    to_email: lead.email.toLowerCase(),
    sent_at: sentAt,
  })

  await supabase
    .from('outreach_threads')
    .update({
      subject: draft.email.subject,
      emails_sent: 1,
      last_sent_at: sentAt,
      next_followup_at: TOTAL_STEPS > 1 ? inDays(FOLLOW_UP_DELAYS_DAYS[0]) : null,
      status: TOTAL_STEPS > 1 ? 'active' : 'completed',
    })
    .eq('id', thread.id)

  await supabase
    .from('leads')
    .update({ last_contacted_at: sentAt, ...(lead.status === 'New' ? { status: 'Contacted' as const } : {}) })
    .eq('id', leadId)

  await logActivity(supabase, {
    orgId,
    leadId,
    userId,
    title: 'Cold email sent',
    body: draft.email.subject,
  })

  return { ok: true }
}

// ─── Follow-ups ─────────────────────────────────────────────────────────────

async function sendFollowUp(supabase: Client, thread: OutreachThread): Promise<Result> {
  // Claim this exact step. If another run (cron + button) got here first, the
  // update matches no row and we stop without sending a duplicate.
  const { data: claimed } = await supabase
    .from('outreach_threads')
    .update({ next_followup_at: null })
    .eq('id', thread.id)
    .eq('status', 'active')
    .eq('emails_sent', thread.emails_sent)
    .not('next_followup_at', 'is', null)
    .select('id')

  if (!claimed || claimed.length === 0) return { ok: true }

  const fail = async (error: string): Promise<Result> => {
    await supabase
      .from('outreach_threads')
      .update({ next_followup_at: new Date(Date.now() + RETRY_MS).toISOString(), last_error: error })
      .eq('id', thread.id)
    return { ok: false, error }
  }

  const [{ data: lead }, { data: history }] = await Promise.all([
    supabase.from('leads').select('*').eq('id', thread.lead_id).maybeSingle(),
    supabase.from('outreach_messages').select('*').eq('thread_id', thread.id).order('sent_at'),
  ])

  if (!lead) return fail('Lead was deleted.')

  const messages = history ?? []
  const outboundIds = messages.filter((message) => message.direction === 'outbound').map((message) => message.message_id)
  const step = thread.emails_sent

  const draft = await composeEmail(lead as Lead, step, messages as PriorEmail[])
  if (!draft.ok) return fail(draft.error)

  const messageId = newMessageId()
  const subject = thread.subject.startsWith('Re:') ? thread.subject : `Re: ${thread.subject}`

  try {
    await sendMail({
      fromName: senderConfig().name,
      to: thread.to_email,
      subject,
      text: draft.email.body,
      messageId,
      // Threads the follow-up under the first email in the lead's inbox.
      inReplyTo: outboundIds.at(-1) ?? null,
      references: outboundIds,
    })
  } catch (error) {
    return fail(`Sending failed: ${errorText(error)}`)
  }

  const sentAt = new Date().toISOString()
  const nextStep = step + 1
  const more = nextStep < TOTAL_STEPS

  await supabase.from('outreach_messages').insert({
    org_id: thread.org_id,
    thread_id: thread.id,
    direction: 'outbound',
    step,
    subject,
    body: draft.email.body,
    message_id: messageId,
    in_reply_to: outboundIds.at(-1) ?? null,
    from_email: senderAddress(),
    to_email: thread.to_email,
    sent_at: sentAt,
  })

  await supabase
    .from('outreach_threads')
    .update({
      emails_sent: nextStep,
      last_sent_at: sentAt,
      next_followup_at: more ? inDays(FOLLOW_UP_DELAYS_DAYS[nextStep - 1]) : null,
      status: more ? 'active' : 'completed',
      last_error: null,
    })
    .eq('id', thread.id)

  await supabase.from('leads').update({ last_contacted_at: sentAt }).eq('id', thread.lead_id)
  await logActivity(supabase, {
    orgId: thread.org_id,
    leadId: thread.lead_id,
    userId: thread.created_by,
    title: `Follow-up ${step} sent`,
    body: subject,
  })

  return { ok: true }
}

export async function sendDueFollowUps(supabase: Client, orgId?: string) {
  let query = supabase
    .from('outreach_threads')
    .select('*')
    .eq('status', 'active')
    .lte('next_followup_at', new Date().toISOString())
    .order('next_followup_at')
    .limit(25)
  if (orgId) query = query.eq('org_id', orgId)

  const { data: due } = await query
  const budget = await remainingToday(supabase)
  let sent = 0
  const errors: string[] = []

  for (const thread of (due ?? []).slice(0, budget)) {
    const result = await sendFollowUp(supabase, thread)
    if (result.ok) sent++
    else errors.push(`${thread.to_email}: ${result.error}`)
  }

  return { sent, errors }
}

// ─── Manual reply ───────────────────────────────────────────────────────────

/** A rep's own answer to a lead, sent from the dashboard in the same thread. */
export async function replyToThread(
  supabase: Client,
  { orgId, threadId, userId, body }: { orgId: string; threadId: string; userId: string; body: string },
): Promise<Result> {
  if (!mailConfigured()) return { ok: false, error: 'Email is not connected.' }

  const [{ data: thread }, { data: history }] = await Promise.all([
    supabase.from('outreach_threads').select('*').eq('id', threadId).eq('org_id', orgId).maybeSingle(),
    supabase.from('outreach_messages').select('message_id, sent_at').eq('thread_id', threadId).order('sent_at'),
  ])
  if (!thread) return { ok: false, error: 'Thread not found.' }
  if (thread.status === 'bounced') return { ok: false, error: 'This address bounced; email cannot be delivered.' }

  const references = (history ?? []).map((message) => message.message_id)
  const subject = thread.subject.startsWith('Re:') ? thread.subject : `Re: ${thread.subject}`
  const text = `${body.trim()}\n${signature()}`
  const messageId = newMessageId()

  try {
    await sendMail({
      fromName: senderConfig().name,
      to: thread.to_email,
      subject,
      text,
      messageId,
      inReplyTo: references.at(-1) ?? null,
      references,
    })
  } catch (error) {
    return { ok: false, error: errorText(error) }
  }

  const sentAt = new Date().toISOString()
  await supabase.from('outreach_messages').insert({
    org_id: orgId,
    thread_id: thread.id,
    direction: 'outbound',
    step: null,
    subject,
    body: text,
    message_id: messageId,
    in_reply_to: references.at(-1) ?? null,
    from_email: senderAddress(),
    to_email: thread.to_email,
    sent_at: sentAt,
  })

  // A human is in the conversation now; no automated follow-ups after this.
  await supabase
    .from('outreach_threads')
    .update({
      last_sent_at: sentAt,
      next_followup_at: null,
      ...(thread.status === 'active' ? { status: 'stopped' as const } : {}),
    })
    .eq('id', thread.id)

  await supabase.from('leads').update({ last_contacted_at: sentAt }).eq('id', thread.lead_id)
  await logActivity(supabase, { orgId, leadId: thread.lead_id, userId, title: 'Replied by email', body: body.slice(0, 500) })

  return { ok: true }
}

// ─── Replies ────────────────────────────────────────────────────────────────

function isDaemon(address: string) {
  return /mailer-daemon|postmaster/i.test(address)
}

export async function syncReplies(supabase: Client, orgId?: string) {
  const windowStart = new Date(Date.now() - REPLY_WINDOW_DAYS * DAY_MS)

  let threadQuery = supabase
    .from('outreach_threads')
    .select('*')
    .in('status', ['active', 'completed', 'replied'])
    .gte('last_sent_at', windowStart.toISOString())
  if (orgId) threadQuery = threadQuery.eq('org_id', orgId)

  const { data: threads } = await threadQuery
  if (!threads || threads.length === 0) return { replies: 0, bounces: 0 }

  const threadById = new Map(threads.map((thread) => [thread.id, thread]))
  const { data: stored } = await supabase
    .from('outreach_messages')
    .select('thread_id, direction, message_id')
    .in('thread_id', [...threadById.keys()])

  const threadByMessageId = new Map<string, OutreachThread>()
  const known = new Set<string>()
  for (const message of stored ?? []) {
    known.add(message.message_id)
    const thread = threadById.get(message.thread_id)
    if (thread && message.direction === 'outbound') threadByMessageId.set(message.message_id, thread)
  }

  // Older threads first, so a lead in two orgs resolves to their latest thread.
  const threadByEmail = new Map<string, OutreachThread>()
  for (const thread of [...threads].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    threadByEmail.set(thread.to_email, thread)
  }

  const earliest = threads.reduce((min, thread) => Math.min(min, Date.parse(thread.created_at)), Date.now())
  const since = new Date(Math.max(windowStart.getTime(), earliest - DAY_MS))
  const me = senderAddress()

  const byReference = (ids: (string | null)[]) => {
    for (const id of ids) {
      const thread = id ? threadByMessageId.get(id) : undefined
      if (thread) return thread
    }
    return undefined
  }

  const inbox = await readInbox(since, (message) => {
    if (known.has(message.messageId) || message.fromEmail === me) return false
    if (isDaemon(message.fromEmail)) return true
    if (message.autoReply) return false
    return Boolean(byReference([message.inReplyTo, ...message.references]) || threadByEmail.get(message.fromEmail))
  })

  let replies = 0
  let bounces = 0

  for (const message of inbox) {
    const bounce = isDaemon(message.fromEmail)
    const thread = bounce
      ? byReference([message.inReplyTo, ...message.references, ...messageIdsIn(message.text)])
      : (byReference([message.inReplyTo, ...message.references]) ?? threadByEmail.get(message.fromEmail))
    if (!thread) continue

    const { data: inserted } = await supabase
      .from('outreach_messages')
      .upsert(
        {
          org_id: thread.org_id,
          thread_id: thread.id,
          direction: 'inbound',
          subject: message.subject,
          body: bounce ? 'The email could not be delivered to this address.' : stripQuotedReply(message.text),
          message_id: message.messageId,
          in_reply_to: message.inReplyTo,
          from_email: message.fromEmail,
          to_email: me,
          sent_at: message.date.toISOString(),
        },
        { onConflict: 'org_id,message_id', ignoreDuplicates: true },
      )
      .select('id')

    // Another sync stored it a moment ago.
    if (!inserted || inserted.length === 0) continue

    if (bounce) {
      bounces++
      await supabase
        .from('outreach_threads')
        .update({ status: 'bounced', next_followup_at: null })
        .eq('id', thread.id)
      continue
    }

    replies++
    const firstReply = thread.status !== 'replied'
    await supabase
      .from('outreach_threads')
      .update({
        status: 'replied',
        next_followup_at: null,
        ...(firstReply ? { replied_at: message.date.toISOString() } : {}),
      })
      .eq('id', thread.id)
    thread.status = 'replied'

    await logActivity(supabase, {
      orgId: thread.org_id,
      leadId: thread.lead_id,
      userId: null,
      title: 'Replied to cold email',
      body: stripQuotedReply(message.text).slice(0, 500),
    })

    if (firstReply && thread.created_by) {
      // Service-role only; under a user session RLS rejects it, which is fine —
      // the reply still shows on the Outreach page.
      await supabase.from('notifications').insert({
        org_id: thread.org_id,
        user_id: thread.created_by,
        title: `New reply from ${thread.to_email}`,
        body: stripQuotedReply(message.text).slice(0, 200),
        href: '/outreach',
      })
    }
  }

  return { replies, bounces }
}

/** Replies first, so nobody who just answered gets a follow-up. */
export async function runOutreachCycle(supabase: Client, orgId?: string) {
  if (!mailConfigured()) {
    return { replies: 0, bounces: 0, followUps: 0, errors: ['Email is not connected.'] }
  }

  const errors: string[] = []
  let replies = 0
  let bounces = 0

  try {
    ;({ replies, bounces } = await syncReplies(supabase, orgId))
  } catch (error) {
    // Without a fresh inbox read we can't tell who replied, so hold follow-ups.
    errors.push(`Inbox check failed, follow-ups held: ${errorText(error)}`)
    return { replies, bounces, followUps: 0, errors }
  }

  const followUps = await sendDueFollowUps(supabase, orgId)
  return { replies, bounces, followUps: followUps.sent, errors: [...errors, ...followUps.errors] }
}
