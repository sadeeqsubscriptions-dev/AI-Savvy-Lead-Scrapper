'use client'

import * as React from 'react'
import { Select as SelectPrimitive } from '@base-ui/react/select'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

const controlBase =
  'w-full rounded-lg border border-input bg-background/60 px-3 text-sm text-foreground shadow-sm transition-colors outline-none placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-destructive/25'

export function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return <input className={cn(controlBase, 'h-10', className)} {...props} />
}

export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return <textarea className={cn(controlBase, 'min-h-24 resize-y py-2.5 leading-6', className)} {...props} />
}

type OptionElement = React.ReactElement<
  React.OptionHTMLAttributes<HTMLOptionElement> & { children?: React.ReactNode }
>

/**
 * Styled drop-in replacement for a native `<select>` — same `<option>` children
 * and `event.target.value`-shaped `onChange` API, so every existing call site
 * works unchanged. The popup is a real themed panel (Base UI) instead of the
 * browser's native, unstyleable option list.
 */
export function Select({
  className,
  children,
  value,
  defaultValue,
  onChange,
  name,
  id,
  disabled,
  required,
  'aria-label': ariaLabel,
}: React.ComponentProps<'select'>) {
  const options = React.useMemo(
    () =>
      React.Children.toArray(children).filter(
        (child): child is OptionElement => React.isValidElement(child) && child.type === 'option',
      ),
    [children],
  )

  const handleValueChange = (nextValue: string | null) => {
    onChange?.({
      target: { value: nextValue ?? '', name },
    } as unknown as React.ChangeEvent<HTMLSelectElement>)
  }

  return (
    <SelectPrimitive.Root
      items={options.map((option) => ({
        value: String(option.props.value ?? ''),
        label: option.props.children,
      }))}
      value={value != null ? String(value) : undefined}
      defaultValue={defaultValue != null ? String(defaultValue) : undefined}
      onValueChange={handleValueChange}
      name={name}
      id={id}
      disabled={disabled}
      required={required}
    >
      <SelectPrimitive.Trigger
        aria-label={ariaLabel}
        className={cn(
          controlBase,
          'flex h-10 items-center justify-between gap-2 data-[popup-open]:border-ring data-[popup-open]:ring-2 data-[popup-open]:ring-ring/25',
          className,
        )}
      >
        <SelectPrimitive.Value className="truncate text-left" />
        <SelectPrimitive.Icon className="shrink-0 text-muted-foreground">
          <ChevronDown className="size-4" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Positioner className="z-[120] outline-none" sideOffset={6}>
          <SelectPrimitive.Popup className="max-h-72 min-w-[var(--anchor-width)] overflow-auto rounded-lg border border-border bg-popover p-1 text-sm text-popover-foreground shadow-xl shadow-black/20 outline-none">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={String(option.props.value)}
                value={String(option.props.value ?? '')}
                disabled={option.props.disabled}
                className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-2 outline-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40 data-[highlighted]:bg-secondary"
              >
                <SelectPrimitive.ItemText>{option.props.children}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="text-primary">
                  <Check className="size-3.5" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
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
