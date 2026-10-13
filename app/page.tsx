import Link from 'next/link'
import type { Metadata } from 'next'
import {
  ArrowRight,
  Bot,
  CalendarCheck,
  Check,
  Clock,
  Database,
  FileSearch,
  Inbox,
  Mail,
  MapPin,
  Phone,
  Reply,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { Logo } from '@/components/brand'
import { getSession } from '@/lib/auth'
import { PAID_PLANS, PLANS, TOP_UPS } from '@/lib/billing/plans'
import { APP_NAME } from '@/lib/constants'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: `${APP_NAME} — find leads, let AI email them, book meetings`,
  description:
    'Find local businesses on Google Maps, let AI research each one and write a personal cold email, follow up automatically and call with a live AI coach. Free plan available.',
}

const steps = [
  {
    icon: Search,
    title: 'Find',
    body: 'Type a niche and a city — “dentists in Austin”. We pull real businesses from Google Maps with their website, phone and email.',
  },
  {
    icon: Bot,
    title: 'Research',
    body: 'AI reads each lead’s website and reviews, spots what they’re missing and picks the one service of yours they need most.',
  },
  {
    icon: Mail,
    title: 'Email',
    body: 'A personal cold email goes out from your own inbox during their business hours, with polite follow-ups if they don’t answer.',
  },
  {
    icon: CalendarCheck,
    title: 'Book',
    body: 'Replies land on your dashboard, sorted by intent. Call hot leads with a live AI coach and send the meeting invite in one click.',
  },
]

const features = [
  {
    icon: MapPin,
    title: 'Real leads, not stale lists',
    body: 'Fresh Google Maps results with emails found on each business’s own website. Duplicates are removed before they reach your CRM.',
  },
  {
    icon: Sparkles,
    title: 'Emails that sound like you',
    body: 'Every email is written for one business, mentions something real about them and pitches your service — not a template with a name swapped in.',
  },
  {
    icon: Clock,
    title: 'Autopilot that respects the inbox',
    body: 'Sends on weekdays in the lead’s own time zone, paces itself to protect your sender reputation and stops the moment someone replies.',
  },
  {
    icon: Reply,
    title: 'Every reply tracked',
    body: 'We read your inbox for answers, flag “interested”, “not now” and “unsubscribe”, and notify you so no warm lead goes cold.',
  },
  {
    icon: Phone,
    title: 'Call with a live AI coach',
    body: 'Dial from the browser on your own number. The coach listens and suggests what to say next, then writes the call summary for you.',
  },
  {
    icon: Database,
    title: 'A CRM built in',
    body: 'Pipeline status, notes, calendar, team access and Excel / CSV import. Bring the leads you already have on the free plan.',
  },
]

const faqs = [
  {
    q: 'Is the free plan really free?',
    a: 'Yes. The CRM, Excel import, pipeline and sending emails you write yourself are free forever, up to 250 leads. No card needed.',
  },
  {
    q: 'Whose email address do the emails come from?',
    a: 'Yours. You connect your own inbox (Zoho, Gmail, Outlook or any SMTP/IMAP mailbox) with an app password, so replies come straight to you. The password is stored encrypted.',
  },
  {
    q: 'Where do the leads come from?',
    a: 'Public business listings on Google Maps, plus the contact email published on each business’s own website. You can also import your own lists.',
  },
  {
    q: 'Do I need a phone number for calling?',
    a: 'No. Growth and Pro include your own US phone number and call minutes. It’s set up automatically when you subscribe.',
  },
  {
    q: 'What happens if I run out of leads or minutes?',
    a: `Buy a one-time top-up from the billing page — ${Object.values(TOP_UPS)
      .map((t) => `${t.name.replace('+', '')} for $${t.price}`)
      .join(', ')} — or move up a plan. Allowances reset every billing month.`,
  },
  {
    q: 'Can I cancel any time?',
    a: 'Yes, from the billing page in one click. You keep your leads and history and drop back to the free plan at the end of the month.',
  },
]

function HeroMock() {
  return (
    <div className="relative mx-auto w-full max-w-xl">
      <div className="absolute -inset-8 -z-10 rounded-[2rem] bg-gradient-brand opacity-20 blur-3xl" />
      <div className="rounded-2xl border border-border bg-card/90 p-4 shadow-2xl backdrop-blur sm:p-5">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-background/70 px-3 py-2 text-sm">
          <Search className="size-4 text-muted-foreground" />
          <span className="text-muted-foreground">roofing companies in</span>
          <span className="font-medium">Dallas, TX</span>
          <span className="ml-auto rounded-md bg-gradient-brand px-2 py-0.5 text-[11px] font-medium text-white">Find</span>
        </div>

        <ul className="mt-3 space-y-2">
          {[
            { name: 'Summit Roofing Co.', meta: '4.8 ★ · 212 reviews', status: 'Replied', tone: 'bg-success/15 text-success' },
            { name: 'Lone Star Roof Pros', meta: '4.5 ★ · 96 reviews', status: 'Emailed', tone: 'bg-primary/15 text-primary' },
            { name: 'Red River Exteriors', meta: '4.9 ★ · 58 reviews', status: 'Researched', tone: 'bg-chart-3/15 text-chart-3' },
          ].map((lead) => (
            <li key={lead.name} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{lead.name}</p>
                <p className="text-[11px] text-muted-foreground">{lead.meta}</p>
              </div>
              <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium', lead.tone)}>{lead.status}</span>
            </li>
          ))}
        </ul>

        <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
            <Sparkles className="size-3" /> AI-written email
          </p>
          <p className="mt-2 text-sm font-medium">Summit’s 212 reviews vs. page 2 on Google</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Hi Mark — your reviews are some of the best in Dallas, but “roof repair Dallas” shows three competitors above you.
            We fix exactly that for roofers. Worth a 15-minute look next week?
          </p>
        </div>

        <div className="mt-3 flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2 text-xs text-success">
          <Inbox className="size-3.5" />
          <span>
            <span className="font-medium">Mark replied:</span> “Sure — Tuesday works.”
          </span>
        </div>
      </div>
    </div>
  )
}

export default async function Home() {
  const session = await getSession()
  const plans = [PLANS.free, ...PAID_PLANS]

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Logo href="/" />
          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            <a href="#how" className="hover:text-foreground">How it works</a>
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#pricing" className="hover:text-foreground">Pricing</a>
            <a href="#faq" className="hover:text-foreground">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            {session ? (
              <Link href="/dashboard" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-gradient-brand px-4 text-sm font-medium text-white shadow-lg shadow-primary/25">
                Open dashboard <ArrowRight className="size-4" />
              </Link>
            ) : (
              <>
                <Link href="/login" className="hidden h-9 items-center rounded-lg px-3 text-sm text-muted-foreground hover:text-foreground sm:inline-flex">
                  Sign in
                </Link>
                <Link href="/signup" className="inline-flex h-9 items-center rounded-lg bg-gradient-brand px-4 text-sm font-medium text-white shadow-lg shadow-primary/25">
                  Start free
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden bg-brand-aurora">
          <div className="absolute inset-0 grid-backdrop opacity-40 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.05fr_1fr]">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
                <Sparkles className="size-3.5 text-primary" /> AI prospecting for agencies and service businesses
              </p>
              <h1 className="mt-6 font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
                Find leads. Let AI email them. <span className="text-gradient-brand">Book the meetings.</span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
                Pull real businesses from Google Maps, have AI research each one and write a personal cold email from your own
                inbox, follow up automatically — then call the hot ones with a live AI coach.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href={session ? '/dashboard' : '/signup'}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-brand px-6 text-base font-medium text-white shadow-xl shadow-primary/30 transition hover:brightness-110"
                >
                  {session ? 'Open your dashboard' : 'Start free — no card'} <ArrowRight className="size-4" />
                </Link>
                <a
                  href="#pricing"
                  className="inline-flex h-12 items-center justify-center rounded-xl border border-border bg-card/70 px-6 text-base font-medium backdrop-blur hover:bg-card"
                >
                  See pricing
                </a>
              </div>
              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
                {['Free plan forever', 'Sends from your own inbox', 'Cancel any time'].map((item) => (
                  <li key={item} className="flex items-center gap-1.5">
                    <Check className="size-4 text-success" /> {item}
                  </li>
                ))}
              </ul>
            </div>
            <HeroMock />
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-16 border-t border-border">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">How it works</p>
            <h2 className="mt-3 max-w-2xl font-display text-3xl font-bold tracking-tight sm:text-4xl">
              From a search to a booked call, without the busywork
            </h2>
            <ol className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map((step, index) => (
                <li key={step.title} className="relative rounded-2xl border border-border bg-card p-6">
                  <span className="font-mono text-xs text-muted-foreground">0{index + 1}</span>
                  <span className="mt-3 flex size-10 items-center justify-center rounded-xl bg-gradient-brand text-white shadow-lg shadow-primary/25">
                    <step.icon className="size-5" />
                  </span>
                  <h3 className="mt-4 font-display text-lg font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-16 border-t border-border bg-secondary/30">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Features</p>
            <h2 className="mt-3 max-w-2xl font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Everything a one-person sales team needs
            </h2>
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <div key={feature.title} className="rounded-2xl border border-border bg-card p-6 transition hover:-translate-y-0.5 hover:shadow-xl">
                  <feature.icon className="size-6 text-primary" />
                  <h3 className="mt-4 font-display text-base font-semibold">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{feature.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="scroll-mt-16 border-t border-border">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Pricing</p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">Start free. Upgrade when it’s working.</h2>
              <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
                Monthly plans, no contracts. Allowances reset every billing month.
              </p>
            </div>
            <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              {plans.map((plan) => {
                const popular = plan.id === 'growth'
                return (
                  <div
                    key={plan.id}
                    className={cn(
                      'relative flex flex-col rounded-2xl border bg-card p-6',
                      popular ? 'border-primary shadow-2xl shadow-primary/20' : 'border-border',
                    )}
                  >
                    {popular ? (
                      <span className="absolute -top-3 left-6 rounded-full bg-gradient-brand px-3 py-1 text-[11px] font-semibold text-white">
                        Most popular
                      </span>
                    ) : null}
                    <h3 className="font-display text-lg font-semibold">{plan.name}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{plan.tagline}</p>
                    <p className="mt-5">
                      <span className="font-display text-4xl font-bold">${plan.price}</span>
                      <span className="text-sm text-muted-foreground">/month</span>
                    </p>
                    <ul className="mt-6 flex-1 space-y-3 text-sm">
                      {plan.highlights.map((line) => (
                        <li key={line} className="flex gap-2">
                          <Check className="mt-0.5 size-4 shrink-0 text-success" />
                          <span>{line}</span>
                        </li>
                      ))}
                    </ul>
                    <Link
                      href={session ? '/billing' : '/signup'}
                      className={cn(
                        'mt-7 inline-flex h-11 items-center justify-center rounded-xl text-sm font-medium transition',
                        popular
                          ? 'bg-gradient-brand text-white shadow-lg shadow-primary/25 hover:brightness-110'
                          : 'border border-border hover:bg-secondary',
                      )}
                    >
                      {plan.price === 0 ? 'Start free' : `Choose ${plan.name}`}
                    </Link>
                  </div>
                )
              })}
            </div>
            <p className="mt-8 text-center text-xs text-muted-foreground">
              Need more mid-month? Top-ups:{' '}
              {Object.values(TOP_UPS)
                .map((t) => `${t.name} $${t.price}`)
                .join(' · ')}
              . Calling numbers are US.
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-16 border-t border-border bg-secondary/30">
          <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
            <h2 className="text-center font-display text-3xl font-bold tracking-tight sm:text-4xl">Questions</h2>
            <div className="mt-10 space-y-3">
              {faqs.map((faq) => (
                <details key={faq.q} className="group rounded-xl border border-border bg-card p-5 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                    {faq.q}
                    <span className="text-xl leading-none text-muted-foreground transition group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{faq.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="border-t border-border">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <div className="relative overflow-hidden rounded-3xl bg-brand-aurora px-6 py-14 text-center sm:px-12">
              <div className="absolute inset-0 grid-backdrop opacity-30" />
              <div className="relative">
                <ShieldCheck className="mx-auto size-8 text-primary" />
                <h2 className="mx-auto mt-4 max-w-2xl font-display text-3xl font-bold tracking-tight sm:text-4xl">
                  Your next client is already on Google Maps
                </h2>
                <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
                  Create a free workspace in under a minute. Upgrade only when you want AI to do the outreach for you.
                </p>
                <Link
                  href={session ? '/dashboard' : '/signup'}
                  className="mt-8 inline-flex h-12 items-center gap-2 rounded-xl bg-gradient-brand px-7 text-base font-medium text-white shadow-xl shadow-primary/30 hover:brightness-110"
                >
                  {session ? 'Open your dashboard' : 'Create my free workspace'} <ArrowRight className="size-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <FileSearch className="size-4" />
            <span>
              © {new Date().getFullYear()} {APP_NAME} by{' '}
              <a href="https://aisavvy.us" className="hover:text-foreground">AI Savvy</a>
            </span>
          </div>
          <div className="flex gap-5">
            <a href="#pricing" className="hover:text-foreground">Pricing</a>
            <Link href="/login" className="hover:text-foreground">Sign in</Link>
            <Link href="/signup" className="hover:text-foreground">Start free</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
