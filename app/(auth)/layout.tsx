import Link from 'next/link'
import { ArrowLeft, Check } from 'lucide-react'
import { Logo } from '@/components/brand'
import { APP_NAME } from '@/lib/constants'

const highlights = [
  'Scrape high-fit accounts by city and niche',
  'Every touch, note, and next step in one timeline',
  'Shared pipeline your whole team can trust',
]

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col justify-center px-5 py-12 sm:px-10">
        <div className="mx-auto w-full max-w-md">
          <Logo href="/" className="mb-10" />
          {children}
          <Link
            href="/"
            className="mt-8 inline-flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3" />
            Back to homepage
          </Link>
        </div>
      </div>

      <div className="relative hidden overflow-hidden border-l border-border bg-brand-aurora lg:block">
        <div className="absolute inset-0 grid-backdrop opacity-40" />
        <div className="relative flex h-full flex-col justify-center px-14">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            {APP_NAME} workspace
          </p>
          <h2 className="mt-5 max-w-md font-display text-4xl font-semibold leading-[1.1] tracking-tight">
            Turn scattered signals into <span className="text-gradient-brand">pipeline.</span>
          </h2>
          <ul className="mt-9 space-y-4">
            {highlights.map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm text-muted-foreground">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <Check className="size-3" />
                </span>
                {item}
              </li>
            ))}
          </ul>
          <div className="mt-12 rounded-2xl border border-border bg-card/70 p-5 backdrop-blur">
            <div className="flex items-baseline justify-between">
              <p className="text-xs text-muted-foreground">Qualified pipeline</p>
              <span className="text-[10px] font-medium text-success">+12.8%</span>
            </div>
            <p className="mt-2 font-mono text-3xl font-semibold">$518.1k</p>
            <div className="mt-5 flex h-16 items-end gap-1">
              {[28, 36, 31, 48, 42, 56, 51, 68, 62, 79, 73, 90, 84, 100].map((height, index) => (
                <div
                  key={index}
                  className="flex-1 rounded-t-sm bg-gradient-to-t from-primary/40 to-primary"
                  style={{ height: `${height}%` }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
