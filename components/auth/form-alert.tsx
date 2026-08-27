import { AlertCircle, CheckCircle2 } from 'lucide-react'

export function FormAlert({ error, message }: { error?: string; message?: string }) {
  if (!error && !message) return null

  const isError = Boolean(error)

  return (
    <div
      role={isError ? 'alert' : 'status'}
      className={
        isError
          ? 'mb-5 flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs leading-5 text-destructive'
          : 'mb-5 flex items-start gap-2.5 rounded-lg border border-success/30 bg-success/10 p-3 text-xs leading-5 text-success'
      }
    >
      {isError ? (
        <AlertCircle className="mt-0.5 size-4 shrink-0" />
      ) : (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
      )}
      <span>{error ?? message}</span>
    </div>
  )
}
