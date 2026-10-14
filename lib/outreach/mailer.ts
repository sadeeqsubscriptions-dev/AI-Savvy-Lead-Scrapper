import { randomUUID } from 'node:crypto'
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import nodemailer from 'nodemailer'

/**
 * Email transport for one workspace's own mailbox: SMTP to send, IMAP to read
 * replies. Every function takes the Mailbox to use — see mailbox.ts for where
 * it comes from (a customer's connected inbox, or the env mailbox for the
 * AI Savvy team's workspace).
 */

export type MailProvider = 'zoho' | 'gmail' | 'outlook' | 'custom'

export type Mailbox = {
  provider: MailProvider
  user: string
  pass: string
  smtpHost: string
  smtpPort: number
  imapHost: string
  imapPort: number
  /** Set for inboxes connected with Google / Microsoft sign-in (XOAUTH2) instead of an app password. */
  accessToken?: string
}

/** Standard hosts for the providers customers pick in Settings. */
export function presetHosts(provider: MailProvider, zohoRegion = 'com') {
  if (provider === 'gmail') return { smtpHost: 'smtp.gmail.com', smtpPort: 465, imapHost: 'imap.gmail.com', imapPort: 993 }
  if (provider === 'outlook') {
    return { smtpHost: 'smtp-mail.outlook.com', smtpPort: 587, imapHost: 'outlook.office365.com', imapPort: 993 }
  }
  // Zoho mailboxes on your own domain use the "pro" hosts; regions differ.
  return {
    smtpHost: `smtppro.zoho.${zohoRegion}`,
    smtpPort: 465,
    imapHost: `imappro.zoho.${zohoRegion}`,
    imapPort: 993,
  }
}

/** The mailbox in the environment (EMAIL_USER / EMAIL_APP_PASSWORD), if set. */
export function envMailbox(): Mailbox | null {
  const user = process.env.EMAIL_USER ?? ''
  const pass = (process.env.EMAIL_APP_PASSWORD ?? '').replace(/\s+/g, '')
  if (!user || !pass) return null

  const provider: MailProvider =
    process.env.EMAIL_PROVIDER === 'gmail' || (!process.env.EMAIL_PROVIDER && /@(gmail|googlemail)\.com$/i.test(user))
      ? 'gmail'
      : 'zoho'
  const hosts = presetHosts(provider, process.env.ZOHO_REGION || 'com')
  return {
    provider,
    user,
    pass,
    smtpHost: process.env.SMTP_HOST || hosts.smtpHost,
    smtpPort: Number(process.env.SMTP_PORT) || hosts.smtpPort,
    imapHost: process.env.IMAP_HOST || hosts.imapHost,
    imapPort: Number(process.env.IMAP_PORT) || hosts.imapPort,
  }
}

/** Web inbox for the mailbox's provider, for the "Open mailbox" link. */
export function webmailUrl(mailbox: Mailbox | null) {
  if (!mailbox) return 'https://mail.google.com/'
  if (mailbox.provider === 'gmail') return 'https://mail.google.com/'
  if (mailbox.provider === 'outlook') return 'https://outlook.live.com/mail/'
  const region = mailbox.imapHost.match(/zoho\.([a-z.]+)$/)?.[1] ?? 'com'
  return mailbox.provider === 'zoho' ? `https://mail.zoho.${region}/` : 'about:blank'
}

export function newMessageId(mailbox: Mailbox) {
  const domain = mailbox.user.split('@')[1] || 'mail.local'
  return `<${randomUUID()}@${domain}>`
}

function createTransport(mailbox: Mailbox) {
  return nodemailer.createTransport({
    host: mailbox.smtpHost,
    port: mailbox.smtpPort,
    secure: mailbox.smtpPort === 465,
    auth: mailbox.accessToken
      ? { type: 'OAuth2', user: mailbox.user, accessToken: mailbox.accessToken }
      : { user: mailbox.user, pass: mailbox.pass },
  })
}

function createImap(mailbox: Mailbox) {
  return new ImapFlow({
    host: mailbox.imapHost,
    port: mailbox.imapPort,
    secure: true,
    auth: mailbox.accessToken
      ? { user: mailbox.user, accessToken: mailbox.accessToken }
      : { user: mailbox.user, pass: mailbox.pass },
    logger: false,
  })
}

function explain(mailbox: Mailbox, part: 'SMTP' | 'IMAP', error: unknown) {
  // imapflow reports a bad login as "Command failed" and puts the server's
  // words in `responseText`, flagging it with `authenticationFailed`.
  const details = error as { responseText?: string; authenticationFailed?: boolean }
  const raw = [error instanceof Error ? error.message : String(error), details?.responseText]
    .filter(Boolean)
    .join(': ')
  const host = part === 'SMTP' ? mailbox.smtpHost : mailbox.imapHost

  if (details?.authenticationFailed || /auth|credential|password|login|535|invalid/i.test(raw)) {
    const hint =
      mailbox.provider === 'zoho'
        ? ', and make sure IMAP Access is on in Zoho Mail settings and your Zoho plan includes IMAP/SMTP'
        : mailbox.provider === 'gmail'
          ? ' (Google account → Security → 2-Step Verification → App passwords)'
          : ''
    return `${part} login rejected on ${host}. Use an app password, not your normal password${hint}. (${raw})`
  }
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|getaddrinfo/i.test(raw)) {
    return `${part} could not reach ${host}. Check the provider (and Zoho region) in your email settings. (${raw})`
  }
  return `${part} failed on ${host}: ${raw}`
}

/** Logs in to SMTP and IMAP without sending anything, for the setup check. */
export async function testMailConnection(mailbox: Mailbox) {
  const result = {
    smtp: null as string | null,
    imap: null as string | null,
    smtpHost: mailbox.smtpHost,
    imapHost: mailbox.imapHost,
  }

  try {
    await createTransport(mailbox).verify()
  } catch (error) {
    result.smtp = explain(mailbox, 'SMTP', error)
  }

  const client = createImap(mailbox)
  try {
    await client.connect()
    const lock = await client.getMailboxLock('INBOX')
    lock.release()
  } catch (error) {
    result.imap = explain(mailbox, 'IMAP', error)
  } finally {
    await client.logout().catch(() => undefined)
  }

  return result
}

export async function sendMail(
  mailbox: Mailbox,
  message: {
    fromName: string
    to: string
    subject: string
    text: string
    messageId: string
    inReplyTo?: string | null
    references?: string[]
    /** A calendar invite (.ics text) the lead can accept straight from the email. */
    invite?: string
  },
) {
  try {
    await createTransport(mailbox).sendMail({
      from: { name: message.fromName, address: mailbox.user },
      to: message.to,
      subject: message.subject,
      text: message.text,
      messageId: message.messageId,
      inReplyTo: message.inReplyTo ?? undefined,
      references: message.references?.length ? message.references : undefined,
      // Gives Gmail/Yahoo a one-click unsubscribe target; replies land in the
      // inbox, where the sync stops the sequence.
      list: { unsubscribe: { url: `mailto:${mailbox.user}?subject=unsubscribe`, comment: 'Unsubscribe' } },
      ...(message.invite ? { icalEvent: { method: 'REQUEST', filename: 'invite.ics', content: message.invite } } : {}),
    })
  } catch (error) {
    throw new Error(explain(mailbox, 'SMTP', error))
  }
}

export type InboxMessage = {
  uid: number
  messageId: string
  inReplyTo: string | null
  references: string[]
  fromEmail: string
  subject: string
  date: Date
  autoReply: boolean
}

const MESSAGE_ID_PATTERN = /<[^<>\s]+>/g

function headerValue(headers: Buffer | undefined, name: string) {
  if (!headers) return ''
  // Header blocks fold long values onto indented continuation lines.
  const unfolded = headers.toString('utf8').replace(/\r?\n[ \t]+/g, ' ')
  const line = unfolded.split(/\r?\n/).find((row) => row.toLowerCase().startsWith(`${name.toLowerCase()}:`))
  return line ? line.slice(name.length + 1).trim() : ''
}

/**
 * Reads the inbox since `since` and returns the messages `pick` accepts, with
 * their plain-text body. Only headers are pulled for the scan; full bodies are
 * downloaded just for the matches.
 */
export async function readInbox(
  mailbox: Mailbox,
  since: Date,
  pick: (message: InboxMessage) => boolean,
): Promise<(InboxMessage & { text: string })[]> {
  const client = createImap(mailbox)

  try {
    await client.connect()
  } catch (error) {
    throw new Error(explain(mailbox, 'IMAP', error))
  }
  const lock = await client.getMailboxLock('INBOX')

  try {
    const uids = await client.search({ since }, { uid: true })
    if (!uids || uids.length === 0) return []

    const matches: InboxMessage[] = []
    for await (const item of client.fetch(
      uids,
      { uid: true, envelope: true, headers: ['references', 'auto-submitted', 'x-autoreply'] },
      { uid: true },
    )) {
      const envelope = item.envelope
      if (!envelope?.messageId) continue

      const autoSubmitted = headerValue(item.headers, 'auto-submitted').toLowerCase()
      const message: InboxMessage = {
        uid: item.uid,
        messageId: envelope.messageId,
        inReplyTo: envelope.inReplyTo ?? null,
        references: headerValue(item.headers, 'references').match(MESSAGE_ID_PATTERN) ?? [],
        fromEmail: (envelope.from?.[0]?.address ?? '').toLowerCase(),
        subject: envelope.subject ?? '',
        date: envelope.date ? new Date(envelope.date) : new Date(),
        autoReply:
          (autoSubmitted.length > 0 && autoSubmitted !== 'no') ||
          headerValue(item.headers, 'x-autoreply').length > 0,
      }
      if (pick(message)) matches.push(message)
    }

    const results: (InboxMessage & { text: string })[] = []
    for (const message of matches) {
      const full = await client.fetchOne(String(message.uid), { source: true }, { uid: true })
      if (!full || !full.source) continue
      const parsed = await simpleParser(full.source)
      results.push({ ...message, text: parsed.text ?? '' })
    }
    return results
  } finally {
    lock.release()
    await client.logout().catch(() => undefined)
  }
}

/** Every `<message-id>` mentioned anywhere in a text, e.g. a bounce report body. */
export function messageIdsIn(text: string) {
  return text.match(MESSAGE_ID_PATTERN) ?? []
}

/**
 * Drops the quoted history under a reply ("On Tue, … wrote:" and `>` lines),
 * so the dashboard shows what the lead actually wrote.
 */
export function stripQuotedReply(text: string) {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const kept: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (/^On .+wrote:$/i.test(trimmed) || /^-{2,}\s*Original Message\s*-{2,}$/i.test(trimmed)) break
    if (/^From: .+/i.test(trimmed) && kept.some((row) => row.trim().length > 0)) break
    if (trimmed.startsWith('>')) continue
    kept.push(line)
  }

  const result = kept.join('\n').trim()
  return result.length > 0 ? result : text.trim()
}

function icsDate(date: Date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/** Escapes text for an .ics field: backslash, semicolon, comma, newline. */
function icsText(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** A standard calendar invite (works in Gmail, Outlook, Apple Calendar). */
export function calendarInvite(event: {
  uid: string
  organizer: string
  start: Date
  minutes: number
  title: string
  description: string
  attendee: { name: string; email: string }
  location?: string | null
}) {
  return [
    'BEGIN:VCALENDAR',
    'PRODID:-//AI Savvy//Lead CRM//EN',
    'VERSION:2.0',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(event.start)}`,
    `DTEND:${icsDate(new Date(event.start.getTime() + event.minutes * 60_000))}`,
    `SUMMARY:${icsText(event.title)}`,
    `DESCRIPTION:${icsText(event.description)}`,
    ...(event.location ? [`LOCATION:${icsText(event.location)}`] : []),
    `ORGANIZER:mailto:${event.organizer}`,
    `ATTENDEE;CN=${icsText(event.attendee.name)};RSVP=TRUE:mailto:${event.attendee.email}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
}
