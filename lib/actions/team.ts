'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { isAdmin, requireSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { failure, type ActionState } from '@/lib/actions/state'
import type { MemberRole } from '@/lib/supabase/types'

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  role: z.enum(['admin', 'member', 'viewer']),
})

export async function inviteMember(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSession()
  if (!isAdmin(session.role)) return { error: 'Only admins can invite teammates.' }

  const parsed = inviteSchema.safeParse({
    email: formData.get('email') ?? '',
    role: formData.get('role') ?? 'member',
  })

  if (!parsed.success) return failure(parsed.error)

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('invitations')
    .insert({
      org_id: session.organization.id,
      email: parsed.data.email,
      role: parsed.data.role,
      invited_by: session.userId,
    })
    .select('token')
    .single()

  if (error) {
    return {
      error: error.code === '23505'
        ? 'There is already a pending invite for that email.'
        : error.message,
    }
  }

  revalidatePath('/team')

  // Delivery is handled by whatever email provider is wired up later; the code
  // is returned so an admin can share it directly in the meantime.
  return {
    ok: true,
    message: `Invite created for ${parsed.data.email}. Share this code: ${data.token}`,
  }
}

export async function revokeInvitation(id: string) {
  const session = await requireSession()
  if (!isAdmin(session.role)) return { error: 'Only admins can revoke invites.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('invitations')
    .update({ status: 'revoked' })
    .eq('id', id)
    .eq('org_id', session.organization.id)

  if (error) return { error: error.message }

  revalidatePath('/team')
  return { ok: true, message: 'Invite revoked.' }
}

export async function updateMemberRole(userId: string, role: MemberRole) {
  const session = await requireSession()
  if (!isAdmin(session.role)) return { error: 'Only admins can change roles.' }

  if (userId === session.userId) {
    return { error: 'You cannot change your own role.' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('organization_members')
    .update({ role })
    .eq('org_id', session.organization.id)
    .eq('user_id', userId)

  if (error) return { error: error.message }

  revalidatePath('/team')
  return { ok: true, message: 'Role updated.' }
}

export async function removeMember(userId: string) {
  const session = await requireSession()
  if (!isAdmin(session.role)) return { error: 'Only admins can remove teammates.' }

  if (userId === session.userId) {
    return { error: 'Use "leave workspace" to remove yourself.' }
  }

  const supabase = await createClient()

  // Never strip the last owner out of a workspace.
  const { data: target } = await supabase
    .from('organization_members')
    .select('role')
    .eq('org_id', session.organization.id)
    .eq('user_id', userId)
    .maybeSingle()

  if (target?.role === 'owner') {
    const { count } = await supabase
      .from('organization_members')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', session.organization.id)
      .eq('role', 'owner')

    if ((count ?? 0) <= 1) return { error: 'A workspace must keep at least one owner.' }
  }

  const { error } = await supabase
    .from('organization_members')
    .delete()
    .eq('org_id', session.organization.id)
    .eq('user_id', userId)

  if (error) return { error: error.message }

  // Leads owned by the departing member fall back to unassigned.
  await supabase
    .from('leads')
    .update({ owner_id: null })
    .eq('org_id', session.organization.id)
    .eq('owner_id', userId)

  revalidatePath('/team')
  return { ok: true, message: 'Teammate removed.' }
}
