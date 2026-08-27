import Image from 'next/image'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { APP_NAME } from '@/lib/constants'

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'relative flex size-9 shrink-0 overflow-hidden rounded-xl shadow-lg shadow-primary/25',
        className,
      )}
    >
      <Image src="/logo.png" alt={APP_NAME} fill sizes="36px" className="object-cover" priority />
    </span>
  )
}

export function Logo({
  href = '/dashboard',
  className,
  showWordmark = true,
}: {
  href?: string
  className?: string
  showWordmark?: boolean
}) {
  return (
    <Link href={href} className={cn('flex items-center gap-2.5', className)}>
      <LogoMark />
      {showWordmark ? (
        <span className="font-display text-base font-bold tracking-tight">{APP_NAME}</span>
      ) : null}
    </Link>
  )
}
