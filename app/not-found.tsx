import Link from 'next/link'
import { Logo } from '@/components/brand'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-brand-aurora px-5 text-center">
      <div className="absolute inset-0 grid-backdrop opacity-30" />
      <div className="relative">
        <Logo href="/" className="mb-10 justify-center" />
        <p className="font-mono text-6xl font-semibold text-gradient-brand">404</p>
        <h1 className="mt-4 font-display text-2xl font-semibold tracking-tight">
          We could not find that page
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
          The link may be out of date, or the record was removed from your workspace.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/dashboard">
            <Button variant="brand">Back to dashboard</Button>
          </Link>
          <Link href="/">
            <Button variant="outline">Homepage</Button>
          </Link>
        </div>
      </div>
    </main>
  )
}
