import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Lead, OutreachThread } from '@/lib/supabase/types'
import { ensureBrief } from '@/lib/ai/brief'
import { INTENT_LABEL, classifyReply, stageForIntent, type ReplyIntent } from '@/lib/ai/reply-intent'
import { blockedReason, consumeUsage, getEntitlements, limitMessage, type Entitlements } from '@/lib/billing/entitlements'
import { createAdminClient, hasAdminCredentials } from '@/lib/supabase/admin'
import { composeEmail, signature, type DraftEmail, type PriorEmail } from './compose'
import { FOLLOW_UP_DELAYS_DAYS, TOTAL_STEPS, clampDailyNew } from './config'
import { ineligibleReason, isDemoLead } from './eligibility'
import { mailboxFor, orgsWithMailbox } from './mailbox'
import { messageIdsIn, newMessageId, readInbox, sendMail, stripQuotedReply, type Mailbox } from './mailer'
import { outreachQueue, withQueue, type OutreachQueue } from './queue-shape'
import {
  describeSendTime,
  estimateFirstSends,
  inSendWindow,
  leadTimezone,
  nextSendWindow,
  startOfEasternDay,
} from './schedule'
import { NO_PROFILE_ERROR, sellerFor, type Seller } from './seller'

/**
 * Cold email for one workspace at a time: its own inbox (mailbox.ts), its own
 * sales profile (seller.ts) and its plan's allowances (billing). The
 * scheduler (runAllWorkspaces) loops over every workspace with an inbox.
 */

type Client = SupabaseClient<Database>
type Result = { ok: true } | { ok: false; error: string }

const DAY_MS = 24 * 60 * 60 * 1000
/** How far back the inbox scan looks for replies. */
const REPLY_WINDOW_DAYS = 45
/** Back-off before retrying a follow-up that failed to send. */
const RETRY_MS = 2 * 60 * 60 * 1000
/** How many first emails one scheduler run sends, so the day's target is spread out. */
const FIRSTS_PER_RUN = 2
const MAX_QUEUE_ATTEMPTS = 3

export const NO_MAILBOX_ERROR = 'Connect your email inbox first (Settings → Email). Emails are sent from your own address.'

function inDays(days: number) {
  return new Date(Date.now() + days * DAY_MS).toISOString()
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

/** Everything a workspace needs to send: inbox, seller and plan. */
export type Workspace = {
  orgId: string
  mailbox: Mailbox | null
  seller: Seller | null
  entitlements: Entitlements
}

export async function loadWorkspace(orgId: string): Promise<Workspace> {
  const [mailbox, seller, entitlements] = await Promise.all([mailboxFor(orgId), sellerFor(orgId), getEntitlements(orgId)])
  return { orgId, mailbox, seller, entitlements }
}

/**
 * Outbound emails from one workspace since midnight US Eastern.
 * `firstOnly` counts only first emails to new leads (the daily target).
 */
export async function sentToday(supabase: Client, orgId: string, firstOnly = false) {
  let query = supabase
    .from('outreach_messages')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('direction', 'outbound')
    .gte('sent_at', startOfEasternDay().toISOString())
  if (firstOnly) query = query.eq('step', 0)
  const { count } = await query
  return count ?? 0
}

/**
 * The workspace's daily sending pace: new leads per day (set on the Outreach
 * page) and a safety cap on everything sent, twice that. select('*') so a
 * database without the daily_new column still works (falls back to 25).
 */
export async function dailyPlan(supabase: Client, orgId: string) {
  const { data } = await supabase.from('outreach_settings').select('*').eq('org_id', orgId).maybeSingle()
  const dailyNew = clampDailyNew((data as { daily_new?: number | null } | null)?.daily_new)
  const envCap = Number(process.env.OUTREACH_DAILY_LIMIT) || 0
  return { dailyNew, dailyLimit: Math.max(envCap, dailyNew * 2) }
}

async function remainingToday(supabase: Client, orgId: string) {
  const { dailyLimit } = await dailyPlan(supabase, orgId)
  return Math.max(0, dailyLimit - (await sentToday(supabase, orgId)))
}

async function remainingNewToday(supabase: Client, orgId: string) {
  const { dailyNew } = await dailyPlan(supabase, orgId)
  return Math.max(0, dailyNew - (await sentToday(supabase, orgId, true)))
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

async function loadLead(supabase: Client, orgId: string, leadId: string) {
  const { data } = await supabase.from('leads').select('*').eq('id', leadId).eq('org_id', orgId).maybeSingle()
  return data
}

/** Saves Claude's "not a fit" verdict so the lead leaves Ready (and the send queue). */
async function markNotAFit(supabase: Client, lead: Lead, reason: string) {
  const metadata = withQueue(lead.metadata, null) as Record<string, unknown>
  await supabase
    .from('leads')
    .update({ metadata: { ...metadata, outreach_skip: { reason, at: new Date().toISOString() } } as Lead['metadata'] })
    .eq('id', lead.id)
}

// ─── AI allowance ───────────────────────────────────────────────────────────

function aiBilled(lead: Lead) {
  const meta = lead.metadata
  return Boolean(meta && typeof meta === 'object' && !Array.isArray(meta) && (meta as Record<string, unknown>).ai_billed)
}

/**
 * Counts this lead against the plan's AI-worked leads, once per lead: its
 * research, first email and follow-ups all come from that one unit.
 */
export async function chargeAiLead(supabase: Client, lead: Lead): Promise<Result> {
  if (aiBilled(lead)) return { ok: true }
  const granted = await consumeUsage(lead.org_id, 'ai_leads', 1)
  if (granted < 1) return { ok: false, error: limitMessage('ai_leads') }
  const { data: latest } = await supabase.from('leads').select('metadata').eq('id', lead.id).maybeSingle()
  const meta = latest?.metadata && typeof latest.metadata === 'object' && !Array.isArray(latest.metadata) ? latest.metadata : {}
  await supabase
    .from('leads')
    .update({ metadata: { ...(meta as Record<string, unknown>), ai_billed: true } as Lead['metadata'] })
    .eq('id', lead.id)
  return { ok: true }
}

// ─── Scheduling ─────────────────────────────────────────────────────────────

/**
 * Queues a lead's first email for the scheduler, which sends it inside the
 * lead's local business hours (weekdays 9-4). With `draft`, that exact email
 * is sent; without, Claude writes it from the lead's sales script at send time.
 */
export async function queueOutreach(
  supabase: Client,
  {
    orgId,
    leadId,
    by,
    draft,
  }: { orgId: string; leadId: string; by: string | null; draft?: { subject: string; body: string } },
): Promise<{ ok: true; sendAt: string; label: string } | { ok: false; error: string }> {
  const lead = await loadLead(supabase, orgId, leadId)
  if (!lead) return { ok: false, error: 'Lead not found.' }
  if (!lead.email) return { ok: false, error: `${lead.full_name} has no email address.` }

  const { data: existing } = await supabase
    .from('outreach_threads')
    .select('id')
    .eq('org_id', orgId)
    .eq('lead_id', leadId)
    .maybeSingle()
  if (existing) return { ok: false, error: `${lead.full_name} has already been emailed.` }

  const flagged = ineligibleReason(lead)
  if (flagged && !draft) return { ok: false, error: `Not queued: ${flagged}` }

  const queue: OutreachQueue = { queued_at: new Date().toISOString(), by, ...(draft ? { draft } : {}) }
  await supabase.from('leads').update({ metadata: withQueue(lead.metadata, queue) }).eq('id', lead.id)

  const zone = leadTimezone(lead)
  const sendAt = nextSendWindow(zone)
  return { ok: true, sendAt: sendAt.toISOString(), label: describeSendTime(sendAt, zone) }
}

export async function cancelQueued(supabase: Client, { orgId, leadId }: { orgId: string; leadId: string }) {
  const lead = await loadLead(supabase, orgId, leadId)
  if (!lead) return
  await supabase.from('leads').update({ metadata: withQueue(lead.metadata, null) }).eq('id', lead.id)
}

/** Whether a lead's inbox is in business hours right now. */
export function canSendNow(lead: Pick<Lead, 'location' | 'city' | 'country'>) {
  return inSendWindow(leadTimezone(lead))
}

/** Whether the autopilot is switched on for this workspace (no settings row = on). */
async function autopilotOn(supabase: Client, orgId: string) {
  const { data } = await supabase.from('outreach_settings').select('autopilot').eq('org_id', orgId).maybeSingle()
  return data?.autopilot ?? true
}

/**
 * Real leads the autopilot may email for one workspace: have an email, not
 * contacted, not queued, not demo data, and pass screening. Highest score
 * first. Empty when the autopilot is off or not on the workspace's plan.
 */
export async function autopilotCandidates(supabase: Client, orgId: string, entitlements?: Entitlements) {
  const plan = entitlements ?? (await getEntitlements(orgId))
  if (!plan.plan.features.autopilot || !(await autopilotOn(supabase, orgId))) return []

  const [{ data: leads }, { data: threads }] = await Promise.all([
    supabase
      .from('leads')
      .select('*')
      .eq('org_id', orgId)
      .not('email', 'is', null)
      .neq('email', '')
      .is('metadata->outreach_queue', null)
      .is('metadata->demo', null)
      .order('score', { ascending: false })
      .limit(300),
    supabase.from('outreach_threads').select('lead_id').eq('org_id', orgId),
  ])
  const contacted = new Set((threads ?? []).map((thread) => thread.lead_id))
  return (leads ?? []).filter((lead) => !contacted.has(lead.id) && !isDemoLead(lead.metadata) && !ineligibleReason(lead))
}

/**
 * Sends first emails for one workspace to leads in business hours, within
 * today's target: leads queued by hand first, then the autopilot's picks.
 * Stops starting new sends at `deadline`.
 */
export async function sendQueued(supabase: Client, workspace: Workspace, deadline = Infinity) {
  const { orgId } = workspace
  const [{ data: queued }, autopilot] = await Promise.all([
    supabase.from('leads').select('*').eq('org_id', orgId).not('metadata->outreach_queue', 'is', null).limit(200),
    autopilotCandidates(supabase, orgId, workspace.entitlements),
  ])

  const manual = (queued ?? [])
    .map((lead) => ({ lead, queue: outreachQueue(lead.metadata) }))
    .filter((item): item is { lead: Lead; queue: OutreachQueue } => item.queue !== null)
    .sort((a, b) => a.queue.queued_at.localeCompare(b.queue.queued_at))
  const auto = autopilot.map((lead) => ({ lead, queue: null as OutreachQueue | null }))
  const due = [...manual, ...auto].filter(({ lead }) => inSendWindow(leadTimezone(lead)))

  const budget = Math.min(
    FIRSTS_PER_RUN,
    await remainingNewToday(supabase, orgId),
    await remainingToday(supabase, orgId),
  )
  let sent = 0
  const errors: string[] = []

  for (const { lead, queue } of due) {
    if (sent >= budget || Date.now() > deadline) break
    const result = await startOutreach(supabase, {
      workspace,
      leadId: lead.id,
      userId: queue?.by ?? null,
      draft: queue?.draft,
    })
    if (result.ok) {
      sent++
      continue
    }

    errors.push(`${lead.email}: ${result.error}`)
    // Out of plan allowance or no inbox: nothing else will work this run.
    if (/Daily|used all|Connect your email|sales profile|plan/i.test(result.error)) break

    // Not a fit / already emailed / screened out: drop it. Otherwise retry
    // on a later run, up to MAX_QUEUE_ATTEMPTS times.
    const fresh = await loadLead(supabase, orgId, lead.id)
    if (!fresh) continue
    const current = outreachQueue(fresh.metadata) ?? { queued_at: new Date().toISOString(), by: null }
    const attempts = (current.attempts ?? 0) + 1
    if (/already|Skipped|no email/i.test(result.error)) {
      await supabase.from('leads').update({ metadata: withQueue(fresh.metadata, null) }).eq('id', lead.id)
    } else if (attempts >= MAX_QUEUE_ATTEMPTS) {
      // Give up so the autopilot doesn't pick it again; shows under "Not a fit".
      await markNotAFit(supabase, fresh, `Sending failed ${attempts} times: ${result.error}`.slice(0, 300))
    } else {
      await supabase
        .from('leads')
        .update({ metadata: withQueue(fresh.metadata, { ...current, attempts, last_error: result.error }) })
        .eq('id', lead.id)
    }
  }

  return { sent, errors }
}

// ─── First email ────────────────────────────────────────────────────────────

/** Writes the first email without sending it, so a rep can read and edit it. */
export async function previewOutreach(
  supabase: Client,
  { orgId, leadId, force = false }: { orgId: string; leadId: string; force?: boolean },
): Promise<{ ok: true; email: DraftEmail } | { ok: false; error: string; notAFit?: string }> {
  const workspace = await loadWorkspace(orgId)
  const blocked = blockedReason(workspace.entitlements, 'ai')
  if (blocked) return { ok: false, error: blocked }
  if (!workspace.seller) return { ok: false, error: NO_PROFILE_ERROR }

  const lead = await loadLead(supabase, orgId, leadId)
  if (!lead) return { ok: false, error: 'Lead not found.' }
  if (!lead.email) return { ok: false, error: `${lead.full_name} has no email address.` }

  const charged = await chargeAiLead(supabase, lead)
  if (!charged.ok) return charged

  // Same brief the Targeting page shows, so the email pitches the same offer.
  const brief = await ensureBrief(supabase, lead, null, workspace.seller)
  const draft = await composeEmail(lead, 0, [], { seller: workspace.seller, force, brief: brief.ok ? brief.brief : null })
  if (!draft.ok && draft.notAFit) await markNotAFit(supabase, lead, draft.notAFit)
  return draft
}

export async function startOutreach(
  supabase: Client,
  {
    workspace: given,
    orgId: givenOrgId,
    leadId,
    userId,
    draft: reviewed,
    force = false,
  }: {
    workspace?: Workspace
    orgId?: string
    leadId: string
    /** Null when the scheduler sends on someone's behalf. */
    userId: string | null
    /** An email the rep read or wrote (no AI needed); skips writing a new one. */
    draft?: { subject: string; body: string }
    /** The rep chose to email a lead the screening flagged. */
    force?: boolean
  },
): Promise<Result> {
  const workspace = given ?? (await loadWorkspace(givenOrgId!))
  const { orgId, mailbox, seller } = workspace
  if (!mailbox) return { ok: false, error: NO_MAILBOX_ERROR }
  // Writing with AI needs a plan that includes it; sending your own words doesn't.
  if (!reviewed) {
    const blocked = blockedReason(workspace.entitlements, 'ai')
    if (blocked) return { ok: false, error: blocked }
    if (!seller) return { ok: false, error: NO_PROFILE_ERROR }
  }

  const lead = await loadLead(supabase, orgId, leadId)

  if (!lead) return { ok: false, error: 'Lead not found.' }
  if (!lead.email) return { ok: false, error: `${lead.full_name} has no email address.` }
  const flagged = ineligibleReason(lead)
  if (flagged && !force && !reviewed) return { ok: false, error: `Skipped ${lead.full_name}: ${flagged}` }
  if ((await remainingToday(supabase, orgId)) <= 0) {
    return { ok: false, error: `Daily send limit (${(await dailyPlan(supabase, orgId)).dailyLimit}) reached. Try again tomorrow.` }
  }
  if ((await remainingNewToday(supabase, orgId)) <= 0) {
    return { ok: false, error: `Daily target of ${(await dailyPlan(supabase, orgId)).dailyNew} new leads reached. Try again tomorrow.` }
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
    const charged = await chargeAiLead(supabase, lead)
    if (!charged.ok) return release(charged.error)
    const brief = await ensureBrief(supabase, lead, userId, seller!)
    const written = await composeEmail(lead, 0, [], { seller: seller!, force, brief: brief.ok ? brief.brief : null })
    if (!written.ok) {
      if (written.notAFit) await markNotAFit(supabase, lead, written.notAFit)
      return release(written.error)
    }
    draft = written
  }

  const messageId = newMessageId(mailbox)
  try {
    await sendMail(mailbox, {
      fromName: seller?.senderName ?? mailbox.user,
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
    from_email: mailbox.user.toLowerCase(),
    to_email: lead.email.toLowerCase(),
    sent_at: sentAt,
  })

  // Hand-written emails don't get AI follow-ups unless the plan includes AI.
  const followUps = TOTAL_STEPS > 1 && workspace.entitlements.plan.features.ai
  await supabase
    .from('outreach_threads')
    .update({
      subject: draft.email.subject,
      emails_sent: 1,
      last_sent_at: sentAt,
      next_followup_at: followUps ? inDays(FOLLOW_UP_DELAYS_DAYS[0]) : null,
      status: followUps ? 'active' : 'completed',
    })
    .eq('id', thread.id)

  // Re-read metadata: it may have changed while Claude was writing.
  const { data: latest } = await supabase.from('leads').select('metadata').eq('id', leadId).maybeSingle()
  await supabase
    .from('leads')
    .update({
      last_contacted_at: sentAt,
      metadata: withQueue(latest?.metadata ?? lead.metadata, null),
      ...(lead.status === 'New' ? { status: 'Contacted' as const } : {}),
    })
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

async function sendFollowUp(supabase: Client, workspace: Workspace, thread: OutreachThread): Promise<Result> {
  const { mailbox, seller } = workspace
  if (!mailbox || !seller) return { ok: false, error: NO_MAILBOX_ERROR }

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

  const draft = await composeEmail(lead as Lead, step, messages as PriorEmail[], { seller })
  if (!draft.ok) return fail(draft.error)

  const messageId = newMessageId(mailbox)
  const subject = thread.subject.startsWith('Re:') ? thread.subject : `Re: ${thread.subject}`

  try {
    await sendMail(mailbox, {
      fromName: seller.senderName,
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
    from_email: mailbox.user.toLowerCase(),
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

export async function sendDueFollowUps(supabase: Client, workspace: Workspace, deadline = Infinity) {
  // AI follow-ups are part of the AI feature; a lapsed plan pauses them.
  if (blockedReason(workspace.entitlements, 'ai') || !workspace.mailbox || !workspace.seller) {
    return { sent: 0, errors: [] as string[] }
  }

  const { data: due } = await supabase
    .from('outreach_threads')
    .select('*')
    .eq('org_id', workspace.orgId)
    .eq('status', 'active')
    .lte('next_followup_at', new Date().toISOString())
    .order('next_followup_at')
    .limit(25)
  const threads = due ?? []

  // Follow-ups also wait for the lead's business hours.
  const { data: places } = threads.length
    ? await supabase.from('leads').select('id, location, city, country').in('id', threads.map((thread) => thread.lead_id))
    : { data: [] }
  const placeById = new Map((places ?? []).map((place) => [place.id, place]))
  const open = threads.filter((thread) => inSendWindow(leadTimezone(placeById.get(thread.lead_id) ?? {})))

  const budget = await remainingToday(supabase, workspace.orgId)
  let sent = 0
  const errors: string[] = []

  for (const thread of open.slice(0, budget)) {
    if (Date.now() > deadline) break
    const result = await sendFollowUp(supabase, workspace, thread)
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
  const [mailbox, seller] = await Promise.all([mailboxFor(orgId), sellerFor(orgId)])
  if (!mailbox) return { ok: false, error: NO_MAILBOX_ERROR }

  const [{ data: thread }, { data: history }] = await Promise.all([
    supabase.from('outreach_threads').select('*').eq('id', threadId).eq('org_id', orgId).maybeSingle(),
    supabase.from('outreach_messages').select('message_id, sent_at').eq('thread_id', threadId).order('sent_at'),
  ])
  if (!thread) return { ok: false, error: 'Thread not found.' }
  if (thread.status === 'bounced') return { ok: false, error: 'This address bounced; email cannot be delivered.' }

  const references = (history ?? []).map((message) => message.message_id)
  const subject = thread.subject.startsWith('Re:') ? thread.subject : `Re: ${thread.subject}`
  const text = seller ? `${body.trim()}\n${signature(seller)}` : body.trim()
  const messageId = newMessageId(mailbox)

  try {
    await sendMail(mailbox, {
      fromName: seller?.senderName ?? mailbox.user,
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
    from_email: mailbox.user.toLowerCase(),
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

/**
 * Bell + dashboard notification for a reply. Written with the service role:
 * RLS lets users read their own notifications but not create them, and this
 * also runs from the "Check inbox" button under a user session.
 */
async function notifyReply(thread: OutreachThread, text: string, intentLabel: string) {
  if (!hasAdminCredentials()) return
  const admin = createAdminClient()

  let recipients = thread.created_by ? [thread.created_by] : []
  if (recipients.length === 0) {
    const { data: owners } = await admin
      .from('organization_members')
      .select('user_id')
      .eq('org_id', thread.org_id)
      .in('role', ['owner', 'admin'])
    recipients = (owners ?? []).map((owner) => owner.user_id)
  }

  const { data: lead } = await admin.from('leads').select('full_name').eq('id', thread.lead_id).maybeSingle()
  const who = lead?.full_name ?? thread.to_email
  await admin.from('notifications').insert(
    recipients.map((userId) => ({
      org_id: thread.org_id,
      user_id: userId,
      title: `${who} replied · ${intentLabel}`,
      body: stripQuotedReply(text).slice(0, 240),
      href: `/targeting/${thread.lead_id}`,
    })),
  )
}

function isDaemon(address: string) {
  return /mailer-daemon|postmaster/i.test(address)
}

/** Reads one workspace's inbox for replies and bounces to its outreach. */
export async function syncReplies(supabase: Client, orgId: string, given?: Workspace) {
  const workspace = given ?? (await loadWorkspace(orgId))
  const mailbox = workspace.mailbox
  if (!mailbox) return { replies: 0, bounces: 0 }

  const windowStart = new Date(Date.now() - REPLY_WINDOW_DAYS * DAY_MS)
  const { data: threads } = await supabase
    .from('outreach_threads')
    .select('*')
    .eq('org_id', orgId)
    .in('status', ['active', 'completed', 'replied'])
    .gte('last_sent_at', windowStart.toISOString())
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

  // Older threads first, so a lead emailed twice resolves to the latest thread.
  const threadByEmail = new Map<string, OutreachThread>()
  for (const thread of [...threads].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    threadByEmail.set(thread.to_email, thread)
  }

  const earliest = threads.reduce((min, thread) => Math.min(min, Date.parse(thread.created_at)), Date.now())
  const since = new Date(Math.max(windowStart.getTime(), earliest - DAY_MS))
  const me = mailbox.user.toLowerCase()

  const byReference = (ids: (string | null)[]) => {
    for (const id of ids) {
      const thread = id ? threadByMessageId.get(id) : undefined
      if (thread) return thread
    }
    return undefined
  }

  const inbox = await readInbox(mailbox, since, (message) => {
    if (known.has(message.messageId) || message.fromEmail === me) return false
    if (isDaemon(message.fromEmail)) return true
    if (message.autoReply) return false
    return Boolean(byReference([message.inReplyTo, ...message.references]) || threadByEmail.get(message.fromEmail))
  })

  // Reading replies with AI is part of the AI feature.
  const canClassify = workspace.entitlements.plan.features.ai
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

    // Read the reply and move the stage: interested → Qualified, no → Lost.
    const replyText = stripQuotedReply(message.text)
    let intent: ReplyIntent = 'other'
    let summary: string | null = null
    if (canClassify) {
      const { data: lastSent } = await supabase
        .from('outreach_messages')
        .select('body')
        .eq('thread_id', thread.id)
        .eq('direction', 'outbound')
        .order('sent_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const verdict = await classifyReply(replyText, lastSent?.body ?? '', workspace.seller?.companyName ?? 'the sender')
      if (verdict.ok) {
        intent = verdict.data.intent
        summary = verdict.data.summary || null
      }
    }
    const stage = stageForIntent(intent)
    if (stage) {
      const { data: current } = await supabase.from('leads').select('status').eq('id', thread.lead_id).maybeSingle()
      // Only move forward from the early stages; never undo a rep's own call.
      if (current && (current.status === 'New' || current.status === 'Contacted')) {
        await supabase.from('leads').update({ status: stage }).eq('id', thread.lead_id)
      }
    }

    await logActivity(supabase, {
      orgId: thread.org_id,
      leadId: thread.lead_id,
      userId: null,
      title: `Replied to cold email · ${INTENT_LABEL[intent]}`,
      body: [summary ? `Summary: ${summary}` : null, replyText.slice(0, 500)].filter(Boolean).join('\n\n'),
    })

    await notifyReply(thread, message.text, INTENT_LABEL[intent])
  }

  return { replies, bounces }
}

// ─── Scheduler ──────────────────────────────────────────────────────────────

/**
 * One scheduler pass for one workspace. Replies first, so nobody who just
 * answered gets another email; then follow-ups; then new leads.
 */
export async function runOutreachCycle(supabase: Client, orgId: string, deadline = Infinity) {
  const workspace = await loadWorkspace(orgId)
  if (!workspace.mailbox) {
    return { replies: 0, bounces: 0, followUps: 0, firsts: 0, errors: [NO_MAILBOX_ERROR] }
  }

  const errors: string[] = []
  let replies = 0
  let bounces = 0

  try {
    ;({ replies, bounces } = await syncReplies(supabase, orgId, workspace))
  } catch (error) {
    // Without a fresh inbox read we can't tell who replied, so hold all sending.
    errors.push(`Inbox check failed, sending held: ${errorText(error)}`)
    return { replies, bounces, followUps: 0, firsts: 0, errors }
  }

  const followUps = await sendDueFollowUps(supabase, workspace, deadline)
  const firsts = await sendQueued(supabase, workspace, deadline)
  return {
    replies,
    bounces,
    followUps: followUps.sent,
    firsts: firsts.sent,
    errors: [...errors, ...followUps.errors, ...firsts.errors],
  }
}

export type CycleResult = Awaited<ReturnType<typeof runOutreachCycle>>

/** Runs every workspace that has an inbox, recording each one's result. */
export async function runAllWorkspaces(supabase: Client, deadline: number) {
  const orgIds = await orgsWithMailbox()
  const results: Record<string, CycleResult> = {}
  for (const orgId of orgIds) {
    if (Date.now() > deadline) break
    try {
      results[orgId] = await runOutreachCycle(supabase, orgId, deadline)
    } catch (error) {
      results[orgId] = { replies: 0, bounces: 0, followUps: 0, firsts: 0, errors: [errorText(error)] }
    }
    const at = new Date().toISOString()
    await supabase.from('outreach_settings').upsert(
      { org_id: orgId, last_run_at: at, last_run: { ...results[orgId], errors: results[orgId].errors.slice(0, 5) }, updated_at: at },
      { onConflict: 'org_id' },
    )
  }
  return results
}

/**
 * Estimated send time for every lead waiting for its first email, in the
 * order the scheduler takes them (queued by hand first, then autopilot picks
 * — only as many as the plan's AI allowance has left).
 */
export async function estimateUpNext(supabase: Client, orgId: string) {
  const entitlements = await getEntitlements(orgId)
  const [{ data: queued }, autopilot, firstsToday] = await Promise.all([
    supabase.from('leads').select('*').eq('org_id', orgId).not('metadata->outreach_queue', 'is', null).limit(200),
    autopilotCandidates(supabase, orgId, entitlements),
    sentToday(supabase, orgId, true),
  ])

  const manual = (queued ?? [])
    .map((lead) => ({ lead, queue: outreachQueue(lead.metadata) }))
    .filter((item): item is { lead: Lead; queue: OutreachQueue } => item.queue !== null)
    .sort((a, b) => a.queue.queued_at.localeCompare(b.queue.queued_at))
    .map((item) => item.lead)

  const affordable = autopilot.slice(0, entitlements.remaining.aiLeads)
  const order = [...manual, ...affordable].map((lead) => ({ id: lead.id, timeZone: leadTimezone(lead) }))
  const etas = estimateFirstSends(order, {
    perRun: FIRSTS_PER_RUN,
    dailyNew: (await dailyPlan(supabase, orgId)).dailyNew,
    sentToday: firstsToday,
  })
  return Object.fromEntries([...etas].map(([id, at]) => [id, at.toISOString()])) as Record<string, string>
}
