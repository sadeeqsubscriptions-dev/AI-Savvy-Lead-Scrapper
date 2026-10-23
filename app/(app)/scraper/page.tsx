import type { Metadata } from 'next'
import { PlanNotice } from '@/components/billing/plan-notice'
import { ScraperWorkspace } from '@/components/scraper/scraper-workspace'
import { canWrite, requirePage } from '@/lib/auth'
import { getPendingRecordCount, getScrapeJobs } from '@/lib/queries'
import { listProviders } from '@/lib/scraper/registry'

export const metadata: Metadata = { title: 'Lead scraper' }

export default async function ScraperPage() {
  const session = await requirePage('scraper')

  const [jobs, pendingReview] = await Promise.all([
    getScrapeJobs(session.organization.id, 20),
    getPendingRecordCount(session.organization.id),
  ])

  return (
    <>
      <PlanNotice orgId={session.organization.id} feature="scraping" />
      <ScraperWorkspace
        providers={listProviders()}
        jobs={jobs}
        canWrite={canWrite(session.role)}
        pendingReview={pendingReview}
      />
    </>
  )
}
