'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { canWrite, requireSession } from '@/lib/auth'
import { LEAD_STATUSES } from '@/lib/constants'
import { createClient } from '@/lib/supabase/server'
import { failure, optionalEmail, optionalText, type ActionState } from '@/lib/actions/state'
import type { LeadStatus } from '@/lib/supabase/types'

const leadSchema = z.object({
  full_name: z.string().trim().min(2, 'Enter the contact name').max(160),
  company: optionalText,
  title: optionalText,
  email: optionalEmail,
  phone: optionalText,
  website: optionalText,
  location: optionalText,
  industry: optionalText,
  source: z.string().trim().min(1).default('Manual'),
  status: z.enum(LEAD_STATUSES as [LeadStatus, ...LeadStatus[]]).default('New'),
  score: z.coerce.number().int().min(0).max(100).default(50),
  estimated_value: z.coerce.number().min(0).max(1_000_000_000).default(0),
  owner_id: z
    .string()
    .trim()
    .transform((value) => (value.length === 0 || value === 'unassigned' ? null : value))
    .nullable(),
  notes: optionalText,
})

function readLeadForm(formData: FormData) {
  return leadSchema.safeParse({
    full_name: formData.get('full_name') ?? '',
    company: formData.get('company') ?? '',
    title: formData.get('title') ?? '',
    email: formData.get('email') ?? '',
    phone: formData.get('phone') ?? '',
    website: formData.get('website') ?? '',
    location: formData.get('location') ?? '',
    industry: formData.get('industry') ?? '',
    source: formData.get('source') ?? 'Manual',
    status: formData.get('status') ?? 'New',
    score: formData.get('score') ?? 50,
    estimated_value: formData.get('estimated_value') ?? 0,
    owner_id: formData.get('owner_id') ?? '',
    notes: formData.get('notes') ?? '',
  })
}

function revalidateLeadViews() {
  revalidatePath('/crm')
  revalidatePath('/dashboard')
}

export async function createLead(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSession()
  if (!canWrite(session.role)) return { error: 'Your role cannot create leads.' }

  const parsed = readLeadForm(formData)
  if (!parsed.success) return failure(parsed.error)

  const supabase = await createClient()
  const { error } = await supabase.from('leads').insert({
    ...parsed.data,
    org_id: session.organization.id,
    created_by: session.userId,
    owner_id: parsed.data.owner_id ?? session.userId,
  })

  if (error) {
    return {
      error:
        error.code === '23505' || error.message.includes('leads_org_email_idx')
          ? 'A lead with that email already exists in this workspace.'
          : error.message,
    }
  }

  revalidateLeadViews()
  return { ok: true, message: `${parsed.data.full_name} was added.` }
}

export async function updateLead(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSession()
  if (!canWrite(session.role)) return { error: 'Your role cannot edit leads.' }

  const id = String(formData.get('id') ?? '')
  if (!id) return { error: 'Missing lead reference.' }

  const parsed = readLeadForm(formData)
  if (!parsed.success) return failure(parsed.error)

  const supabase = await createClient()
  const { error } = await supabase
    .from('leads')
    .update(parsed.data)
    .eq('id', id)
    .eq('org_id', session.organization.id)

  if (error) return { error: error.message }

  revalidateLeadViews()
  return { ok: true, message: 'Lead updated.' }
}

export async function updateLeadStatus(id: string, status: LeadStatus) {
  const session = await requireSession()
  if (!canWrite(session.role)) return { error: 'Your role cannot edit leads.' }

  if (!LEAD_STATUSES.includes(status)) return { error: 'Unknown status.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('leads')
    .update({ status })
    .eq('id', id)
    .eq('org_id', session.organization.id)

  if (error) return { error: error.message }

  revalidateLeadViews()
  return { ok: true }
}

export async function assignLead(id: string, ownerId: string | null) {
  const session = await requireSession()
  if (!canWrite(session.role)) return { error: 'Your role cannot edit leads.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('leads')
    .update({ owner_id: ownerId })
    .eq('id', id)
    .eq('org_id', session.organization.id)

  if (error) return { error: error.message }

  revalidateLeadViews()
  return { ok: true }
}

export async function deleteLead(id: string) {
  const session = await requireSession()
  if (!canWrite(session.role)) return { error: 'Your role cannot delete leads.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('leads')
    .delete()
    .eq('id', id)
    .eq('org_id', session.organization.id)

  if (error) return { error: error.message }

  revalidateLeadViews()
  return { ok: true }
}

export async function deleteLeads(ids: string[]) {
  const session = await requireSession()
  if (!canWrite(session.role)) return { error: 'Your role cannot delete leads.' }
  if (ids.length === 0) return { error: 'Nothing selected.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('leads')
    .delete()
    .in('id', ids)
    .eq('org_id', session.organization.id)

  if (error) return { error: error.message }

  revalidateLeadViews()
  return { ok: true, message: `${ids.length} lead${ids.length === 1 ? '' : 's'} deleted.` }
}

export async function bulkUpdateStatus(ids: string[], status: LeadStatus) {
  const session = await requireSession()
  if (!canWrite(session.role)) return { error: 'Your role cannot edit leads.' }
  if (ids.length === 0) return { error: 'Nothing selected.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('leads')
    .update({ status })
    .in('id', ids)
    .eq('org_id', session.organization.id)

  if (error) return { error: error.message }

  revalidateLeadViews()
  return { ok: true, message: `Moved ${ids.length} lead${ids.length === 1 ? '' : 's'} to ${status}.` }
}

const activitySchema = z.object({
  lead_id: z.string().uuid(),
  type: z.enum(['note', 'email', 'call', 'meeting']),
  title: z.string().trim().min(2, 'Add a short summary').max(200),
  body: optionalText,
})

export async function logActivity(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSession()
  if (!canWrite(session.role)) return { error: 'Your role cannot log activity.' }

  const parsed = activitySchema.safeParse({
    lead_id: formData.get('lead_id'),
    type: formData.get('type') ?? 'note',
    title: formData.get('title') ?? '',
    body: formData.get('body') ?? '',
  })

  if (!parsed.success) return failure(parsed.error)

  const supabase = await createClient()
  const { error } = await supabase.from('lead_activities').insert({
    ...parsed.data,
    org_id: session.organization.id,
    user_id: session.userId,
  })

  if (error) return { error: error.message }

  // A logged touch counts as contact, so keep the lead's recency accurate.
  if (parsed.data.type !== 'note') {
    await supabase
      .from('leads')
      .update({ last_contacted_at: new Date().toISOString() })
      .eq('id', parsed.data.lead_id)
      .eq('org_id', session.organization.id)
  }

  revalidateLeadViews()
  return { ok: true, message: 'Activity logged.' }
}

/** CSV export of the full lead list, generated server-side. */
export async function exportLeadsCsv() {
  const session = await requireSession()
  const supabase = await createClient()

  const { data } = await supabase
    .from('leads')
    .select('*, owner:profiles!leads_owner_id_fkey(full_name, email)')
    .eq('org_id', session.organization.id)
    .order('created_at', { ascending: false })
    .limit(5000)

  const columns = [
    'Name', 'Company', 'Title', 'Email', 'Phone', 'Location', 'Industry',
    'Source', 'Status', 'Score', 'Estimated value', 'Owner', 'Created',
  ]

  const escape = (value: unknown) => {
    const text = value === null || value === undefined ? '' : String(value)
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }

  const rows = (data ?? []).map((lead) => {
    const owner = (lead as unknown as { owner: { full_name: string | null; email: string } | null })
      .owner
    return [
      lead.full_name, lead.company, lead.title, lead.email, lead.phone, lead.location,
      lead.industry, lead.source, lead.status, lead.score, lead.estimated_value,
      owner?.full_name ?? owner?.email ?? '', lead.created_at,
    ].map(escape).join(',')
  })

  return {
    filename: `ai-savvy-leads-${new Date().toISOString().slice(0, 10)}.csv`,
    csv: [columns.join(','), ...rows].join('\n'),
  }
}

const importRowSchema = z.object({
  full_name: z.string().trim().max(160).optional().default(''),
  company: z.string().trim().max(200).optional().default(''),
  title: z.string().trim().max(200).optional().default(''),
  email: z.string().trim().max(320).optional().default(''),
  phone: z.string().trim().max(60).optional().default(''),
  website: z.string().trim().max(500).optional().default(''),
  location: z.string().trim().max(200).optional().default(''),
  industry: z.string().trim().max(120).optional().default(''),
  notes: z.string().trim().max(5000).optional().default(''),
})

export type ImportRow = z.input<typeof importRowSchema>

/**
 * Bulk-adds leads from an uploaded spreadsheet. The client sends rows in
 * chunks; emails already in the workspace (or repeated in the file) are
 * skipped rather than failing the whole batch.
 */
export async function importLeads(rows: ImportRow[]) {
  const session = await requireSession()
  if (!canWrite(session.role)) return { ok: false as const, error: 'Your role cannot add leads.' }
  if (rows.length === 0) return { ok: true as const, imported: 0, duplicates: 0, invalid: 0 }
  if (rows.length > 500) return { ok: false as const, error: 'Send at most 500 rows at a time.' }

  const supabase = await createClient()
  const orgId = session.organization.id
  const text = (value: string) => (value.length > 0 ? value : null)
  const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

  let invalid = 0
  const candidates = []
  for (const raw of rows) {
    const parsed = importRowSchema.safeParse(raw)
    if (!parsed.success) {
      invalid++
      continue
    }
    const row = parsed.data
    const name = row.full_name || row.company
    if (!name) {
      invalid++
      continue
    }
    const email = row.email.toLowerCase()
    candidates.push({
      org_id: orgId,
      created_by: session.userId,
      owner_id: session.userId,
      source: 'Import',
      full_name: name,
      company: text(row.company),
      title: text(row.title),
      email: email && validEmail(email) ? email : null,
      phone: text(row.phone),
      website: text(row.website),
      location: text(row.location),
      industry: text(row.industry),
      notes: text(row.notes),
    })
  }

  const emails = candidates.map((lead) => lead.email).filter((email): email is string => Boolean(email))
  const existing = new Set<string>()
  if (emails.length > 0) {
    const { data } = await supabase.from('leads').select('email').eq('org_id', orgId).in('email', emails)
    for (const lead of data ?? []) if (lead.email) existing.add(lead.email.toLowerCase())
  }

  let duplicates = 0
  const fresh = candidates.filter((lead) => {
    if (!lead.email) return true
    if (existing.has(lead.email)) {
      duplicates++
      return false
    }
    existing.add(lead.email)
    return true
  })

  let imported = 0
  if (fresh.length > 0) {
    const { error } = await supabase.from('leads').insert(fresh)
    if (!error) {
      imported = fresh.length
    } else {
      // A mixed-case duplicate slipped past the lookup: fall back to one by one.
      for (const lead of fresh) {
        const { error: rowError } = await supabase.from('leads').insert(lead)
        if (rowError) duplicates++
        else imported++
      }
    }
  }

  revalidateLeadViews()
  revalidatePath('/targeting')
  revalidatePath('/outreach')
  return { ok: true as const, imported, duplicates, invalid }
}
