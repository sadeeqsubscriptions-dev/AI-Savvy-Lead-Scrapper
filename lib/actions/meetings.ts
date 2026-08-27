'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { canWrite, requireSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { failure, optionalText, type ActionState } from '@/lib/actions/state'

const meetingSchema = z
  .object({
    title: z.string().trim().min(2, 'Give the meeting a title').max(200),
    description: optionalText,
    date: z.string().trim().min(1, 'Pick a date'),
    time: z.string().trim().min(1, 'Pick a start time'),
    duration: z.coerce.number().int().min(5).max(600).default(30),
    lead_id: z
      .string()
      .trim()
      .transform((value) => (value.length === 0 || value === 'none' ? null : value))
      .nullable(),
    meeting_url: optionalText,
    location: optionalText,
    attendees: z
      .string()
      .trim()
      .transform((value) =>
        value
          .split(/[,\s;]+/)
          .map((item) => item.trim())
          .filter((item) => item.length > 0),
      ),
  })
  .refine((values) => !Number.isNaN(new Date(`${values.date}T${values.time}`).getTime()), {
    message: 'That date and time is not valid',
    path: ['date'],
  })

export async function createMeeting(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSession()
  if (!canWrite(session.role)) return { error: 'Your role cannot schedule meetings.' }

  const parsed = meetingSchema.safeParse({
    title: formData.get('title') ?? '',
    description: formData.get('description') ?? '',
    date: formData.get('date') ?? '',
    time: formData.get('time') ?? '',
    duration: formData.get('duration') ?? 30,
    lead_id: formData.get('lead_id') ?? '',
    meeting_url: formData.get('meeting_url') ?? '',
    location: formData.get('location') ?? '',
    attendees: formData.get('attendees') ?? '',
  })

  if (!parsed.success) return failure(parsed.error)

  const { date, time, duration, ...rest } = parsed.data
  const startsAt = new Date(`${date}T${time}`)
  const endsAt = new Date(startsAt.getTime() + duration * 60_000)

  const supabase = await createClient()
  const { error } = await supabase.from('meetings').insert({
    ...rest,
    org_id: session.organization.id,
    created_by: session.userId,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
  })

  if (error) return { error: error.message }

  // Surface the booking on the lead timeline too.
  if (rest.lead_id) {
    await supabase.from('lead_activities').insert({
      org_id: session.organization.id,
      lead_id: rest.lead_id,
      user_id: session.userId,
      type: 'meeting',
      title: `Meeting scheduled: ${rest.title}`,
      body: startsAt.toISOString(),
    })
  }

  revalidatePath('/calendar')
  revalidatePath('/dashboard')
  return { ok: true, message: 'Meeting scheduled.' }
}

export async function deleteMeeting(id: string) {
  const session = await requireSession()
  if (!canWrite(session.role)) return { error: 'Your role cannot cancel meetings.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('meetings')
    .delete()
    .eq('id', id)
    .eq('org_id', session.organization.id)

  if (error) return { error: error.message }

  revalidatePath('/calendar')
  revalidatePath('/dashboard')
  return { ok: true, message: 'Meeting cancelled.' }
}

const rescheduleSchema = z.object({
  id: z.string().uuid(),
  date: z.string().trim().min(1),
  time: z.string().trim().min(1),
  duration: z.coerce.number().int().min(5).max(600).default(30),
})

export async function rescheduleMeeting(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession()
  if (!canWrite(session.role)) return { error: 'Your role cannot reschedule meetings.' }

  const parsed = rescheduleSchema.safeParse({
    id: formData.get('id'),
    date: formData.get('date') ?? '',
    time: formData.get('time') ?? '',
    duration: formData.get('duration') ?? 30,
  })

  if (!parsed.success) return failure(parsed.error)

  const startsAt = new Date(`${parsed.data.date}T${parsed.data.time}`)
  if (Number.isNaN(startsAt.getTime())) return { error: 'That date and time is not valid.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('meetings')
    .update({
      starts_at: startsAt.toISOString(),
      ends_at: new Date(startsAt.getTime() + parsed.data.duration * 60_000).toISOString(),
    })
    .eq('id', parsed.data.id)
    .eq('org_id', session.organization.id)

  if (error) return { error: error.message }

  revalidatePath('/calendar')
  return { ok: true, message: 'Meeting moved.' }
}
