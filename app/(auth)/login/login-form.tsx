'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { signIn, type AuthState } from '@/lib/actions/auth'
import { FormAlert } from '@/components/auth/form-alert'
import { SubmitButton } from '@/components/auth/submit-button'
import { Field, Input, Label } from '@/components/ui/field'

export function LoginForm({ next, linkError }: { next?: string; linkError?: string }) {
  const [state, formAction] = useActionState<AuthState, FormData>(signIn, {})

  return (
    <form action={formAction} className="mt-7">
      <FormAlert error={state.error ?? linkError} message={state.message} />

      <input type="hidden" name="next" value={next ?? '/dashboard'} />

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

        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <Label htmlFor="password" className="mb-0">
              Password
            </Label>
            <Link href="/forgot-password" className="text-xs text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            placeholder="••••••••"
          />
        </div>

        <SubmitButton variant="brand" className="w-full" pendingText="Signing in…">
          Sign in
        </SubmitButton>
      </div>
    </form>
  )
}
