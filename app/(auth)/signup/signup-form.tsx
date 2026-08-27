'use client'

import { useActionState } from 'react'
import { signUp, type AuthState } from '@/lib/actions/auth'
import { FormAlert } from '@/components/auth/form-alert'
import { SubmitButton } from '@/components/auth/submit-button'
import { Field, Input } from '@/components/ui/field'

export function SignupForm() {
  const [state, formAction] = useActionState<AuthState, FormData>(signUp, {})

  // On success the action returns a "check your email" message instead of
  // redirecting, so keep the confirmation on screen and drop the form.
  if (state.message) {
    return (
      <div className="mt-7">
        <FormAlert message={state.message} />
        <p className="text-sm leading-6 text-muted-foreground">
          The link expires in 24 hours. If it does not arrive, check your spam folder or{' '}
          <a href="/signup" className="text-primary hover:underline">
            try again
          </a>
          .
        </p>
      </div>
    )
  }

  return (
    <form action={formAction} className="mt-7">
      <FormAlert error={state.error} />

      <div className="space-y-4">
        <Field label="Full name" htmlFor="fullName">
          <Input id="fullName" name="fullName" autoComplete="name" required placeholder="Jordan Lee" />
        </Field>

        <Field label="Workspace name" htmlFor="organizationName" hint="Usually your company name.">
          <Input
            id="organizationName"
            name="organizationName"
            autoComplete="organization"
            required
            placeholder="Northstar Labs"
          />
        </Field>

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

        <Field
          label="Create password"
          htmlFor="password"
          hint="At least 8 characters, with a number."
        >
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            placeholder="••••••••"
          />
        </Field>

        <SubmitButton variant="brand" className="w-full" pendingText="Creating workspace…">
          Create workspace
        </SubmitButton>
      </div>
    </form>
  )
}
