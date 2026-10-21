'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useActionState, useEffect, useState, useTransition } from 'react'
import {
  ArrowRight,
  Building2,
  Database,
  KeyRound,
  Phone,
  Plug,
  ShieldCheck,
  Store,
  UserRound,
} from 'lucide-react'
import {
  changePassword,
  resetWorkspaceData,
  updateOrganization,
  updateProfile,
} from '@/lib/actions/settings'
import { signOut } from '@/lib/actions/auth'
import type { ActionState } from '@/lib/actions/state'
import type { ProviderOption } from '@/lib/scraper/registry'
import { formatDate, formatNumber, formatPhone } from '@/lib/format'
import type { MemberRole, Organization, Profile } from '@/lib/supabase/types'
import { FormAlert } from '@/components/auth/form-alert'
import { MailboxForm, type ConnectedMailbox, type OAuthOptions } from '@/components/setup/setup-forms'
import { SubmitButton } from '@/components/auth/submit-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, SectionHeading } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/field'
import { Progress, Spinner } from '@/components/ui/progress'
import { toast } from '@/components/ui/toaster'
import { cn } from '@/lib/utils'

const TABS = [
  { id: 'profile', label: 'Profile', icon: UserRound },
  { id: 'security', label: 'Security', icon: ShieldCheck },
  { id: 'workspace', label: 'Workspace', icon: Building2 },
  { id: 'integrations', label: 'Integrations', icon: Plug },
  { id: 'data', label: 'Data', icon: Database },
] as const

type TabId = (typeof TABS)[number]['id']

/** What this workspace has connected, for Settings → Integrations. */
export type WorkspaceIntegrations = {
  mailbox: ConnectedMailbox
  fallbackSender: string | null
  oauth: OAuthOptions
  phoneNumber: string | null
  planName: string
  callingIncluded: boolean
  salesProfile: { companyName: string; services: number } | null
  internal: boolean
}

const TIMEZONES = [
  'UTC',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Dubai',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Australia/Sydney',
]

export function SettingsWorkspace({
  profile,
  organization,
  role,
  email,
  leadCount,
  memberCount,
  providers,
  integrations,
  isAdmin,
}: {
  profile: Profile
  organization: Organization
  role: MemberRole
  email: string
  leadCount: number
  memberCount: number
  providers: ProviderOption[]
  integrations: WorkspaceIntegrations
  isAdmin: boolean
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const requested = searchParams.get('tab') as TabId | null
  const [tab, setTab] = useState<TabId>(
    TABS.some((item) => item.id === requested) ? requested! : 'profile',
  )

  const selectTab = (next: TabId) => {
    setTab(next)
    router.replace(`/settings?tab=${next}`, { scroll: false })
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <SectionHeading
        eyebrow="Configuration"
        title="Settings"
        description="Manage your profile, workspace, connected inbox and calling number."
      />

      <div className="flex gap-2 overflow-x-auto border-b border-border pb-px">
        {TABS.map((item) => {
          const Icon = item.icon
          const active = tab === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => selectTab(item.id)}
              className={cn(
                '-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm transition-colors',
                active
                  ? 'border-primary font-medium text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
              aria-current={active ? 'page' : undefined}
            >
              <Icon className="size-4" />
              {item.label}
            </button>
          )
        })}
      </div>

      {tab === 'profile' ? <ProfilePanel profile={profile} email={email} role={role} /> : null}
      {tab === 'security' ? <SecurityPanel email={email} /> : null}
      {tab === 'workspace' ? (
        <WorkspacePanel
          organization={organization}
          isAdmin={isAdmin}
          leadCount={leadCount}
          memberCount={memberCount}
        />
      ) : null}
      {tab === 'integrations' ? (
        <IntegrationsPanel providers={providers} integrations={integrations} isAdmin={isAdmin} />
      ) : null}
      {tab === 'data' ? (
        <DataPanel isAdmin={isAdmin} leadCount={leadCount} organization={organization} />
      ) : null}
    </div>
  )
}

function ProfilePanel({
  profile,
  email,
  role,
}: {
  profile: Profile
  email: string
  role: MemberRole
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(updateProfile, {})

  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message)
  }, [state])

  return (
    <Card>
      <CardHeader
        title="Your profile"
        description="This is how teammates see you across the workspace."
        action={<Badge tone="brand">{role}</Badge>}
      />
      <form action={formAction} className="space-y-4 px-5 pb-5">
        <FormAlert error={state.error} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="full_name" error={state.fieldErrors?.full_name}>
            <Input
              id="full_name"
              name="full_name"
              required
              defaultValue={profile.full_name ?? ''}
            />
          </Field>

          <Field label="Email" htmlFor="profile-email" hint="Change this from the Security tab.">
            <Input id="profile-email" value={email} disabled />
          </Field>

          <Field label="Job title" htmlFor="job_title">
            <Input
              id="job_title"
              name="job_title"
              defaultValue={profile.job_title ?? ''}
              placeholder="Head of Revenue"
            />
          </Field>

          <Field label="Phone" htmlFor="phone">
            <Input id="phone" name="phone" defaultValue={profile.phone ?? ''} />
          </Field>

          <Field label="Timezone" htmlFor="timezone" className="sm:col-span-2">
            <Select id="timezone" name="timezone" defaultValue={profile.timezone}>
              {TIMEZONES.map((zone) => (
                <option key={zone} value={zone}>
                  {zone.replace('_', ' ')}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="flex justify-end">
          <SubmitButton variant="brand" pendingText="Saving…">
            Save profile
          </SubmitButton>
        </div>
      </form>
    </Card>
  )
}

function SecurityPanel({ email }: { email: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(changePassword, {})

  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message)
  }, [state])

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Change password"
          description="You stay signed in on this device after updating."
        />
        <form action={formAction} className="space-y-4 px-5 pb-5">
          <FormAlert error={state.error} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="New password" htmlFor="new-password" hint="At least 8 characters, with a number.">
              <Input
                id="new-password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
              />
            </Field>

            <Field label="Confirm password" htmlFor="confirm-password" error={state.fieldErrors?.confirm}>
              <Input
                id="confirm-password"
                name="confirm"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
              />
            </Field>
          </div>

          <div className="flex justify-end">
            <SubmitButton variant="brand" pendingText="Updating…">
              <KeyRound className="size-4" />
              Update password
            </SubmitButton>
          </div>
        </form>
      </Card>

      <Card>
        <CardHeader title="Sessions" description={`Signed in as ${email}`} />
        <div className="px-5 pb-5">
          <p className="text-sm leading-6 text-muted-foreground">
            Signing out ends this session everywhere on this browser. Supabase handles token
            rotation automatically, so there is nothing else to clean up.
          </p>
          <form action={signOut} className="mt-4">
            <Button type="submit" variant="outline">
              Sign out
            </Button>
          </form>
        </div>
      </Card>
    </div>
  )
}

function WorkspacePanel({
  organization,
  isAdmin,
  leadCount,
  memberCount,
}: {
  organization: Organization
  isAdmin: boolean
  leadCount: number
  memberCount: number
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(updateOrganization, {})

  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message)
  }, [state])

  const unlimited = organization.lead_quota >= 1_000_000_000
  const usage = !unlimited && organization.lead_quota > 0 ? (leadCount / organization.lead_quota) * 100 : 0

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Workspace"
          description={isAdmin ? 'Visible to everyone on the team.' : 'Only admins can edit these.'}
          action={<Badge tone="outline">{organization.plan}</Badge>}
        />
        <form action={formAction} className="space-y-4 px-5 pb-5">
          <FormAlert error={state.error} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Workspace name" htmlFor="org-name" error={state.fieldErrors?.name}>
              <Input
                id="org-name"
                name="name"
                required
                defaultValue={organization.name}
                disabled={!isAdmin}
              />
            </Field>

            <Field label="Website" htmlFor="org-website">
              <Input
                id="org-website"
                name="website"
                defaultValue={organization.website ?? ''}
                placeholder="https://company.com"
                disabled={!isAdmin}
              />
            </Field>

            <Field label="Workspace URL slug" htmlFor="org-slug">
              <Input id="org-slug" value={organization.slug} disabled />
            </Field>

            <Field label="Created" htmlFor="org-created">
              <Input id="org-created" value={formatDate(organization.created_at)} disabled />
            </Field>
          </div>

          {isAdmin ? (
            <div className="flex justify-end">
              <SubmitButton variant="brand" pendingText="Saving…">
                Save workspace
              </SubmitButton>
            </div>
          ) : null}
        </form>
      </Card>

      <Card>
        <CardHeader
          title="Usage"
          description="Included in the current plan"
          action={
            <Link href="/billing" className="text-xs font-medium text-primary hover:underline">
              Plan & billing
            </Link>
          }
        />
        <div className="space-y-4 px-5 pb-5">
          <div>
            <div className="mb-2 flex items-baseline justify-between text-sm">
              <span className="text-muted-foreground">Leads stored</span>
              <span className="font-mono">
                {formatNumber(leadCount)} / {unlimited ? 'unlimited' : formatNumber(organization.lead_quota)}
              </span>
            </div>
            <Progress value={usage} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Team members', value: formatNumber(memberCount) },
              { label: 'Plan', value: organization.plan },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className="mt-0.5 font-mono text-lg font-semibold capitalize">{stat.value}</p>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  )
}

function IntegrationsPanel({
  providers,
  integrations,
  isAdmin,
}: {
  providers: ProviderOption[]
  integrations: WorkspaceIntegrations
  isAdmin: boolean
}) {
  const searchParams = useSearchParams()
  const notice = {
    connected: searchParams.get('mail_connected') ?? undefined,
    error: searchParams.get('mail_error') ?? undefined,
  }
  const sender = integrations.mailbox?.email ?? integrations.fallbackSender

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-primary/25 bg-primary/[0.05] p-4 text-sm">
        <p className="font-medium">How your connections are used</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {sender ? (
            <>
              Every email — autopilot, follow-ups, replies and call follow-ups — is sent from{' '}
              <span className="font-mono text-foreground">{sender}</span>, and replies are read from its inbox.
            </>
          ) : (
            'Connect an inbox below: every email the autopilot sends goes out from it, and replies are read from it.'
          )}{' '}
          {integrations.phoneNumber
            ? `Calls show ${formatPhone(integrations.phoneNumber)} as caller ID.`
            : null}
        </p>
      </div>

      <MailboxForm
        mailbox={integrations.mailbox}
        canEdit={isAdmin}
        oauth={integrations.oauth}
        notice={notice}
        fallback={Boolean(integrations.fallbackSender)}
        returnTo="integrations"
      />

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Phone className="size-4 text-primary" /> Calling number
              </span>
            }
            description="The number leads see when you call or text. Numbers are managed on the Team page."
            action={
              integrations.phoneNumber ? (
                <Badge tone="success">Active</Badge>
              ) : integrations.callingIncluded ? (
                <Badge tone="warning">Setting up</Badge>
              ) : (
                <Badge tone="outline">Not on {integrations.planName}</Badge>
              )
            }
          />
          <div className="px-5 pb-5">
            {integrations.phoneNumber ? (
              <p className="font-mono text-xl font-semibold tracking-tight">{formatPhone(integrations.phoneNumber)}</p>
            ) : integrations.callingIncluded ? (
              <p className="text-sm text-muted-foreground">Your number is being assigned. It appears here within a minute.</p>
            ) : (
              <Link href="/billing" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                Get your own number with Growth <ArrowRight className="size-4" />
              </Link>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Store className="size-4 text-primary" /> Sales profile
              </span>
            }
            description="What the AI pitches in every email and call."
            action={
              integrations.salesProfile ? (
                <Badge tone="success">Done</Badge>
              ) : integrations.internal ? (
                <Badge tone="info">AI Savvy defaults</Badge>
              ) : (
                <Badge tone="warning">Needed</Badge>
              )
            }
          />
          <div className="px-5 pb-5">
            <p className="text-sm">
              {integrations.salesProfile
                ? `${integrations.salesProfile.companyName} · ${integrations.salesProfile.services} service${integrations.salesProfile.services === 1 ? '' : 's'}`
                : integrations.internal
                  ? 'Pitching AI Savvy services.'
                  : 'Not filled in yet.'}
            </p>
            <Link href="/setup" className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
              Edit on Sales setup <ArrowRight className="size-4" />
            </Link>
          </div>
        </Card>
      </div>

      {providers.length > 0 ? (
        <Card>
          <CardHeader
            title="Lead data sources"
            description="Team workspace only. Customers just use Smart search; these are the services behind it."
          />
          <ul className="divide-y divide-border">
            {providers.map((provider) => (
              <li key={provider.id} className="flex items-start gap-4 px-5 py-4">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                  <Plug className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{provider.label}</p>
                    <Badge tone={provider.ready ? 'success' : 'outline'}>{provider.ready ? 'Ready' : 'Not configured'}</Badge>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{provider.description}</p>
                  {provider.requiresEnv ? (
                    <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">{provider.requiresEnv}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  )
}

function DataPanel({
  isAdmin,
  leadCount,
  organization,
}: {
  isAdmin: boolean
  leadCount: number
  organization: Organization
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const reset = () => {
    if (
      !window.confirm(
        `Delete every lead, meeting, and scrape in ${organization.name}? This cannot be undone.`,
      )
    ) {
      return
    }

    startTransition(async () => {
      const result = await resetWorkspaceData()
      if (result.error) toast.error(result.error)
      else {
        toast.success(result.message!)
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-5">
      <Card className="border-destructive/30">
        <CardHeader
          title="Danger zone"
          description="Irreversible actions that affect the whole workspace."
        />
        <div className="px-5 pb-5">
          <p className="mb-4 text-sm leading-6 text-muted-foreground">
            Removes all leads, activity, meetings, scrape jobs, and results. Team members and
            workspace settings are kept.
          </p>
          <Button
            variant="destructive"
            onClick={reset}
            disabled={!isAdmin || pending}
          >
            {pending ? <Spinner /> : null}
            Delete all workspace data
          </Button>
        </div>
      </Card>
    </div>
  )
}
