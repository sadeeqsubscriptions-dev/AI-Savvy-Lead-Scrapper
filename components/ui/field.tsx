import { cn } from '@/lib/utils'

const controlBase =
  'w-full rounded-lg border border-input bg-background/60 px-3 text-sm text-foreground shadow-sm transition-colors outline-none placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-destructive/25'

export function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return <input className={cn(controlBase, 'h-10', className)} {...props} />
}

export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return <textarea className={cn(controlBase, 'min-h-24 resize-y py-2.5 leading-6', className)} {...props} />
}

export function Select({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        controlBase,
        'h-10 appearance-none bg-[length:1rem] bg-[right_0.65rem_center] bg-no-repeat pr-9',
        '[background-image:url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%2394a3b8\' stroke-width=\'2\' stroke-linecap=\'round\'%3E%3Cpath d=\'m6 9 6 6 6-6\'/%3E%3C/svg%3E")]',
        className,
      )}
      {...props}
    />
  )
}

export function Label({ className, ...props }: React.ComponentProps<'label'>) {
  return (
    <label
      className={cn('mb-1.5 block text-xs font-medium text-muted-foreground', className)}
      {...props}
    />
  )
}

export function Field({
  label,
  hint,
  error,
  children,
  className,
  htmlFor,
}: {
  label?: string
  hint?: string
  error?: string
  children: React.ReactNode
  className?: string
  htmlFor?: string
}) {
  return (
    <div className={cn('min-w-0', className)}>
      {label ? <Label htmlFor={htmlFor}>{label}</Label> : null}
      {children}
      {error ? (
        <p className="mt-1.5 text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-muted-foreground/80">{hint}</p>
      ) : null}
    </div>
  )
}

export function Switch({
  checked,
  onCheckedChange,
  label,
  description,
  name,
}: {
  checked: boolean
  onCheckedChange: (value: boolean) => void
  label: string
  description?: string
  name?: string
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{description}</span>
        ) : null}
      </span>
      <span className="relative mt-0.5 shrink-0">
        <input
          type="checkbox"
          name={name}
          checked={checked}
          onChange={(event) => onCheckedChange(event.target.checked)}
          className="peer sr-only"
        />
        <span className="block h-5 w-9 rounded-full bg-secondary transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring/50" />
        <span className="pointer-events-none absolute left-0.5 top-0.5 size-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
      </span>
    </label>
  )
}
