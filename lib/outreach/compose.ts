import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import type { Lead } from '@/lib/supabase/types'
import { COMPANY, TOTAL_STEPS, senderConfig } from './config'

// Medium effort: one email is short, but picking the right angle from the
// prospect's own site is where the quality comes from.
const MODEL = 'claude-opus-5-5'
const SERVICE_NAMES = COMPANY.services.map((service) => service.name)

const emailSchema = z.object({
  fit: z.boolean(),
  skip_reason: z.string(),
  service: z.string(),
  why: z.string(),
  subject: z.string().max(120),
  body: z.string(),
})

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

Services (choose exactly ONE — the one this specific business most obviously needs):
${COMPANY.services.map((service) => `- ${service.name}: ${service.pitch}`).join('\n')}

Goal of every email: book a free 15-minute call. Booking link: ${COMPANY.bookingUrl}

STEP 1 — Qualify. Decide whether this lead is a real private business that could buy AI services. Set fit=false and explain in skip_reason for: government agencies, schools, patient-appeal or claims departments, large national corporations, directories, news or article pages, job boards, or when you cannot tell what the business does. When fit=false, return empty strings for subject and body.

STEP 2 — Research. If a website is given, fetch it (one or two pages at most) to learn what they actually do, who their customers are, and how customers contact or book them. Base the email on what you find.

STEP 3 — Write like a top-performing SDR:
- Opening line: a specific, true observation about THEIR business from the website or lead data (a service they offer, how customers book, the area they serve). Never "I hope this finds you well", never "I came across your website".
- Then the problem: one likely time-sink for a business like theirs (answering the same questions by phone, chasing leads by hand, booking appointments manually, and so on).
- Then the offer: the ONE service you chose, framed as a concrete outcome for them ("a WhatsApp assistant that answers pricing questions and books jobs after hours"). One sentence of credibility at most.
- Make it interactive: include one easy question they can answer in a reply (e.g. "Are most of your bookings still coming in by phone?").
- Close: ask for 15 minutes this week, with the booking link on its own line.
- Last line: "If this isn't relevant, just reply 'no thanks' and I won't follow up."
- 90-140 words. Plain text, short paragraphs, no markdown, no bullets, no emojis, no hype words (revolutionize, game-changer, cutting-edge, leverage, synergy).
- Greeting: first name if the lead is clearly a person; otherwise "Hi {Company} team,".
- Never invent facts, clients, results or statistics. If the website gave you nothing, be specific to their industry instead.
- No signature or sign-off name — it is appended automatically.
- Subject: 3-6 words, specific to them, lowercase is fine, no clickbait, no "Re:".

Also return service (the exact name of the one service you chose) and why (one sentence, for the sales rep, on why this service fits this business).`
}

function leadFacts(lead: Lead) {
  const brief = lead.ai_brief
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
    brief ? `Research summary: ${brief.summary}` : null,
    brief ? `Company context: ${brief.company_context}` : null,
    brief?.talking_points.length ? `Talking points: ${brief.talking_points.join(' | ')}` : null,
  ]
    .filter(Boolean)
    .join('\n')
}

function buildRequest(lead: Lead, step: number, history: PriorEmail[], force: boolean) {
  const facts = leadFacts(lead)

  if (step === 0) {
    const override = force
      ? '\nThe sales rep reviewed this lead and wants to email it regardless, so set fit=true and write the best email you can.\n'
      : ''
    return `Write the FIRST cold email to this prospect.
${override}
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
- 40-80 words. Do not repeat the previous email. Add one new angle: a different concrete example of time saved, or a second service that fits.
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

export async function composeEmail(
  lead: Lead,
  step: number,
  history: PriorEmail[] = [],
  { force = false }: { force?: boolean } = {},
): Promise<ComposeResult> {
  // Trim: a key pasted into Vercel often carries a trailing space or newline.
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) return { ok: false, error: 'ANTHROPIC_API_KEY is not set.' }

  const client = new Anthropic({ apiKey })
  // Reading the prospect's own site is what makes the opener specific. Web
  // fetch only opens URLs already in the prompt, so it stays on their domain.
  const tools: Anthropic.Beta.BetaToolUnion[] = lead.website
    ? [{ type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 2, max_content_tokens: 8000 }]
    : []
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: 'user', content: buildRequest(lead, step, history, force) },
  ]

  let response: Anthropic.Beta.BetaMessage | undefined
  try {
    for (let turn = 0; turn < 3; turn++) {
      response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 6000,
        // If a safety classifier declines, the API retries on a fallback model
        // inside the same call instead of failing the send.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        tools,
        output_config: {
          effort: 'medium',
          format: {
            type: 'json_schema',
            schema: {
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
            },
          },
        },
        system: systemPrompt(),
        messages,
      })

      // A turn with server tools can pause mid-research; resume it.
      if (response.stop_reason !== 'pause_turn') break
      messages.push({ role: 'assistant', content: response.content })
    }
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return {
        ok: false,
        error: `Anthropic rejected ANTHROPIC_API_KEY (key starting ${apiKey.slice(0, 10)}…): ${error.message}`,
      }
    }
    if (error instanceof Anthropic.RateLimitError) {
      return { ok: false, error: 'Claude rate limit reached. Try again in a moment.' }
    }
    return { ok: false, error: error instanceof Error ? error.message : 'Claude request failed.' }
  }

  if (!response) return { ok: false, error: 'Claude returned no email.' }
  if (response.stop_reason === 'refusal') return { ok: false, error: 'Claude declined to write this email.' }

  // The JSON answer is the last text block; earlier ones narrate the research.
  const textBlock = [...response.content].reverse().find((block) => block.type === 'text')
  if (!textBlock || textBlock.type !== 'text') return { ok: false, error: 'Claude returned no email.' }

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(textBlock.text)
  } catch {
    return { ok: false, error: 'Could not parse the generated email.' }
  }

  const parsed = emailSchema.safeParse(parsedJson)
  if (!parsed.success) return { ok: false, error: 'The generated email was incomplete.' }

  const draft = parsed.data
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
