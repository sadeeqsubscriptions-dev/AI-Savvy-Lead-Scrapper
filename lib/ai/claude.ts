import Anthropic from '@anthropic-ai/sdk'

/**
 * The one place the app talks to Claude. Targeting briefs, outreach emails
 * and the live call assistant all go through `askClaudeJson`, so the key,
 * model, fallback and error wording stay identical everywhere.
 */

export const CLAUDE_MODEL = 'claude-opus-5-5'

type Effort = 'low' | 'medium' | 'high'

export type ClaudeJsonResult<T> = { ok: true; data: T; model: string } | { ok: false; error: string }

function apiKey() {
  // Trim: a key pasted into Vercel often carries a trailing space or newline.
  return process.env.ANTHROPIC_API_KEY?.trim() || null
}

export function claudeConfigured() {
  return apiKey() !== null
}

function errorMessage(error: unknown, key: string) {
  if (error instanceof Anthropic.AuthenticationError) {
    return `Anthropic rejected ANTHROPIC_API_KEY (key starting ${key.slice(0, 10)}…): ${error.message}`
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return `This Anthropic key can't use ${CLAUDE_MODEL}: ${error.message}`
  }
  if (error instanceof Anthropic.RateLimitError) return 'Claude rate limit reached. Try again in a moment.'
  if (error instanceof Anthropic.APIError && error.status === 402) {
    return 'The Anthropic account is out of credit. Add credit at console.anthropic.com.'
  }
  return error instanceof Error ? error.message : 'Claude request failed.'
}

/**
 * One Claude turn that must answer with JSON matching `schema`. Server tools
 * (web search / fetch) are allowed; a research turn that pauses is resumed.
 */
export async function askClaudeJson<T>({
  system,
  prompt,
  schema,
  parse,
  tools = [],
  effort = 'low',
  maxTokens = 4000,
}: {
  system: string
  prompt: string
  /** JSON Schema for structured output (additionalProperties: false, all required). */
  schema: Record<string, unknown>
  /** Validates the parsed JSON, e.g. a zod schema's safeParse. */
  parse: (value: unknown) => { success: true; data: T } | { success: false }
  tools?: Anthropic.Beta.BetaToolUnion[]
  effort?: Effort
  maxTokens?: number
}): Promise<ClaudeJsonResult<T>> {
  const key = apiKey()
  if (!key) return { ok: false, error: 'ANTHROPIC_API_KEY is not set in the environment.' }

  const client = new Anthropic({ apiKey: key })
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: prompt }]

  let response: Anthropic.Beta.BetaMessage | undefined
  try {
    for (let turn = 0; turn < 3; turn++) {
      response = await client.beta.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: maxTokens,
        // If a safety classifier declines, the API retries on a fallback model
        // inside the same call instead of failing.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        tools,
        output_config: { effort, format: { type: 'json_schema', schema } },
        system,
        messages,
      })
      if (response.stop_reason !== 'pause_turn') break
      messages.push({ role: 'assistant', content: response.content })
    }
  } catch (error) {
    return { ok: false, error: errorMessage(error, key) }
  }

  if (!response) return { ok: false, error: 'Claude returned nothing.' }
  if (response.stop_reason === 'refusal') return { ok: false, error: 'Claude declined this request.' }

  // The JSON answer is the last text block; earlier ones narrate any research.
  const text = [...response.content].reverse().find((block) => block.type === 'text')
  if (!text || text.type !== 'text') return { ok: false, error: 'Claude returned no answer.' }

  let json: unknown
  try {
    json = JSON.parse(text.text)
  } catch {
    return { ok: false, error: 'Could not read Claude’s answer.' }
  }

  const parsed = parse(json)
  if (!parsed.success) return { ok: false, error: 'Claude’s answer was missing fields.' }
  return { ok: true, data: parsed.data, model: response.model }
}

/** Web search tool definition, for prompts that need fresh facts about a lead. */
export function webSearchTool(maxUses: number): Anthropic.Beta.BetaToolUnion {
  return { type: 'web_search_20260209', name: 'web_search', max_uses: maxUses }
}

/** Web fetch tool; it can only open URLs already present in the prompt. */
export function webFetchTool(maxUses: number): Anthropic.Beta.BetaToolUnion {
  return { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: maxUses, max_content_tokens: 8000 }
}
