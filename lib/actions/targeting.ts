'use server'

import Anthropic from '@anthropic-ai/sdk'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { isAdmin, requireSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { LeadAiBrief } from '@/lib/supabase/types'

const MODEL = 'claude-opus-5'
const MAX_SEARCHES = 5

const briefSchema = z.object({
  summary: z.string().min(1),
  company_context: z.string().min(1),
  talking_points: z.array(z.string().min(1)).min(1),
  objections: z.array(z.object({ objection: z.string().min(1), response: z.string().min(1) })),
  closing_strategy: z.string().min(1),
  sources: z.array(z.object({ title: z.string(), url: z.string() })),
})

type BriefResult = { ok: true; brief: LeadAiBrief } | { ok: false; error: string }

function buildPrompt(lead: {
  full_name: string
  title: string | null
  company: string | null
  industry: string | null
  website: string | null
  location: string | null
  city: string | null
  country: string | null
  status: string
  notes: string | null
}) {
  const facts = [
    `Name: ${lead.full_name}`,
    lead.title ? `Title: ${lead.title}` : null,
    lead.company ? `Company: ${lead.company}` : null,
    lead.industry ? `Industry: ${lead.industry}` : null,
    lead.website ? `Website: ${lead.website}` : null,
    lead.location ?? lead.city ? `Location: ${lead.location ?? lead.city}${lead.country ? `, ${lead.country}` : ''}` : null,
    `Pipeline stage: ${lead.status}`,
    lead.notes ? `Internal rep notes: ${lead.notes}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  return `You are a senior enterprise sales strategist preparing a rep for outreach to a specific prospect.

Known facts about the lead:
${facts}

Use web search to find current, real information about this person and their company — recent news, funding, hiring, product launches, public profile signals, and pain points common to their industry. Then write a sales briefing for the rep who will contact them.

Respond with ONLY a single JSON object — no markdown fences, no commentary before or after — matching exactly this shape:
{
  "summary": string (2-3 sentences on who this person is and why they're a fit),
  "company_context": string (what the company does, recent developments, likely priorities),
  "talking_points": string[] (4-6 specific, personalized opening angles the rep can use),
  "objections": [{ "objection": string, "response": string }] (3-4 likely objections and how to handle them),
  "closing_strategy": string (concrete advice on how to move this lead toward a close),
  "sources": [{ "title": string, "url": string }] (the web sources actually used — omit if search found nothing usable)
}`
}

function extractJson(text: string) {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  return fenced ? fenced[1] : trimmed
}

export async function generateLeadBrief(leadId: string): Promise<BriefResult> {
  const session = await requireSession()
  const apiKey = process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    return { ok: false, error: 'ANTHROPIC_API_KEY is not set. Add it in your Vercel project settings.' }
  }

  const supabase = await createClient()
  const { data: lead } = await supabase
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .eq('org_id', session.organization.id)
    .maybeSingle()

  if (!lead) return { ok: false, error: 'Lead not found.' }
  if (lead.owner_id !== session.userId && !isAdmin(session.role)) {
    return { ok: false, error: 'This lead is not assigned to you.' }
  }

  const client = new Anthropic({ apiKey })
  const prompt = buildPrompt(lead)
  const tools = [{ type: 'web_search_20260209' as const, name: 'web_search' as const, max_uses: MAX_SEARCHES }]

  let response
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      tools,
      messages: [{ role: 'user', content: prompt }],
    })

    // A long research turn can pause when it hits the search budget mid-flow;
    // resume once so the model still gets to write the final brief.
    if (response.stop_reason === 'pause_turn') {
      response = await client.messages.create({
        model: MODEL,
        max_tokens: 8000,
        tools,
        messages: [
          { role: 'user', content: prompt },
          { role: 'assistant', content: response.content },
        ],
      })
    }
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return { ok: false, error: 'Claude rejected the API key. Check ANTHROPIC_API_KEY.' }
    }
    if (error instanceof Anthropic.RateLimitError) {
      return { ok: false, error: 'Claude rate limit reached. Try again in a moment.' }
    }
    return { ok: false, error: error instanceof Error ? error.message : 'Claude request failed.' }
  }

  const textBlock = [...response.content].reverse().find((block) => block.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    return { ok: false, error: 'Claude did not return a brief.' }
  }

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(extractJson(textBlock.text))
  } catch {
    return { ok: false, error: 'Could not parse the generated brief.' }
  }

  const parsed = briefSchema.safeParse(parsedJson)
  if (!parsed.success) {
    return { ok: false, error: 'The generated brief was missing required fields.' }
  }

  const brief: LeadAiBrief = {
    ...parsed.data,
    generated_by: session.userId,
    model: response.model,
  }

  await supabase
    .from('leads')
    .update({ ai_brief: brief, ai_brief_generated_at: new Date().toISOString() })
    .eq('id', leadId)
    .eq('org_id', session.organization.id)

  revalidatePath('/targeting')
  revalidatePath('/crm')
  return { ok: true, brief }
}
