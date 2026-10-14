'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { canWrite, isAdmin, requireSession } from '@/lib/auth'
import { DAILY_NEW_MAX, DAILY_NEW_MIN } from '@/lib/outreach/config'
import {
  canSendNow,
  cancelQueued,
  previewOutreach,
  queueOutreach,
  replyToThread,
  startOutreach,
  syncReplies,
} from '@/lib/outreach/engine'
import { requireFeature } from '@/lib/billing/entitlements'
import { mailboxFor } from '@/lib/outreach/mailbox'
import { testMailConnection } from '@/lib/outreach/mailer'
import { createClient } from '@/lib/supabase/server'

type SendResult = { ok: true } | { ok: false; error: string }
/** Sent now, or scheduled for the lead's next business-hours window. */
type SendOrScheduleResult = { ok: true; scheduledFor: string | null } | { ok: false; error: string }

function refresh() {
  revalidatePath('/outreach')
  revalidatePath('/crm')
  revalidatePath('/dashboard')
}

const draftSchema = z.object({
  subject: z.string().trim().min(1, 'Add a subject line.').max(150),
  body: z.string().trim().min(20, 'The email is too short.').max(5000),
})

/** Claude writes the first email for review; nothing is sent. */
export async function previewOutreachEmail(leadId: string, force = false) {
  const session = await requireSession()
  if (!canWrite(session.role)) return { ok: false as const, error: 'Viewers cannot write email.' }

  const supabase = await createClient()
  const result = await previewOutreach(supabase, { orgId: session.organization.id, leadId, force })
  if (!result.ok && result.notAFit) revalidatePath('/outreach')
  return result
}

/**
 * Sends the first email now if it's business hours where the lead is;
 * otherwise schedules it for their next weekday morning. With `draft`, that
 * exact email goes out; without it, Claude writes one from the script.
 */
export async function sendOutreach(
  leadId: string,
  draft?: { subject: string; body: string },
): Promise<SendOrScheduleResult> {
  const session = await requireSession()
  if (!canWrite(session.role)) return { ok: false, error: 'Viewers cannot send email.' }

  let reviewed: { subject: string; body: string } | undefined
  if (draft) {
    const parsed = draftSchema.safeParse(draft)
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid email.' }
    reviewed = parsed.data
  }

  // Claude writes it unless the rep wrote it: that needs a plan with AI.
  if (!reviewed) {
    const allowed = await requireFeature(session.organization.id, 'ai')
    if (!allowed.ok) return allowed
  }

  const supabase = await createClient()
  const { data: place } = await supabase
    .from('leads')
    .select('location, city, country')
    .eq('id', leadId)
    .eq('org_id', session.organization.id)
    .maybeSingle()
  if (!place) return { ok: false, error: 'Lead not found.' }

  if (!canSendNow(place)) {
    const queued = await queueOutreach(supabase, {
      orgId: session.organization.id,
      leadId,
      by: session.userId,
      draft: reviewed,
    })
    refresh()
    return queued.ok ? { ok: true, scheduledFor: queued.label } : queued
  }

  const result = await startOutreach(supabase, {
    orgId: session.organization.id,
    leadId,
    userId: session.userId,
    draft: reviewed,
  })

  refresh()
  return result.ok ? { ok: true, scheduledFor: null } : result
}

export async function cancelScheduledOutreach(leadId: string): Promise<SendResult> {
  const session = await requireSession()
  if (!canWrite(session.role)) return { ok: false, error: 'Viewers cannot change outreach.' }

  const supabase = await createClient()
  await cancelQueued(supabase, { orgId: session.organization.id, leadId })
  refresh()
  revalidatePath(`/targeting/${leadId}`)
  return { ok: true }
}

/** Checks the inbox for replies, then sends any follow-ups that are due. */
/**
 * Reads the inbox for replies now. Sending (new leads and follow-ups) is the
 * scheduler's job, so opening the page never waits on emails going out.
 */
export async function syncOutreach() {
  const session = await requireSession()
  if (!canWrite(session.role)) return { replies: 0, bounces: 0, errors: [] as string[] }
  if (!(await mailboxFor(session.organization.id))) return { replies: 0, bounces: 0, errors: [] as string[] }

  const supabase = await createClient()
  try {
    const result = await syncReplies(supabase, session.organization.id)
    refresh()
    return { ...result, errors: [] as string[] }
  } catch (error) {
    return { replies: 0, bounces: 0, errors: [error instanceof Error ? error.message : 'Inbox check failed.'] }
  }
}

/** Turns the autopilot (automatic first emails) on or off for the workspace. */
export async function setAutopilot(enabled: boolean): Promise<SendResult> {
  const session = await requireSession()
  if (!isAdmin(session.role)) return { ok: false, error: 'Only owners and admins can change the autopilot.' }
  if (enabled) {
    const allowed = await requireFeature(session.organization.id, 'autopilot')
    if (!allowed.ok) return allowed
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('outreach_settings')
    .upsert({ org_id: session.organization.id, autopilot: enabled, updated_at: new Date().toISOString() }, { onConflict: 'org_id' })
  if (error) {
    return {
      ok: false,
      error: error.message.includes('outreach_settings')
        ? 'Run the outreach_settings database update first (see setup steps).'
        : error.message,
    }
  }
  refresh()
  return { ok: true }
}

/** How many new leads the autopilot emails per day for this workspace. */
export async function setDailyNew(value: number): Promise<SendResult> {
  const session = await requireSession()
  if (!isAdmin(session.role)) return { ok: false, error: 'Only owners and admins can change the daily pace.' }
  if (!Number.isFinite(value) || value < DAILY_NEW_MIN || value > DAILY_NEW_MAX) {
    return { ok: false, error: `Choose between ${DAILY_NEW_MIN} and ${DAILY_NEW_MAX} new leads a day.` }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('outreach_settings')
    .upsert(
      { org_id: session.organization.id, daily_new: Math.round(value), updated_at: new Date().toISOString() },
      { onConflict: 'org_id' },
    )
  if (error) {
    return {
      ok: false,
      error: error.message.includes('daily_new')
        ? 'Run the daily-pace database update first (supabase/migrations/20261015120000_daily_pace.sql).'
        : error.message,
    }
  }
  refresh()
  return { ok: true }
}

export async function stopOutreach(threadId: string): Promise<SendResult> {
  const session = await requireSession()
  if (!canWrite(session.role)) return { ok: false, error: 'Viewers cannot change outreach.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('outreach_threads')
    .update({ status: 'stopped', next_followup_at: null })
    .eq('id', threadId)
    .eq('org_id', session.organization.id)
    .eq('status', 'active')

  if (error) return { ok: false, error: 'Could not stop the sequence.' }
  revalidatePath('/outreach')
  return { ok: true }
}

export async function replyOutreach(threadId: string, body: string): Promise<SendResult> {
  const session = await requireSession()
  if (!canWrite(session.role)) return { ok: false, error: 'Viewers cannot send email.' }

  const text = body.trim()
  if (text.length < 2) return { ok: false, error: 'Write a reply first.' }
  if (text.length > 10_000) return { ok: false, error: 'That reply is too long.' }

  const supabase = await createClient()
  const result = await replyToThread(supabase, {
    orgId: session.organization.id,
    threadId,
    userId: session.userId,
    body: text,
  })

  refresh()
  return result
}

/** Logs in to the mailbox over SMTP and IMAP without sending, to verify setup. */
export async function checkEmailConnection() {
  const session = await requireSession()
  if (!canWrite(session.role)) return { ok: false as const, error: 'Viewers cannot change email settings.' }
  const mailbox = await mailboxFor(session.organization.id)
  if (!mailbox) {
    return { ok: false as const, error: 'No inbox connected yet. Add yours in Settings → Email.' }
  }

  const result = await testMailConnection(mailbox)
  const problems = [result.smtp, result.imap].filter((problem): problem is string => Boolean(problem))
  return problems.length === 0
    ? { ok: true as const, message: `Connected: sending via ${result.smtpHost}, reading replies via ${result.imapHost}.` }
    : { ok: false as const, error: problems.join(' ') }
}
