'use client'

import { useActionState, useEffect } from 'react'
import { createMeeting } from '@/lib/actions/meetings'
import type { ActionState } from '@/lib/actions/state'
import { FormAlert } from '@/components/auth/form-alert'
import { SubmitButton } from '@/components/auth/submit-button'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { toast } from '@/components/ui/toaster'
import { toDateInputValue } from '@/lib/format'

export type LeadOption = { id: string; label: string }

export function MeetingForm({
  leads,
  defaultDate,
  onDone,
}: {
  leads: LeadOption[]
  defaultDate?: Date
  onDone: () => void
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(createMeeting, {})

  useEffect(() => {
    if (state.ok) {
      if (state.message) toast.success(state.message)
      onDone()
    }
  }, [state, onDone])

  return (
    <form action={formAction} className="space-y-4">
      <FormAlert error={state.error} />

      <Field label="Title" htmlFor="title" error={state.fieldErrors?.title}>
        <Input
          id="title"
          name="title"
          required
          minLength={2}
          placeholder="Discovery call — Northstar Labs"
        />
      </Field>

      <Field label="Lead" htmlFor="lead_id" hint="Links the meeting to a CRM timeline.">
        <Select id="lead_id" name="lead_id" defaultValue="none">
          <option value="none">No lead</option>
          {leads.map((lead) => (
            <option key={lead.id} value={lead.id}>
              {lead.label}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Date" htmlFor="date" error={state.fieldErrors?.date}>
          <Input
            id="date"
            name="date"
            type="date"
            required
            defaultValue={toDateInputValue(defaultDate ?? new Date())}
          />
        </Field>

        <Field label="Start time" htmlFor="time">
          <Input id="time" name="time" type="time" required defaultValue="10:00" />
        </Field>

        <Field label="Duration" htmlFor="duration">
          <Select id="duration" name="duration" defaultValue="30">
            <option value="15">15 min</option>
            <option value="30">30 min</option>
            <option value="45">45 min</option>
            <option value="60">1 hour</option>
            <option value="90">1.5 hours</option>
          </Select>
        </Field>
      </div>

      <Field label="Meeting link" htmlFor="meeting_url">
        <Input
          id="meeting_url"
          name="meeting_url"
          type="url"
          placeholder="https://meet.google.com/…"
        />
      </Field>

      <Field
        label="Extra attendees"
        htmlFor="attendees"
        hint="Comma separated email addresses."
      >
        <Input id="attendees" name="attendees" placeholder="sam@company.com, priya@company.com" />
      </Field>

      <Field label="Agenda" htmlFor="description">
        <Textarea
          id="description"
          name="description"
          placeholder="What do you want to walk away knowing?"
        />
      </Field>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <SubmitButton variant="brand" pendingText="Scheduling…">
          Schedule meeting
        </SubmitButton>
      </div>
    </form>
  )
}
