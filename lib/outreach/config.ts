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

/** How many leads one "Send to all" click handles, so the request fits the 300s limit. */
export const BATCH_SIZE = 8

export function senderConfig() {
  return {
    name: process.env.OUTREACH_SENDER_NAME || 'The AI Savvy team',
    title: process.env.OUTREACH_SENDER_TITLE || 'AI Savvy',
    postalAddress: process.env.OUTREACH_POSTAL_ADDRESS || null,
    // Mail providers flag new mailboxes that suddenly send cold email in bulk
    // (Zoho can suspend outgoing mail). Start low and raise it as replies come in.
    dailyLimit: Number(process.env.OUTREACH_DAILY_LIMIT) || 25,
  }
}
