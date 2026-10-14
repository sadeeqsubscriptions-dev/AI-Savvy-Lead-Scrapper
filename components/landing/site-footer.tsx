import Link from 'next/link'
import { ArrowUp, Lock, Mail, ShieldCheck } from 'lucide-react'
import { Logo } from '@/components/brand'
import { APP_NAME, COMPANY_NAME, COMPANY_URL, SUPPORT_EMAIL } from '@/lib/constants'

const COLUMNS = [
  {
    title: 'Product',
    links: [
      { label: 'How it works', href: '/#how' },
      { label: 'Features', href: '/#features' },
      { label: 'Pricing', href: '/#pricing' },
      { label: 'FAQ', href: '/#faq' },
    ],
  },
  {
    title: 'Get started',
    links: [
      { label: 'Create a free account', href: '/signup' },
      { label: 'Sign in', href: '/login' },
      { label: 'Compare plans', href: '/#pricing' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: COMPANY_NAME, href: COMPANY_URL, external: true },
      { label: 'Contact us', href: `mailto:${SUPPORT_EMAIL}` },
      { label: 'Privacy policy', href: '/privacy' },
      { label: 'Terms of service', href: '/terms' },
    ],
  },
]

export function SiteFooter() {
  const year = new Date().getFullYear()
  return (
    <footer className="border-t border-border bg-card/40">
      <div className="mx-auto max-w-6xl px-4 pb-24 pt-14 sm:px-6 sm:pb-10">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))] [&>*:first-child]:col-span-2 md:[&>*:first-child]:col-span-1">
          <div className="max-w-sm">
            <Logo href="/" />
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              Find local businesses, let AI research and email them from your own inbox, and call the hot ones with a live
              AI coach. Built by {COMPANY_NAME} for agencies and service businesses.
            </p>
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="mt-5 inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm transition hover:border-primary/40"
            >
              <Mail className="size-4 text-primary" /> {SUPPORT_EMAIL}
            </a>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground">{column.title}</p>
              <ul className="mt-4 space-y-3 text-sm">
                {column.links.map((link) => (
                  <li key={link.label}>
                    {'external' in link ? (
                      <a href={link.href} target="_blank" rel="noreferrer" className="text-muted-foreground transition-colors hover:text-foreground">
                        {link.label}
                      </a>
                    ) : (
                      <Link href={link.href} className="text-muted-foreground transition-colors hover:text-foreground">
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-border pt-6 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
          <p>
            © {year} {COMPANY_NAME}. All rights reserved. {APP_NAME} is a product of{' '}
            <a href={COMPANY_URL} target="_blank" rel="noreferrer" className="hover:text-foreground">
              aisavvy.us
            </a>
            .
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="flex items-center gap-1.5">
              <Lock className="size-3.5" /> Payments secured by Stripe
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="size-3.5" /> Inbox passwords encrypted
            </span>
            <a href="#top" className="flex items-center gap-1.5 transition-colors hover:text-foreground">
              <ArrowUp className="size-3.5" /> Back to top
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
