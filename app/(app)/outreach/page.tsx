import type { Metadata } from 'next'
import { canWrite, requireSession } from '@/lib/auth'
import { BATCH_SIZE, TOTAL_STEPS, senderConfig } from '@/lib/outreach/config'
import { sentInLast24h } from '@/lib/outreach/engine'
import { mailConfigured, senderAddress, webmailUrl } from '@/lib/outreach/mailer'
import { getOutreachBoard } from '@/lib/queries'
import { createClient } from '@/lib/supabase/server'
import { OutreachWorkspace } from '@/components/outreach/outreach-workspace'

export const metadata: Metadata = { title: 'Outreach' }

// Each email waits on Claude, and "Send to all" handles a batch in one go.
export const maxDuration = 300

export default async function OutreachPage() {
  const session = await requireSession()
  const supabase = await createClient()

  const [{ leads, threads }, sentToday] = await Promise.all([
    getOutreachBoard(session.organization.id),
    sentInLast24h(supabase),
  ])

  return (
    <OutreachWorkspace
      leads={leads}
      threads={threads}
      canSend={canWrite(session.role)}
      mail={{
        configured: mailConfigured(),
        sender: senderAddress(),
        sentToday,
        dailyLimit: senderConfig().dailyLimit,
        webmailUrl: webmailUrl(),
      }}
      totalSteps={TOTAL_STEPS}
      batchSize={BATCH_SIZE}
    />
  )
}
