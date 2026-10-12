/**
 * When an email may go out: weekdays, 9:00-16:00 in the lead's own US time
 * zone, never on major US holidays. Pure functions, so the server (sending)
 * and the browser (showing "scheduled for…") agree.
 */

export const SEND_START_HOUR = 9
export const SEND_END_HOUR = 16
export const DEFAULT_TIMEZONE = 'America/New_York'

const STATE_ZONES: Record<string, string> = {
  AL: 'America/Chicago', AK: 'America/Anchorage', AZ: 'America/Phoenix', AR: 'America/Chicago',
  CA: 'America/Los_Angeles', CO: 'America/Denver', CT: 'America/New_York', DE: 'America/New_York',
  DC: 'America/New_York', FL: 'America/New_York', GA: 'America/New_York', HI: 'Pacific/Honolulu',
  ID: 'America/Boise', IL: 'America/Chicago', IN: 'America/Indiana/Indianapolis', IA: 'America/Chicago',
  KS: 'America/Chicago', KY: 'America/New_York', LA: 'America/Chicago', ME: 'America/New_York',
  MD: 'America/New_York', MA: 'America/New_York', MI: 'America/Detroit', MN: 'America/Chicago',
  MS: 'America/Chicago', MO: 'America/Chicago', MT: 'America/Denver', NE: 'America/Chicago',
  NV: 'America/Los_Angeles', NH: 'America/New_York', NJ: 'America/New_York', NM: 'America/Denver',
  NY: 'America/New_York', NC: 'America/New_York', ND: 'America/Chicago', OH: 'America/New_York',
  OK: 'America/Chicago', OR: 'America/Los_Angeles', PA: 'America/New_York', RI: 'America/New_York',
  SC: 'America/New_York', SD: 'America/Chicago', TN: 'America/Chicago', TX: 'America/Chicago',
  UT: 'America/Denver', VT: 'America/New_York', VA: 'America/New_York', WA: 'America/Los_Angeles',
  WV: 'America/New_York', WI: 'America/Chicago', WY: 'America/Denver', PR: 'America/Puerto_Rico',
}

const STATE_NAMES: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO',
  connecticut: 'CT', delaware: 'DE', 'district of columbia': 'DC', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY',
  louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN',
  mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH',
  'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND',
  ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI',
  'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
  'puerto rico': 'PR',
}

// Big cities scraped without a state.
const CITY_ZONES: Record<string, string> = {
  'los angeles': 'America/Los_Angeles', 'san francisco': 'America/Los_Angeles', 'san diego': 'America/Los_Angeles',
  seattle: 'America/Los_Angeles', portland: 'America/Los_Angeles', 'las vegas': 'America/Los_Angeles',
  phoenix: 'America/Phoenix', denver: 'America/Denver', 'salt lake city': 'America/Denver',
  chicago: 'America/Chicago', houston: 'America/Chicago', dallas: 'America/Chicago', austin: 'America/Chicago',
  'san antonio': 'America/Chicago', 'new orleans': 'America/Chicago', nashville: 'America/Chicago',
  minneapolis: 'America/Chicago', 'kansas city': 'America/Chicago', 'st. louis': 'America/Chicago',
  honolulu: 'Pacific/Honolulu', anchorage: 'America/Anchorage',
}

/** Best guess of the lead's time zone from its location fields; US Eastern if unknown. */
export function leadTimezone(lead: { location?: string | null; city?: string | null; country?: string | null }) {
  const text = [lead.location, lead.city, lead.country].filter(Boolean).join(', ')
  if (!text) return DEFAULT_TIMEZONE
  const lower = text.toLowerCase()

  // "Miami, FL" / "Austin TX 78701" — a two-letter code after a comma or space at the end.
  const code = text.match(/(?:,|\s)\s*([A-Z]{2})(?:\s+\d{5})?\s*(?:,\s*(?:US|USA|United States))?\s*$/)
  if (code && STATE_ZONES[code[1]]) return STATE_ZONES[code[1]]
  if (/^[A-Za-z]{2}$/.test(text.trim()) && STATE_ZONES[text.trim().toUpperCase()]) {
    return STATE_ZONES[text.trim().toUpperCase()]
  }

  // Longest names first so "west virginia" beats "virginia".
  for (const name of Object.keys(STATE_NAMES).sort((a, b) => b.length - a.length)) {
    if (new RegExp(`\\b${name}\\b`).test(lower)) return STATE_ZONES[STATE_NAMES[name]]
  }
  for (const [city, zone] of Object.entries(CITY_ZONES)) {
    if (lower.includes(city)) return zone
  }
  return DEFAULT_TIMEZONE
}

type LocalParts = { year: number; month: number; day: number; weekday: number; hour: number; minute: number }

function localParts(date: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    weekday: weekdays.indexOf(get('weekday')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
  }
}

/** nth weekday (0=Sun) of a month; n = -1 for the last one. */
function nthWeekday(year: number, month: number, weekday: number, n: number) {
  if (n > 0) {
    const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
    return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7
  }
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const last = new Date(Date.UTC(year, month - 1, lastDay)).getUTCDay()
  return lastDay - ((last - weekday + 7) % 7)
}

function isHoliday({ year, month, day }: LocalParts) {
  const thanksgiving = nthWeekday(year, 11, 4, 4)
  return (
    (month === 1 && day === 1) ||
    (month === 5 && day === nthWeekday(year, 5, 1, -1)) || // Memorial Day
    (month === 7 && day === 4) ||
    (month === 9 && day === nthWeekday(year, 9, 1, 1)) || // Labor Day
    (month === 11 && (day === thanksgiving || day === thanksgiving + 1)) ||
    (month === 12 && (day === 24 || day === 25 || day === 31))
  )
}

/** Is now a good moment to land in this lead's inbox? */
export function inSendWindow(timeZone: string, now = new Date()) {
  const local = localParts(now, timeZone)
  if (local.weekday === 0 || local.weekday === 6) return false
  if (isHoliday(local)) return false
  return local.hour >= SEND_START_HOUR && local.hour < SEND_END_HOUR
}

/** Start of the next sending window (now, if it's open). */
export function nextSendWindow(timeZone: string, now = new Date()) {
  if (inSendWindow(timeZone, now)) return now
  const step = 15 * 60 * 1000
  const probe = new Date(Math.ceil(now.getTime() / step) * step)
  for (let i = 0; i < 4 * 24 * 10; i++) {
    if (inSendWindow(timeZone, probe)) return probe
    probe.setTime(probe.getTime() + step)
  }
  return probe
}

/** "Mon 9:00 AM EDT" in the lead's own zone. */
export function describeSendTime(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date)
}

/** Midnight today in US Eastern, as a Date: the daily cap resets then. */
export function startOfEasternDay(now = new Date()) {
  const local = localParts(now, DEFAULT_TIMEZONE)
  const minutesIntoDay = local.hour * 60 + local.minute
  const start = new Date(now.getTime() - minutesIntoDay * 60 * 1000)
  start.setUTCSeconds(0, 0)
  return start
}

/** The scheduler runs at :00, :15, :30 and :45. First run at or after `date`. */
export function nextRunSlot(date: Date) {
  const step = 15 * 60 * 1000
  return new Date(Math.ceil(date.getTime() / step) * step)
}

/** When a follow-up due at `dueAt` actually goes out: next run inside the lead's hours. */
export function followUpEta(timeZone: string, dueAt: Date, now = new Date()) {
  const from = dueAt.getTime() > now.getTime() ? dueAt : now
  return nextRunSlot(nextSendWindow(timeZone, nextRunSlot(from)))
}

/**
 * Replays the scheduler to estimate when each lead's first email goes out:
 * a run every 15 minutes, `perRun` emails per run, in the given order, only
 * inside each lead's business hours, at most `dailyNew` per US Eastern day.
 */
export function estimateFirstSends(
  items: { id: string; timeZone: string }[],
  { perRun, dailyNew, sentToday, now = new Date() }: { perRun: number; dailyNew: number; sentToday: number; now?: Date },
) {
  const etas = new Map<string, Date>()
  const pending = [...items]
  const step = 15 * 60 * 1000
  let slot = nextRunSlot(new Date(now.getTime() + 1000))
  let day = startOfEasternDay(slot).getTime()
  let sentThisDay = sentToday

  for (let i = 0; i < 4 * 24 * 21 && pending.length > 0; i++, slot = new Date(slot.getTime() + step)) {
    const slotDay = startOfEasternDay(slot).getTime()
    if (slotDay !== day) {
      day = slotDay
      sentThisDay = 0
    }
    const budget = Math.min(perRun, dailyNew - sentThisDay)
    if (budget <= 0) continue

    // Check each time zone once per run, not once per lead.
    const open = new Map<string, boolean>()
    const isOpen = (zone: string) => {
      if (!open.has(zone)) open.set(zone, inSendWindow(zone, slot))
      return open.get(zone)!
    }

    let sent = 0
    for (let j = 0; j < pending.length && sent < budget; ) {
      if (isOpen(pending[j].timeZone)) {
        etas.set(pending[j].id, slot)
        pending.splice(j, 1)
        sent++
      } else {
        j++
      }
    }
    sentThisDay += sent
  }
  return etas
}

/** Offset of `timeZone` from UTC at `date`, in minutes (EDT = -240). */
function zoneOffsetMinutes(timeZone: string, date: Date) {
  const local = localParts(date, timeZone)
  const asUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute)
  return Math.round((asUtc - Math.floor(date.getTime() / 60000) * 60000) / 60000)
}

/** "2026-10-14T15:00" typed as the lead's wall-clock time → ISO instant. */
export function zonedInputToIso(value: string, timeZone: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)
  if (!match) return null
  const [, y, mo, d, h, mi] = match.map(Number)
  const guess = new Date(Date.UTC(y, mo - 1, d, h, mi))
  // Two passes settle the offset across a daylight-saving change.
  let instant = new Date(guess.getTime() - zoneOffsetMinutes(timeZone, guess) * 60000)
  instant = new Date(guess.getTime() - zoneOffsetMinutes(timeZone, instant) * 60000)
  return instant.toISOString()
}

/** ISO instant → "2026-10-14T15:00" in the lead's wall-clock time (for <input type="datetime-local">). */
export function isoToZonedInput(iso: string, timeZone: string) {
  const local = localParts(new Date(iso), timeZone)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${local.year}-${pad(local.month)}-${pad(local.day)}T${pad(local.hour)}:${pad(local.minute)}`
}

/** Short zone label for the lead, e.g. "EDT". */
export function zoneAbbreviation(timeZone: string, date = new Date()) {
  return (
    new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' })
      .formatToParts(date)
      .find((part) => part.type === 'timeZoneName')?.value ?? timeZone
  )
}
