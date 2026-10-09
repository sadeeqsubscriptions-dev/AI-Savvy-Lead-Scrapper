import type { Json } from '@/lib/supabase/types'

/**
 * A lead waiting for its first email, stored on `leads.metadata.outreach_queue`.
 * Researching a lead queues it; the scheduler sends it inside the lead's
 * business hours. `draft` is set when a rep wrote/edited the email themselves.
 */
export type OutreachQueue = {
  queued_at: string
  by: string | null
  draft?: { subject: string; body: string }
  attempts?: number
  last_error?: string
}

export function outreachQueue(metadata: Json | null | undefined): OutreachQueue | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const value = (metadata as Record<string, Json | undefined>).outreach_queue
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const queue = value as unknown as OutreachQueue
  return typeof queue.queued_at === 'string' ? queue : null
}

/** Metadata with the queue entry set (or removed when `queue` is null). */
export function withQueue(metadata: Json | null | undefined, queue: OutreachQueue | null): Json {
  const base = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? { ...metadata } : {}
  if (queue) (base as Record<string, Json>).outreach_queue = queue as unknown as Json
  else delete (base as Record<string, Json | undefined>).outreach_queue
  return base as Json
}
