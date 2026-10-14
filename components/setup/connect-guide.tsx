import { ExternalLink, Info } from 'lucide-react'

type Step = { text: React.ReactNode; link?: { label: string; href: string } }
type Guide = { title: string; steps: Step[]; note?: React.ReactNode }

const GUIDES: Record<string, Guide> = {
  gmail: {
    title: 'Connect Gmail or Google Workspace with an app password',
    steps: [
      {
        text: (
          <>
            Sign in to your Google Account and open <b>Security</b>.
          </>
        ),
        link: { label: 'Open Google security', href: 'https://myaccount.google.com/security' },
      },
      {
        text: (
          <>
            Under <b>How you sign in to Google</b>, turn on <b>2-Step Verification</b> and finish the setup. App passwords
            only appear once this is on.
          </>
        ),
      },
      {
        text: (
          <>
            Open <b>App passwords</b>, type a name such as <b>AI Savvy</b> and click <b>Create</b>.
          </>
        ),
        link: { label: 'Open app passwords', href: 'https://myaccount.google.com/apppasswords' },
      },
      {
        text: (
          <>
            Google shows a <b>16-letter password</b> in a yellow box. Copy it (spaces don’t matter).
          </>
        ),
      },
      {
        text: (
          <>
            Back here: enter your Gmail address, choose <b>Gmail / Google Workspace</b>, paste the app password and click{' '}
            <b>Test and connect</b>.
          </>
        ),
      },
    ],
    note: (
      <>
        Using a company Google Workspace address and don’t see App passwords? Your IT admin has turned them off. Use{' '}
        <b>Continue with Google</b> above if you see it, or ask your admin to allow app passwords.
      </>
    ),
  },
  outlook: {
    title: 'Connect Outlook, Hotmail or Microsoft 365',
    steps: [
      {
        text: (
          <>
            <b>Work or school address (Microsoft 365)?</b> Use <b>Continue with Microsoft</b> above if you see it — that’s
            the easiest way. Your IT admin may need to turn on <b>Authenticated SMTP</b> for your mailbox (Microsoft 365
            admin center → Users → Active users → your name → Mail → Manage email apps).
          </>
        ),
      },
      {
        text: (
          <>
            <b>Personal Outlook.com / Hotmail address:</b> open your Microsoft account <b>Security</b> page and choose{' '}
            <b>Advanced security options</b>.
          </>
        ),
        link: { label: 'Open Microsoft security', href: 'https://account.microsoft.com/security' },
      },
      {
        text: (
          <>
            Turn on <b>Two-step verification</b>, then under <b>App passwords</b> click <b>Create a new app password</b>.
          </>
        ),
        link: { label: 'Open app passwords', href: 'https://account.live.com/proofs/AppPassword' },
      },
      {
        text: (
          <>
            Copy the password Microsoft shows, then enter your address here, choose <b>Outlook / Microsoft 365</b>, paste it
            and click <b>Test and connect</b>.
          </>
        ),
      },
    ],
    note: (
      <>
        Microsoft is phasing out app passwords. If the test says the login was rejected, use <b>Continue with Microsoft</b>{' '}
        instead.
      </>
    ),
  },
  zoho: {
    title: 'Connect Zoho Mail',
    steps: [
      {
        text: (
          <>
            Sign in to Zoho Mail, click the <b>gear icon (Settings)</b> → <b>Mail Accounts</b> → your address →{' '}
            <b>IMAP</b>, tick <b>IMAP Access</b> and save. This lets us see replies.
          </>
        ),
        link: { label: 'Open Zoho Mail', href: 'https://mail.zoho.com/zm/#settings/all/mailaccounts' },
      },
      {
        text: (
          <>
            Open your Zoho account <b>Security</b> page → <b>App Passwords</b> → <b>Generate New Password</b>, name it{' '}
            <b>AI Savvy</b> and click <b>Generate</b>.
          </>
        ),
        link: { label: 'Open Zoho app passwords', href: 'https://accounts.zoho.com/home#security/app_password' },
      },
      {
        text: <>Copy the password Zoho shows (it’s only shown once).</>,
      },
      {
        text: (
          <>
            Back here: enter your address, choose <b>Zoho Mail</b>, pick the <b>data center</b> that matches the address you
            sign in at (zoho<b>.com</b> = United States, zoho<b>.eu</b> = Europe, zoho<b>.in</b> = India…), paste the
            password and click <b>Test and connect</b>.
          </>
        ),
      },
    ],
    note: <>Zoho’s Forever Free plan doesn’t include IMAP/SMTP. You need Mail Lite or higher.</>,
  },
  custom: {
    title: 'Connect any other mailbox (GoDaddy, Namecheap, Hostinger, cPanel…)',
    steps: [
      {
        text: (
          <>
            Search your email host’s help center for <b>“IMAP and SMTP settings”</b>. You need two server names: one for
            sending (SMTP) and one for reading (IMAP).
          </>
        ),
      },
      {
        text: (
          <>
            Fill in the <b>SMTP server</b> (often <code>smtp.yourhost.com</code> or <code>mail.yourdomain.com</code>) with port{' '}
            <b>465</b>, and the <b>IMAP server</b> with port <b>993</b>.
          </>
        ),
      },
      {
        text: (
          <>
            Use your email password, or an <b>app password</b> if your host has two-step login turned on.
          </>
        ),
      },
      { text: <>Click <b>Test and connect</b>. If it fails, the message says whether sending or reading was refused.</> },
    ],
  },
}

/** Numbered, provider-specific instructions shown under the inbox form. */
export function ConnectGuide({ provider }: { provider: string }) {
  const guide = GUIDES[provider] ?? GUIDES.custom
  return (
    <details open className="group rounded-xl border border-border bg-secondary/40 p-4 text-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-medium [&::-webkit-details-marker]:hidden">
        <span>Step-by-step: {guide.title}</span>
        <span className="text-xs text-muted-foreground group-open:hidden">Show</span>
        <span className="hidden text-xs text-muted-foreground group-open:inline">Hide</span>
      </summary>
      <ol className="mt-4 space-y-3">
        {guide.steps.map((step, index) => (
          <li key={index} className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-gradient-brand text-xs font-semibold text-white">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1 pt-0.5 text-[13px] leading-6 text-muted-foreground [&_b]:font-medium [&_b]:text-foreground [&_code]:rounded [&_code]:bg-card [&_code]:px-1 [&_code]:font-mono [&_code]:text-xs">
              {step.text}
              {step.link ? (
                <a
                  href={step.link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-2 inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-0.5 text-xs font-medium text-foreground transition hover:border-primary/40"
                >
                  {step.link.label} <ExternalLink className="size-3" />
                </a>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
      {guide.note ? (
        <p className="mt-4 flex gap-2 rounded-lg bg-card p-3 text-xs leading-5 text-muted-foreground [&_b]:font-medium [&_b]:text-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0 text-primary" />
          <span>{guide.note}</span>
        </p>
      ) : null}
      <p className="mt-3 text-xs text-muted-foreground">
        We test the login before saving and store it encrypted. Nothing is sent until you turn on the autopilot or send an
        email yourself, and you can disconnect at any time.
      </p>
    </details>
  )
}
