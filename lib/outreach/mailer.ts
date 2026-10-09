import { randomUUID } from 'node:crypto'
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import nodemailer from 'nodemailer'

/**
 * Email transport: the sender's own mailbox over SMTP (send) and IMAP (read
 * replies). Presets cover Zoho and Gmail; SMTP_HOST / IMAP_HOST override them
 * for any other provider.
 */
type Provider = 'zoho' | 'gmail'

function presetHosts(provider: Provider) {
  if (provider === 'gmail') return { smtp: 'smtp.gmail.com', imap: 'imap.gmail.com' }

  // Zoho runs separate data centers (zoho.com, zoho.eu, zoho.in, …) and uses
  // the "pro" hosts for mailboxes on your own domain.
  const region = process.env.ZOHO_REGION || 'com'
  const personal = process.env.ZOHO_ACCOUNT_TYPE === 'personal'
  return {
    smtp: `${personal ? 'smtp' : 'smtppro'}.zoho.${region}`,
    imap: `${personal ? 'imap' : 'imappro'}.zoho.${region}`,
  }
}

function mailEnv() {
  const user = process.env.EMAIL_USER ?? ''
  const provider: Provider =
    process.env.EMAIL_PROVIDER === 'gmail' ||
    (!process.env.EMAIL_PROVIDER && /@(gmail|googlemail)\.com$/i.test(user))
      ? 'gmail'
      : 'zoho'
  const hosts = presetHosts(provider)

  return {
    provider,
    user,
    pass: (process.env.EMAIL_APP_PASSWORD ?? '').replace(/\s+/g, ''),
    smtpHost: process.env.SMTP_HOST || hosts.smtp,
    smtpPort: Number(process.env.SMTP_PORT) || 465,
    imapHost: process.env.IMAP_HOST || hosts.imap,
    imapPort: Number(process.env.IMAP_PORT) || 993,
  }
}

/** Web inbox for the configured provider, for the "Open mailbox" link. */
export function webmailUrl() {
  const env = mailEnv()
  if (env.provider === 'gmail') return 'https://mail.google.com/'
  return `https://mail.zoho.${process.env.ZOHO_REGION || 'com'}/`
}

export function mailConfigured() {
  const env = mailEnv()
  return Boolean(env.user && env.pass)
}

export function senderAddress() {
  return mailEnv().user.toLowerCase()
}

export function newMessageId() {
  const domain = senderAddress().split('@')[1] || 'aisavvy.us'
  return `<${randomUUID()}@${domain}>`
}

function createTransport() {
  const env = mailEnv()
  return nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpPort === 465,
    auth: { user: env.user, pass: env.pass },
  })
}

function createImap() {
  const env = mailEnv()
  return new ImapFlow({
    host: env.imapHost,
    port: env.imapPort,
    secure: true,
    auth: { user: env.user, pass: env.pass },
    logger: false,
  })
}

function explain(part: 'SMTP' | 'IMAP', error: unknown) {
  const env = mailEnv()
  // imapflow reports a bad login as "Command failed" and puts the server's
  // words in `responseText`, flagging it with `authenticationFailed`.
  const details = error as { responseText?: string; authenticationFailed?: boolean }
  const raw = [error instanceof Error ? error.message : String(error), details?.responseText]
    .filter(Boolean)
    .join(': ')
  const host = part === 'SMTP' ? env.smtpHost : env.imapHost

  if (details?.authenticationFailed || /auth|credential|password|login|535|invalid/i.test(raw)) {
    return `${part} login rejected on ${host}. Use an app-specific password (not your normal password)${
      env.provider === 'zoho' ? ', and make sure IMAP Access is enabled in Zoho Mail settings and your plan includes IMAP/SMTP (Mail Lite or higher)' : ''
    }. (${raw})`
  }
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|getaddrinfo/i.test(raw)) {
    return `${part} could not reach ${host}. Check ZOHO_REGION (com, eu, in, com.au…) matches your Zoho data center. (${raw})`
  }
  return `${part} failed on ${host}: ${raw}`
}

/** Logs in to SMTP and IMAP without sending anything, for the setup check. */
export async function testMailConnection() {
  const env = mailEnv()
  const result = { smtp: null as string | null, imap: null as string | null, smtpHost: env.smtpHost, imapHost: env.imapHost }

  try {
    await createTransport().verify()
  } catch (error) {
    result.smtp = explain('SMTP', error)
  }

  const client = createImap()
  try {
    await client.connect()
    const lock = await client.getMailboxLock('INBOX')
    lock.release()
  } catch (error) {
    result.imap = explain('IMAP', error)
  } finally {
    await client.logout().catch(() => undefined)
  }

  return result
}

export async function sendMail(message: {
  fromName: string
  to: string
  subject: string
  text: string
  messageId: string
  inReplyTo?: string | null
  references?: string[]
}) {
  const env = mailEnv()
  const transport = createTransport()

  try {
    await transport.sendMail({
      from: { name: message.fromName, address: env.user },
      to: message.to,
      subject: message.subject,
      text: message.text,
      messageId: message.messageId,
      inReplyTo: message.inReplyTo ?? undefined,
      references: message.references?.length ? message.references : undefined,
      // Gives Gmail/Yahoo a one-click unsubscribe target; replies land in the
      // inbox, where the sync stops the sequence.
      list: { unsubscribe: { url: `mailto:${env.user}?subject=unsubscribe`, comment: 'Unsubscribe' } },
    })
  } catch (error) {
    throw new Error(explain('SMTP', error))
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
  since: Date,
  pick: (message: InboxMessage) => boolean,
): Promise<(InboxMessage & { text: string })[]> {
  const client = createImap()

  try {
    await client.connect()
  } catch (error) {
    throw new Error(explain('IMAP', error))
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
