import { z } from 'zod'
import { COMPANY, senderConfig } from '@/lib/outreach/config'
import { leadTimezone } from '@/lib/outreach/schedule'
import type { CallEvent, Lead, LeadAiBrief } from '@/lib/supabase/types'
import { askClaudeJson } from './claude'

/**
 * Live call coaching. Claude sees the brief and the transcript so far and
 * returns what to say next — two sentences at most, so the rep can read it
 * while the lead is still talking — plus anything actionable it heard: a
 * meeting time, a call-back time, or a request for an email.
 */

const SERVICES = COMPANY.services.map((service) => `- ${service.name}: ${service.pitch}`).join('\n')

type Line = Pick<CallEvent, 'speaker' | 'text'>

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

function transcriptText(events: Line[]) {
  return events.map((event) => `${event.speaker === 'rep' ? 'REP' : 'LEAD'}: ${event.text}`).join('\n')
}

/** "Monday, October 12, 2026, 10:42 AM (America/New_York, UTC-04:00)" — so "tomorrow at 3" resolves. */
function clockFor(timeZone: string) {
  const now = new Date()
  const local = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(now)
  const offset = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(now)
    .find((part) => part.type === 'timeZoneName')?.value
  return `${local} (${timeZone}, ${offset?.replace('GMT', 'UTC') ?? 'UTC'})`
}

const TIME_RULES = (timeZone: string) => `It is now ${clockFor(timeZone)} for the lead.
Times: if a specific meeting time was agreed (or proposed by the lead), return it as an ISO 8601 timestamp with the lead's UTC offset, e.g. 2026-10-14T15:00:00-04:00, resolving words like "tomorrow" or "Thursday afternoon" (afternoon = 2 PM) from the current date above. If the lead asked to be called back at a time, put it in callback_time the same way. Otherwise use an empty string. Never guess a time nobody mentioned.`

const detectedFields = {
  meeting_time: { type: 'string', description: 'ISO time of an agreed/proposed meeting, or empty' },
  callback_time: { type: 'string', description: 'ISO time the lead asked to be called back, or empty' },
  wants_email: { type: 'boolean', description: 'Lead asked for info / details by email' },
} as const

const detectedSchema = {
  meeting_time: z.string(),
  callback_time: z.string(),
  wants_email: z.boolean(),
}

const suggestionSchema = z.object({
  heard: z.string(),
  say: z.string().min(1),
  next: z.string(),
  ...detectedSchema,
})

export type CallSuggestion = z.infer<typeof suggestionSchema>

export async function suggestReply(lead: Lead, brief: LeadAiBrief | null, events: Line[]) {
  const zone = leadTimezone(lead)
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
Answer questions about ${COMPANY.name} truthfully from the info above. If you don't know (e.g. exact pricing), have the rep say they'll cover it on the 15-minute call. Never invent prices, clients or results.

${TIME_RULES(zone)}`,
    prompt: `${context(lead, brief)}

Call transcript so far (latest last):
${transcriptText(events.slice(-14))}

What should the rep say next?`,
    schema: {
      type: 'object',
      properties: {
        heard: { type: 'string' },
        say: { type: 'string' },
        next: { type: 'string' },
        ...detectedFields,
      },
      required: ['heard', 'say', 'next', 'meeting_time', 'callback_time', 'wants_email'],
      additionalProperties: false,
    },
    parse: (value) => suggestionSchema.safeParse(value),
    // Read live, mid-sentence: the fast model, no thinking, short output.
    fast: true,
    effort: 'low',
    maxTokens: 600,
  })
}

const summarySchema = z.object({
  summary: z.string().min(1),
  outcome: z.enum(['meeting_booked', 'interested', 'call_back', 'not_interested', 'no_conversation']),
  next_step: z.string(),
  ...detectedSchema,
})

export type CallSummary = z.infer<typeof summarySchema>

export async function summarizeCall(lead: Lead, events: Line[]) {
  return askClaudeJson({
    system: `You write short CRM notes after sales calls for ${COMPANY.name}. Plain, factual, no fluff.\n\n${TIME_RULES(leadTimezone(lead))}`,
    prompt: `Lead: ${lead.full_name}${lead.company ? ` (${lead.company})` : ''}

Transcript:
${transcriptText(events)}

Return: summary (2-3 sentences: what was discussed, their situation, interest level), outcome, next_step (one line, or empty), and any meeting_time / callback_time / wants_email.`,
    schema: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        outcome: {
          type: 'string',
          enum: ['meeting_booked', 'interested', 'call_back', 'not_interested', 'no_conversation'],
        },
        next_step: { type: 'string' },
        ...detectedFields,
      },
      required: ['summary', 'outcome', 'next_step', 'meeting_time', 'callback_time', 'wants_email'],
      additionalProperties: false,
    },
    parse: (value) => summarySchema.safeParse(value),
    effort: 'low',
    maxTokens: 2000,
  })
}

const emailSchema = z.object({ subject: z.string().min(1), body: z.string().min(10) })

/** The email the rep sends after a call: recap + what was promised + next step. */
export async function writeCallEmail(
  lead: Lead,
  brief: LeadAiBrief | null,
  events: Line[],
  extra: { meetingTime: string | null },
) {
  const sender = senderConfig()
  return askClaudeJson({
    system: `You write the short email a sales rep sends right after a phone call, as ${sender.name} (${sender.title}) from ${COMPANY.name} (${COMPANY.website}).
${COMPANY.name}: ${COMPANY.positioning}
Services:
${SERVICES}
Booking link for a free 15-minute call: ${COMPANY.bookingUrl}

Rules: 60-120 words, plain text, no markdown. Thank them for the call, recap in one or two sentences what they said they need, state the one service that fits and the concrete outcome, then the next step (the agreed meeting time if there is one; otherwise the booking link). Never invent facts not in the call or brief. No signature — it is added automatically. Subject: short and specific, no "Re:".`,
    prompt: `${context(lead, brief)}
${extra.meetingTime ? `Meeting agreed for: ${extra.meetingTime}` : 'No meeting time agreed yet.'}

Call transcript:
${events.length > 0 ? transcriptText(events.slice(-60)) : '(No transcript: the call was made outside the dialer. Write a short follow-up based on the brief.)'}`,
    schema: {
      type: 'object',
      properties: { subject: { type: 'string' }, body: { type: 'string' } },
      required: ['subject', 'body'],
      additionalProperties: false,
    },
    parse: (value) => emailSchema.safeParse(value),
    effort: 'low',
    maxTokens: 2500,
  })
}
