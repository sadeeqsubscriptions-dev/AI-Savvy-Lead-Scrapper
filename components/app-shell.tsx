'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  CalendarDays,
  Crosshair,
  Database,
  FileSearch,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Settings,
  Sun,
  Users,
  X,
} from 'lucide-react'
import { LogoMark } from '@/components/brand'
import { GlobalSearch } from '@/components/global-search'
import { useTheme } from '@/components/theme-provider'
import { Avatar } from '@/components/ui/avatar'
import { Progress } from '@/components/ui/progress'
import { signOut } from '@/lib/actions/auth'
import { APP_NAME } from '@/lib/constants'
import { formatNumber } from '@/lib/format'
import type { MemberRole } from '@/lib/supabase/types'
import { cn } from '@/lib/utils'

const workspaceNav = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/crm', label: 'CRM', icon: Database },
  { href: '/targeting', label: 'Targeting', icon: Crosshair },
  { href: '/scraper', label: 'Lead scraper', icon: FileSearch },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
]

const manageNav = [
  { href: '/team', label: 'Team', icon: Users },
  { href: '/settings', label: 'Settings', icon: Settings },
]

const roleLabels: Record<MemberRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
  viewer: 'Viewer',
}

export function AppShell({
  children,
  user,
  organization,
  usage,
}: {
  children: React.ReactNode
  user: { name: string; email: string; role: MemberRole }
  organization: { id: string; name: string }
  usage: { used: number; quota: number }
}) {
  const pathname = usePathname()
  const { theme, toggleTheme } = useTheme()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  const percent = usage.quota > 0 ? Math.min(100, (usage.used / usage.quota) * 100) : 0

  const navLink = (
    item: { href: string; label: string; icon: typeof Database },
    variant: 'primary' | 'muted',
  ) => {
    const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
    const Icon = item.icon

    return (
      <Link
        key={item.href}
        href={item.href}
        className={cn(
          'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200',
          active
            ? variant === 'primary'
              ? 'bg-gradient-brand font-medium text-white shadow-lg shadow-primary/20'
              : 'bg-secondary text-foreground'
            : 'text-muted-foreground hover:translate-x-0.5 hover:bg-sidebar-accent hover:text-foreground',
        )}
      >
        <Icon className="size-4 shrink-0 transition-transform duration-200 group-hover:scale-110" />
        {item.label}
      </Link>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-sidebar-border bg-sidebar px-4 py-5 transition-transform duration-200 lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="mb-7 flex items-center justify-between gap-2 px-1">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5">
            <LogoMark className="size-8 rounded-lg" />
            <span className="min-w-0">
              <span className="block truncate font-display text-sm font-bold tracking-tight">
                {organization.name}
              </span>
              <span className="block truncate text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {APP_NAME}
              </span>
            </span>
          </Link>
          <button
            type="button"
            className="rounded-md p-1 text-muted-foreground hover:bg-secondary lg:hidden"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
          >
            <X className="size-4" />
          </button>
        </div>

        <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Workspace
        </p>
        <nav className="flex flex-col gap-1" aria-label="Workspace navigation">
          {workspaceNav.map((item) => navLink(item, 'primary'))}
        </nav>

        <p className="mb-2 mt-7 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Manage
        </p>
        <nav className="flex flex-col gap-1" aria-label="Management navigation">
          {manageNav.map((item) => navLink(item, 'muted'))}
        </nav>

        <div className="mt-auto space-y-3 pt-6">
          <div className="rounded-xl border border-sidebar-border bg-card/60 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Lead quota</span>
              <span className="font-mono text-xs">{Math.round(percent)}%</span>
            </div>
            <Progress value={percent} />
            <p className="mt-2 text-[11px] text-muted-foreground">
              {formatNumber(usage.used)} of {formatNumber(usage.quota)} leads
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-transparent px-1 py-1.5">
            <Avatar name={user.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user.name}</p>
              <p className="truncate text-xs text-muted-foreground">{roleLabels[user.role]}</p>
            </div>
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut className="size-4" />
              </button>
            </form>
          </div>
        </div>
      </aside>

      {open ? (
        <button
          type="button"
          className="animate-in fade-in fixed inset-0 z-40 bg-slate-950/70 duration-200 lg:hidden"
          onClick={() => setOpen(false)}
          aria-label="Close navigation overlay"
        />
      ) : null}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border bg-background/85 px-4 backdrop-blur-md sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className="rounded-lg border border-border p-2 text-muted-foreground lg:hidden"
              onClick={() => setOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="size-4" />
            </button>
            <GlobalSearch orgId={organization.id} />
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className="rounded-lg p-2 text-muted-foreground transition-all duration-300 hover:bg-secondary hover:text-foreground active:scale-90"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            >
              <span className="block transition-transform duration-500 ease-out [transform:rotate(0deg)] data-[flip=true]:[transform:rotate(180deg)]" data-flip={theme === 'dark'}>
                {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </span>
            </button>
            <Link
              href="/settings"
              className="rounded-lg p-1.5 transition-all duration-200 hover:scale-105 hover:opacity-80"
              aria-label="Your profile"
            >
              <Avatar name={user.name} size="sm" />
            </Link>
          </div>
        </header>

        <main
          key={pathname}
          className="animate-in fade-in slide-in-from-bottom-2 min-h-[calc(100vh-4rem)] px-4 py-6 duration-500 ease-out sm:px-6 lg:px-8"
        >
          {children}
        </main>
      </div>
    </div>
  )
}
