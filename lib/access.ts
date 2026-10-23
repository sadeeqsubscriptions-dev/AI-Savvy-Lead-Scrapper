import type { MemberRole } from '@/lib/supabase/types'

/**
 * Which pages each teammate can open. Owners and admins see everything;
 * members and viewers get the default set below unless an admin picks pages
 * for them on the Team page (organization_members.page_access). Settings
 * (own profile) is always open. Safe to import in the browser.
 */

export type PageId =
  | 'dashboard'
  | 'scraper'
  | 'crm'
  | 'targeting'
  | 'outreach'
  | 'status'
  | 'dialer'
  | 'sms'
  | 'calendar'
  | 'setup'
  | 'team'
  | 'billing'

export const PAGES: { id: PageId; label: string; href: string; description: string }[] = [
  { id: 'dashboard', label: 'Dashboard', href: '/dashboard', description: 'Pipeline numbers and recent activity.' },
  { id: 'crm', label: 'CRM', href: '/crm', description: 'All leads, import, edit and assign.' },
  { id: 'targeting', label: 'Targeting', href: '/targeting', description: 'Lead pages with AI research and scripts.' },
  { id: 'dialer', label: 'Dialer', href: '/dialer', description: 'Call leads with the AI coach.' },
  { id: 'sms', label: 'SMS', href: '/sms', description: 'Texts on the workspace numbers.' },
  { id: 'calendar', label: 'Calendar', href: '/calendar', description: 'Meetings and call-backs.' },
  { id: 'scraper', label: 'Lead scraper', href: '/scraper', description: 'Find new leads (uses the plan allowance).' },
  { id: 'outreach', label: 'Outreach', href: '/outreach', description: 'Email autopilot, drafts and replies.' },
  { id: 'status', label: 'Status', href: '/status', description: 'Where every lead is in the sequence.' },
  { id: 'setup', label: 'Sales setup', href: '/setup', description: 'Inbox, sales profile and scripts.' },
  { id: 'team', label: 'Team', href: '/team', description: 'Teammates and phone numbers.' },
  { id: 'billing', label: 'Plan & billing', href: '/billing', description: 'Plan, usage and invoices.' },
]

/** What a new member or viewer gets until an admin changes it: the day-to-day sales pages. */
export const DEFAULT_MEMBER_PAGES: PageId[] = ['dashboard', 'crm', 'targeting', 'dialer', 'sms', 'calendar']

const ALL_PAGES = PAGES.map((page) => page.id)

export function isPageId(value: string): value is PageId {
  return (ALL_PAGES as string[]).includes(value)
}

export function allowedPages(role: MemberRole, pageAccess: string[] | null | undefined): PageId[] {
  if (role === 'owner' || role === 'admin') return ALL_PAGES
  return (pageAccess ?? DEFAULT_MEMBER_PAGES).filter(isPageId)
}

export function canSeePage(role: MemberRole, pageAccess: string[] | null | undefined, page: PageId) {
  return allowedPages(role, pageAccess).includes(page)
}

/** Where to send someone who opened a page they can't see. */
export function homeFor(role: MemberRole, pageAccess: string[] | null | undefined) {
  const first = allowedPages(role, pageAccess)[0]
  return first ? PAGES.find((page) => page.id === first)!.href : '/settings'
}
