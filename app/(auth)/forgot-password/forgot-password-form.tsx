'use client'

import { useActionState } from 'react'
import { requestPasswordReset, type AuthState } from '@/lib/actions/auth'
import { FormAlert } from '@/components/auth/form-alert'
import { SubmitButton } from '@/components/auth/submit-button'
import { Field, Input } from '@/components/ui/field'

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState<AuthState, FormData>(requestPasswordReset, {})

  return (
    <form action={formAction} className="mt-7">
      <FormAlert error={state.error} message={state.message} />

      <div className="space-y-4">
        <Field label="Work email" htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@company.com"
          />
        </Field>

        <SubmitButton variant="brand" className="w-full" pendingText="Sending link…">
          Send reset link
        </SubmitButton>
      </div>
    </form>
  )
}
