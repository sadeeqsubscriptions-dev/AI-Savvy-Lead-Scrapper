'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import { CheckCircle2, Mail, Store } from 'lucide-react'
import { FormAlert } from '@/components/auth/form-alert'
import { SubmitButton } from '@/components/auth/submit-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { toast } from '@/components/ui/toaster'
import { connectMailbox, disconnectMailbox, saveSalesProfile } from '@/lib/actions/setup'
import type { ActionState } from '@/lib/actions/state'
import type { SalesProfile } from '@/lib/supabase/types'

export type ConnectedMailbox = { email: string; provider: string; verifiedAt: string | null } | null

const HELP: Record<string, string> = {
  zoho: 'Zoho Mail → Settings → Security → App passwords → Generate. IMAP must be on (Settings → Mail accounts → IMAP access).',
  gmail: 'Google Account → Security → 2-Step Verification on → App passwords → create one for "Mail".',
  outlook: 'Microsoft account → Security → Advanced security options → App passwords → create one.',
  custom: 'Use the SMTP (sending) and IMAP (reading replies) details from your email host.',
}

export function SalesProfileForm({ profile, canEdit }: { profile: SalesProfile | null; canEdit: boolean }) {
  const [state, formAction] = useActionState<ActionState, FormData>(saveSalesProfile, {})

  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message)
  }, [state])

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Store className="size-4 text-primary" /> What you sell
          </span>
        }
        description="The AI uses this to research leads and write every email, call script and follow-up in your name."
        action={profile?.company_name ? <Badge tone="success">Done</Badge> : <Badge tone="warning">Needed</Badge>}
      />
      <CardBody>
        <form action={formAction} className="space-y-4">
          <FormAlert error={state.error} />
          <fieldset disabled={!canEdit} className="grid gap-4 sm:grid-cols-2">
            <Field label="Company name" htmlFor="company_name" error={state.fieldErrors?.company_name}>
              <Input id="company_name" name="company_name" required defaultValue={profile?.company_name ?? ''} placeholder="Brightline Marketing" />
            </Field>
            <Field label="Website" htmlFor="website">
              <Input id="website" name="website" defaultValue={profile?.website ?? ''} placeholder="https://brightline.co" />
            </Field>
            <div className="sm:col-span-2">
              <Field
                label="What you do and why clients pick you"
                htmlFor="description"
                error={state.fieldErrors?.description}
              >
                <Textarea
                  id="description"
                  name="description"
                  rows={3}
                  required
                  defaultValue={profile?.description ?? ''}
                  placeholder="We help local service businesses get more booked jobs from Google. 120+ clients, average 2.3x more calls in 90 days."
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field
                label="Services — one per line, as “Name: what it does for the client”"
                htmlFor="services"
                error={state.fieldErrors?.services}
              >
                <Textarea
                  id="services"
                  name="services"
                  rows={5}
                  required
                  defaultValue={profile?.services ?? ''}
                  placeholder={'Local SEO: get into the Google Maps top 3 for your area\nGoogle Ads: booked calls at a fixed cost per lead\nWebsite redesign: a fast site that turns visitors into calls'}
                />
              </Field>
            </div>
            <Field label="Meeting booking link" htmlFor="booking_url" error={state.fieldErrors?.booking_url}>
              <Input id="booking_url" name="booking_url" defaultValue={profile?.booking_url ?? ''} placeholder="https://calendly.com/you/15min" />
            </Field>
            <Field label="Postal address (shown in email footer)" htmlFor="postal_address">
              <Input id="postal_address" name="postal_address" defaultValue={profile?.postal_address ?? ''} placeholder="123 Main St, Austin, TX" />
            </Field>
            <Field label="Emails are signed by" htmlFor="sender_name" error={state.fieldErrors?.sender_name}>
              <Input id="sender_name" name="sender_name" required defaultValue={profile?.sender_name ?? ''} placeholder="Alex Morgan" />
            </Field>
            <Field label="Their title" htmlFor="sender_title">
              <Input id="sender_title" name="sender_title" defaultValue={profile?.sender_title ?? ''} placeholder="Founder" />
            </Field>
          </fieldset>
          {canEdit ? (
            <div className="flex justify-end">
              <SubmitButton pendingText="Saving…">Save sales profile</SubmitButton>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Only the owner or an admin can change this.</p>
          )}
        </form>
      </CardBody>
    </Card>
  )
}

export function MailboxForm({ mailbox, canEdit }: { mailbox: ConnectedMailbox; canEdit: boolean }) {
  const [state, formAction] = useActionState<ActionState, FormData>(connectMailbox, {})
  const [provider, setProvider] = useState('zoho')
  const [editing, setEditing] = useState(!mailbox)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (state.ok) {
      if (state.message) toast.success(state.message)
      setEditing(false)
    }
  }, [state])

  const disconnect = () =>
    startTransition(async () => {
      const result = await disconnectMailbox()
      if (result.error) toast.error(result.error)
      else {
        toast.success(result.message ?? 'Disconnected')
        setEditing(true)
      }
    })

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Mail className="size-4 text-primary" /> Your sending inbox
          </span>
        }
        description="Emails go out from your own address and replies land in your inbox — we read them to track who answered."
        action={mailbox ? <Badge tone="success">Connected</Badge> : <Badge tone="warning">Needed</Badge>}
      />
      <CardBody>
        {mailbox && !editing ? (
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-secondary/40 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="size-5 text-success" />
              <div>
                <p className="text-sm font-medium">{mailbox.email}</p>
                <p className="text-xs capitalize text-muted-foreground">{mailbox.provider} · sending and reply tracking work</p>
              </div>
            </div>
            {canEdit ? (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                  Change
                </Button>
                <Button size="sm" variant="destructive" disabled={pending} onClick={disconnect}>
                  Disconnect
                </Button>
              </div>
            ) : null}
          </div>
        ) : canEdit ? (
          <form action={formAction} className="space-y-4">
            <FormAlert error={state.error} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email provider" htmlFor="provider">
                <Select id="provider" name="provider" value={provider} onChange={(event) => setProvider(event.target.value)}>
                  <option value="zoho">Zoho Mail</option>
                  <option value="gmail">Gmail / Google Workspace</option>
                  <option value="outlook">Outlook / Microsoft 365</option>
                  <option value="custom">Other (SMTP + IMAP)</option>
                </Select>
              </Field>
              {provider === 'zoho' ? (
                <Field label="Zoho data center" htmlFor="zoho_region">
                  <Select id="zoho_region" name="zoho_region" defaultValue="com">
                    <option value="com">United States (zoho.com)</option>
                    <option value="eu">Europe (zoho.eu)</option>
                    <option value="in">India (zoho.in)</option>
                    <option value="com.au">Australia (zoho.com.au)</option>
                    <option value="jp">Japan (zoho.jp)</option>
                    <option value="sa">Saudi Arabia (zoho.sa)</option>
                  </Select>
                </Field>
              ) : (
                <div className="hidden sm:block" />
              )}
              <Field label="Email address" htmlFor="email" error={state.fieldErrors?.email}>
                <Input id="email" name="email" type="email" required placeholder="you@yourcompany.com" defaultValue={mailbox?.email ?? ''} />
              </Field>
              <Field label="App password" htmlFor="password" error={state.fieldErrors?.password}>
                <Input id="password" name="password" type="password" required autoComplete="new-password" placeholder="Not your normal password" />
              </Field>
              {provider === 'custom' ? (
                <>
                  <Field label="SMTP server" htmlFor="smtp_host">
                    <Input id="smtp_host" name="smtp_host" placeholder="smtp.yourhost.com" />
                  </Field>
                  <Field label="SMTP port" htmlFor="smtp_port">
                    <Input id="smtp_port" name="smtp_port" type="number" defaultValue={465} />
                  </Field>
                  <Field label="IMAP server" htmlFor="imap_host">
                    <Input id="imap_host" name="imap_host" placeholder="imap.yourhost.com" />
                  </Field>
                  <Field label="IMAP port" htmlFor="imap_port">
                    <Input id="imap_port" name="imap_port" type="number" defaultValue={993} />
                  </Field>
                </>
              ) : null}
            </div>
            <p className="rounded-lg bg-secondary/50 p-3 text-xs leading-5 text-muted-foreground">
              <span className="font-medium text-foreground">How to get an app password: </span>
              {HELP[provider]} We test the login before saving and store the password encrypted.
            </p>
            <div className="flex justify-end gap-2">
              {mailbox ? (
                <Button variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              ) : null}
              <SubmitButton pendingText="Testing connection…">Test and connect</SubmitButton>
            </div>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">No inbox connected yet. Ask the workspace owner to connect one.</p>
        )}
      </CardBody>
    </Card>
  )
}
