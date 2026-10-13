'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { FileSpreadsheet, Upload } from 'lucide-react'
import { importLeads, type ImportRow } from '@/lib/actions/leads'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/field'
import { Modal } from '@/components/ui/modal'
import { Progress } from '@/components/ui/progress'
import { toast } from '@/components/ui/toaster'

type Field = keyof ImportRow

const FIELDS: { key: Field; label: string; aliases: string[] }[] = [
  { key: 'full_name', label: 'Contact name', aliases: ['name', 'full name', 'contact', 'contact name', 'person', 'owner name', 'first name'] },
  { key: 'company', label: 'Company', aliases: ['company', 'business', 'business name', 'organization', 'organisation', 'account', 'company name'] },
  { key: 'email', label: 'Email', aliases: ['email', 'e-mail', 'email address', 'mail'] },
  { key: 'phone', label: 'Phone', aliases: ['phone', 'phone number', 'telephone', 'tel', 'mobile', 'cell', 'contact number'] },
  { key: 'website', label: 'Website', aliases: ['website', 'url', 'site', 'web', 'domain', 'homepage'] },
  { key: 'title', label: 'Job title', aliases: ['title', 'job title', 'position', 'role', 'designation'] },
  { key: 'location', label: 'Location', aliases: ['location', 'city', 'address', 'state', 'region', 'area'] },
  { key: 'industry', label: 'Industry', aliases: ['industry', 'category', 'niche', 'sector', 'type'] },
  { key: 'notes', label: 'Notes', aliases: ['notes', 'note', 'comments', 'description'] },
]

const CHUNK = 300

function normalize(header: string) {
  return header.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
}

function guessMapping(headers: string[]) {
  const mapping: Partial<Record<Field, number>> = {}
  for (const field of FIELDS) {
    const index = headers.findIndex((header) => field.aliases.includes(normalize(header)))
    if (index >= 0 && !Object.values(mapping).includes(index)) mapping[field.key] = index
  }
  return mapping
}

async function readFile(file: File): Promise<string[][]> {
  const cell = (value: unknown) => (value === null || value === undefined ? '' : String(value).trim())

  if (/\.xlsx$/i.test(file.name)) {
    const { readSheet } = await import('read-excel-file/browser')
    const rows = await readSheet(file)
    return rows.map((row) => row.map(cell))
  }

  const Papa = (await import('papaparse')).default
  const text = await file.text()
  const result = Papa.parse<string[]>(text, { skipEmptyLines: true })
  return result.data.map((row) => row.map(cell))
}

/** Upload an Excel (.xlsx) or CSV file, match its columns, and add the rows as leads. */
export function ImportLeads({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter()
  const [fileName, setFileName] = useState<string | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<Partial<Record<Field, number>>>({})
  const [progress, setProgress] = useState<number | null>(null)

  const reset = () => {
    setFileName(null)
    setHeaders([])
    setRows([])
    setMapping({})
    setProgress(null)
  }

  const close = () => {
    if (progress !== null) return
    reset()
    onClose()
  }

  const pick = async (file: File | undefined) => {
    if (!file) return
    try {
      const data = (await readFile(file)).filter((row) => row.some((value) => value.length > 0))
      if (data.length < 2) {
        toast.error('That file has no rows under the header.')
        return
      }
      setFileName(file.name)
      setHeaders(data[0])
      setRows(data.slice(1))
      setMapping(guessMapping(data[0]))
    } catch {
      toast.error('Could not read that file. Use .xlsx or .csv.')
    }
  }

  const toRow = (row: string[]): ImportRow => {
    const result: ImportRow = {}
    for (const field of FIELDS) {
      const index = mapping[field.key]
      if (index !== undefined) result[field.key] = row[index] ?? ''
    }
    return result
  }

  const canImport = mapping.full_name !== undefined || mapping.company !== undefined

  const run = async () => {
    const all = rows.map(toRow)
    let imported = 0
    let duplicates = 0
    let invalid = 0
    setProgress(0)

    for (let start = 0; start < all.length; start += CHUNK) {
      const result = await importLeads(all.slice(start, start + CHUNK))
      if (!result.ok) {
        toast.error(result.error)
        break
      }
      imported += result.imported
      duplicates += result.duplicates
      invalid += result.invalid
      setProgress(Math.round(((start + CHUNK) / all.length) * 100))
      if (result.overLimit) {
        toast.error(result.overLimit)
        break
      }
    }

    toast.success(
      `Imported ${imported} lead${imported === 1 ? '' : 's'}` +
        (duplicates ? ` · ${duplicates} already in the CRM` : '') +
        (invalid ? ` · ${invalid} skipped (no name or company)` : ''),
    )
    setProgress(null)
    reset()
    onClose()
    router.refresh()
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Import leads"
      description="Upload an Excel (.xlsx) or CSV file. The first row must be the column names."
      className="max-w-2xl"
      footer={
        fileName ? (
          <>
            <Button variant="ghost" onClick={reset} disabled={progress !== null}>
              Choose another file
            </Button>
            <Button variant="brand" onClick={run} disabled={!canImport || progress !== null}>
              <Upload className="size-4" />
              Import {rows.length} row{rows.length === 1 ? '' : 's'}
            </Button>
          </>
        ) : null
      }
    >
      {!fileName ? (
        <label className="flex cursor-pointer flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-10 text-center transition-colors hover:border-primary/50 hover:bg-primary/[0.03]">
          <FileSpreadsheet className="size-8 text-primary" />
          <span className="text-sm font-medium">Choose a .xlsx or .csv file</span>
          <span className="text-xs text-muted-foreground">
            Columns like Name, Company, Email, Phone, Website, City, Industry are matched automatically.
          </span>
          <input
            type="file"
            accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={(event) => void pick(event.target.files?.[0])}
          />
        </label>
      ) : progress !== null ? (
        <div className="space-y-3 py-6">
          <p className="text-sm">Importing {rows.length} rows…</p>
          <Progress value={Math.min(100, progress)} active />
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{fileName}</span> · {rows.length} rows. Check which column
            goes where:
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {FIELDS.map((field) => (
              <label key={field.key} className="flex items-center justify-between gap-3 text-sm">
                <span className="shrink-0 text-muted-foreground">{field.label}</span>
                <Select
                  value={mapping[field.key] === undefined ? '' : String(mapping[field.key])}
                  onChange={(event) =>
                    setMapping((current) => {
                      const next = { ...current }
                      if (event.target.value === '') delete next[field.key]
                      else next[field.key] = Number(event.target.value)
                      return next
                    })
                  }
                  className="w-44"
                  aria-label={`Column for ${field.label}`}
                >
                  <option value="">— skip —</option>
                  {headers.map((header, index) => (
                    <option key={index} value={String(index)}>
                      {header || `Column ${index + 1}`}
                    </option>
                  ))}
                </Select>
              </label>
            ))}
          </div>
          {!canImport ? (
            <p className="text-xs text-destructive">Match at least a Contact name or Company column.</p>
          ) : null}

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[520px] text-left text-xs">
              <thead className="border-b border-border bg-secondary/40 text-muted-foreground">
                <tr>
                  {['Name', 'Company', 'Email', 'Phone'].map((label) => (
                    <th key={label} className="px-3 py-2 font-medium">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.slice(0, 5).map((row, index) => {
                  const lead = toRow(row)
                  return (
                    <tr key={index}>
                      <td className="max-w-40 truncate px-3 py-2">{lead.full_name || lead.company || '—'}</td>
                      <td className="max-w-40 truncate px-3 py-2">{lead.company || '—'}</td>
                      <td className="max-w-48 truncate px-3 py-2">{lead.email || '—'}</td>
                      <td className="px-3 py-2">{lead.phone || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Emails already in the CRM are skipped. Imported leads are assigned to you and show up in Targeting.
          </p>
        </div>
      )}
    </Modal>
  )
}
