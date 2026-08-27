'use client'

import { useActionState } from 'react'
import { updatePassword, type AuthState } from '@/lib/actions/auth'
import { FormAlert } from '@/components/auth/form-alert'
import { SubmitButton } from '@/components/auth/submit-button'
import { Field, Input } from '@/components/ui/field'

export function ResetPasswordForm() {
  const [state, formAction] = useActionState<AuthState, FormData>(updatePassword, {})

  return (
    <form action={formAction} className="mt-7">
      <FormAlert error={state.error} message={state.message} />

      <div className="space-y-4">
        <Field label="New password" htmlFor="password" hint="At least 8 characters, with a number.">
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
          />
        </Field>

        <Field label="Confirm new password" htmlFor="confirm">
          <Input
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
          />
        </Field>

        <SubmitButton variant="brand" className="w-full" pendingText="Updating…">
          Update password
        </SubmitButton>
      </div>
    </form>
  )
}
