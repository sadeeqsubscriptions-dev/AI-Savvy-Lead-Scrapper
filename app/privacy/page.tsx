import type { Metadata } from 'next'
import { LegalPage } from '@/components/landing/legal-page'
import { APP_NAME, COMPANY_NAME, SUPPORT_EMAIL } from '@/lib/constants'

export const metadata: Metadata = { title: 'Privacy policy' }

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="October 15, 2026">
      <section>
        <p>
          This policy explains what {COMPANY_NAME} (“we”) collects when you use {APP_NAME}, why, and who we share it with.
          Questions: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </p>
      </section>
      <section>
        <h2>What we collect</h2>
        <ul>
          <li><strong>Account details:</strong> your name, email, workspace name and team members.</li>
          <li><strong>Your leads and pipeline:</strong> businesses you find or import, notes, statuses, meetings and the emails sent and received through the app.</li>
          <li><strong>Connected inbox:</strong> the address you connect and either an app password or a sign-in token from Google or Microsoft. These are stored encrypted and used only to send your emails and read replies to them.</li>
          <li><strong>Calls:</strong> who you called, when and for how long, and a live transcript used by the AI coach and the call summary. Calls are not recorded as audio.</li>
          <li><strong>Billing:</strong> your plan and usage. Card details are handled by Stripe and never reach our servers.</li>
        </ul>
      </section>
      <section>
        <h2>Where leads come from</h2>
        <p>
          The lead scraper collects publicly listed business information (for example Google Maps listings and the contact
          details a business publishes on its own website). You are responsible for how you contact the businesses you
          find, including following anti-spam laws such as CAN-SPAM. Every email the app sends carries an unsubscribe header, and a
          reply asking to stop ends the email sequence for that business.
        </p>
      </section>
      <section>
        <h2>Services we use</h2>
        <ul>
          <li>Supabase: database and sign-in</li>
          <li>Vercel: hosting</li>
          <li>Anthropic (Claude): AI research, emails and the call coach</li>
          <li>Twilio: phone numbers, calls and live transcription</li>
          <li>Apify, Google and SerpApi: finding public business listings</li>
          <li>Stripe: payments</li>
        </ul>
        <p className="mt-3">We don’t sell your data, and we don’t use your leads or emails to train AI models.</p>
      </section>
      <section>
        <h2>Keeping and deleting data</h2>
        <p>
          We keep your data while your account is open. Workspace owners can delete all leads and history from Settings →
          Data, and disconnect the inbox at any time. To close your account and erase everything, email{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </p>
      </section>
      <section>
        <h2>Changes</h2>
        <p>If we change this policy in a meaningful way, we’ll tell workspace owners by email before it takes effect.</p>
      </section>
    </LegalPage>
  )
}
