'use client'

import { useFormStatus } from 'react-dom'
import { Button, type ButtonProps } from '@/components/ui/button'
import { Spinner } from '@/components/ui/progress'

export function SubmitButton({
  children,
  pendingText,
  ...props
}: ButtonProps & { pendingText?: string }) {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" disabled={pending} {...props}>
      {pending ? (
        <>
          <Spinner />
          {pendingText ?? 'Working…'}
        </>
      ) : (
        children
      )}
    </Button>
  )
}
