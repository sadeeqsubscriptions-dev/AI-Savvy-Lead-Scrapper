'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { isAdmin, requireSession } from '@/lib/auth'
import { failure, optionalText, type ActionState } from '@/lib/actions/state'
import { presetHosts, testMailConnection, type MailProvider, type Mailbox } from '@/lib/outreach/mailer'
import { encryptSecret } from '@/lib/security/secrets'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const profileSchema = z.object({
  company_name: z.string().trim().min(2, 'Enter your company name').max(120),
  website: optionalText,
  description: z.string().trim().min(20, 'Describe what you do in a sentence or two').max(1500),
  services: z
    .string()
    .trim()
    .min(5, 'List at least one service')
    .max(4000)
    .refine((value) => value.split(/\r?\n/).some((line) => line.trim().length > 2), 'List at least one service'),
  booking_url: optionalText.refine(
    (value) => value === null || /^https?:\/\//i.test(value),
    'Booking link must start with https://',
  ),
  sender_name: z.string().trim().min(2, 'Who are the emails from?').max(80),
  sender_title: optionalText,
  postal_address: optionalText,
})

/** What the workspace sells — the AI pitches this in scripts, emails and calls. */
export async function saveSalesProfile(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSession()
  if (!isAdmin(session.role)) return { error: 'Only the owner or an admin can change the sales profile.' }

  const parsed = profileSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return failure(parsed.error)

  const supabase = await createClient()
  const { error } = await supabase
    .from('sales_profiles')
    .upsert({ org_id: session.organization.id, ...parsed.data, updated_at: new Date().toISOString() }, { onConflict: 'org_id' })
  if (error) return { error: error.message }

  revalidatePath('/setup')
  return { ok: true, message: 'Sales profile saved. The AI now pitches your services.' }
}

const mailSchema = z.object({
  provider: z.enum(['zoho', 'gmail', 'outlook', 'custom']),
  email: z.string().trim().toLowerCase().email('Enter the full email address'),
  password: z.string().min(4, 'Paste the app password'),
  zoho_region: z.enum(['com', 'eu', 'in', 'com.au', 'jp', 'sa']).default('com'),
  smtp_host: optionalText,
  smtp_port: z.coerce.number().int().min(1).max(65535).optional(),
  imap_host: optionalText,
  imap_port: z.coerce.number().int().min(1).max(65535).optional(),
})

/**
 * Connects the inbox emails are sent from. Logs in over SMTP and IMAP first;
 * only a working mailbox is saved, with the password encrypted.
 */
export async function connectMailbox(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSession()
  if (!isAdmin(session.role)) return { error: 'Only the owner or an admin can connect the inbox.' }

  const parsed = mailSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return failure(parsed.error)
  const input = parsed.data

  const preset = presetHosts(input.provider as MailProvider, input.zoho_region)
  const mailbox: Mailbox = {
    provider: input.provider as MailProvider,
    user: input.email,
    pass: input.password.replace(/\s+/g, ''),
    smtpHost: input.provider === 'custom' ? (input.smtp_host ?? '') : preset.smtpHost,
    smtpPort: input.provider === 'custom' ? (input.smtp_port ?? 465) : preset.smtpPort,
    imapHost: input.provider === 'custom' ? (input.imap_host ?? '') : preset.imapHost,
    imapPort: input.provider === 'custom' ? (input.imap_port ?? 993) : preset.imapPort,
  }
  if (!mailbox.smtpHost || !mailbox.imapHost) return { error: 'Enter the SMTP and IMAP server names.' }

  const check = await testMailConnection(mailbox)
  const problems = [check.smtp, check.imap].filter(Boolean)
  if (problems.length > 0) return { error: problems.join(' ') }

  const { error } = await createAdminClient()
    .from('mail_accounts')
    .upsert(
      {
        org_id: session.organization.id,
        email: mailbox.user,
        provider: mailbox.provider,
        smtp_host: mailbox.smtpHost,
        smtp_port: mailbox.smtpPort,
        imap_host: mailbox.imapHost,
        imap_port: mailbox.imapPort,
        password_encrypted: encryptSecret(mailbox.pass),
        verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'org_id' },
    )
  if (error) return { error: error.message }

  revalidatePath('/setup')
  revalidatePath('/outreach')
  return { ok: true, message: `Connected ${mailbox.user}. Emails will be sent from this inbox.` }
}

export async function disconnectMailbox(): Promise<ActionState> {
  const session = await requireSession()
  if (!isAdmin(session.role)) return { error: 'Only the owner or an admin can disconnect the inbox.' }
  await createAdminClient().from('mail_accounts').delete().eq('org_id', session.organization.id)
  revalidatePath('/setup')
  revalidatePath('/outreach')
  return { ok: true, message: 'Inbox disconnected. Nothing will be sent until you connect one again.' }
}
