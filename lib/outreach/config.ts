/**
 * What AI Savvy sells, who signs the emails, and the follow-up cadence.
 * The service list mirrors https://aisavvy.us/ — update it here when the site
 * changes and every generated email picks it up.
 */

export const COMPANY = {
  name: 'AI Savvy',
  website: 'https://aisavvy.us',
  bookingUrl: 'https://calendly.com/ydg7780/free-15-min-consultation',
  positioning:
    'Practical AI for real businesses: AI systems that save time, cut repetitive work, and help a team do more without adding headcount. Not theory, not hype — hands-on implementation, step by step, until it actually works.',
  founder:
    'Yossi Goldstein, AI implementation consultant with 22+ years of software experience. A business advisor who understands AI deeply, not a software vendor.',
  services: [
    {
      name: 'AI Consulting & Implementation',
      pitch: 'Find where time is lost and put practical AI to work, starting with the team and what the business already knows.',
    },
    {
      name: 'AI Chatbots (website + WhatsApp)',
      pitch: 'An assistant that answers customers instantly, books appointments, and qualifies leads 24/6, in any language — even after hours.',
    },
    {
      name: 'Voice AI',
      pitch: 'Answers phone calls and routes them automatically, around the clock.',
    },
    {
      name: 'Automation & CRM',
      pitch: 'A CRM built around how they sell, lead routing and nurturing, workflow automation, and internal systems made for the way the business runs.',
    },
    {
      name: 'Websites & Apps',
      pitch: 'Professional business websites, landing pages and web apps, designed and built end to end.',
    },
    {
      name: 'AI Training for Teams',
      pitch: 'A hands-on day where the team learns to use AI on the work they actually do.',
    },
    {
      name: 'Monthly Retainer (dedicated AI developer)',
      pitch: 'One expert who learns the business and keeps building what is needed: automations, CRM, websites and internal tools.',
    },
    {
      name: 'AI Videos for Business',
      pitch: 'Ads, product and training videos with an AI presenter. No crew, no studio.',
    },
  ],
} as const

/**
 * Days to wait before each follow-up, counted from the previous email. Two
 * entries = one first email + two follow-ups. After the last one the thread is
 * marked completed.
 */
export const FOLLOW_UP_DELAYS_DAYS = [3, 5]

export const TOTAL_STEPS = FOLLOW_UP_DELAYS_DAYS.length + 1

/** Bounds for the per-workspace "new leads per day" setting. */
export const DAILY_NEW_MIN = 1
export const DAILY_NEW_MAX = 100

export function clampDailyNew(value: number | null | undefined) {
  const fallback = Number(process.env.OUTREACH_DAILY_NEW) || 25
  const n = Number.isFinite(value) && value ? Math.round(value) : fallback
  return Math.min(DAILY_NEW_MAX, Math.max(DAILY_NEW_MIN, n))
}

export function senderConfig() {
  return {
    name: process.env.OUTREACH_SENDER_NAME || 'The AI Savvy team',
    title: process.env.OUTREACH_SENDER_TITLE || 'AI Savvy',
    postalAddress: process.env.OUTREACH_POSTAL_ADDRESS || null,
    // New leads emailed per day (US Eastern day). The scheduler spreads them
    // through business hours.
    dailyNew: Number(process.env.OUTREACH_DAILY_NEW) || 25,
    // Safety cap on everything sent per day (first emails + follow-ups +
    // replies). Mail providers flag mailboxes that suddenly send in bulk.
    dailyLimit: Math.max(Number(process.env.OUTREACH_DAILY_LIMIT) || 0, (Number(process.env.OUTREACH_DAILY_NEW) || 25) * 2),
  }
}
