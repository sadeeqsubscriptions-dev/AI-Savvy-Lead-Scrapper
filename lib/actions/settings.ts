'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { isAdmin, requireSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { failure, optionalText, type ActionState } from '@/lib/actions/state'

const profileSchema = z.object({
  full_name: z.string().trim().min(2, 'Enter your name').max(120),
  job_title: optionalText,
  phone: optionalText,
  timezone: z.string().trim().min(1).default('UTC'),
})

export async function updateProfile(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSession()

  const parsed = profileSchema.safeParse({
    full_name: formData.get('full_name') ?? '',
    job_title: formData.get('job_title') ?? '',
    phone: formData.get('phone') ?? '',
    timezone: formData.get('timezone') ?? 'UTC',
  })

  if (!parsed.success) return failure(parsed.error)

  const supabase = await createClient()
  const { error } = await supabase.from('profiles').update(parsed.data).eq('id', session.userId)

  if (error) return { error: error.message }

  revalidatePath('/settings')
  revalidatePath('/', 'layout')
  return { ok: true, message: 'Profile saved.' }
}

const orgSchema = z.object({
  name: z.string().trim().min(2, 'Enter a workspace name').max(120),
  website: optionalText,
})

export async function updateOrganization(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession()
  if (!isAdmin(session.role)) return { error: 'Only admins can change workspace settings.' }

  const parsed = orgSchema.safeParse({
    name: formData.get('name') ?? '',
    website: formData.get('website') ?? '',
  })

  if (!parsed.success) return failure(parsed.error)

  const supabase = await createClient()
  const { error } = await supabase
    .from('organizations')
    .update(parsed.data)
    .eq('id', session.organization.id)

  if (error) return { error: error.message }

  revalidatePath('/settings')
  revalidatePath('/', 'layout')
  return { ok: true, message: 'Workspace updated.' }
}

const changePasswordSchema = z
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

export async function changePassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSession()

  const parsed = changePasswordSchema.safeParse({
    password: formData.get('password') ?? '',
    confirm: formData.get('confirm') ?? '',
  })

  if (!parsed.success) return failure(parsed.error)

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })

  if (error) return { error: error.message }

  return { ok: true, message: 'Password updated.' }
}

export async function loadDemoData(): Promise<ActionState> {
  const session = await requireSession()
  if (!isAdmin(session.role)) return { error: 'Only admins can load demo data.' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('seed_demo_data', {
    target_org: session.organization.id,
  })

  if (error) return { error: error.message }

  revalidatePath('/', 'layout')

  return data === 0
    ? { ok: true, message: 'This workspace already has leads, so nothing was added.' }
    : { ok: true, message: `Added ${data} sample leads with activity and meetings.` }
}

export async function resetWorkspaceData(): Promise<ActionState> {
  const session = await requireSession()
  if (!isAdmin(session.role)) return { error: 'Only admins can reset workspace data.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('reset_demo_data', { target_org: session.organization.id })

  if (error) return { error: error.message }

  revalidatePath('/', 'layout')
  return { ok: true, message: 'All leads, meetings, and scrape history were removed.' }
}
