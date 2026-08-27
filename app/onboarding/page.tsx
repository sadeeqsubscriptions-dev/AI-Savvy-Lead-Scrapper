import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { Logo } from '@/components/brand'
import { getSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { OnboardingForm } from './onboarding-form'

export const metadata: Metadata = { title: 'Create your workspace' }

export default async function OnboardingPage() {
  const session = await getSession()
  if (session) redirect('/dashboard')

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-brand-aurora px-5 py-12">
      <div className="absolute inset-0 grid-backdrop opacity-30" />
      <div className="relative w-full max-w-md">
        <Logo href="/" className="mb-8 justify-center" />
        <div className="rounded-2xl border border-border bg-card/80 p-6 shadow-2xl backdrop-blur sm:p-8">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            One last step
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            You are signed in as {user.email}, but you are not part of a workspace yet. Create one,
            or join an existing team with an invite code.
          </p>
          <OnboardingForm />
        </div>
      </div>
    </main>
  )
}
