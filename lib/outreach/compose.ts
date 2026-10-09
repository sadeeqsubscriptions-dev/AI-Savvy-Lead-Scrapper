import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import type { Lead } from '@/lib/supabase/types'
import { COMPANY, TOTAL_STEPS, senderConfig } from './config'

// Short, single-shot writing: low effort keeps each email to a few cents.
const MODEL = 'claude-opus-5-5'

const emailSchema = z.object({
  subject: z.string().min(1).max(120),
  body: z.string().min(20),
})

export type DraftEmail = z.infer<typeof emailSchema>

export type PriorEmail = { direction: 'outbound' | 'inbound'; subject: string; body: string; sent_at: string }

type ComposeResult = { ok: true; email: DraftEmail } | { ok: false; error: string }

function systemPrompt() {
  const sender = senderConfig()
  return `You write cold outreach emails for ${COMPANY.name} (${COMPANY.website}), in the first person as ${sender.name} (${sender.title}).

About ${COMPANY.name}: ${COMPANY.positioning}
Founder: ${COMPANY.founder} You may mention the founder's experience, but you are writing as ${sender.name}, not as the founder (unless they are the same person).

Services you can offer (pick the one or two that genuinely fit this prospect — never list them all):
${COMPANY.services.map((service) => `- ${service.name}: ${service.pitch}`).join('\n')}

The single call to action is a free 15-minute call: ${COMPANY.bookingUrl}

How to write:
- Plain text only. No markdown, no bullet symbols, no bold, no emojis.
- Short: 60-120 words for a first email, 40-80 for a follow-up. Short paragraphs.
- Open with something specific to their business, industry or location — never "I hope this email finds you well".
- Name a concrete, believable way AI could save them time (e.g. a dental clinic: a WhatsApp bot that books appointments after hours). Tie it to the service you chose.
- Never invent facts about the prospect, fake results, clients, or statistics. If you know little, stay general about their industry.
- If the lead's name looks like a business rather than a person, greet the team ("Hi there," or "Hi {Company} team,"). Otherwise use their first name.
- Sound like a real person writing one email, not a marketing blast. No hype words ("revolutionize", "game-changer", "cutting-edge").
- End with a soft one-line ask that includes the booking link, then a final line letting them opt out, e.g. "If this isn't relevant, just reply 'no thanks' and I won't follow up."
- Do NOT write a signature or sign-off name — it is appended automatically.
- Subject: under 7 words, lowercase-friendly, specific, no clickbait, no "Re:".`
}

function leadFacts(lead: Lead) {
  const brief = lead.ai_brief
  return [
    `Name: ${lead.full_name}`,
    lead.company ? `Company: ${lead.company}` : null,
    lead.title ? `Title: ${lead.title}` : null,
    lead.industry ? `Industry: ${lead.industry}` : null,
    lead.website ? `Website: ${lead.website}` : null,
    lead.location || lead.city
      ? `Location: ${lead.location ?? lead.city}${lead.country ? `, ${lead.country}` : ''}`
      : null,
    lead.notes ? `Rep notes: ${lead.notes}` : null,
    brief ? `Research summary: ${brief.summary}` : null,
    brief ? `Company context: ${brief.company_context}` : null,
    brief?.talking_points.length ? `Talking points: ${brief.talking_points.join(' | ')}` : null,
  ]
    .filter(Boolean)
    .join('\n')
}

function buildRequest(lead: Lead, step: number, history: PriorEmail[]) {
  const facts = leadFacts(lead)

  if (step === 0) {
    return `Write the FIRST cold email to this prospect.

Prospect:
${facts}`
  }

  const thread = history
    .map((email) => `[${email.direction === 'outbound' ? 'We sent' : 'They replied'} ${email.sent_at}]\nSubject: ${email.subject}\n${email.body}`)
    .join('\n\n---\n\n')

  const isLast = step === TOTAL_STEPS - 1
  return `Write follow-up #${step} (of ${TOTAL_STEPS - 1}) to this prospect. They have not replied.

Prospect:
${facts}

Emails sent so far:
${thread}

Rules for this follow-up:
- Do not repeat the previous email. Add one new angle: a different service that fits, or a different concrete example of time saved.
- Do not guilt-trip ("just bumping this", "did you see my email").
${isLast ? '- This is the final follow-up: say politely this is the last note, and leave the door open.' : ''}
- The subject field will be ignored (the email goes in the same thread), so just repeat the original subject.`
}

export function signature() {
  const sender = senderConfig()
  return [
    '',
    sender.name,
    sender.title,
    COMPANY.website,
    sender.postalAddress,
  ]
    .filter((line) => line !== null)
    .join('\n')
}

export async function composeEmail(lead: Lead, step: number, history: PriorEmail[] = []): Promise<ComposeResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { ok: false, error: 'ANTHROPIC_API_KEY is not set.' }

  const client = new Anthropic({ apiKey })

  let response
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      // If a safety classifier declines, the API retries on a fallback model
      // inside the same call instead of failing the send.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: {
        effort: 'low',
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: {
              subject: { type: 'string', description: 'Email subject line' },
              body: { type: 'string', description: 'Plain-text email body, without a signature' },
            },
            required: ['subject', 'body'],
            additionalProperties: false,
          },
        },
      },
      system: systemPrompt(),
      messages: [{ role: 'user', content: buildRequest(lead, step, history) }],
    })
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return { ok: false, error: 'Claude rejected the API key. Check ANTHROPIC_API_KEY.' }
    }
    if (error instanceof Anthropic.RateLimitError) {
      return { ok: false, error: 'Claude rate limit reached. Try again in a moment.' }
    }
    return { ok: false, error: error instanceof Error ? error.message : 'Claude request failed.' }
  }

  if (response.stop_reason === 'refusal') {
    return { ok: false, error: 'Claude declined to write this email.' }
  }

  const textBlock = response.content.find((block) => block.type === 'text')
  if (!textBlock || textBlock.type !== 'text') return { ok: false, error: 'Claude returned no email.' }

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(textBlock.text)
  } catch {
    return { ok: false, error: 'Could not parse the generated email.' }
  }

  const parsed = emailSchema.safeParse(parsedJson)
  if (!parsed.success) return { ok: false, error: 'The generated email was incomplete.' }

  return {
    ok: true,
    email: { subject: parsed.data.subject.trim(), body: `${parsed.data.body.trim()}\n${signature()}` },
  }
}
