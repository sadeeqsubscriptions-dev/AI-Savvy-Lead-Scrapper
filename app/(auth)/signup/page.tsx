import Link from 'next/link'
import type { Metadata } from 'next'
import { SignupForm } from './signup-form'

export const metadata: Metadata = { title: 'Create your workspace' }

export default function SignupPage() {
  return (
    <>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Start building pipeline</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Create your workspace and invite the team in minutes.
      </p>

      <SignupForm />

      <p className="mt-6 text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </>
  )
}
