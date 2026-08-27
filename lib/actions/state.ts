import { z } from 'zod'

export type ActionState = {
  ok?: boolean
  error?: string
  message?: string
  /** Field-level messages keyed by input name. */
  fieldErrors?: Record<string, string>
}

export function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form'
    if (!result[key]) result[key] = issue.message
  }
  return result
}

export function failure(error: z.ZodError): ActionState {
  return { ok: false, error: error.issues[0]?.message, fieldErrors: fieldErrorsFrom(error) }
}

/** Turns an empty string from a form input into null for nullable columns. */
export const optionalText = z
  .string()
  .trim()
  .transform((value) => (value.length === 0 ? null : value))
  .nullable()

export const optionalEmail = z
  .string()
  .trim()
  .transform((value) => (value.length === 0 ? null : value.toLowerCase()))
  .nullable()
  .refine((value) => value === null || z.string().email().safeParse(value).success, {
    message: 'Enter a valid email address',
  })
