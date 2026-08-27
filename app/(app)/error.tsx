'use client'

import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, EmptyState } from '@/components/ui/card'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="mx-auto max-w-lg py-16">
      <Card>
        <EmptyState
          icon={AlertTriangle}
          title="Something went wrong"
          description={
            error.message.length > 0 && error.message.length < 240
              ? error.message
              : 'That request failed. Retrying usually clears it — if not, check that your Supabase migrations have been applied.'
          }
          action={
            <Button variant="brand" onClick={reset}>
              Try again
            </Button>
          }
        />
      </Card>
    </div>
  )
}
