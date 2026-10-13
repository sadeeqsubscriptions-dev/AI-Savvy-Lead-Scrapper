import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { sellerBrief, type Seller } from '@/lib/outreach/seller'
import type { Database, Lead, LeadAiBrief } from '@/lib/supabase/types'
import { currentBrief } from './brief-shape'
import { askClaudeJson, webSearchTool } from './claude'

/**
 * The lead brief: a short script (who they are, where to hit them, what to
 * offer). The Targeting page shows it, outreach emails are written from it,
 * and the dialer keeps it on screen during calls — one source of truth. It
 * pitches the workspace's own services (its Seller), not anyone else's.
 */

const briefSchema = z.object({
  summary: z.string().min(1),
  pain_points: z.array(z.string().min(1)).min(1).max(4),
  offer: z.object({ service: z.string().min(1), pitch: z.string().min(1) }),
  opener: z.string().min(1),
  objections: z.array(z.object({ objection: z.string().min(1), response: z.string().min(1) })).max(4),
  sources: z.array(z.object({ title: z.string(), url: z.string() })),
})

function jsonSchema(seller: Seller) {
  return {
    type: 'object',
    properties: {
      summary: { type: 'string', description: '2-3 short lines: who they are and what they do' },
      pain_points: {
        type: 'array',
        items: { type: 'string' },
        description: `2-3 one-line problems this business likely has that ${seller.companyName} can fix`,
      },
      offer: {
        type: 'object',
        properties: {
          service: { type: 'string', enum: seller.services.map((service) => service.name) },
          pitch: { type: 'string', description: 'One or two sentences: the concrete outcome for them' },
        },
        required: ['service', 'pitch'],
        additionalProperties: false,
      },
      opener: { type: 'string', description: 'The first one or two sentences to say on a cold call' },
      objections: {
        type: 'array',
        items: {
          type: 'object',
          properties: { objection: { type: 'string' }, response: { type: 'string' } },
          required: ['objection', 'response'],
          additionalProperties: false,
        },
        description: '2-3 likely objections with a one-sentence answer each',
      },
      sources: {
        type: 'array',
        items: {
          type: 'object',
          properties: { title: { type: 'string' }, url: { type: 'string' } },
          required: ['title', 'url'],
          additionalProperties: false,
        },
      },
    },
    required: ['summary', 'pain_points', 'offer', 'opener', 'objections', 'sources'],
    additionalProperties: false,
  }
}

function system(seller: Seller) {
  return `You prepare short sales scripts for ${seller.companyName}.

${sellerBrief(seller)}

Rules:
- Be concise. A rep reads this seconds before calling. No filler, no generic advice.
- summary: 2-3 short lines max.
- pain_points: 2-3 items, one line each, specific to this business type (e.g. "Bookings come in by phone — missed calls after 6pm are lost jobs").
- offer: choose exactly ONE service — the one they most obviously need — and say the outcome in plain words.
- opener: natural, specific to them, ends with a question. No "how are you today".
- objections: 2-3, each answered in one sentence.
- Never invent facts. If research finds little, stay specific to their industry.`
}

function leadFacts(lead: Lead) {
  return [
    `Name: ${lead.full_name}`,
    lead.company ? `Company: ${lead.company}` : null,
    lead.title ? `Title: ${lead.title}` : null,
    lead.industry ? `Industry: ${lead.industry}` : null,
    lead.website ? `Website: ${lead.website}` : null,
    lead.location || lead.city
      ? `Location: ${lead.location ?? lead.city}${lead.country ? `, ${lead.country}` : ''}`
      : null,
    `Pipeline stage: ${lead.status}`,
    lead.notes ? `Rep notes: ${lead.notes}` : null,
  ]
    .filter(Boolean)
    .join('\n')
}

export async function generateBrief(lead: Lead, userId: string | null, seller: Seller) {
  const result = await askClaudeJson({
    system: system(seller),
    prompt: `Research this lead with a quick web search or two (their website first if given), then write the script.

Lead:
${leadFacts(lead)}`,
    schema: jsonSchema(seller),
    parse: (value) => briefSchema.safeParse(value),
    tools: [webSearchTool(2)],
    tier: 'bulk',
    effort: 'low',
    maxTokens: 6000,
  })

  if (!result.ok) return result
  const brief: LeadAiBrief = { version: 2, ...result.data, generated_by: userId, model: result.model }
  return { ok: true as const, brief }
}

/** Generates and saves the brief when the lead doesn't have a current one. */
export async function ensureBrief(
  supabase: SupabaseClient<Database>,
  lead: Lead,
  userId: string | null,
  seller: Seller,
) {
  const existing = currentBrief(lead.ai_brief)
  if (existing) return { ok: true as const, brief: existing }

  const result = await generateBrief(lead, userId, seller)
  if (!result.ok) return result

  await supabase
    .from('leads')
    .update({ ai_brief: result.brief, ai_brief_generated_at: new Date().toISOString() })
    .eq('id', lead.id)
  return result
}
