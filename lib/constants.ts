import type { LeadStatus, MemberRole } from '@/lib/supabase/types'

export const APP_NAME = 'AI Savvy Leads Scrapper'

/** Shown on the landing page, legal pages and footer. Override with NEXT_PUBLIC_SUPPORT_EMAIL. */
export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'yossi@aisavvy.us'
export const COMPANY_NAME = 'AI Savvy'
export const COMPANY_URL = 'https://aisavvy.us'

export const LEAD_STATUSES: LeadStatus[] = [
  'New',
  'Contacted',
  'Qualified',
  'Proposal',
  'Won',
  'Lost',
]

/** Statuses that still count toward open pipeline. */
export const OPEN_STATUSES: LeadStatus[] = ['New', 'Contacted', 'Qualified', 'Proposal']

export const LEAD_SOURCES = [
  'Manual',
  'Website',
  'LinkedIn',
  'Apollo',
  'Referral',
  'Scraper',
  'Cold outreach',
  'Event',
  'Partner',
] as const

export const MEMBER_ROLES: { value: MemberRole; label: string; description: string }[] = [
  { value: 'owner', label: 'Owner', description: 'Full control, including billing and deletion.' },
  { value: 'admin', label: 'Admin', description: 'Manage teammates, settings, and all records.' },
  { value: 'member', label: 'Member', description: 'Create and edit leads, meetings, and scrapes.' },
  { value: 'viewer', label: 'Viewer', description: 'Read-only access to the workspace.' },
]

export const INDUSTRIES = [
  'SaaS',
  'AI',
  'Fintech',
  'Healthcare',
  'Commerce',
  'Logistics',
  'Legal',
  'Media',
  'Real Estate',
  'Education',
  'Manufacturing',
  'Professional Services',
] as const

export const PAGE_SIZE = 25
