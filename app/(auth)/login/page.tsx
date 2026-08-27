import Link from 'next/link'
import type { Metadata } from 'next'
import { LoginForm } from './login-form'
import { APP_NAME } from '@/lib/constants'

export const metadata: Metadata = { title: 'Sign in' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>
}) {
  const { next, error } = await searchParams

  return (
    <>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Sign in to pick up where you left off.
      </p>

      <LoginForm next={next} linkError={error} />

      <p className="mt-6 text-sm text-muted-foreground">
        New to {APP_NAME}?{' '}
        <Link href="/signup" className="font-medium text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </>
  )
}
