import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

/**
 * AES-256-GCM for secrets we must store and use later (customers' mailbox
 * app passwords). The key comes from MAIL_ENCRYPTION_KEY, or is derived from
 * the Supabase service key so it works without extra setup. Changing either
 * means customers reconnect their mailbox.
 */
function key() {
  const source = process.env.MAIL_ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!source) throw new Error('No encryption key: set MAIL_ENCRYPTION_KEY.')
  return createHash('sha256').update(`ai-savvy-mail:${source}`).digest()
}

export function encryptSecret(plain: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join('.')
}

export function decryptSecret(sealed: string) {
  const [version, iv, tag, data] = sealed.split('.')
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('Unreadable secret.')
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8')
}
