'use client'

import { useRouter } from 'next/navigation'
import { useActionState, useEffect, useState } from 'react'
import { AlertTriangle, Play } from 'lucide-react'
import { createScrapeJob, type CreateJobState } from '@/lib/actions/scraper'
import type { ProviderOption } from '@/lib/scraper/registry'
import { INDUSTRIES } from '@/lib/constants'
import { FormAlert } from '@/components/auth/form-alert'
import { SubmitButton } from '@/components/auth/submit-button'
import { Card, CardHeader } from '@/components/ui/card'
import { Field, Input, Label, Select, Switch, Textarea } from '@/components/ui/field'
import { toast } from '@/components/ui/toaster'

export function ScrapeForm({
  providers,
  onStarted,
}: {
  providers: ProviderOption[]
  onStarted: (jobId: string) => void
}) {
  const router = useRouter()
  const [state, formAction] = useActionState<CreateJobState, FormData>(createScrapeJob, {})
  const [providerId, setProviderId] = useState(
    providers.find((provider) => provider.ready)?.id ?? providers[0]?.id ?? 'smart',
  )
  // Most people never need to pick a source: Smart search is the default.
  const [chooseSource, setChooseSource] = useState(false)
  const [minScore, setMinScore] = useState(0)
  // Off by default: results go to review so you pick what enters the CRM.
  const [autoImport, setAutoImport] = useState(false)

  const provider = providers.find((item) => item.id === providerId)

  useEffect(() => {
    if (state.ok && state.jobId) {
      onStarted(state.jobId)
      router.refresh()
    } else if (state.error) {
      toast.error(state.error)
    }
  }, [state, onStarted, router])

  return (
    <Card>
      <CardHeader
        title="New scrape"
        description="Describe who you are looking for and where. Results land in a review queue before hitting your CRM."
      />
      <form action={formAction} className="space-y-4 px-5 pb-5">
        <FormAlert error={state.error} />

        {chooseSource ? (
          <>
            <Field label="Data source" htmlFor="provider">
              <Select
                id="provider"
                name="provider"
                value={providerId}
                onChange={(event) => setProviderId(event.target.value)}
              >
                {providers.map((item) => (
                  <option key={item.id} value={item.id} disabled={!item.ready}>
                    {item.label}
                    {item.ready ? '' : ' — not configured'}
                  </option>
                ))}
              </Select>
            </Field>
            {provider ? (
              <p className="-mt-2 text-xs leading-5 text-muted-foreground">{provider.description}</p>
            ) : null}
          </>
        ) : (
          <div className="flex items-start justify-between gap-3 rounded-lg border border-primary/25 bg-primary/[0.05] p-3">
            <input type="hidden" name="provider" value={providerId} />
            <div className="text-xs leading-5">
              <p className="font-medium text-foreground">{provider?.label ?? 'Smart search'}</p>
              <p className="text-muted-foreground">{provider?.description}</p>
            </div>
            <button
              type="button"
              onClick={() => setChooseSource(true)}
              className="shrink-0 text-xs text-primary hover:underline"
            >
              Change source
            </button>
          </div>
        )}

        {provider && !provider.ready ? (
          <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs leading-5 text-warning">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              {provider.requiresEnv
                ? `Set ${provider.requiresEnv} in .env.local and restart the dev server to use this source.`
                : 'Add your scraping code to lib/scraper/providers/custom.ts to enable this source.'}
            </span>
          </div>
        ) : null}

        <Field
          label="What are you looking for?"
          htmlFor="query"
          error={state.fieldErrors?.query}
          hint="The kind of business, the way you'd search for it on Google Maps."
        >
          <Input
            id="query"
            name="query"
            required
            minLength={2}
            placeholder="Dentists, roofing companies, med spas…"
          />
        </Field>

        <Field
          label="Cities or regions"
          htmlFor="locations"
          hint="One per line, or comma separated. Leave blank to search everywhere."
        >
          <Textarea
            id="locations"
            name="locations"
            rows={3}
            className="min-h-20"
            placeholder={'Miami, FL\nOrlando, FL'}
          />
        </Field>

        {provider && provider.seedUrls !== 'unsupported' ? (
          <Field
            label={provider.seedUrls === 'required' ? 'Seed URLs' : 'Seed URLs (optional)'}
            htmlFor="seed_urls"
            error={state.fieldErrors?.seed_urls}
            hint={
              provider.seedUrls === 'required'
                ? 'This source crawls pages instead of searching, so it needs somewhere to start. One URL per line — company sites, or a directory page to crawl outward from.'
                : 'Give the agent a head start by pointing it at specific pages. One per line.'
            }
          >
            <Textarea
              id="seed_urls"
              name="seed_urls"
              rows={3}
              className="min-h-20 font-mono text-xs"
              required={provider.seedUrls === 'required'}
              placeholder={'https://acme-agency.com\nhttps://directory.example.com/austin'}
            />
          </Field>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Industry tag" htmlFor="industry">
            <Select id="industry" name="industry" defaultValue="">
              <option value="">Not set</option>
              {INDUSTRIES.map((industry) => (
                <option key={industry} value={industry}>
                  {industry}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Max results" htmlFor="max_results">
            <Input
              id="max_results"
              name="max_results"
              type="number"
              min={1}
              max={1000}
              defaultValue={100}
            />
          </Field>
        </div>

        <div>
          <Label htmlFor="min_score">
            Minimum lead score — <span className="font-mono text-foreground">{minScore}</span>
          </Label>
          <input
            id="min_score"
            name="min_score"
            type="range"
            min={0}
            max={100}
            step={5}
            value={minScore}
            onChange={(event) => setMinScore(Number(event.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-secondary accent-[var(--primary)]"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            Records below this score are dropped before they reach the review queue.
          </p>
        </div>

        <div className="rounded-lg border border-border p-3.5">
          <Switch
            name="auto_import"
            checked={autoImport}
            onCheckedChange={setAutoImport}
            label="Import to CRM automatically"
            description="Off: results wait for you to select and import them. Government and school results are dropped either way, and duplicate emails are always skipped."
          />
        </div>

        <SubmitButton
          variant="brand"
          className="w-full"
          pendingText="Queueing scrape…"
          disabled={!provider?.ready}
        >
          <Play className="size-4" />
          Start scrape
        </SubmitButton>
      </form>
    </Card>
  )
}
