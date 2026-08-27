import type { ScrapeProvider, ScrapedLeadInput } from '../types'

const FIRST_NAMES = [
  'Maya', 'Elliot', 'Sofia', 'Darius', 'Leila', 'Noah', 'Avery', 'Marcus', 'Jules', 'Priya',
  'Owen', 'Nadia', 'Theo', 'Imani', 'Caleb', 'Rosa', 'Dev', 'Hana', 'Miles', 'Zoe',
]

const LAST_NAMES = [
  'Chen', 'Brooks', 'Ramirez', 'Wells', 'Okafor', 'Kim', 'Wilson', 'Grant', 'Martin', 'Shah',
  'Doyle', 'Haddad', 'Novak', 'Barnes', 'Foster', 'Nguyen', 'Patel', 'Sato', 'Rivera', 'Lang',
]

const COMPANY_HEADS = [
  'Northstar', 'Metric', 'Civic', 'Brightline', 'Relay', 'Goodwell', 'Orbit', 'Ritual',
  'Anchor', 'Lumen', 'Cobalt', 'Verdant', 'Pivot', 'Sable', 'Kindred', 'Atlas',
]

const COMPANY_TAILS = ['Labs', 'Studio', 'Group', 'Systems', 'Partners', 'Collective', 'Works', 'Co']

const TITLES = [
  'Founder', 'Owner', 'CEO', 'VP of Growth', 'Head of Revenue', 'Director of Operations',
  'Marketing Manager', 'Head of Partnerships', 'COO', 'General Manager',
]

/** Deterministic PRNG so the same query yields a repeatable result set. */
function seededRandom(seed: string) {
  let state = 2166136261
  for (let i = 0; i < seed.length; i++) {
    state ^= seed.charCodeAt(i)
    state = Math.imul(state, 16777619)
  }
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return ((state >>> 0) % 100000) / 100000
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Built-in provider that fabricates plausible records. It exists so the whole
 * pipeline — job lifecycle, staging table, scoring, import — is testable before
 * any third-party credentials are configured.
 */
export const sampleProvider: ScrapeProvider = {
  id: 'sample',
  label: 'Sample data (no API key)',
  description: 'Generates realistic placeholder leads so you can test the full pipeline.',

  async run(context) {
    const { query, locations, industry, maxResults, signal } = context
    const random = seededRandom(`${query}|${locations.join(',')}`)
    const cities = locations.length > 0 ? locations : ['Remote']
    const target = Math.min(maxResults, 120)
    const batchSize = 10

    for (let offset = 0; offset < target; offset += batchSize) {
      if (signal.aborted) return

      const batch: ScrapedLeadInput[] = []
      const size = Math.min(batchSize, target - offset)

      for (let i = 0; i < size; i++) {
        const index = offset + i
        const first = FIRST_NAMES[Math.floor(random() * FIRST_NAMES.length)]
        const last = LAST_NAMES[Math.floor(random() * LAST_NAMES.length)]
        const company = `${COMPANY_HEADS[Math.floor(random() * COMPANY_HEADS.length)]} ${
          COMPANY_TAILS[Math.floor(random() * COMPANY_TAILS.length)]
        }`
        const domain = `${company.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`
        const city = cities[index % cities.length]
        const hasEmail = random() > 0.18
        const hasPhone = random() > 0.25

        batch.push({
          full_name: `${first} ${last}`,
          company,
          title: TITLES[Math.floor(random() * TITLES.length)],
          email: hasEmail ? `${first.toLowerCase()}@${domain}` : null,
          phone: hasPhone
            ? `(${200 + Math.floor(random() * 700)}) 555-${String(Math.floor(random() * 10000)).padStart(4, '0')}`
            : null,
          website: `https://${domain}`,
          address: city,
          city: city.split(',')[0],
          industry: industry ?? null,
          source_url: `https://${domain}/about`,
          raw: { provider: 'sample', query, rating: Number((3 + random() * 2).toFixed(1)) },
        })
      }

      await context.emit(batch)
      await context.onProgress(
        Math.min(96, Math.round(((offset + size) / target) * 100)),
        `Found ${context.emitted()} records`,
      )

      // Pace the run so progress is observable in the UI.
      await sleep(320)
    }
  },
}
