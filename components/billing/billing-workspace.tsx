'use client'

import { useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, CreditCard, Phone, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Progress, Spinner } from '@/components/ui/progress'
import { toast } from '@/components/ui/toaster'
import { buyTopUp, choosePlan, openBillingPortal } from '@/lib/actions/billing'
import { PAID_PLANS, PLANS, TOP_UPS, isUnlimited, type TopUpId } from '@/lib/billing/plans'
import { formatDate, formatNumber } from '@/lib/format'
import type { PlanId } from '@/lib/supabase/types'
import { cn } from '@/lib/utils'

type Amounts = { leadsFound: number; aiLeads: number; callSeconds: number }

type Props = {
  currentPlan: PlanId
  status: string
  paused: boolean
  periodEnd: string | null
  hasCustomer: boolean
  phoneNumber: string | null
  usage: Amounts
  bonus: Amounts
  seats: { used: number; total: number }
  canManage: boolean
  paymentsReady: boolean
  notice: { kind: 'plan' | 'topup'; id: string } | null
}

type Result = { ok: true; url: string } | { ok: true; message: string } | { ok: false; error: string }

function UsageRow({ label, used, cap, unit }: { label: string; used: number; cap: number; unit: string }) {
  const unlimited = isUnlimited(cap)
  const percent = unlimited || cap <= 0 ? 0 : (used / cap) * 100
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
        <span>{label}</span>
        <span className="font-mono text-xs text-muted-foreground">
          {formatNumber(used)} / {unlimited ? 'unlimited' : cap <= 0 ? 'not included' : `${formatNumber(cap)} ${unit}`}
        </span>
      </div>
      <Progress value={percent} barClassName={percent >= 90 ? 'bg-destructive' : undefined} />
    </div>
  )
}

export function BillingWorkspace(props: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const plan = PLANS[props.currentPlan] ?? PLANS.free
  const internal = plan.id === 'internal'
  const paid = plan.price > 0

  useEffect(() => {
    if (!props.notice) return
    if (props.notice.kind === 'plan') {
      toast.success(`Welcome to ${PLANS[props.notice.id as PlanId]?.name ?? 'your new plan'}! It can take a few seconds to unlock.`)
    } else {
      toast.success(`${TOP_UPS[props.notice.id as TopUpId]?.name ?? 'Top-up'} added to this month.`)
    }
    router.replace('/billing')
  }, [props.notice, router])

  const run = (action: () => Promise<Result>) =>
    startTransition(async () => {
      const result = await action()
      if (!result.ok) toast.error(result.error)
      else if ('url' in result) window.location.href = result.url
      else {
        toast.success(result.message)
        router.refresh()
      }
    })

  const blocked = !props.canManage || !props.paymentsReady || internal

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Plan & billing</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            You&apos;re on <span className="font-medium text-foreground">{plan.name}</span>
            {paid && props.periodEnd ? <> · renews {formatDate(props.periodEnd)}</> : null}
            {internal ? ' · unlimited, never billed' : null}
          </p>
        </div>
        {props.hasCustomer && props.canManage && props.paymentsReady && !internal ? (
          <Button variant="outline" disabled={pending} onClick={() => run(openBillingPortal)}>
            <CreditCard /> Cards, invoices & cancel
          </Button>
        ) : null}
      </div>

      {props.paused ? (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div>
            <p className="font-medium">Your last payment didn&apos;t go through</p>
            <p className="mt-0.5 text-muted-foreground">
              Premium features are paused until the card is updated. Your leads and history are safe.
            </p>
          </div>
        </div>
      ) : null}

      {!props.paymentsReady && !internal ? (
        <p className="rounded-lg border border-border bg-secondary/40 p-3 text-xs text-muted-foreground">
          Payments are being set up. Plans can be bought shortly.
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="This month's usage" description="Counts reset every billing period. Unused amounts don't roll over." />
          <CardBody className="space-y-4">
            <UsageRow
              label="Leads found by the scraper"
              used={props.usage.leadsFound}
              cap={plan.limits.leadsFound + props.bonus.leadsFound}
              unit="leads"
            />
            <UsageRow
              label="Leads researched & emailed by AI"
              used={props.usage.aiLeads}
              cap={plan.limits.aiLeads + props.bonus.aiLeads}
              unit="leads"
            />
            <UsageRow
              label="Call minutes"
              used={Math.ceil(props.usage.callSeconds / 60)}
              cap={isUnlimited(plan.limits.callMinutes) ? plan.limits.callMinutes : plan.limits.callMinutes + Math.floor(props.bonus.callSeconds / 60)}
              unit="min"
            />
            <UsageRow label="Users" used={props.seats.used} cap={props.seats.total} unit="seats" />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Phone className="size-4 text-primary" /> Calling number
              </span>
            }
            description="Growth and Pro come with your own US number. Leads see it as your caller ID."
          />
          <CardBody>
            {internal ? (
              <p className="text-sm text-muted-foreground">Uses the AI Savvy company number.</p>
            ) : props.phoneNumber ? (
              <p className="font-mono text-lg font-semibold">{props.phoneNumber}</p>
            ) : plan.phoneNumber ? (
              <p className="text-sm text-muted-foreground">Your number is being set up — it appears here within a minute.</p>
            ) : (
              <p className="text-sm text-muted-foreground">Not included on {plan.name}. Upgrade to Growth to start calling.</p>
            )}
          </CardBody>
        </Card>
      </div>

      {!internal ? (
        <div>
          <h2 className="mb-3 font-display text-lg font-semibold tracking-tight">Plans</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[PLANS.free, ...PAID_PLANS].map((option) => {
              const current = option.id === plan.id
              const popular = option.id === 'growth'
              return (
                <Card
                  key={option.id}
                  className={cn('flex flex-col p-5', current && 'ring-2 ring-primary', popular && !current && 'border-primary/50')}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-display text-base font-semibold">{option.name}</h3>
                    {current ? <Badge tone="brand">Current</Badge> : popular ? <Badge tone="violet">Most popular</Badge> : null}
                  </div>
                  <p className="mt-3">
                    <span className="font-display text-3xl font-bold">${option.price}</span>
                    <span className="text-sm text-muted-foreground">/month</span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{option.tagline}</p>
                  <ul className="mt-4 flex-1 space-y-2 text-sm">
                    {option.highlights.map((line) => (
                      <li key={line} className="flex gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-success" />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-5">
                    {current ? (
                      <Button className="w-full" variant="secondary" disabled>
                        Your plan
                      </Button>
                    ) : option.price === 0 ? (
                      <Button
                        className="w-full"
                        variant="outline"
                        disabled={blocked || pending || !props.hasCustomer}
                        onClick={() => run(openBillingPortal)}
                      >
                        Downgrade (cancel in portal)
                      </Button>
                    ) : (
                      <Button
                        className="w-full"
                        variant={popular ? 'brand' : 'default'}
                        disabled={blocked || pending}
                        onClick={() => run(() => choosePlan(option.id))}
                      >
                        {pending ? <Spinner /> : <Sparkles />}
                        {paid ? `Switch to ${option.name}` : `Get ${option.name}`}
                      </Button>
                    )}
                  </div>
                </Card>
              )
            })}
          </div>
          {!props.canManage ? (
            <p className="mt-3 text-xs text-muted-foreground">Only the workspace owner or an admin can change the plan.</p>
          ) : null}
        </div>
      ) : null}

      {paid && !props.paused ? (
        <Card>
          <CardHeader title="Need more this month?" description="One-time top-ups, added instantly and used before the next renewal." />
          <CardBody className="grid gap-3 sm:grid-cols-3">
            {Object.values(TOP_UPS).map((topUp) => {
              const unavailable = topUp.kind === 'call_seconds' && !plan.features.calling
              return (
                <div key={topUp.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium">{topUp.name}</p>
                    <p className="text-xs text-muted-foreground">${topUp.price} one-time</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={blocked || pending || unavailable}
                    title={unavailable ? 'Calling comes with Growth and Pro' : undefined}
                    onClick={() => run(() => buyTopUp(topUp.id))}
                  >
                    Buy
                  </Button>
                </div>
              )
            })}
          </CardBody>
        </Card>
      ) : null}
    </div>
  )
}
