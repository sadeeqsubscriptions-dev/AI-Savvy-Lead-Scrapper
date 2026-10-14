import Link from 'next/link'
import { Check, CreditCard, Lock, Minus, RefreshCcw, ShieldCheck } from 'lucide-react'
import { PAID_PLANS, PLANS, TOP_UPS, type Plan } from '@/lib/billing/plans'
import { TOTAL_STEPS } from '@/lib/outreach/config'
import { cn } from '@/lib/utils'
import { Reveal } from './motion'

const fmt = (n: number) => n.toLocaleString('en-US')

/** The most important lines of each plan, in plain words. */
function included(plan: Plan): { text: string; strong?: boolean }[] {
  const l = plan.limits
  if (plan.price === 0) {
    return [
      { text: `Up to ${fmt(l.storedLeads)} leads in your CRM`, strong: true },
      { text: 'Import leads from Excel / CSV' },
      { text: 'Pipeline, notes, status page and calendar' },
      { text: 'Write and send emails from your own inbox' },
      { text: '1 user' },
    ]
  }
  return [
    { text: `${fmt(l.leadsFound)} new leads found every month`, strong: true },
    { text: `${fmt(l.aiLeads)} leads researched and emailed by AI`, strong: true },
    { text: `${TOTAL_STEPS} personal emails per lead (first email + ${TOTAL_STEPS - 1} follow-ups)` },
    { text: 'Autopilot sends on weekdays in each lead’s time zone' },
    { text: 'Reply tracking with AI intent sorting' },
    ...(plan.phoneNumber
      ? [
          { text: 'Your own US phone number', strong: true },
          { text: `${fmt(l.callMinutes)} call minutes with live AI coach` },
          { text: 'AI call summaries, follow-up emails and meeting invites' },
        ]
      : []),
    { text: 'Unlimited leads stored in your CRM' },
    { text: `${l.seats} ${l.seats === 1 ? 'user' : 'users'}` },
  ]
}

type Cell = string | boolean
const ROWS: { group: string; rows: { label: string; values: (plan: Plan) => Cell; hint?: string }[] }[] = [
  {
    group: 'Finding leads',
    rows: [
      { label: 'Leads found on Google Maps / month', values: (p) => (p.limits.leadsFound ? fmt(p.limits.leadsFound) : false) },
      { label: 'Business emails found on their websites', values: (p) => p.features.scraping },
      { label: 'Leads stored in your CRM', values: (p) => (p.price === 0 ? fmt(p.limits.storedLeads) : 'Unlimited') },
      { label: 'Excel / CSV import', values: () => true },
    ],
  },
  {
    group: 'AI email outreach',
    rows: [
      { label: 'Leads researched + emailed by AI / month', values: (p) => (p.limits.aiLeads ? fmt(p.limits.aiLeads) : false) },
      {
        label: 'AI emails / month (incl. follow-ups)',
        values: (p) => (p.limits.aiLeads ? `up to ${fmt(p.limits.aiLeads * TOTAL_STEPS)}` : false),
      },
      { label: 'Send from your own inbox (Gmail, Outlook, Zoho…)', values: () => true },
      { label: 'Autopilot in each lead’s business hours', values: (p) => p.features.autopilot },
      { label: 'Reply tracking + intent (interested / not now / stop)', values: (p) => p.features.ai },
      { label: 'Cost per fully worked lead', values: (p) => (p.limits.aiLeads ? `$${(p.price / p.limits.aiLeads).toFixed(2)}` : false) },
    ],
  },
  {
    group: 'Calling',
    rows: [
      { label: 'Your own US phone number', values: (p) => p.phoneNumber },
      { label: 'Call minutes / month', values: (p) => (p.limits.callMinutes ? fmt(p.limits.callMinutes) : false) },
      { label: 'Live AI coach + call summaries', values: (p) => p.features.calling },
      { label: 'One-click meeting invites', values: (p) => p.features.calling },
    ],
  },
  {
    group: 'Team',
    rows: [
      { label: 'Users', values: (p) => String(p.limits.seats) },
      { label: 'Top-ups when you need more', values: (p) => p.price > 0 },
    ],
  },
]

function CellValue({ value }: { value: Cell }) {
  if (value === true) return <Check className="mx-auto size-4 text-success" aria-label="Included" />
  if (value === false) return <Minus className="mx-auto size-4 text-muted-foreground/50" aria-label="Not included" />
  return <span className="font-medium">{value}</span>
}

export function Pricing({ signedIn }: { signedIn: boolean }) {
  const plans = [PLANS.free, ...PAID_PLANS]
  const href = signedIn ? '/billing' : '/signup'

  return (
    <>
      <div className="mt-14 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((plan, index) => {
          const popular = plan.id === 'growth'
          return (
            <Reveal key={plan.id} delay={index * 90} className="h-full">
              <div
                className={cn(
                  'relative flex h-full flex-col rounded-2xl p-6 transition duration-300 hover:-translate-y-1',
                  popular ? 'border-glow shadow-2xl shadow-primary/25' : 'border border-border bg-card hover:shadow-xl',
                )}
              >
                {popular ? (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-gradient-brand px-3 py-1 text-[11px] font-semibold text-white shadow-lg">
                    Most popular · includes calling
                  </span>
                ) : null}
                <h3 className="font-display text-lg font-semibold">{plan.name}</h3>
                <p className="mt-1 min-h-[2.5rem] text-xs leading-5 text-muted-foreground">{plan.tagline}</p>
                <p className="mt-4 flex items-baseline gap-1">
                  <span className="font-display text-5xl font-bold tracking-tight">${plan.price}</span>
                  <span className="text-sm text-muted-foreground">/month</span>
                </p>
                <p className="mt-1 h-4 text-[11px] text-muted-foreground">
                  {plan.limits.aiLeads
                    ? `≈ $${(plan.price / plan.limits.aiLeads).toFixed(2)} per lead researched + emailed`
                    : 'Free forever · no card needed'}
                </p>
                <Link
                  href={href}
                  className={cn(
                    'mt-6 inline-flex h-11 items-center justify-center rounded-xl text-sm font-semibold transition',
                    popular
                      ? 'bg-gradient-brand text-white shadow-lg shadow-primary/30 hover:brightness-110'
                      : plan.price === 0
                        ? 'border border-border hover:bg-secondary'
                        : 'bg-foreground text-background hover:opacity-90',
                  )}
                >
                  {plan.price === 0 ? 'Start free' : `Get ${plan.name}`}
                </Link>
                <ul className="mt-6 flex-1 space-y-2.5 border-t border-border pt-6 text-sm">
                  {included(plan).map((line) => (
                    <li key={line.text} className="flex gap-2.5">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      <span className={line.strong ? 'font-medium' : 'text-muted-foreground'}>{line.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          )
        })}
      </div>

      <Reveal className="mt-8">
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-2"><RefreshCcw className="size-4 text-primary" /> Cancel any time, in one click</span>
          <span className="flex items-center gap-2"><ShieldCheck className="size-4 text-primary" /> Keep your leads if you downgrade</span>
          <span className="flex items-center gap-2"><CreditCard className="size-4 text-primary" /> No setup fee, no contract</span>
          <span className="flex items-center gap-2"><Lock className="size-4 text-primary" /> Secure checkout by Stripe</span>
        </div>
      </Reveal>

      <Reveal className="mt-16">
        <h3 className="text-center font-display text-2xl font-bold tracking-tight">Compare every plan</h3>
        <div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="p-4 text-left font-medium text-muted-foreground">What you get</th>
                {plans.map((plan) => (
                  <th key={plan.id} className={cn('p-4 text-center', plan.id === 'growth' && 'bg-primary/5')}>
                    <span className="block font-display font-semibold">{plan.name}</span>
                    <span className="text-xs font-normal text-muted-foreground">${plan.price}/mo</span>
                  </th>
                ))}
              </tr>
            </thead>
            {ROWS.map((group) => (
              <tbody key={group.group}>
                <tr>
                  <td colSpan={plans.length + 1} className="bg-secondary/40 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.group}
                  </td>
                </tr>
                {group.rows.map((row) => (
                  <tr key={row.label} className="border-t border-border/60">
                    <td className="p-4 text-muted-foreground">{row.label}</td>
                    {plans.map((plan) => (
                      <td key={plan.id} className={cn('p-4 text-center', plan.id === 'growth' && 'bg-primary/5')}>
                        <CellValue value={row.values(plan)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Need more mid-month? One-time top-ups on any paid plan:{' '}
          {Object.values(TOP_UPS)
            .map((t) => `${t.name} for $${t.price}`)
            .join(' · ')}
          . Allowances reset each billing month. Prices in USD.
        </p>
      </Reveal>
    </>
  )
}
