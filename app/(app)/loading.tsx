import { Spinner } from '@/components/ui/progress'

export default function AppLoading() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-muted-foreground">
      <Spinner className="size-6" />
      <p className="text-sm">Loading your workspace…</p>
    </div>
  )
}
