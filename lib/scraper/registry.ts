import { apolloProvider } from './providers/apollo'
import { browserUseProvider } from './providers/browser-use'
import { crawl4aiProvider } from './providers/crawl4ai'
import { crawleeProvider } from './providers/crawlee'
import { firecrawlProvider } from './providers/firecrawl'
import { googleMapsProvider } from './providers/google-maps'
import { sampleProvider } from './providers/sample'
import { CUSTOM_PROVIDER_READY, customProvider } from './providers/custom'
import type { ScrapeProvider } from './types'

// Ordered roughly by how useful each one is as a starting point.
const providers: ScrapeProvider[] = [
  sampleProvider,
  apolloProvider,
  firecrawlProvider,
  googleMapsProvider,
  crawleeProvider,
  crawl4aiProvider,
  browserUseProvider,
  customProvider,
]

export const DEFAULT_PROVIDER = sampleProvider.id

/** Providers that crawl supplied pages instead of searching the web. */
export const SEED_URL_PROVIDERS = new Set([crawleeProvider.id, crawl4aiProvider.id])

/** Providers that can make use of seed URLs but do not require them. */
export const SEED_URL_OPTIONAL_PROVIDERS = new Set([browserUseProvider.id])

export function getProvider(id: string): ScrapeProvider | null {
  return providers.find((provider) => provider.id === id) ?? null
}

/** True when the provider's credentials (or implementation) are in place. */
export function isProviderReady(provider: ScrapeProvider) {
  if (provider.id === customProvider.id) return CUSTOM_PROVIDER_READY
  if (!provider.requiresEnv) return true
  return Boolean(process.env[provider.requiresEnv])
}

/** Serializable provider list for the scrape form. */
export function listProviders() {
  return providers.map((provider) => ({
    id: provider.id,
    label: provider.label,
    description: provider.description,
    ready: isProviderReady(provider),
    requiresEnv: provider.requiresEnv ?? null,
    seedUrls: SEED_URL_PROVIDERS.has(provider.id)
      ? ('required' as const)
      : SEED_URL_OPTIONAL_PROVIDERS.has(provider.id)
        ? ('optional' as const)
        : ('unsupported' as const),
  }))
}

export type ProviderOption = ReturnType<typeof listProviders>[number]
