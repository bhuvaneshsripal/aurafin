import type { ReactNode } from 'react';

// ⚠️ Replace with the address people should write to about their data.
const CONTACT_EMAIL = 'your-email@example.com';
const UPDATED = '24 October 2026';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-ink mb-2">{title}</h2>
      <div className="space-y-2 text-[15px] leading-relaxed text-ink-2">{children}</div>
    </section>
  );
}

function Privacy() {
  return (
    <>
      <p className="text-ink-2 text-[15px] leading-relaxed">
        Aurafin is a personal net worth and portfolio tracker. This policy explains what information
        the app handles and why.
      </p>
      <Section title="Information we collect">
        <ul className="list-disc pl-5 space-y-1">
          <li><b>Account details</b> — when you sign in with Google or email: your name, email address and profile photo.</li>
          <li><b>Financial data you enter</b> — assets, liabilities, goals, transactions, budgets and similar entries you add yourself. We never ask for bank passwords or connect to your bank accounts.</li>
          <li><b>Preferences</b> — settings such as theme, currency, notifications and app lock.</li>
          <li><b>Usage and device data</b> — basic analytics and diagnostics (for example, pages used and errors) to keep the app working.</li>
        </ul>
      </Section>
      <Section title="How we use it">
        <p>
          To sign you in, store and sync your data across your devices, show your portfolio value and
          analytics, send notifications and digests you turn on, and improve reliability. We do not sell
          your personal or financial data and do not use it for advertising.
        </p>
      </Section>
      <Section title="Services that process data">
        <p>
          Aurafin uses Google Firebase (Authentication, Firestore database, Analytics) to sign you in and
          store your data, Google Sign-In for login, and Vercel for hosting. Live market prices are fetched
          from public market data sources (such as NSE, Yahoo Finance and mfapi.in); requests for prices
          contain the symbols being looked up, not your identity or holdings values.
        </p>
      </Section>
      <Section title="Storage and security">
        <p>
          Your data is stored in your account in Firebase and protected by access rules so only you can read
          it. Some data is also cached on your device to work offline. No system is perfectly secure, so use
          a strong password and the app lock.
        </p>
      </Section>
      <Section title="Your choices">
        <p>
          You can edit or delete entries in the app at any time, and sign out whenever you like. To request a
          copy of your data or deletion of your account and all stored data, email{' '}
          <a className="text-brand-600 underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </Section>
      <Section title="Children">
        <p>Aurafin is not intended for children under 13, and we do not knowingly collect their data.</p>
      </Section>
      <Section title="Changes and contact">
        <p>
          We may update this policy and will change the date above when we do. Questions:{' '}
          <a className="text-brand-600 underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </Section>
    </>
  );
}

function Terms() {
  return (
    <>
      <p className="text-ink-2 text-[15px] leading-relaxed">
        By using Aurafin you agree to these terms. If you do not agree, please do not use the app.
      </p>
      <Section title="What Aurafin is">
        <p>
          Aurafin is a tool for tracking your own net worth, investments and budgets. It is provided for
          personal, informational use.
        </p>
      </Section>
      <Section title="Not financial advice">
        <p>
          Nothing in Aurafin is investment, tax or legal advice. Prices, valuations, projections and
          analytics may be delayed, estimated or inaccurate. Verify important figures with official sources
          and make your own decisions.
        </p>
      </Section>
      <Section title="Your account">
        <p>
          You are responsible for the accuracy of the data you enter and for keeping your account and device
          secure. Do not misuse the service, attempt to access other users' data, or disrupt the app.
        </p>
      </Section>
      <Section title="Availability and liability">
        <p>
          The app is provided “as is” without warranties. We may change or discontinue features at any time
          and, to the extent permitted by law, are not liable for losses arising from use of the app or
          reliance on its data.
        </p>
      </Section>
      <Section title="Privacy and contact">
        <p>
          See our <a className="text-brand-600 underline" href="/privacy">Privacy Policy</a> for how data is
          handled. Questions:{' '}
          <a className="text-brand-600 underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </Section>
    </>
  );
}

/** Public, signed-out-friendly /privacy and /terms pages (Google OAuth
 *  branding verification needs publicly reachable policy URLs). */
export default function LegalPage({ kind }: { kind: 'privacy' | 'terms' }) {
  return (
    <div className="min-h-screen bg-page">
      <header className="bg-surface border-b border-line">
        <div className="mx-auto max-w-3xl px-5 py-3 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2.5">
            <img src="/logo-icon.png" alt="" className="h-8 w-8 rounded-full" />
            <span className="font-brand text-ink text-2xl leading-none">
              Aurafin<span className="text-brand-500">.</span>
            </span>
          </a>
          <a href="/" className="text-sm font-medium text-brand-600">Back to app</a>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-10">
        <h1 className="text-3xl font-bold text-ink">{kind === 'privacy' ? 'Privacy Policy' : 'Terms of Service'}</h1>
        <p className="text-sm text-ink-2 mt-1 mb-6">Last updated {UPDATED}</p>
        {kind === 'privacy' ? <Privacy /> : <Terms />}
      </main>
    </div>
  );
}
