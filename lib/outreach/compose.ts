import { z } from 'zod'
import { currentBrief } from '@/lib/ai/brief-shape'
import { askClaudeJson, webFetchTool } from '@/lib/ai/claude'
import type { Lead, LeadAiBrief } from '@/lib/supabase/types'
import { COMPANY, TOTAL_STEPS, senderConfig } from './config'

const SERVICE_NAMES = COMPANY.services.map((service) => service.name)

const emailSchema = z.object({
  fit: z.boolean(),
  skip_reason: z.string(),
  service: z.string(),
  why: z.string(),
  subject: z.string().max(120),
  body: z.string(),
})

const jsonSchema = {
  type: 'object',
  properties: {
    fit: { type: 'boolean', description: 'Is this a real business worth emailing?' },
    skip_reason: { type: 'string', description: 'Why not, when fit is false; otherwise empty' },
    service: { type: 'string', enum: SERVICE_NAMES, description: 'The one service pitched' },
    why: { type: 'string', description: 'One sentence for the rep on why this service fits' },
    subject: { type: 'string', description: 'Email subject line' },
    body: { type: 'string', description: 'Plain-text email body, without a signature' },
  },
  required: ['fit', 'skip_reason', 'service', 'why', 'subject', 'body'],
  additionalProperties: false,
}

export type DraftEmail = { subject: string; body: string; service: string; why: string }

export type PriorEmail = { direction: 'outbound' | 'inbound'; subject: string; body: string; sent_at: string }

export type ComposeResult =
  | { ok: true; email: DraftEmail }
  | { ok: false; error: string; notAFit?: string }

function systemPrompt() {
  const sender = senderConfig()
  return `You are a senior sales development rep writing cold outreach for ${COMPANY.name} (${COMPANY.website}). You write in the first person as ${sender.name} (${sender.title}).

About ${COMPANY.name}: ${COMPANY.positioning}
Founder: ${COMPANY.founder} You may mention the founder's 22+ years of software experience as credibility, but you are writing as ${sender.name}.

Services:
${COMPANY.services.map((service) => `- ${service.name}: ${service.pitch}`).join('\n')}

Goal of every email: book a free 15-minute call. Booking link: ${COMPANY.bookingUrl}

Qualify first. Set fit=false and explain in skip_reason for: government agencies, schools, patient-appeal or claims departments, large national corporations, directories, news or article pages, job boards, or when you cannot tell what the business does. When fit=false, return empty strings for subject and body.

Write like a top-performing SDR:
- Opening line: a specific, true observation about THEIR business. Never "I hope this finds you well", never "I came across your website".
- Then the problem: one time-sink a business like theirs has (use the sales brief's pain points when given).
- Then the offer: ONE service, framed as a concrete outcome for them. One sentence of credibility at most.
- Make it interactive: one easy question they can answer in a reply.
- Close: ask for 15 minutes this week, booking link on its own line.
- Last line: "If this isn't relevant, just reply 'no thanks' and I won't follow up."
- 90-140 words. Plain text, short paragraphs, no markdown, no bullets, no emojis, no hype words (revolutionize, game-changer, cutting-edge, leverage, synergy).
- Greeting: first name if the lead is clearly a person; otherwise "Hi {Company} team,".
- Never invent facts, clients, results or statistics.
- No signature or sign-off name — it is appended automatically.
- Subject: 3-6 words, specific to them, lowercase is fine, no clickbait, no "Re:".

Also return service (exact name of the service pitched) and why (one sentence for the rep on why it fits).`
}

function leadFacts(lead: Lead) {
  return [
    `Name: ${lead.full_name}`,
    lead.company ? `Company: ${lead.company}` : null,
    lead.title ? `Title: ${lead.title}` : null,
    lead.industry ? `Industry: ${lead.industry}` : null,
    lead.website ? `Website: ${lead.website}` : null,
    lead.email ? `Email: ${lead.email}` : null,
    lead.location || lead.city
      ? `Location: ${lead.location ?? lead.city}${lead.country ? `, ${lead.country}` : ''}`
      : null,
    lead.notes ? `Rep notes: ${lead.notes}` : null,
  ]
    .filter(Boolean)
    .join('\n')
}

function briefText(brief: LeadAiBrief) {
  return `Sales brief (already researched — the email must match it):
- Who they are: ${brief.summary}
- Where to hit them: ${brief.pain_points.join(' | ')}
- Offer to pitch: ${brief.offer.service} — ${brief.offer.pitch}`
}

function buildRequest(lead: Lead, brief: LeadAiBrief | null, step: number, history: PriorEmail[], force: boolean) {
  const facts = leadFacts(lead)
  const context = brief
    ? `${briefText(brief)}\nPitch exactly the brief's offer (${brief.offer.service}).`
    : lead.website
      ? 'No brief yet: fetch their website (one or two pages) to find the right angle and the one service they most need.'
      : 'No brief and no website: pick the service that fits their industry best.'

  if (step === 0) {
    const override = force
      ? '\nThe sales rep reviewed this lead and wants to email it regardless, so set fit=true and write the best email you can.\n'
      : ''
    return `Write the FIRST cold email to this prospect.
${override}
Prospect:
${facts}

${context}`
  }

  const thread = history
    .map((email) => `[${email.direction === 'outbound' ? 'We sent' : 'They replied'} ${email.sent_at}]\nSubject: ${email.subject}\n${email.body}`)
    .join('\n\n---\n\n')

  const isLast = step === TOTAL_STEPS - 1
  return `Write follow-up #${step} (of ${TOTAL_STEPS - 1}) to this prospect. They have not replied.

Prospect:
${facts}

${brief ? briefText(brief) : ''}

Emails sent so far:
${thread}

Rules for this follow-up:
- 40-80 words. Do not repeat the previous email. Add one new angle: another pain point from the brief, or a different concrete example of time saved.
- Do not guilt-trip ("just bumping this", "did you see my email").
- Keep one easy question and the booking link.
${isLast ? '- This is the final follow-up: say politely this is the last note, and leave the door open.' : ''}
- The subject is ignored (the email goes in the same thread), so repeat the original subject.
- Set fit=true and skip_reason to an empty string; the lead is already qualified.`
}

export function signature() {
  const sender = senderConfig()
  return ['', sender.name, sender.title, COMPANY.website, sender.postalAddress]
    .filter((line) => line !== null)
    .join('\n')
}

/**
 * Writes one email. With a brief, the email pitches the brief's offer, so the
 * Targeting script, the email and the call all say the same thing.
 */
export async function composeEmail(
  lead: Lead,
  step: number,
  history: PriorEmail[] = [],
  { force = false, brief = currentBrief(lead.ai_brief) }: { force?: boolean; brief?: LeadAiBrief | null } = {},
): Promise<ComposeResult> {
  const result = await askClaudeJson({
    system: systemPrompt(),
    prompt: buildRequest(lead, brief, step, history, force),
    schema: jsonSchema,
    parse: (value) => emailSchema.safeParse(value),
    // The brief already did the research; only fetch the site without one.
    tools: !brief && lead.website ? [webFetchTool(2)] : [],
    effort: 'medium',
    maxTokens: 6000,
  })
  if (!result.ok) return result

  const draft = result.data
  if (!draft.fit && !force && step === 0) {
    const reason = draft.skip_reason.trim() || 'Not a good fit for AI Savvy.'
    return { ok: false, error: `Skipped: ${reason}`, notAFit: reason }
  }
  if (draft.subject.trim().length === 0 || draft.body.trim().length < 20) {
    return { ok: false, error: 'The generated email was incomplete.' }
  }

  return {
    ok: true,
    email: {
      subject: draft.subject.trim(),
      body: `${draft.body.trim()}\n${signature()}`,
      service: draft.service,
      why: draft.why.trim(),
    },
  }
}
