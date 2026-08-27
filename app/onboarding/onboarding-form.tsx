'use client'

import { useActionState, useState } from 'react'
import { acceptInvitation, createWorkspace, signOut, type AuthState } from '@/lib/actions/auth'
import { FormAlert } from '@/components/auth/form-alert'
import { SubmitButton } from '@/components/auth/submit-button'
import { Field, Input } from '@/components/ui/field'
import { cn } from '@/lib/utils'

export function OnboardingForm() {
  const [mode, setMode] = useState<'create' | 'join'>('create')
  const [createState, createAction] = useActionState<AuthState, FormData>(createWorkspace, {})
  const [joinState, joinAction] = useActionState<AuthState, FormData>(acceptInvitation, {})

  return (
    <div className="mt-7">
      <div className="mb-5 flex rounded-lg border border-border bg-background/60 p-1">
        {(
          [
            ['create', 'Create workspace'],
            ['join', 'Join with invite'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            className={cn(
              'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              mode === value
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'create' ? (
        <form action={createAction} className="space-y-4">
          <FormAlert error={createState.error} />
          <Field label="Workspace name" htmlFor="organizationName">
            <Input
              id="organizationName"
              name="organizationName"
              required
              autoFocus
              placeholder="Northstar Labs"
            />
          </Field>
          <SubmitButton variant="brand" className="w-full" pendingText="Creating…">
            Create workspace
          </SubmitButton>
        </form>
      ) : (
        <form action={joinAction} className="space-y-4">
          <FormAlert error={joinState.error} />
          <Field
            label="Invite code"
            htmlFor="token"
            hint="Your admin can copy this from the Team page."
          >
            <Input id="token" name="token" required autoFocus placeholder="Paste your invite code" />
          </Field>
          <SubmitButton variant="brand" className="w-full" pendingText="Joining…">
            Join workspace
          </SubmitButton>
        </form>
      )}

      <form action={signOut} className="mt-5 text-center">
        <button type="submit" className="text-xs text-muted-foreground hover:text-foreground">
          Sign out
        </button>
      </form>
    </div>
  )
}
