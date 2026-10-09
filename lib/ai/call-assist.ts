import { z } from 'zod'
import { COMPANY } from '@/lib/outreach/config'
import type { CallEvent, Lead, LeadAiBrief } from '@/lib/supabase/types'
import { askClaudeJson } from './claude'

/**
 * Live call coaching. Claude sees the brief and the transcript so far and
 * returns what to say next — two sentences at most, so the rep can read it
 * while the lead is still talking.
 */

const SERVICES = COMPANY.services.map((service) => `- ${service.name}: ${service.pitch}`).join('\n')

function context(lead: Lead, brief: LeadAiBrief | null) {
  return [
    `Lead: ${lead.full_name}${lead.company ? ` (${lead.company})` : ''}${lead.industry ? `, ${lead.industry}` : ''}`,
    brief ? `Who they are: ${brief.summary}` : null,
    brief ? `Where to hit them: ${brief.pain_points.join(' | ')}` : null,
    brief ? `Planned offer: ${brief.offer.service} — ${brief.offer.pitch}` : null,
  ]
    .filter(Boolean)
    .join('\n')
}

function transcriptText(events: Pick<CallEvent, 'speaker' | 'text'>[]) {
  return events
    .map((event) => `${event.speaker === 'rep' ? 'REP' : 'LEAD'}: ${event.text}`)
    .join('\n')
}

const suggestionSchema = z.object({
  heard: z.string(),
  say: z.string().min(1),
  next: z.string(),
})

export type CallSuggestion = z.infer<typeof suggestionSchema>

export async function suggestReply(lead: Lead, brief: LeadAiBrief | null, events: Pick<CallEvent, 'speaker' | 'text'>[]) {
  return askClaudeJson({
    system: `You are a live sales coach whispering to a rep from ${COMPANY.name} (${COMPANY.website}) during a cold call.
${COMPANY.name}: ${COMPANY.positioning}
Services:
${SERVICES}
Goal of the call: book a free 15-minute call (${COMPANY.bookingUrl}).

Answer FAST and SHORT. The rep reads this while talking.
- heard: what the lead just asked or objected to, in under 8 words (empty if nothing needs answering).
- say: the exact words the rep should say next. Max 2 short sentences, conversational, no jargon.
- next: one tiny tip (e.g. "Ask how they book jobs today"), under 10 words, or empty.
Answer questions about ${COMPANY.name} truthfully from the info above. If you don't know (e.g. exact pricing), have the rep say they'll cover it on the 15-minute call. Never invent prices, clients or results.`,
    prompt: `${context(lead, brief)}

Call transcript so far (latest last):
${transcriptText(events.slice(-30))}

What should the rep say next?`,
    schema: {
      type: 'object',
      properties: {
        heard: { type: 'string' },
        say: { type: 'string' },
        next: { type: 'string' },
      },
      required: ['heard', 'say', 'next'],
      additionalProperties: false,
    },
    parse: (value) => suggestionSchema.safeParse(value),
    effort: 'low',
    maxTokens: 1500,
  })
}

const summarySchema = z.object({
  summary: z.string().min(1),
  outcome: z.enum(['meeting_booked', 'interested', 'call_back', 'not_interested', 'no_conversation']),
  next_step: z.string(),
})

export type CallSummary = z.infer<typeof summarySchema>

export async function summarizeCall(lead: Lead, events: Pick<CallEvent, 'speaker' | 'text'>[]) {
  return askClaudeJson({
    system: `You write short CRM notes after sales calls for ${COMPANY.name}. Plain, factual, no fluff.`,
    prompt: `Lead: ${lead.full_name}${lead.company ? ` (${lead.company})` : ''}

Transcript:
${transcriptText(events)}

Return: summary (2-3 sentences: what was discussed, their situation, interest level), outcome, next_step (one line, or empty).`,
    schema: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        outcome: {
          type: 'string',
          enum: ['meeting_booked', 'interested', 'call_back', 'not_interested', 'no_conversation'],
        },
        next_step: { type: 'string' },
      },
      required: ['summary', 'outcome', 'next_step'],
      additionalProperties: false,
    },
    parse: (value) => summarySchema.safeParse(value),
    effort: 'low',
    maxTokens: 2000,
  })
}
