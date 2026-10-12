import { z } from 'zod'
import type { LeadStatus } from '@/lib/supabase/types'
import { askClaudeJson } from './claude'

/**
 * Reads a lead's reply and says what it means, so the pipeline stage updates
 * itself: interested → Qualified, "no thanks" → Lost, anything else stays.
 */

export const REPLY_INTENTS = ['interested', 'question', 'not_interested', 'unsubscribe', 'referral', 'other'] as const
export type ReplyIntent = (typeof REPLY_INTENTS)[number]

const schema = z.object({ intent: z.enum(REPLY_INTENTS), summary: z.string() })

export const INTENT_LABEL: Record<ReplyIntent, string> = {
  interested: 'Interested',
  question: 'Has a question',
  not_interested: 'Not interested',
  unsubscribe: 'Asked to stop',
  referral: 'Pointed to someone else',
  other: 'Replied',
}

/** The stage a reply moves the lead to, or null to leave it. */
export function stageForIntent(intent: ReplyIntent): LeadStatus | null {
  if (intent === 'interested') return 'Qualified'
  if (intent === 'not_interested' || intent === 'unsubscribe') return 'Lost'
  return null
}

export async function classifyReply(reply: string, ourEmail: string) {
  return askClaudeJson({
    system:
      'You triage replies to cold sales emails for AI Savvy, an AI consulting company. Classify the reply. ' +
      'interested = wants a call, more info, pricing, or says yes. question = asks something without clear interest. ' +
      'not_interested = declines. unsubscribe = asks to stop emailing. referral = points to another person. ' +
      'summary = one short sentence of what they said, for the sales rep.',
    prompt: `Our email:\n${ourEmail.slice(0, 2000)}\n\nTheir reply:\n${reply.slice(0, 4000)}`,
    schema: {
      type: 'object',
      properties: {
        intent: { type: 'string', enum: [...REPLY_INTENTS] },
        summary: { type: 'string' },
      },
      required: ['intent', 'summary'],
      additionalProperties: false,
    },
    parse: (value) => schema.safeParse(value),
    effort: 'low',
    maxTokens: 1000,
  })
}
