'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

function useInView<T extends Element>(once = true) {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          if (once) observer.disconnect()
        } else if (!once) setInView(false)
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.15 },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [once])
  return [ref, inView] as const
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Fades and lifts its content in the first time it scrolls into view. */
export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = 'div',
}: {
  children: React.ReactNode
  delay?: number
  className?: string
  as?: 'div' | 'li' | 'section'
}) {
  const [ref, inView] = useInView<HTMLDivElement>()
  return (
    <Tag
      ref={ref as React.Ref<never>}
      data-shown={inView}
      className={cn('reveal', className)}
      style={{ '--reveal-delay': `${delay}ms` } as React.CSSProperties}
    >
      {children}
    </Tag>
  )
}

/** Counts up to `value` once visible. */
export function CountUp({
  value,
  prefix = '',
  suffix = '',
  duration = 1400,
}: {
  value: number
  prefix?: string
  suffix?: string
  duration?: number
}) {
  const [ref, inView] = useInView<HTMLSpanElement>()
  const [shown, setShown] = useState(0)

  useEffect(() => {
    if (!inView) return
    if (prefersReducedMotion()) {
      setShown(value)
      return
    }
    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      setShown(Math.round(value * (1 - Math.pow(1 - t, 3))))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [inView, value, duration])

  return (
    <span ref={ref} className="tabular-nums">
      {prefix}
      {shown.toLocaleString('en-US')}
      {suffix}
    </span>
  )
}

/** Cycles through words in place, e.g. the niche in the hero headline. */
export function RotatingWord({ words, className }: { words: string[]; className?: string }) {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (prefersReducedMotion()) return
    const id = setInterval(() => setIndex((i) => (i + 1) % words.length), 2400)
    return () => clearInterval(id)
  }, [words.length])
  return (
    <span className="relative inline-block" aria-live="off">
      {/* The gradient sits on the animated word itself: a parent text-clip doesn't reach a transformed child. */}
      <span key={index} className={cn('animate-word-in inline-block', className)}>
        {words[index]}
      </span>
    </span>
  )
}

/** Wraps a grid so each child card gets a cursor-following glow. */
export function SpotlightGroup({ children, className }: { children: React.ReactNode; className?: string }) {
  const onMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const card = (event.target as HTMLElement).closest<HTMLElement>('[data-spotlight]')
    if (!card) return
    const rect = card.getBoundingClientRect()
    card.style.setProperty('--spot-x', `${event.clientX - rect.left}px`)
    card.style.setProperty('--spot-y', `${event.clientY - rect.top}px`)
  }
  return (
    <div className={className} onPointerMove={onMove}>
      {children}
    </div>
  )
}
