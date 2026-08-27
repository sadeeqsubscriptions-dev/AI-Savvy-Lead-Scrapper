import type { Metadata } from 'next'
import { ScraperWorkspace } from '@/components/scraper/scraper-workspace'
import { canWrite, requireSession } from '@/lib/auth'
import { getPendingRecordCount, getScrapeJobs } from '@/lib/queries'
import { listProviders } from '@/lib/scraper/registry'

export const metadata: Metadata = { title: 'Lead scraper' }

export default async function ScraperPage() {
  const session = await requireSession()

  const [jobs, pendingReview] = await Promise.all([
    getScrapeJobs(session.organization.id, 20),
    getPendingRecordCount(session.organization.id),
  ])

  return (
    <ScraperWorkspace
      providers={listProviders()}
      jobs={jobs}
      canWrite={canWrite(session.role)}
      pendingReview={pendingReview}
    />
  )
}
