import { cn } from '@/lib/utils'

const palette = [
  'bg-primary/15 text-primary',
  'bg-chart-2/15 text-chart-2',
  'bg-chart-3/15 text-chart-3',
  'bg-warning/15 text-warning',
  'bg-success/15 text-success',
  'bg-chart-4/15 text-chart-4',
]

export function initialsOf(name?: string | null, fallback = '?') {
  if (!name) return fallback
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return fallback
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/** Stable per-name color so the same person keeps the same swatch everywhere. */
export function colorOf(seed?: string | null) {
  if (!seed) return palette[0]
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) % 997
  return palette[hash % palette.length]
}

export function Avatar({
  name,
  size = 'default',
  className,
}: {
  name?: string | null
  size?: 'sm' | 'default' | 'lg'
  className?: string
}) {
  const sizes = {
    sm: 'size-6 text-[9px]',
    default: 'size-8 text-[10px]',
    lg: 'size-12 text-sm',
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-semibold',
        sizes[size],
        colorOf(name),
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  )
}
