import { cva, type VariantProps } from 'class-variance-authority'
import type { JobStatus, LeadStatus } from '@/lib/supabase/types'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'bg-secondary text-secondary-foreground',
        brand: 'bg-primary/12 text-primary',
        info: 'bg-chart-2/12 text-chart-2',
        violet: 'bg-chart-3/15 text-chart-3',
        success: 'bg-success/12 text-success',
        warning: 'bg-warning/12 text-warning',
        danger: 'bg-destructive/12 text-destructive',
        outline: 'border border-border text-muted-foreground',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
)

export function Badge({
  className,
  tone,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />
}

export const leadStatusTone: Record<LeadStatus, VariantProps<typeof badgeVariants>['tone']> = {
  New: 'info',
  Contacted: 'warning',
  Qualified: 'brand',
  Proposal: 'violet',
  Won: 'success',
  Lost: 'danger',
}

/** Matching raw color classes for dots, bars, and board columns. */
export const leadStatusColor: Record<LeadStatus, string> = {
  New: 'bg-chart-2',
  Contacted: 'bg-warning',
  Qualified: 'bg-primary',
  Proposal: 'bg-chart-3',
  Won: 'bg-success',
  Lost: 'bg-destructive',
}

export const jobStatusTone: Record<JobStatus, VariantProps<typeof badgeVariants>['tone']> = {
  queued: 'neutral',
  running: 'info',
  completed: 'success',
  failed: 'danger',
  cancelled: 'outline',
}

export function ScoreBadge({ score }: { score: number }) {
  const tone = score >= 85 ? 'success' : score >= 70 ? 'warning' : 'outline'
  return (
    <Badge tone={tone} className="font-mono">
      {score}
    </Badge>
  )
}
