import Link from 'next/link'
import type { Metadata } from 'next'
import {
  ArrowRight,
  Bot,
  CalendarCheck,
  Check,
  Clock,
  Database,
  Inbox,
  Mail,
  MapPin,
  Phone,
  Reply,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react'
import { Logo } from '@/components/brand'
import { LiveDemo } from '@/components/landing/live-demo'
import { CountUp, Reveal, RotatingWord, SpotlightGroup } from '@/components/landing/motion'
import { Pricing } from '@/components/landing/pricing'
import { getSession } from '@/lib/auth'
import { PLANS, TOP_UPS } from '@/lib/billing/plans'
import { APP_NAME } from '@/lib/constants'
import { TOTAL_STEPS } from '@/lib/outreach/config'

export const metadata: Metadata = {
  title: `${APP_NAME} — find leads, let AI email them, book meetings`,
  description:
    'Find local businesses on Google Maps, let AI research each one and write a personal cold email from your own inbox, follow up automatically and call with a live AI coach. Free plan available.',
}

const NICHES = ['roofers', 'dentists', 'law firms', 'med spas', 'HVAC companies', 'gyms', 'realtors', 'restaurants']
const MARQUEE = [
  'Roofing · Dallas',
  'Dentists · Austin',
  'Law firms · Chicago',
  'Med spas · Miami',
  'HVAC · Phoenix',
  'Gyms · Denver',
  'Realtors · Atlanta',
  'Plumbers · Houston',
  'Restaurants · New York',
  'Auto repair · Seattle',
  'Chiropractors · San Diego',
  'Salons · Las Vegas',
]

const steps = [
  {
    icon: Search,
    title: 'Find',
    body: 'Type a niche and a city. We pull real businesses from Google Maps with their website, phone, rating and email.',
  },
  {
    icon: Bot,
    title: 'Research',
    body: 'AI reads each lead’s website and reviews, spots what they’re missing and picks the one service of yours they need.',
  },
  {
    icon: Mail,
    title: 'Email',
    body: `A personal email goes out from your inbox in their business hours, plus ${TOTAL_STEPS - 1} polite follow-ups if they’re quiet.`,
  },
  {
    icon: CalendarCheck,
    title: 'Book',
    body: 'Replies land on your dashboard sorted by intent. Call the hot ones with an AI coach and send the invite in one click.',
  },
]

const features = [
  {
    icon: MapPin,
    title: 'Real, fresh leads',
    body: 'Live Google Maps results with emails found on each business’s own website. Duplicates are removed before they reach your CRM.',
    wide: true,
  },
  {
    icon: Sparkles,
    title: 'Emails that sound like you',
    body: 'Every email is written for one business and mentions something real about them. No templates with a name swapped in.',
  },
  {
    icon: Clock,
    title: 'Autopilot that protects your inbox',
    body: 'Weekdays only, in the lead’s time zone, paced to protect your sender reputation, and it stops the moment someone replies.',
  },
  {
    icon: Reply,
    title: 'Every reply caught',
    body: 'We read your inbox, sort replies into interested, not now and unsubscribe, and notify you so no warm lead goes cold.',
    wide: true,
  },
  {
    icon: Phone,
    title: 'Call with a live AI coach',
    body: 'Dial from your browser on your own US number. The coach suggests what to say next, then writes the summary and the follow-up email.',
    wide: true,
  },
  {
    icon: Database,
    title: 'A full CRM built in',
    body: 'Pipeline status, notes, calendar, team roles and Excel import. Free forever for the leads you already have.',
  },
]

const oldWay = [
  'Hours copying leads out of Google Maps',
  'One generic template sent to everyone',
  'Forgetting to follow up',
  'Replies buried in your inbox',
  'Cold-calling without knowing what to say',
]
const newWay = [
  'Hundreds of fresh leads in a few minutes',
  'A personal email for every business',
  `${TOTAL_STEPS - 1} follow-ups sent for you, on time`,
  'Replies sorted and flagged on your dashboard',
  'A live AI coach in your ear on every call',
]

const faqs = [
  {
    q: 'Is the free plan really free?',
    a: `Yes. The CRM, Excel import, pipeline and sending emails you write yourself are free forever, up to ${PLANS.free.limits.storedLeads} leads. No card needed.`,
  },
  {
    q: 'Whose email address do the emails come from?',
    a: 'Yours. Connect Gmail or Outlook / Microsoft 365 by signing in with Google or Microsoft, or any other inbox (Zoho and more) with an app password. Replies come straight to you.',
  },
  {
    q: 'Will this hurt my email reputation?',
    a: 'Autopilot sends a small number of new emails a day per inbox, only on weekdays during the lead’s business hours, and stops when someone replies or unsubscribes. That pacing is what keeps cold email landing in the inbox.',
  },
  {
    q: 'Where do the leads come from?',
    a: 'Public business listings on Google Maps, plus the contact email published on each business’s own website. You can also import your own lists from Excel or CSV.',
  },
  {
    q: 'What counts as an “AI lead”?',
    a: `One business that AI researches and writes to. It includes the research, the first email and up to ${TOTAL_STEPS - 1} follow-ups, so a plan with 150 AI leads can send up to ${150 * TOTAL_STEPS} personal emails a month.`,
  },
  {
    q: 'Do I need my own phone number for calling?',
    a: 'No. Growth and Pro include your own US number, set up automatically when you subscribe. You call right from the browser, so there’s nothing to install.',
  },
  {
    q: 'What if I run out of leads or minutes?',
    a: `Buy a one-time top-up from the billing page (${Object.values(TOP_UPS)
      .map((t) => `${t.name.replace('+', '')} for $${t.price}`)
      .join(', ')}) or move up a plan. Allowances reset every billing month.`,
  },
  {
    q: 'Can I cancel any time?',
    a: 'Yes, in one click from the billing page. You keep your leads and history and move to the free plan.',
  },
]

export default async function Home() {
  const session = await getSession()
  const primaryHref = session ? '/dashboard' : '/signup'

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Logo href="/" />
          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex" aria-label="Page sections">
            <a href="#how" className="transition-colors hover:text-foreground">How it works</a>
            <a href="#features" className="transition-colors hover:text-foreground">Features</a>
            <a href="#pricing" className="transition-colors hover:text-foreground">Pricing</a>
            <a href="#faq" className="transition-colors hover:text-foreground">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            {session ? (
              <Link
                href="/dashboard"
                className="group inline-flex h-10 items-center gap-1.5 rounded-lg bg-gradient-brand px-4 text-sm font-medium text-white shadow-lg shadow-primary/25"
              >
                Open dashboard <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            ) : (
              <>
                <Link href="/login" className="hidden h-10 items-center rounded-lg px-3 text-sm text-muted-foreground hover:text-foreground sm:inline-flex">
                  Sign in
                </Link>
                <Link
                  href="/signup"
                  className="inline-flex h-10 items-center rounded-lg bg-gradient-brand px-4 text-sm font-medium text-white shadow-lg shadow-primary/25 transition hover:brightness-110"
                >
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
          <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pb-20 pt-14 sm:px-6 sm:pt-20 lg:grid-cols-[1.05fr_1fr] lg:pb-28">
            <div>
              <Reveal>
                <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" />
                    <span className="relative inline-flex size-2 rounded-full bg-success" />
                  </span>
                  AI prospecting for agencies and service businesses
                </p>
              </Reveal>
              <Reveal delay={80}>
                <h1 className="mt-6 font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
                  <span className="block">
                    Find <RotatingWord words={NICHES} className="text-gradient-brand pb-1" />.
                  </span>
                  <span className="block">AI emails them.</span>
                  <span className="block text-gradient-brand">You take the meetings.</span>
                </h1>
              </Reveal>
              <Reveal delay={160}>
                <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
                  Pull real businesses from Google Maps. AI researches each one and writes a personal cold email from your own
                  inbox, follows up for you and flags every reply. Then you call the hot ones with a live AI coach.
                </p>
              </Reveal>
              <Reveal delay={240}>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Link
                    href={primaryHref}
                    className="group inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-brand px-6 text-base font-semibold text-white shadow-xl shadow-primary/30 transition hover:-translate-y-0.5 hover:brightness-110"
                  >
                    {session ? 'Open your dashboard' : 'Start free, no card'}
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                  </Link>
                  <a
                    href="#pricing"
                    className="inline-flex h-12 items-center justify-center rounded-xl border border-border bg-card/70 px-6 text-base font-medium backdrop-blur transition hover:-translate-y-0.5 hover:bg-card"
                  >
                    See plans and pricing
                  </a>
                </div>
              </Reveal>
              <Reveal delay={320}>
                <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
                  {['Free plan forever', 'Sends from your own inbox', 'Cancel any time'].map((item) => (
                    <li key={item} className="flex items-center gap-1.5">
                      <Check className="size-4 text-success" /> {item}
                    </li>
                  ))}
                </ul>
              </Reveal>
            </div>
            <Reveal delay={200}>
              <LiveDemo />
            </Reveal>
          </div>

          {/* Niche marquee */}
          <div className="relative border-y border-border/60 bg-background/40 py-4 backdrop-blur [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
            <div className="animate-marquee flex w-max gap-3">
              {[...MARQUEE, ...MARQUEE].map((item, index) => (
                <span
                  key={index}
                  aria-hidden={index >= MARQUEE.length}
                  className="flex items-center gap-2 whitespace-nowrap rounded-full border border-border bg-card/70 px-4 py-1.5 text-sm text-muted-foreground"
                >
                  <MapPin className="size-3.5 text-primary" /> {item}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Numbers */}
        <section className="border-b border-border">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-14 sm:px-6 lg:grid-cols-4">
            {[
              { value: PLANS.pro.limits.leadsFound, suffix: '', label: 'leads a month you can find on Pro' },
              { value: TOTAL_STEPS, suffix: '', label: 'personal emails per lead, follow-ups included' },
              { value: 5, suffix: ' days', label: 'a week of sending, in each lead’s business hours' },
              { value: 0, suffix: ' templates', label: 'every email is written for one business', static: true },
            ].map((stat, index) => (
              <Reveal key={stat.label} delay={index * 90} className="text-center lg:text-left">
                <p className="font-display text-4xl font-bold tracking-tight text-gradient-brand sm:text-5xl">
                  {stat.static ? `0${stat.suffix}` : <CountUp value={stat.value} suffix={stat.suffix} />}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">{stat.label}</p>
              </Reveal>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-16">
          <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
            <Reveal>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">How it works</p>
              <h2 className="mt-3 max-w-2xl font-display text-3xl font-bold tracking-tight sm:text-4xl">
                From a search to a booked call, without the busywork
              </h2>
            </Reveal>
            <ol className="relative mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <div className="absolute left-0 right-0 top-[3.25rem] hidden h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent lg:block" aria-hidden />
              {steps.map((step, index) => (
                <Reveal as="li" key={step.title} delay={index * 120} className="relative">
                  <div className="h-full rounded-2xl border border-border bg-card p-6 transition duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl">
                    <span className="font-mono text-xs text-muted-foreground">Step {index + 1}</span>
                    <span className="mt-3 flex size-11 items-center justify-center rounded-xl bg-gradient-brand text-white shadow-lg shadow-primary/30">
                      <step.icon className="size-5" />
                    </span>
                    <h3 className="mt-4 font-display text-lg font-semibold">{step.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.body}</p>
                  </div>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-16 border-t border-border bg-secondary/30">
          <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
            <Reveal>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Features</p>
              <h2 className="mt-3 max-w-2xl font-display text-3xl font-bold tracking-tight sm:text-4xl">
                A whole sales team’s busywork, done for you
              </h2>
            </Reveal>
            <SpotlightGroup className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature, index) => (
                <Reveal key={feature.title} delay={(index % 3) * 100} className={feature.wide ? 'lg:col-span-2' : undefined}>
                  <div
                    data-spotlight
                    className="spotlight group h-full rounded-2xl border border-border bg-card p-7 transition duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl"
                  >
                    <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition group-hover:scale-110 group-hover:bg-gradient-brand group-hover:text-white">
                      <feature.icon className="size-5" />
                    </span>
                    <h3 className="mt-5 font-display text-lg font-semibold">{feature.title}</h3>
                    <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{feature.body}</p>
                  </div>
                </Reveal>
              ))}
            </SpotlightGroup>
          </div>
        </section>

        {/* Old way vs new way */}
        <section className="border-t border-border">
          <div className="mx-auto max-w-5xl px-4 py-24 sm:px-6">
            <Reveal>
              <h2 className="text-center font-display text-3xl font-bold tracking-tight sm:text-4xl">Stop prospecting by hand</h2>
            </Reveal>
            <div className="mt-12 grid gap-5 md:grid-cols-2">
              <Reveal>
                <div className="h-full rounded-2xl border border-border bg-card p-7">
                  <p className="font-display text-lg font-semibold text-muted-foreground">The old way</p>
                  <ul className="mt-5 space-y-3.5 text-sm">
                    {oldWay.map((line) => (
                      <li key={line} className="flex gap-3 text-muted-foreground">
                        <X className="mt-0.5 size-4 shrink-0 text-destructive" /> {line}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
              <Reveal delay={120}>
                <div className="border-glow h-full rounded-2xl p-7 shadow-2xl shadow-primary/15">
                  <p className="font-display text-lg font-semibold">With {APP_NAME}</p>
                  <ul className="mt-5 space-y-3.5 text-sm">
                    {newWay.map((line) => (
                      <li key={line} className="flex gap-3">
                        <Check className="mt-0.5 size-4 shrink-0 text-success" /> {line}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="scroll-mt-16 border-t border-border bg-secondary/30">
          <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
            <Reveal className="text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Pricing</p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">Start free. Upgrade when it’s working.</h2>
              <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
                Every paid plan finds leads, researches them with AI and emails them for you. Growth and Pro add your own phone
                number with a live AI call coach.
              </p>
            </Reveal>
            <Pricing signedIn={Boolean(session)} />
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-16 border-t border-border">
          <div className="mx-auto max-w-3xl px-4 py-24 sm:px-6">
            <Reveal>
              <h2 className="text-center font-display text-3xl font-bold tracking-tight sm:text-4xl">Questions, answered</h2>
            </Reveal>
            <div className="mt-12 space-y-3">
              {faqs.map((faq, index) => (
                <Reveal key={faq.q} delay={index * 50}>
                  <details className="group rounded-xl border border-border bg-card p-5 transition-colors open:border-primary/40 [&_summary::-webkit-details-marker]:hidden">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                      {faq.q}
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-lg leading-none text-muted-foreground transition-transform duration-300 group-open:rotate-45">
                        +
                      </span>
                    </summary>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">{faq.a}</p>
                  </details>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="px-4 pb-24 sm:px-6">
          <Reveal className="mx-auto max-w-6xl">
            <div className="relative overflow-hidden rounded-3xl bg-brand-aurora px-6 py-16 text-center sm:px-12">
              <div className="absolute inset-0 grid-backdrop opacity-30" />
              <div className="animate-float-slow absolute -left-16 top-0 size-72 rounded-full bg-primary/20 blur-3xl" />
              <div className="animate-float-slower absolute -right-16 bottom-0 size-72 rounded-full bg-chart-3/20 blur-3xl" />
              <div className="relative">
                <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-gradient-brand text-white shadow-xl shadow-primary/30">
                  <Inbox className="size-6" />
                </span>
                <h2 className="mx-auto mt-5 max-w-2xl font-display text-3xl font-bold tracking-tight sm:text-5xl">
                  Your next client is already on Google Maps
                </h2>
                <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
                  Create a free workspace in under a minute. Upgrade when you want AI to do the outreach for you.
                </p>
                <Link
                  href={primaryHref}
                  className="group mt-8 inline-flex h-12 items-center gap-2 rounded-xl bg-gradient-brand px-7 text-base font-semibold text-white shadow-xl shadow-primary/30 transition hover:-translate-y-0.5 hover:brightness-110"
                >
                  {session ? 'Open your dashboard' : 'Create my free workspace'}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </Link>
                <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                  <ShieldCheck className="size-3.5" /> No card needed for the free plan
                </p>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-border pb-20 sm:pb-0">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <span>
            © {new Date().getFullYear()} {APP_NAME} by{' '}
            <a href="https://aisavvy.us" className="hover:text-foreground">AI Savvy</a>
          </span>
          <div className="flex gap-5">
            <a href="#pricing" className="hover:text-foreground">Pricing</a>
            <a href="#faq" className="hover:text-foreground">FAQ</a>
            <Link href="/login" className="hover:text-foreground">Sign in</Link>
          </div>
        </div>
      </footer>

      {/* Mobile: keep the main action in reach */}
      {!session ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 p-3 backdrop-blur-xl sm:hidden">
          <Link
            href="/signup"
            className="flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-brand text-base font-semibold text-white shadow-lg shadow-primary/30"
          >
            Start free, no card <ArrowRight className="size-4" />
          </Link>
        </div>
      ) : null}
    </div>
  )
}
