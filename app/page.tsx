import Link from 'next/link'
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  Database,
  FileSearch,
  Sparkles,
  Target,
  Users,
  Zap,
} from 'lucide-react'
import { Logo } from '@/components/brand'
import { Reveal } from '@/components/motion/reveal'
import { Button } from '@/components/ui/button'
import { getSession } from '@/lib/auth'
import { APP_NAME } from '@/lib/constants'

const features = [
  {
    icon: FileSearch,
    title: 'Find your next customer',
    body: 'Scrape high-fit accounts by city, niche, and intent. Every record is scored and de-duplicated before it reaches your pipeline.',
  },
  {
    icon: Database,
    title: 'One source of truth',
    body: 'Leads, touches, notes, and next steps stay connected in a workspace the whole team can trust — with role-based access built in.',
  },
  {
    icon: BarChart3,
    title: 'Know what is working',
    body: 'Live pipeline value, win rate, and per-rep conversion, computed from your data rather than a spreadsheet someone forgot to update.',
  },
  {
    icon: CalendarDays,
    title: 'Keep momentum',
    body: 'Book meetings against a lead and the timeline updates itself, so nobody has to reconstruct what happened last week.',
  },
  {
    icon: Target,
    title: 'Prioritize automatically',
    body: 'Heuristic scoring weighs reachability and seniority, surfacing the leads most likely to move first.',
  },
  {
    icon: Users,
    title: 'Built for teams',
    body: 'Invite teammates with owner, admin, member, or viewer roles. Row-level security keeps every workspace fully isolated.',
  },
]

const workflow = [
  {
    step: '01',
    title: 'Describe your ideal customer',
    body: 'Pick a data source, enter a niche and the cities you sell into, then set a minimum score.',
  },
  {
    step: '02',
    title: 'Review what comes back',
    body: 'Results land in a staging queue with scores and duplicate detection. Import everything, or cherry-pick.',
  },
  {
    step: '03',
    title: 'Work the pipeline',
    body: 'Assign owners, log calls and emails, book meetings, and watch stage-by-stage conversion in the dashboard.',
  },
]

const plans = [
  {
    name: 'Starter',
    price: '$0',
    cadence: 'forever',
    description: 'For founders validating a motion.',
    features: ['1,000 leads', '2 seats', 'Sample data source', 'CRM, calendar, and CSV export'],
    cta: 'Start free',
    highlighted: false,
  },
  {
    name: 'Growth',
    price: '$49',
    cadence: 'per month',
    description: 'For teams running outbound every week.',
    features: [
      '25,000 leads',
      '10 seats',
      'Google Maps + custom providers',
      'Team performance reporting',
      'Priority support',
    ],
    cta: 'Start free trial',
    highlighted: true,
  },
  {
    name: 'Scale',
    price: 'Custom',
    cadence: 'talk to us',
    description: 'For revenue orgs with bespoke sources.',
    features: [
      'Unlimited leads and seats',
      'Bring your own scrapers',
      'SSO and audit logging',
      'Dedicated environment',
    ],
    cta: 'Contact sales',
    highlighted: false,
  },
]

export default async function LandingPage() {
  const session = await getSession()

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <Logo href="/" />
          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            {[
              ['#product', 'Product'],
              ['#workflow', 'Workflow'],
              ['#pricing', 'Pricing'],
            ].map(([href, label]) => (
              <a
                key={href}
                href={href}
                className="group relative transition-colors hover:text-foreground"
              >
                {label}
                <span className="absolute -bottom-1 left-0 h-px w-0 bg-primary transition-all duration-300 group-hover:w-full" />
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            {session ? (
              <Link href="/dashboard">
                <Button variant="brand">
                  Open workspace
                  <ArrowRight className="size-4" />
                </Button>
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:block"
                >
                  Sign in
                </Link>
                <Link href="/signup">
                  <Button variant="brand">Get started</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden bg-brand-aurora">
        <div className="absolute inset-0 grid-backdrop opacity-40" />
        <div className="pointer-events-none absolute -left-24 top-10 size-72 rounded-full bg-primary/20 blur-3xl animate-float-slow" />
        <div className="pointer-events-none absolute -right-16 top-40 size-80 rounded-full bg-brand-alt/15 blur-3xl animate-float-slower" />
        <div className="relative mx-auto grid max-w-7xl gap-14 px-5 pb-24 pt-16 sm:px-8 lg:grid-cols-[1fr_0.9fr] lg:items-center lg:pt-24">
          <div className="animate-in fade-in slide-in-from-bottom-6 duration-700 ease-out">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs text-primary">
              <span className="size-1.5 animate-pulse rounded-full bg-primary" />
              The signal layer for modern sales teams
            </div>
            <h1 className="max-w-3xl text-balance font-display text-5xl font-semibold leading-[1.03] tracking-[-0.035em] sm:text-6xl lg:text-7xl">
              Turn scattered signals into{' '}
              <span className="text-gradient-brand animate-brand-shimmer">pipeline.</span>
            </h1>
            <p className="mt-7 max-w-xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg">
              {APP_NAME} finds the right accounts, scores every signal, and gives your team a
              clear next move — without the spreadsheet archaeology.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href={session ? '/dashboard' : '/signup'}>
                <Button variant="brand" size="lg" className="w-full sm:w-auto">
                  {session ? 'Open your workspace' : 'Start for free'}
                  <ArrowRight className="size-4" />
                </Button>
              </Link>
              <a href="#workflow">
                <Button variant="outline" size="lg" className="w-full sm:w-auto">
                  See how it works
                </Button>
              </a>
            </div>
            <div className="mt-9 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
              {['No credit card', '1,000 leads free', 'Set up in minutes'].map((item) => (
                <span key={item} className="flex items-center gap-2">
                  <Check className="size-3.5 text-success" />
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="animate-in fade-in slide-in-from-bottom-8 relative duration-700 ease-out [animation-delay:150ms] [animation-fill-mode:backwards]">
            <div className="absolute -inset-8 bg-primary/10 blur-3xl" />
            <div className="hover-lift relative overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-slate-950/50">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-primary animate-pulse" />
                  <span className="font-mono text-xs">ai-savvy-leads / dashboard</span>
                </div>
                <span className="text-[10px] tracking-wider text-muted-foreground">LIVE</span>
              </div>
              <div className="grid grid-cols-2 gap-3 p-4">
                <div className="col-span-2 rounded-xl border border-border bg-background/60 p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Open pipeline</p>
                      <p className="mt-2 font-mono text-3xl font-semibold">$518.1k</p>
                    </div>
                    <span className="rounded-full bg-success/12 px-2 py-1 text-[10px] text-success">
                      +12.8%
                    </span>
                  </div>
                  <div className="mt-5 flex h-20 items-end gap-1">
                    {[28, 36, 31, 48, 42, 56, 51, 68, 62, 79, 73, 90, 84, 100].map(
                      (height, index) => (
                        <div
                          key={index}
                          className="animate-bar-grow flex-1 rounded-t-sm bg-gradient-to-t from-primary/30 to-primary"
                          style={{ height: `${height}%`, animationDelay: `${300 + index * 45}ms` }}
                        />
                      ),
                    )}
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-background/60 p-4 transition-colors duration-300 hover:border-primary/40">
                  <Target className="size-4 text-primary" />
                  <p className="mt-4 text-xs text-muted-foreground">Qualified</p>
                  <p className="mt-1 font-mono text-2xl font-semibold">286</p>
                </div>
                <div className="rounded-xl border border-border bg-background/60 p-4 transition-colors duration-300 hover:border-chart-2/40">
                  <Zap className="size-4 text-chart-2" />
                  <p className="mt-4 text-xs text-muted-foreground">Avg. score</p>
                  <p className="mt-1 font-mono text-2xl font-semibold">74</p>
                </div>
                <div className="col-span-2 rounded-xl border border-border bg-background/60 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-medium">Recent activity</span>
                    <span className="text-[10px] text-primary">View all</span>
                  </div>
                  {[
                    ['Maya Chen opened your proposal', 'bg-primary'],
                    ['128 leads imported from Austin scrape', 'bg-chart-2'],
                    ['Brightline Health moved to Won', 'bg-success'],
                  ].map(([item, color], index) => (
                    <div
                      key={item}
                      className="animate-in fade-in slide-in-from-left-2 flex items-center gap-3 border-t border-border py-2.5 duration-500 [animation-fill-mode:backwards]"
                      style={{ animationDelay: `${900 + index * 150}ms` }}
                    >
                      <span className={`size-2 rounded-full ${color} animate-pulse`} />
                      <span className="truncate text-xs text-muted-foreground">{item}</span>
                      <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                        {index + 1}h
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="product" className="border-y border-border bg-card/20">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
          <Reveal>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Everything in one workspace
            </p>
            <h2 className="mt-4 max-w-2xl text-balance font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              From first signal to closed won
            </h2>
          </Reveal>
          <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, index) => {
              const Icon = feature.icon
              return (
                <Reveal key={feature.title} delay={index * 80}>
                  <div className="group h-full bg-background p-6 transition-colors duration-300 hover:bg-card">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-primary/12 text-primary transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">
                      <Icon className="size-5" />
                    </span>
                    <h3 className="mt-5 font-display text-base font-semibold">{feature.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{feature.body}</p>
                  </div>
                </Reveal>
              )
            })}
          </div>
        </div>
      </section>

      <section id="workflow" className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <Reveal className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Built for the full motion
          </p>
          <h2 className="mx-auto mt-4 max-w-2xl text-balance font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Less busywork. More signal.
          </h2>
        </Reveal>
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {workflow.map((item, index) => (
            <Reveal key={item.step} delay={index * 120}>
              <div className="hover-lift h-full rounded-2xl border border-border bg-card p-6">
                <span className="font-mono text-3xl font-semibold text-gradient-brand">
                  {item.step}
                </span>
                <h3 className="mt-4 font-display text-base font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="pricing" className="border-y border-border bg-card/20">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
          <Reveal className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Pricing</p>
            <h2 className="mx-auto mt-4 max-w-2xl text-balance font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Start free, upgrade when it is working
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-sm leading-6 text-muted-foreground">
              Every plan includes the full CRM, calendar, and scraper. Only volume and seats change.
            </p>
          </Reveal>

          <div className="mt-14 grid gap-6 lg:grid-cols-3">
            {plans.map((plan, index) => (
              <Reveal key={plan.name} delay={index * 100}>
                <div
                  className={
                    plan.highlighted
                      ? 'hover-lift relative rounded-2xl border border-primary/50 bg-card p-6 shadow-2xl shadow-primary/10'
                      : 'hover-lift rounded-2xl border border-border bg-card p-6'
                  }
                >
                  {plan.highlighted ? (
                    <span className="absolute -top-3 left-6 rounded-full bg-gradient-brand px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white">
                      Most popular
                    </span>
                  ) : null}
                  <h3 className="font-display text-lg font-semibold">{plan.name}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{plan.description}</p>
                  <div className="mt-5 flex items-baseline gap-1.5">
                    <span className="font-mono text-4xl font-semibold tracking-tight">
                      {plan.price}
                    </span>
                    <span className="text-xs text-muted-foreground">{plan.cadence}</span>
                  </div>
                  <ul className="mt-6 space-y-2.5">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2.5 text-sm">
                        <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
                        <span className="text-muted-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Link href={session ? '/dashboard' : '/signup'} className="mt-7 block">
                    <Button
                      variant={plan.highlighted ? 'brand' : 'outline'}
                      className="w-full"
                      size="lg"
                    >
                      {plan.cta}
                    </Button>
                  </Link>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl border border-border bg-brand-aurora p-10 text-center sm:p-16">
            <div className="absolute inset-0 grid-backdrop opacity-30" />
            <div className="pointer-events-none absolute -left-10 -top-10 size-56 rounded-full bg-primary/15 blur-3xl animate-float-slow" />
            <div className="pointer-events-none absolute -right-10 -bottom-10 size-56 rounded-full bg-brand-alt/15 blur-3xl animate-float-slower" />
            <div className="relative">
              <span className="mx-auto mb-6 flex size-12 items-center justify-center rounded-2xl bg-gradient-brand shadow-lg shadow-primary/25 animate-pulse">
                <Sparkles className="size-6 text-white" />
              </span>
              <h2 className="mx-auto max-w-xl text-balance font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                Your next 100 customers are already out there
              </h2>
              <p className="mx-auto mt-4 max-w-lg text-sm leading-6 text-muted-foreground">
                Spin up a workspace, run your first scrape, and see real pipeline in under five
                minutes.
              </p>
              <Link href={session ? '/dashboard' : '/signup'} className="mt-8 inline-block">
                <Button variant="brand" size="lg">
                  {session ? 'Open your workspace' : 'Create your workspace'}
                  <ArrowRight className="size-4" />
                </Button>
              </Link>
            </div>
          </div>
        </Reveal>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-5 py-8 sm:flex-row sm:px-8">
          <Logo href="/" />
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} {APP_NAME}. Lead intelligence for modern revenue teams.
          </p>
          <div className="flex gap-5 text-xs text-muted-foreground">
            <a href="#product" className="transition-colors hover:text-foreground">
              Product
            </a>
            <a href="#pricing" className="transition-colors hover:text-foreground">
              Pricing
            </a>
            <Link href="/login" className="transition-colors hover:text-foreground">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
