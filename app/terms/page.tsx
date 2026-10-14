import type { Metadata } from 'next'
import { LegalPage } from '@/components/landing/legal-page'
import { APP_NAME, COMPANY_NAME, SUPPORT_EMAIL } from '@/lib/constants'

export const metadata: Metadata = { title: 'Terms of service' }

export default function TermsPage() {
  return (
    <LegalPage title="Terms of service" updated="October 15, 2026">
      <section>
        <p>
          These terms cover your use of {APP_NAME}, provided by {COMPANY_NAME}. By creating an account you agree to them.
          Questions: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </p>
      </section>
      <section>
        <h2>Plans and billing</h2>
        <ul>
          <li>The Free plan costs nothing and has the limits shown on the pricing page.</li>
          <li>Paid plans are billed monthly in advance through Stripe and renew until cancelled.</li>
          <li>Monthly allowances (leads found, AI-worked leads, call minutes) reset each billing period and don’t roll over.</li>
          <li>Top-ups are one-time purchases for the current period.</li>
          <li>You can cancel at any time from the billing page; the plan stays active until the end of the paid period. Fees already paid are not refunded unless required by law.</li>
          <li>If a payment fails, premium features pause until the card is updated. Your data is kept.</li>
        </ul>
      </section>
      <section>
        <h2>Phone numbers</h2>
        <p>
          Growth and Pro include a US phone number for as long as the plan is active. If you cancel or move to a plan without
          calling, the number is released and may not be recoverable.
        </p>
      </section>
      <section>
        <h2>Acceptable use</h2>
        <ul>
          <li>Contact businesses only for legitimate business purposes, and follow the laws that apply to you, including CAN-SPAM, TCPA and local calling rules.</li>
          <li>Honour opt-out requests promptly. Don’t send to people who asked not to be contacted.</li>
          <li>Don’t use the service for spam, harassment, fraud or anything illegal, and don’t try to get around plan limits.</li>
          <li>You are responsible for the content sent from your inbox and phone number, including AI-written drafts you approve or let the autopilot send.</li>
        </ul>
        <p className="mt-3">We may suspend accounts that break these rules or put our sending and calling providers at risk.</p>
      </section>
      <section>
        <h2>Your data</h2>
        <p>
          You own your leads, notes and emails. We process them only to run the service, as described in the{' '}
          <a href="/privacy">privacy policy</a>.
        </p>
      </section>
      <section>
        <h2>The service</h2>
        <p>
          We work hard to keep the service available and accurate, but it is provided “as is”. AI-written content and
          scraped business details can contain mistakes, so review what matters before relying on it. To the extent the law
          allows, our total liability is limited to the fees you paid in the three months before the claim.
        </p>
      </section>
      <section>
        <h2>Changes</h2>
        <p>We may update these terms. If a change is significant, we’ll email workspace owners before it takes effect.</p>
      </section>
    </LegalPage>
  )
}
