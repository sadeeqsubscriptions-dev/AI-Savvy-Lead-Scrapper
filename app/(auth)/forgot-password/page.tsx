import Link from 'next/link'
import type { Metadata } from 'next'
import { ForgotPasswordForm } from './forgot-password-form'

export const metadata: Metadata = { title: 'Reset your password' }

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Reset your password</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Enter your work email and we will send you a secure reset link.
      </p>

      <ForgotPasswordForm />

      <p className="mt-6 text-sm text-muted-foreground">
        Remembered it?{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </>
  )
}
