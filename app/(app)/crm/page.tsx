import type { Metadata } from 'next'
import { CrmWorkspace } from '@/components/crm/crm-workspace'
import { canWrite, requireSession } from '@/lib/auth'
import { formatCurrency, formatNumber } from '@/lib/format'
import {
  getAssignableMembers,
  getDashboardMetrics,
  getLeads,
  getLeadsForBoard,
} from '@/lib/queries'

export const metadata: Metadata = { title: 'CRM' }

type SearchParams = {
  q?: string
  status?: string
  source?: string
  owner?: string
  sort?: string
  view?: string
  page?: string
  lead?: string
}

export default async function CrmPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const session = await requireSession()
  const params = await searchParams
  const orgId = session.organization.id
  const view = params.view === 'board' ? 'board' : 'table'

  const filters = {
    query: params.q,
    status: params.status,
    source: params.source,
    owner: params.owner,
    sort: params.sort,
    page: params.page ? Number(params.page) : 1,
  }

  const [result, boardLeads, members, metrics] = await Promise.all([
    view === 'table'
      ? getLeads(orgId, filters)
      : Promise.resolve({ leads: [], total: 0, page: 1, pageCount: 1 }),
    view === 'board' ? getLeadsForBoard(orgId, filters) : Promise.resolve([]),
    getAssignableMembers(orgId),
    getDashboardMetrics(orgId),
  ])

  return (
    <div className="mx-auto max-w-[1440px] space-y-5">
      <CrmWorkspace
        leads={view === 'board' ? boardLeads : result.leads}
        total={result.total}
        page={result.page}
        pageCount={result.pageCount}
        view={view}
        members={members}
        canWrite={canWrite(session.role)}
        initialLeadId={params.lead}
        stats={[
          { label: 'All leads', value: formatNumber(metrics.total_leads) },
          {
            label: 'New this week',
            value: formatNumber(metrics.leads_this_week),
            className: 'text-chart-2',
          },
          {
            label: 'Qualified',
            value: formatNumber(metrics.qualified_leads),
            className: 'text-primary',
          },
          {
            label: 'Open pipeline',
            value: formatCurrency(metrics.pipeline_value),
            className: 'text-success',
          },
        ]}
      />
    </div>
  )
}
