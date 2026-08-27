'use client'

import { useMemo, useState } from 'react'
import type { LeadTrendPoint } from '@/lib/supabase/types'

const WIDTH = 720
const HEIGHT = 220
const PADDING = { top: 12, right: 8, bottom: 24, left: 34 }

function niceMax(value: number) {
  if (value <= 4) return 4
  const magnitude = 10 ** Math.floor(Math.log10(value))
  return Math.ceil(value / magnitude) * magnitude
}

/**
 * Dependency-free area chart. Renders as inline SVG with a viewBox so it scales
 * to the container while keeping the geometry math simple.
 */
export function TrendChart({ points }: { points: LeadTrendPoint[] }) {
  const [hover, setHover] = useState<number | null>(null)

  const chart = useMemo(() => {
    const data = points.map((point) => ({
      day: point.day,
      created: Number(point.created) || 0,
      won: Number(point.won) || 0,
    }))

    const max = niceMax(Math.max(1, ...data.map((point) => point.created)))
    const innerWidth = WIDTH - PADDING.left - PADDING.right
    const innerHeight = HEIGHT - PADDING.top - PADDING.bottom

    const x = (index: number) =>
      PADDING.left + (data.length <= 1 ? innerWidth / 2 : (index / (data.length - 1)) * innerWidth)
    const y = (value: number) => PADDING.top + innerHeight - (value / max) * innerHeight

    const line = data.map((point, index) => `${x(index)},${y(point.created)}`).join(' ')
    const area = `${PADDING.left},${y(0)} ${line} ${x(data.length - 1)},${y(0)}`

    return { data, max, x, y, line, area, innerHeight }
  }, [points])

  if (chart.data.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center text-xs text-muted-foreground">
        No activity in this period yet.
      </div>
    )
  }

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => Math.round(chart.max * ratio)).reverse()
  const active = hover !== null ? chart.data[hover] : null

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-56 w-full overflow-visible"
        role="img"
        aria-label="Leads added per day"
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PADDING.left}
              x2={WIDTH - PADDING.right}
              y1={chart.y(tick)}
              y2={chart.y(tick)}
              stroke="currentColor"
              className="text-border"
              strokeWidth="1"
            />
            <text
              x={PADDING.left - 8}
              y={chart.y(tick) + 3}
              textAnchor="end"
              className="fill-muted-foreground text-[9px]"
            >
              {tick}
            </text>
          </g>
        ))}

        <polygon points={chart.area} fill="url(#trend-fill)" />
        <polyline
          points={chart.line}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {chart.data.map((point, index) => (
          <g key={point.day}>
            {point.won > 0 ? (
              <circle cx={chart.x(index)} cy={chart.y(point.created)} r="3" fill="var(--chart-2)" />
            ) : null}
            <rect
              x={chart.x(index) - WIDTH / chart.data.length / 2}
              y={PADDING.top}
              width={WIDTH / chart.data.length}
              height={chart.innerHeight}
              fill="transparent"
              onMouseEnter={() => setHover(index)}
            />
            {hover === index ? (
              <>
                <line
                  x1={chart.x(index)}
                  x2={chart.x(index)}
                  y1={PADDING.top}
                  y2={PADDING.top + chart.innerHeight}
                  stroke="var(--ring)"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
                <circle
                  cx={chart.x(index)}
                  cy={chart.y(point.created)}
                  r="4"
                  fill="var(--primary)"
                  stroke="var(--background)"
                  strokeWidth="2"
                />
              </>
            ) : null}
          </g>
        ))}

        {chart.data.map((point, index) =>
          index % Math.ceil(chart.data.length / 6) === 0 ? (
            <text
              key={`label-${point.day}`}
              x={chart.x(index)}
              y={HEIGHT - 6}
              textAnchor="middle"
              className="fill-muted-foreground text-[9px]"
            >
              {new Date(point.day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </text>
          ) : null,
        )}
      </svg>

      {active ? (
        <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-xl">
          <p className="font-medium">
            {new Date(active.day).toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })}
          </p>
          <p className="mt-1 text-muted-foreground">
            <span className="font-mono text-foreground">{active.created}</span> added
            {active.won > 0 ? (
              <>
                {' · '}
                <span className="font-mono text-chart-2">{active.won}</span> won
              </>
            ) : null}
          </p>
        </div>
      ) : null}
    </div>
  )
}

/** Small inline sparkline used inside metric cards. */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return null

  const max = Math.max(1, ...values)
  const points = values
    .map((value, index) => `${(index / (values.length - 1)) * 100},${34 - (value / max) * 30}`)
    .join(' ')

  return (
    <svg viewBox="0 0 100 36" preserveAspectRatio="none" className={className} aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
      />
    </svg>
  )
}
