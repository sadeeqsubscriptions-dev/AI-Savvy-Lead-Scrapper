import type { Metadata } from 'next'
import { ResetPasswordForm } from './reset-password-form'

export const metadata: Metadata = { title: 'Choose a new password' }

export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Choose a new password</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        You are signed in from the reset link. Set a new password to finish.
      </p>

      <ResetPasswordForm />
    </>
  )
}
