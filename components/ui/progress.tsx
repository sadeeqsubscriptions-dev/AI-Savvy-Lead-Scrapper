import { cn } from '@/lib/utils'

export function Progress({
  value,
  className,
  barClassName,
  active = false,
}: {
  value: number
  className?: string
  barClassName?: string
  active?: boolean
}) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0))

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-secondary', className)}
    >
      <div
        className={cn(
          'relative h-full overflow-hidden rounded-full bg-gradient-brand transition-[width] duration-500 ease-out',
          barClassName,
        )}
        style={{ width: `${clamped}%` }}
      >
        {active ? (
          <span className="animate-progress-shimmer absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent" />
        ) : null}
      </div>
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        'inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent',
        className,
      )}
    />
  )
}
