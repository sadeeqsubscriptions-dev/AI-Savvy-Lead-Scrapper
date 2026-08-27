# AI Savvy Leads Scrapper

Lead intelligence, scraping, and CRM workflows for revenue teams. Next.js 16 (App
Router) + Supabase (Postgres, Auth, RLS), styled with Tailwind v4 in the AI Savvy
palette.

## Stack

| Layer    | Choice                                                      |
| -------- | ----------------------------------------------------------- |
| Frontend | Next.js 16 App Router, React 19, TypeScript                  |
| Styling  | Tailwind CSS v4 (CSS-first `@theme`), Space Grotesk          |
| Backend  | Supabase Postgres with row-level security, server actions    |
| Auth     | Supabase Auth (email + password) via `@supabase/ssr` cookies |
| Scraping | Firecrawl, Crawlee, Crawl4AI, Browser Use behind one registry |

## Getting started

```bash
pnpm install
cp .env.example .env.local   # already filled in for the shared project
pnpm dev
```

Open http://localhost:3000.

### 1. Apply the database schema

The schema lives in `supabase/migrations/`. Apply it one of two ways.

**Option A — Supabase CLI (preferred, keeps migration history):**

```bash
npx supabase login                                  # account that owns the project
npx supabase link --project-ref efugibjzetdrmwqylcaj
npx supabase db push
```

If `link` fails with an access-privileges error, the logged-in CLI account is not a
member of the project. You can still push over a direct connection, which skips the
management API and only needs the database password:

```bash
# Session-mode pooler. The direct host (db.<ref>.supabase.co) is IPv6-only.
# Percent-encode the password: @ becomes %40.
npx supabase db push --db-url \
  "postgresql://postgres.efugibjzetdrmwqylcaj:<PASSWORD>@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres"
```

The same `--db-url` works with `supabase db query -f file.sql` for one-off SQL.

**Option B — SQL Editor (no CLI access needed):**

Open the [SQL Editor](https://supabase.com/dashboard/project/efugibjzetdrmwqylcaj/sql/new),
paste the contents of `supabase/schema.sql`, and run it once. That file is just the
migrations concatenated in order.

After either option, regenerate the TypeScript types so they match the live database:

```bash
pnpm db:types
```

### 2. Create an account

This project has **email confirmation enabled**, so signup sends a verification link
before the session starts. For faster local testing, either:

- Turn off confirmation: Dashboard → Authentication → Sign In / Providers → Email →
  disable "Confirm email"; or
- Keep it on and click the link in the email. Add `http://localhost:3000/**` to
  Authentication → URL Configuration → Redirect URLs so the link resolves locally.

Signing up creates your workspace automatically (the `handle_new_user` trigger reads
the workspace name from the signup form).

### 3. Load sample data

With an empty workspace there is nothing to look at. Go to **Settings → Data → Load
sample data** to insert 48 leads with activity, meetings, and scrape history. The
same screen has a reset button.

## Environment variables

| Variable                        | Required | Purpose                                            |
| ------------------------------- | -------- | -------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | yes      | Supabase project URL                               |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes      | Publishable key, safe for the browser              |
| `NEXT_PUBLIC_SITE_URL`          | yes      | Base URL used to build auth email redirect links   |
| `SUPABASE_SERVICE_ROLE_KEY`     | no       | Only for background jobs that run outside a session |
| `GOOGLE_MAPS_API_KEY`           | no       | Enables the Google Places source                   |
| `FIRECRAWL_API_KEY`             | no       | Enables the Firecrawl source                       |
| `FIRECRAWL_API_URL`             | no       | Point Firecrawl at a self-hosted instance          |
| `CRAWL4AI_URL`                  | no       | Enables the Crawl4AI source                        |
| `CRAWL4AI_TOKEN`                | no       | Crawl4AI auth token (on by default since v0.9)     |
| `BROWSER_USE_API_KEY`           | no       | Enables the Browser Use agent source               |
| `BROWSER_USE_MODEL`             | no       | Override the agent model                           |

## How the scraper works

```
scrape form → scrape_jobs row → POST /api/scraper/run → provider.run()
            → scraped_records (staged, scored, de-duplicated)
            → import_scraped_records() → leads
```

The route runs under the caller's session, so row-level security scopes every write
to their workspace. The UI polls the `scrape_jobs` row for progress.

### Lead sources

Crawlers return **pages**, not contacts, so every page-based source funnels through
one shared extraction step (`lib/scraper/extract.ts`) that pulls emails, phone
numbers, social links, and an owner name out of HTML or markdown. It drops the
usual noise — `noreply@`, analytics and Sentry addresses, image filenames matched as
emails, years and prices matched as phone numbers — and prefers a named address like
`dana.whitfield@` over a generic `info@`. Page-based sources build **one record per
domain**, merging details found across the home, contact, and about pages.

| Source        | Needs                       | How it finds leads                                                                 |
| ------------- | --------------------------- | ---------------------------------------------------------------------------------- |
| Sample        | nothing                     | Generates placeholder leads to exercise the pipeline                               |
| Firecrawl     | `FIRECRAWL_API_KEY`         | Searches the open web for your niche, then extracts contacts from each result      |
| Google Maps   | `GOOGLE_MAPS_API_KEY`       | Local businesses by term and city; company, phone, and website but rarely an email |
| Crawlee       | nothing, but needs seed URLs | Crawls sites you supply over plain HTTP, following contact/about/team pages        |
| Crawl4AI      | `CRAWL4AI_URL` + seed URLs  | Same, but renders JavaScript in a real browser via your local Docker container     |
| Browser Use   | `BROWSER_USE_API_KEY`       | An AI agent browses and hunts on its own; handles directories and search forms     |

**Start with Firecrawl.** It is the only source that both discovers prospects and
extracts their details, so a niche plus a city is enough. Crawlee and Crawl4AI crawl
pages rather than searching, so they need seed URLs — either company sites or a
directory page to crawl outward from. A practical pairing is Firecrawl to discover
domains, then Crawlee or Crawl4AI to dig through them.

Two setup notes:

- **Crawl4AI** is a Python project and cannot run inside Next.js. Start its API
  server, then set `CRAWL4AI_URL`:

  ```bash
  docker run -d -p 11235:11235 --shm-size=1g unclecode/crawl4ai:latest
  ```

- **Browser Use** is billed per agent run and takes minutes rather than seconds, so
  keep max results low. It runs one agent per city, capped at three.

`scrcpy` mirrors and controls Android device screens over ADB — it cannot fetch web
data, so it is not wired in as a lead source.

### Adding your own scraper

Everything except discovery is already handled — job lifecycle, progress, staging,
scoring, de-duplication, and CRM import. To plug in your own code:

1. Open `lib/scraper/providers/custom.ts`.
2. Implement `run(context)`, calling `context.emit([...])` with whatever records you
   find and `context.onProgress(percent, note)` as you go.
3. Set `CUSTOM_PROVIDER_READY = true`.

```ts
async run(context) {
  const { query, locations, maxResults, signal } = context

  for (const location of locations) {
    const rows = await myScraper({ query, location, signal })

    await context.emit(
      rows.map((row) => ({
        full_name: row.contactName,
        company: row.businessName,
        email: row.email,
        phone: row.phone,
        website: row.url,
        city: location,
        raw: row,
      })),
    )

    await context.onProgress(50, `Found ${context.emitted()} records`)
    if (context.emitted() >= maxResults) break
  }
}
```

Omit `score` and each record is scored heuristically (`lib/scraper/score.ts`) on
reachability and seniority. Register additional providers in
`lib/scraper/registry.ts`; they appear in the scrape form and on Settings →
Integrations automatically.

## Data model

| Table                  | Purpose                                             |
| ---------------------- | --------------------------------------------------- |
| `organizations`        | Tenant. Owns every other row.                       |
| `profiles`             | 1:1 with `auth.users`.                              |
| `organization_members` | Membership + role (owner/admin/member/viewer).       |
| `invitations`          | Pending invites with a shareable token.              |
| `leads`                | The CRM record. Unique on `(org_id, lower(email))`.  |
| `lead_activities`      | Timeline. Written by triggers and by hand.           |
| `meetings`             | Calendar entries, optionally linked to a lead.       |
| `scrape_jobs`          | One scrape run and its progress.                     |
| `scraped_records`      | Staging rows before they become leads.               |
| `notifications`        | Per-user in-app messages.                            |

Every tenant table has RLS enabled and is gated on organization membership through
`is_org_member()` / `can_write_org()` / `is_org_admin()`. Those helpers are
`security definer` so policies on `organization_members` do not recurse.

## Scripts

```bash
pnpm dev         # dev server
pnpm build       # production build
pnpm typecheck   # tsc --noEmit
pnpm db:push     # apply migrations to the linked project
pnpm db:types    # regenerate lib/supabase/types.ts from the live schema
```

## Deploying to Vercel

1. Push the repo to GitHub and import it in Vercel.
2. Add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
   `NEXT_PUBLIC_SITE_URL` (your production URL) as environment variables.
3. In Supabase → Authentication → URL Configuration, set the Site URL to your Vercel
   domain and add `https://your-domain.vercel.app/**` to the redirect allow-list.

`app/api/scraper/run` declares `maxDuration = 300`, which needs a Vercel plan that
allows long function timeouts. For longer scrapes, move the runner to a queue or cron
job and give it `SUPABASE_SERVICE_ROLE_KEY` (`lib/supabase/admin.ts` is ready for it).

Which lead sources work on Vercel:

- **Firecrawl**, **Google Maps**, and **Browser Use** are plain HTTP APIs and work
  as-is.
- **Crawlee** works because it uses `CheerioCrawler` — HTTP requests and an HTML
  parser, no browser binary. It is configured with in-memory storage, since its
  default `./storage` directory is not writable on Vercel.
- **Crawl4AI** needs a server it can reach. A `localhost` URL will not resolve from
  a Vercel function, so host the container somewhere public (or keep that source for
  local runs only).

## Project layout

```
app/
  (app)/          authenticated shell: dashboard, crm, scraper, calendar, team, settings
  (auth)/         login, signup, forgot/reset password
  api/scraper/    scrape execution endpoint
  auth/callback/  email link handler
  onboarding/     workspace creation for users without one
components/       UI kit + per-feature client components
lib/
  actions/        server actions (auth, leads, meetings, team, settings, scraper)
  scraper/        provider registry, runner, scoring, contact extraction
  supabase/       browser/server/admin clients, generated types
  queries.ts      server-side reads
supabase/
  migrations/     ordered SQL migrations
  schema.sql      all migrations concatenated, for the SQL Editor
proxy.ts          session refresh + route protection
```
