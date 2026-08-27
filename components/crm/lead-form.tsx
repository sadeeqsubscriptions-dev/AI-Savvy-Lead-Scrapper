'use client'

import { useActionState, useEffect } from 'react'
import { createLead, updateLead } from '@/lib/actions/leads'
import type { ActionState } from '@/lib/actions/state'
import { FormAlert } from '@/components/auth/form-alert'
import { SubmitButton } from '@/components/auth/submit-button'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { toast } from '@/components/ui/toaster'
import { INDUSTRIES, LEAD_SOURCES, LEAD_STATUSES } from '@/lib/constants'
import type { Lead } from '@/lib/supabase/types'

export type MemberOption = { id: string; name: string }

export function LeadForm({
  lead,
  members,
  onDone,
}: {
  lead?: Lead | null
  members: MemberOption[]
  onDone: () => void
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    lead ? updateLead : createLead,
    {},
  )

  useEffect(() => {
    if (state.ok) {
      if (state.message) toast.success(state.message)
      onDone()
    }
  }, [state, onDone])

  return (
    <form action={formAction} className="space-y-4">
      <FormAlert error={state.error} />
      {lead ? <input type="hidden" name="id" value={lead.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="full_name" error={state.fieldErrors?.full_name}>
          <Input
            id="full_name"
            name="full_name"
            required
            defaultValue={lead?.full_name ?? ''}
            placeholder="Maya Chen"
          />
        </Field>

        <Field label="Job title" htmlFor="title">
          <Input
            id="title"
            name="title"
            defaultValue={lead?.title ?? ''}
            placeholder="VP of Growth"
          />
        </Field>

        <Field label="Company" htmlFor="company">
          <Input
            id="company"
            name="company"
            defaultValue={lead?.company ?? ''}
            placeholder="Northstar Labs"
          />
        </Field>

        <Field label="Industry" htmlFor="industry">
          <Select id="industry" name="industry" defaultValue={lead?.industry ?? ''}>
            <option value="">Not set</option>
            {INDUSTRIES.map((industry) => (
              <option key={industry} value={industry}>
                {industry}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Email" htmlFor="email" error={state.fieldErrors?.email}>
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={lead?.email ?? ''}
            placeholder="maya@northstarlabs.io"
          />
        </Field>

        <Field label="Phone" htmlFor="phone">
          <Input
            id="phone"
            name="phone"
            defaultValue={lead?.phone ?? ''}
            placeholder="(415) 555-0182"
          />
        </Field>

        <Field label="Website" htmlFor="website">
          <Input
            id="website"
            name="website"
            defaultValue={lead?.website ?? ''}
            placeholder="https://northstarlabs.io"
          />
        </Field>

        <Field label="Location" htmlFor="location">
          <Input
            id="location"
            name="location"
            defaultValue={lead?.location ?? ''}
            placeholder="San Francisco, CA"
          />
        </Field>

        <Field label="Status" htmlFor="status">
          <Select id="status" name="status" defaultValue={lead?.status ?? 'New'}>
            {LEAD_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Source" htmlFor="source">
          <Select id="source" name="source" defaultValue={lead?.source ?? 'Manual'}>
            {LEAD_SOURCES.map((source) => (
              <option key={source} value={source}>
                {source}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Owner" htmlFor="owner_id">
          <Select id="owner_id" name="owner_id" defaultValue={lead?.owner_id ?? ''}>
            <option value="unassigned">Unassigned</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Estimated value (USD)" htmlFor="estimated_value">
          <Input
            id="estimated_value"
            name="estimated_value"
            type="number"
            min={0}
            step={100}
            defaultValue={lead?.estimated_value ?? 0}
          />
        </Field>

        <Field
          label="Lead score"
          htmlFor="score"
          hint="0–100"
          className="sm:col-span-2"
        >
          <Input
            id="score"
            name="score"
            type="number"
            min={0}
            max={100}
            defaultValue={lead?.score ?? 50}
          />
        </Field>
      </div>

      <Field label="Notes" htmlFor="notes">
        <Textarea
          id="notes"
          name="notes"
          defaultValue={lead?.notes ?? ''}
          placeholder="Context, next steps, anything the team should know."
        />
      </Field>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <SubmitButton variant="brand" pendingText="Saving…">
          {lead ? 'Save changes' : 'Add lead'}
        </SubmitButton>
      </div>
    </form>
  )
}
