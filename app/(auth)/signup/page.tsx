import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Sign-ups closed' }

/** The workspace is private; new people join through an invite from Team. */
export default function SignupPage() {
  return (
    <>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Sign-ups are closed</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This workspace is private to AI Savvy. Ask the owner to invite you from the Team page.
      </p>
      <p className="mt-6 text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </>
  )
}
