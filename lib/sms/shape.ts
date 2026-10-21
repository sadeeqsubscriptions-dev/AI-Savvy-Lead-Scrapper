import type { SmsMessage } from '@/lib/supabase/types'

/** Shapes shared by the SMS page and the server. Safe to import in the browser. */

/** Twilio's hard limit for one text (long ones are split into segments). */
export const SMS_MAX_LENGTH = 1600

export type SmsLeadRef = { id: string; full_name: string; company: string | null } | null
export type SmsMessageWithLead = SmsMessage & { lead: SmsLeadRef }
