'use client'

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

function useDismiss(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
}) {
  useDismiss(open, onClose)

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-100 flex items-end justify-center bg-slate-950/70 p-4 backdrop-blur-sm sm:items-center"
      onMouseDown={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl',
          className,
        )}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div>
            <h2 className="font-display text-base font-semibold tracking-tight">{title}</h2>
            {description ? (
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Close dialog"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
        {footer ? (
          <div className="flex flex-wrap justify-end gap-2 border-t border-border p-4">{footer}</div>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}

export function Drawer({
  open,
  onClose,
  children,
  label,
}: {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  label: string
}) {
  useDismiss(open, onClose)

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-100 flex justify-end bg-slate-950/70 backdrop-blur-sm"
      onMouseDown={onClose}
      role="presentation"
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="h-full w-full max-w-md overflow-y-auto border-l border-border bg-card shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        {children}
      </aside>
    </div>,
    document.body,
  )
}
