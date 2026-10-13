import { NextResponse, after, type NextRequest } from 'next/server'
import { currentBrief } from '@/lib/ai/brief-shape'
import { suggestReply } from '@/lib/ai/call-assist'
import { canWrite, getSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

/**
 * Live coach for an ongoing call. A route (not a server action) so it never
 * queues behind other actions on the page, and the suggestion is saved after
 * the response goes out, so the rep sees it as soon as Claude is done.
 */
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session || !canWrite(session.role)) {
    return NextResponse.json({ ok: false, error: 'Not allowed.' }, { status: 401 })
  }

  let callId: string
  try {
    const body = (await request.json()) as { callId?: unknown }
    if (typeof body.callId !== 'string') throw new Error()
    callId = body.callId
  } catch {
    return NextResponse.json({ ok: false, error: 'callId is required.' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: call } = await supabase
    .from('calls')
    .select('id, org_id, lead_id')
    .eq('id', callId)
    .eq('org_id', session.organization.id)
    .maybeSingle()
  if (!call?.lead_id) return NextResponse.json({ ok: false, error: 'Call not found.' }, { status: 404 })

  const [{ data: lead }, { data: events }] = await Promise.all([
    supabase.from('leads').select('*').eq('id', call.lead_id).maybeSingle(),
    supabase
      .from('call_events')
      .select('speaker, text')
      .eq('call_id', call.id)
      .eq('kind', 'transcript')
      .order('created_at', { ascending: false })
      .limit(14),
  ])
  if (!lead) return NextResponse.json({ ok: false, error: 'Lead not found.' }, { status: 404 })
  if (!events || events.length === 0) return NextResponse.json({ ok: false, error: 'Nothing said yet.' })

  const result = await suggestReply(lead, currentBrief(lead.ai_brief), [...events].reverse())
  if (!result.ok) return NextResponse.json(result)

  after(async () => {
    await supabase.from('call_events').insert({
      org_id: call.org_id,
      call_id: call.id,
      kind: 'suggestion',
      text: result.data.say,
      payload: result.data,
    })
  })

  return NextResponse.json({ ok: true, suggestion: result.data })
}
