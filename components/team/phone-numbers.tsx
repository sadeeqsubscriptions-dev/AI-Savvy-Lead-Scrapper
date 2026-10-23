'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Link2, MessageSquare, Pencil, Phone, PhoneForwarded, Trash2 } from 'lucide-react'
import { assignNumber, attachExistingNumber, buyNumber, removeNumber, renameNumber, setRingInApp } from '@/lib/actions/numbers'
import { PHONE_NUMBER_PRICE } from '@/lib/billing/plans'
import { formatPhone } from '@/lib/phone'
import type { PhoneNumberSource } from '@/lib/supabase/types'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardHeader, EmptyState } from '@/components/ui/card'
import { Field, Input, Select, Switch } from '@/components/ui/field'
import { Modal } from '@/components/ui/modal'
import { toast } from '@/components/ui/toaster'

export type PhoneNumberRow = {
  id: string
  phoneNumber: string
  name: string
  assignedTo: string | null
  source: PhoneNumberSource
  monthlyPrice: number
  sms: boolean
  voice: boolean
  configured: boolean
  ringInApp: boolean
  /** Why the app couldn't wire it up in Twilio yet. */
  problem: string | null
}

const sourceLabel: Record<PhoneNumberSource, string> = {
  plan: 'Included in plan',
  purchased: 'Extra number',
  attached: 'Company number',
}

/**
 * The workspace's phone numbers: who each one belongs to, plus buying more
 * for teammates (billed separately) or, on the AI Savvy workspace, attaching
 * numbers the company already owns in Twilio.
 */
export function PhoneNumbers({
  numbers,
  members,
  isAdmin,
  internal,
  callingIncluded,
  currentUserId,
}: {
  numbers: PhoneNumberRow[]
  members: { userId: string; name: string }[]
  isAdmin: boolean
  /** The AI Savvy workspace: numbers come from the company Twilio account, no charge. */
  internal: boolean
  callingIncluded: boolean
  currentUserId: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [buying, setBuying] = useState(false)
  const [attaching, setAttaching] = useState(false)
  const [renaming, setRenaming] = useState<PhoneNumberRow | null>(null)
  const [form, setForm] = useState({ name: '', areaCode: '', assignTo: '', phoneNumber: '' })

  const done = (result: { ok: true; message: string } | { ok: true; url: string } | { ok: false; error: string }) => {
    if (!result.ok) {
      toast.error(result.error)
      return false
    }
    if ('url' in result) {
      window.location.assign(result.url)
      return true
    }
    toast.success(result.message)
    router.refresh()
    return true
  }

  const submitBuy = () => {
    startTransition(async () => {
      if (done(await buyNumber({ name: form.name, areaCode: form.areaCode, assignTo: form.assignTo || null }))) {
        setBuying(false)
        setForm({ name: '', areaCode: '', assignTo: '', phoneNumber: '' })
      }
    })
  }

  const submitAttach = () => {
    startTransition(async () => {
      if (done(await attachExistingNumber({ phoneNumber: form.phoneNumber, name: form.name, assignTo: form.assignTo || null }))) {
        setAttaching(false)
        setForm({ name: '', areaCode: '', assignTo: '', phoneNumber: '' })
      }
    })
  }

  const submitRename = () => {
    if (!renaming) return
    startTransition(async () => {
      if (done(await renameNumber(renaming.id, form.name))) setRenaming(null)
    })
  }

  const toggleRing = (id: string, on: boolean) => {
    startTransition(async () => {
      done(await setRingInApp(id, on))
    })
  }

  const assign = (id: string, userId: string) => {
    startTransition(async () => {
      done(await assignNumber(id, userId || null))
    })
  }

  const remove = (number: PhoneNumberRow) => {
    const what =
      number.source === 'purchased'
        ? `Release ${formatPhone(number.phoneNumber)}? It goes back to Twilio, the $${number.monthlyPrice}/month charge stops, and its texts stay here.`
        : `Remove ${formatPhone(number.phoneNumber)} from the team? Its texts stay here.`
    if (!window.confirm(what)) return
    startTransition(async () => {
      done(await removeNumber(number.id))
    })
  }

  // A flat list of <option>s (not a fragment): Select reads its items from its direct children.
  const assigneeOptions = [
    <option key="" value="">
      Shared by the team
    </option>,
    ...members.map((member) => (
      <option key={member.userId} value={member.userId}>
        {member.userId === currentUserId ? `${member.name} (you)` : member.name}
      </option>
    )),
  ]

  return (
    <Card>
      <CardHeader
        title="Phone numbers"
        description={
          internal
            ? 'Each teammate can have their own line for calls and texts. Numbers come from the AI Savvy Twilio account.'
            : `Each teammate can have their own line for calls and texts. Extra numbers are $${PHONE_NUMBER_PRICE}/month each, billed separately from the plan.`
        }
        action={
          isAdmin ? (
            <>
              {internal ? (
                <Button variant="outline" size="sm" onClick={() => setAttaching(true)}>
                  <Link2 className="size-3.5" />
                  Attach existing
                </Button>
              ) : null}
              <Button variant="brand" size="sm" onClick={() => setBuying(true)} disabled={!callingIncluded}>
                <PhoneForwarded className="size-3.5" />
                Buy a number
              </Button>
            </>
          ) : null
        }
      />

      {numbers.length === 0 ? (
        <EmptyState
          icon={Phone}
          title="No phone numbers yet"
          description={
            callingIncluded
              ? 'Buy a number for a teammate and their calls and texts will go out from it.'
              : 'Phone numbers come with the Growth and Pro plans.'
          }
          action={
            !callingIncluded && isAdmin ? (
              <Link href="/billing" className={buttonVariants({ variant: 'outline' })}>
                See plans
              </Link>
            ) : null
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead className="border-b border-border bg-secondary/30 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Number</th>
                <th className="px-4 py-3 font-medium">Used by</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Can do</th>
                <th className="px-4 py-3 font-medium">Incoming calls</th>
                {isAdmin ? <th className="w-24 px-4 py-3" /> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {numbers.map((number) => {
                const assignee = members.find((member) => member.userId === number.assignedTo)
                return (
                  <tr key={number.id} className="transition-colors hover:bg-secondary/20">
                    <td className="px-5 py-3">
                      <p className="text-sm font-medium">{number.name || 'Unnamed'}</p>
                      <p className="font-mono text-xs text-muted-foreground">{formatPhone(number.phoneNumber)}</p>
                    </td>
                    <td className="px-4 py-3">
                      {isAdmin ? (
                        <Select
                          value={number.assignedTo ?? ''}
                          onChange={(event) => assign(number.id, event.target.value)}
                          disabled={pending}
                          className="h-8 w-auto min-w-44 text-xs"
                          aria-label={`Who uses ${number.phoneNumber}`}
                        >
                          {assigneeOptions}
                        </Select>
                      ) : (
                        <span className="text-sm">{assignee?.name ?? 'Shared by the team'}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={number.source === 'purchased' ? 'violet' : number.source === 'attached' ? 'info' : 'brand'}>
                        {sourceLabel[number.source]}
                        {number.source === 'purchased' ? ` · $${number.monthlyPrice}/mo` : ''}
                      </Badge>
                      {!number.configured ? (
                        <p className="mt-1 max-w-56 text-[11px] leading-4 text-warning" title={number.problem ?? undefined}>
                          Not connected to Twilio yet{number.problem ? `: ${number.problem}` : ''}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        {number.voice ? (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="size-3" /> Calls
                          </span>
                        ) : null}
                        {number.sms ? (
                          <span className="inline-flex items-center gap-1">
                            <MessageSquare className="size-3" /> SMS
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {isAdmin || number.assignedTo === currentUserId ? (
                        <Switch
                          label={number.ringInApp ? 'Accepted' : 'Off · outbound only'}
                          checked={number.ringInApp}
                          onCheckedChange={(on) => toggleRing(number.id, on)}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">{number.ringInApp ? 'Accepted' : 'Off · outbound only'}</span>
                      )}
                    </td>
                    {isAdmin ? (
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setForm((current) => ({ ...current, name: number.name }))
                              setRenaming(number)
                            }}
                            disabled={pending}
                            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                            aria-label={`Rename ${number.phoneNumber}`}
                          >
                            <Pencil className="size-3.5" />
                          </button>
                          {number.source !== 'plan' ? (
                            <button
                              type="button"
                              onClick={() => remove(number)}
                              disabled={pending}
                              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive"
                              aria-label={`Remove ${number.phoneNumber}`}
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={buying}
        onClose={() => setBuying(false)}
        title="Buy a number"
        description={
          internal
            ? 'A new US number on the AI Savvy Twilio account, ready for calls and texts.'
            : `A new US number for $${PHONE_NUMBER_PRICE}/month, billed to your card separately from the plan. Cancel any time from this page.`
        }
      >
        <form
          onSubmit={(event) => {
            event.preventDefault()
            submitBuy()
          }}
          className="space-y-4"
        >
          <Field label="Name" htmlFor="number-name" hint="How it shows up in the app, e.g. “Sales Rep”.">
            <Input id="number-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required autoFocus />
          </Field>
          <Field label="Area code (optional)" htmlFor="number-area" hint="Closest match; any US number if none is free there.">
            <Input
              id="number-area"
              value={form.areaCode}
              onChange={(event) => setForm({ ...form, areaCode: event.target.value.replace(/\D/g, '').slice(0, 3) })}
              placeholder="305"
              inputMode="numeric"
            />
          </Field>
          <Field label="Used by" htmlFor="number-assign">
            <Select id="number-assign" value={form.assignTo} onChange={(event) => setForm({ ...form, assignTo: event.target.value })}>
              {assigneeOptions}
            </Select>
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setBuying(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="brand" disabled={pending}>
              {internal ? 'Buy number' : `Continue to payment · $${PHONE_NUMBER_PRICE}/mo`}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={attaching}
        onClose={() => setAttaching(false)}
        title="Attach an existing number"
        description="A number already bought in the AI Savvy Twilio account. Its calls and texts are pointed at this app."
      >
        <form
          onSubmit={(event) => {
            event.preventDefault()
            submitAttach()
          }}
          className="space-y-4"
        >
          <Field label="Phone number" htmlFor="attach-number">
            <Input
              id="attach-number"
              value={form.phoneNumber}
              onChange={(event) => setForm({ ...form, phoneNumber: event.target.value })}
              placeholder="+1 754 227 1288"
              required
              autoFocus
            />
          </Field>
          <Field label="Name" htmlFor="attach-name">
            <Input id="attach-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Sales Rep" required />
          </Field>
          <Field label="Used by" htmlFor="attach-assign">
            <Select id="attach-assign" value={form.assignTo} onChange={(event) => setForm({ ...form, assignTo: event.target.value })}>
              {assigneeOptions}
            </Select>
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setAttaching(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="brand" disabled={pending}>
              Attach number
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(renaming)} onClose={() => setRenaming(null)} title="Rename number">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            submitRename()
          }}
          className="space-y-4"
        >
          <Field label="Name" htmlFor="rename-number">
            <Input id="rename-number" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required autoFocus />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="brand" disabled={pending}>
              Save
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  )
}
