const compactCurrency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
})

const fullCurrency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const numberFormat = new Intl.NumberFormat('en-US')

export function formatCurrency(value: number | string | null | undefined, compact = true) {
  const amount = typeof value === 'string' ? Number(value) : (value ?? 0)
  if (!Number.isFinite(amount)) return '$0'
  return compact && Math.abs(amount) >= 10_000
    ? compactCurrency.format(amount)
    : fullCurrency.format(amount)
}

export function formatNumber(value: number | string | null | undefined) {
  const amount = typeof value === 'string' ? Number(value) : (value ?? 0)
  return Number.isFinite(amount) ? numberFormat.format(amount) : '0'
}

export function formatPercent(value: number | null | undefined, digits = 1) {
  const amount = Number(value ?? 0)
  if (!Number.isFinite(amount)) return '0%'
  return `${amount.toFixed(digits)}%`
}

/** Signed delta between two periods, e.g. "+12.8%" — null when there is no baseline. */
export function formatDelta(current: number, previous: number) {
  if (!previous) return current > 0 ? '+100%' : null
  const change = ((current - previous) / previous) * 100
  const sign = change >= 0 ? '+' : ''
  return `${sign}${change.toFixed(1)}%`
}

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatTime(value: string | Date | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000_000],
  ['month', 2_592_000_000],
  ['week', 604_800_000],
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
]

const relativeFormat = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' })

export function formatRelative(value: string | Date | null | undefined) {
  if (!value) return 'Never'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Never'

  const diff = date.getTime() - Date.now()
  const magnitude = Math.abs(diff)

  if (magnitude < 60_000) return 'Just now'

  for (const [unit, ms] of RELATIVE_UNITS) {
    if (magnitude >= ms) return relativeFormat.format(Math.round(diff / ms), unit)
  }

  return 'Just now'
}

/** `2026-08-10` in local time — safe for `<input type="date">` values. */
export function toDateInputValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

export function greetingFor(date = new Date()) {
  const hour = date.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}
