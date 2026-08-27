'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type ToastTone = 'success' | 'error' | 'info'
type Toast = { id: number; message: string; tone: ToastTone }

const TOAST_EVENT = 'ai-savvy-leads:toast'
const DURATION = 4500

/**
 * Toasts are dispatched through a window event so any component — server action
 * callbacks included — can raise one without threading a context provider.
 */
export function toast(message: string, tone: ToastTone = 'info') {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<Omit<Toast, 'id'>>(TOAST_EVENT, { detail: { message, tone } }))
}

toast.success = (message: string) => toast(message, 'success')
toast.error = (message: string) => toast(message, 'error')

const icons = { success: CheckCircle2, error: AlertTriangle, info: Info }

const tones: Record<ToastTone, string> = {
  success: 'text-success',
  error: 'text-destructive',
  info: 'text-primary',
}

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    let counter = 0

    const onToast = (event: Event) => {
      const { message, tone } = (event as CustomEvent<Omit<Toast, 'id'>>).detail
      const id = ++counter
      setToasts((current) => [...current, { id, message, tone }])
      window.setTimeout(() => {
        setToasts((current) => current.filter((item) => item.id !== id))
      }, DURATION)
    }

    window.addEventListener(TOAST_EVENT, onToast)
    return () => window.removeEventListener(TOAST_EVENT, onToast)
  }, [])

  if (toasts.length === 0) return null

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-200 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((item) => {
        const Icon = icons[item.tone]
        return (
          <div
            key={item.id}
            role="status"
            className="pointer-events-auto flex items-start gap-3 rounded-xl border border-border bg-popover p-3.5 shadow-2xl animate-in slide-in-from-bottom-2 fade-in"
          >
            <Icon className={cn('mt-0.5 size-4 shrink-0', tones[item.tone])} />
            <p className="min-w-0 flex-1 text-sm leading-5">{item.message}</p>
            <button
              type="button"
              onClick={() => setToasts((current) => current.filter((t) => t.id !== item.id))}
              className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Dismiss notification"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
