'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

export type AuthState = { error?: string; message?: string }

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

/** Only allow relative in-app paths, so `?next=` can't be used as an open redirect. */
function safeNext(value: FormDataEntryValue | null) {
  const next = typeof value === 'string' ? value : ''
  return next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard'
}

const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
})

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)

  if (error) {
    return {
      error:
        error.message === 'Invalid login credentials'
          ? 'That email and password combination does not match an account.'
          : error.message,
    }
  }

  revalidatePath('/', 'layout')
  redirect(safeNext(formData.get('next')))
}

const signUpSchema = z.object({
  fullName: z.string().trim().min(2, 'Tell us your name'),
  organizationName: z.string().trim().min(2, 'Give your workspace a name'),
  email: z.string().trim().email('Enter a valid email address'),
  password: z
    .string()
    .min(8, 'Use at least 8 characters')
    .regex(/[a-zA-Z]/, 'Include at least one letter')
    .regex(/[0-9]/, 'Include at least one number'),
})

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = signUpSchema.safeParse({
    fullName: formData.get('fullName'),
    organizationName: formData.get('organizationName'),
    email: formData.get('email'),
    password: formData.get('password'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const { email, password, fullName, organizationName } = parsed.data
  const supabase = await createClient()

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Consumed by the handle_new_user trigger to create the workspace.
      data: { full_name: fullName, organization_name: organizationName },
      emailRedirectTo: `${siteUrl()}/auth/callback`,
    },
  })

  if (error) {
    return {
      error: error.message.includes('already registered')
        ? 'An account with that email already exists. Try signing in instead.'
        : error.message,
    }
  }

  // Email confirmation is on: no session is issued until the link is clicked.
  if (!data.session) {
    return {
      message: `We sent a confirmation link to ${email}. Click it to activate your workspace.`,
    }
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}

const emailSchema = z.string().trim().email('Enter a valid email address')

export async function requestPasswordReset(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = emailSchema.safeParse(formData.get('email'))

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${siteUrl()}/auth/callback?next=/reset-password`,
  })

  if (error) return { error: error.message }

  // Deliberately not revealing whether the address exists.
  return { message: 'If that email has an account, a reset link is on its way.' }
}

const passwordSchema = z
  .object({
    password: z
      .string()
      .min(8, 'Use at least 8 characters')
      .regex(/[a-zA-Z]/, 'Include at least one letter')
      .regex(/[0-9]/, 'Include at least one number'),
    confirm: z.string(),
  })
  .refine((values) => values.password === values.confirm, {
    message: 'Those passwords do not match',
    path: ['confirm'],
  })

export async function updatePassword(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = passwordSchema.safeParse({
    password: formData.get('password'),
    confirm: formData.get('confirm'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })

  if (error) return { error: error.message }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

const orgSchema = z.string().trim().min(2, 'Give your workspace a name').max(120)

export async function createWorkspace(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = orgSchema.safeParse(formData.get('organizationName'))

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('create_organization', { org_name: parsed.data })

  if (error) return { error: error.message }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

export async function acceptInvitation(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const token = String(formData.get('token') ?? '').trim()

  if (!token) return { error: 'Paste the invite code from your email' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('accept_invitation', { invite_token: token })

  if (error) return { error: error.message }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}
