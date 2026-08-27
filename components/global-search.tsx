'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { CalendarDays, Command, FileSearch, Search, UserRound } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { SearchResult } from '@/lib/supabase/types'
import { Spinner } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

const icons = { lead: UserRound, meeting: CalendarDays, job: FileSearch }
const labels = { lead: 'Lead', meeting: 'Meeting', job: 'Scrape' }

export function GlobalSearch({ orgId }: { orgId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((current) => !current)
      }
      if (event.key === 'Escape') setOpen(false)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (open) inputRef.current?.focus()
    else {
      setTerm('')
      setResults([])
      setActive(0)
    }
  }, [open])

  useEffect(() => {
    if (term.trim().length < 2) {
      setResults([])
      return
    }

    let cancelled = false
    setLoading(true)

    const handle = window.setTimeout(async () => {
      const supabase = createClient()
      const { data } = await supabase.rpc('search_org', {
        target_org: orgId,
        term: term.trim(),
        max_results: 8,
      })

      if (!cancelled) {
        setResults((data as SearchResult[] | null) ?? [])
        setActive(0)
        setLoading(false)
      }
    }, 220)

    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [term, orgId])

  const go = (href: string) => {
    setOpen(false)
    router.push(href)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-ring/40 hover:text-foreground sm:flex"
      >
        <Search className="size-4" />
        <span>Search anything</span>
        <kbd className="ml-6 flex items-center gap-0.5 rounded border border-border px-1.5 py-0.5 font-mono text-[10px]">
          <Command className="size-3" />K
        </kbd>
      </button>

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground sm:hidden"
        aria-label="Search"
      >
        <Search className="size-4" />
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-100 flex items-start justify-center bg-slate-950/70 p-4 pt-[12vh] backdrop-blur-sm"
          onMouseDown={() => setOpen(false)}
          role="presentation"
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-border px-4">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <input
                ref={inputRef}
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault()
                    setActive((current) => Math.min(current + 1, results.length - 1))
                  }
                  if (event.key === 'ArrowUp') {
                    event.preventDefault()
                    setActive((current) => Math.max(current - 1, 0))
                  }
                  if (event.key === 'Enter' && results[active]) {
                    event.preventDefault()
                    go(results[active].href)
                  }
                }}
                placeholder="Search leads, meetings, and scrapes…"
                className="h-14 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                aria-label="Search workspace"
              />
              {loading ? <Spinner className="size-3.5 text-muted-foreground" /> : null}
            </div>

            <div className="max-h-80 overflow-y-auto p-2">
              {term.trim().length < 2 ? (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                  Type at least two characters to search.
                </p>
              ) : results.length === 0 && !loading ? (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                  No matches for “{term.trim()}”.
                </p>
              ) : (
                results.map((result, index) => {
                  const Icon = icons[result.kind] ?? UserRound
                  return (
                    <button
                      key={`${result.kind}-${result.id}`}
                      type="button"
                      onMouseEnter={() => setActive(index)}
                      onClick={() => go(result.href)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                        index === active ? 'bg-secondary' : 'hover:bg-secondary/60',
                      )}
                    >
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/12 text-primary">
                        <Icon className="size-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{result.title}</span>
                        {result.subtitle ? (
                          <span className="block truncate text-xs text-muted-foreground">
                            {result.subtitle}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
                        {labels[result.kind]}
                      </span>
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
