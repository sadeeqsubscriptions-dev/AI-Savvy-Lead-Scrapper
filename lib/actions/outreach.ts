'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { canWrite, requireSession } from '@/lib/auth'
import { BATCH_SIZE } from '@/lib/outreach/config'
import { previewOutreach, replyToThread, runOutreachCycle, startOutreach } from '@/lib/outreach/engine'
import { mailConfigured, testMailConnection } from '@/lib/outreach/mailer'
import { createClient } from '@/lib/supabase/server'

type SendResult = { ok: true } | { ok: false; error: string }

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
 * Sends the first email. With `draft`, sends exactly what the rep reviewed;
 * without it, Claude writes one on the spot (the one-click path).
 */
export async function sendOutreach(
  leadId: string,
  draft?: { subject: string; body: string },
): Promise<SendResult> {
  const session = await requireSession()
  if (!canWrite(session.role)) return { ok: false, error: 'Viewers cannot send email.' }

  let reviewed: { subject: string; body: string } | undefined
  if (draft) {
    const parsed = draftSchema.safeParse(draft)
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid email.' }
    reviewed = parsed.data
  }

  const supabase = await createClient()
  const result = await startOutreach(supabase, {
    orgId: session.organization.id,
    leadId,
    userId: session.userId,
    draft: reviewed,
  })

  refresh()
  return result
}

/** Sends first emails one after another; capped so the request fits the time limit. */
export async function sendOutreachBatch(leadIds: string[]) {
  const session = await requireSession()
  if (!canWrite(session.role)) return { sent: 0, skipped: 0, errors: ['Viewers cannot send email.'] }

  const supabase = await createClient()
  let sent = 0
  let skipped = 0
  const errors: string[] = []

  for (const leadId of leadIds.slice(0, BATCH_SIZE)) {
    const result = await startOutreach(supabase, {
      orgId: session.organization.id,
      leadId,
      userId: session.userId,
    })
    if (result.ok) {
      sent++
    } else if (result.error.startsWith('Skipped')) {
      skipped++
    } else {
      errors.push(result.error)
      // No point burning Claude credits on the rest once the cap is hit.
      if (result.error.startsWith('Daily send limit') || result.error.startsWith('Email is not connected')) break
    }
  }

  refresh()
  return { sent, skipped, errors }
}

/** Checks the inbox for replies, then sends any follow-ups that are due. */
export async function syncOutreach() {
  const session = await requireSession()
  if (!canWrite(session.role)) return { replies: 0, bounces: 0, followUps: 0, errors: [] }

  const supabase = await createClient()
  const result = await runOutreachCycle(supabase, session.organization.id)
  refresh()
  return result
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
  if (!mailConfigured()) {
    return { ok: false as const, error: 'EMAIL_USER and EMAIL_APP_PASSWORD are not set.' }
  }

  const result = await testMailConnection()
  const problems = [result.smtp, result.imap].filter((problem): problem is string => Boolean(problem))
  return problems.length === 0
    ? { ok: true as const, message: `Connected: sending via ${result.smtpHost}, reading replies via ${result.imapHost}.` }
    : { ok: false as const, error: problems.join(' ') }
}
