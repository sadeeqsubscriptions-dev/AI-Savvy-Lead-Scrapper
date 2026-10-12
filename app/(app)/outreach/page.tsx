import type { Metadata } from 'next'
import { canWrite, requireSession } from '@/lib/auth'
import { TOTAL_STEPS, senderConfig } from '@/lib/outreach/config'
import { sentToday } from '@/lib/outreach/engine'
import { mailConfigured, senderAddress, webmailUrl } from '@/lib/outreach/mailer'
import { getOutreachBoard } from '@/lib/queries'
import { createClient } from '@/lib/supabase/server'
import { OutreachWorkspace, type AutopilotState } from '@/components/outreach/outreach-workspace'

export const metadata: Metadata = { title: 'Outreach' }

// Each email waits on Claude, and "Send to all" handles a batch in one go.
export const maxDuration = 300

export default async function OutreachPage() {
  const session = await requireSession()
  const supabase = await createClient()

  const [{ leads, threads }, newToday, settings] = await Promise.all([
    getOutreachBoard(session.organization.id),
    sentToday(supabase, true),
    supabase.from('outreach_settings').select('*').eq('org_id', session.organization.id).maybeSingle(),
  ])

  // No row yet = autopilot on by default; an error means the table is missing.
  const autopilot: AutopilotState = {
    enabled: settings.data?.autopilot ?? true,
    ready: !settings.error,
    lastRunAt: settings.data?.last_run_at ?? null,
    lastRun: (settings.data?.last_run as AutopilotState['lastRun']) ?? null,
  }

  return (
    <OutreachWorkspace
      leads={leads}
      threads={threads}
      canSend={canWrite(session.role)}
      mail={{
        configured: mailConfigured(),
        sender: senderAddress(),
        sentToday: newToday,
        dailyLimit: senderConfig().dailyNew,
        webmailUrl: webmailUrl(),
      }}
      totalSteps={TOTAL_STEPS}
      autopilot={autopilot}
    />
  )
}
