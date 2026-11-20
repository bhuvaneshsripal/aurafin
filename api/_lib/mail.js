// Sends email from the server over SMTP (works with a Gmail app password, Brevo, Zoho, etc.).
//
// Vercel environment variables:
//   SMTP_USER   the mailbox that sends, e.g. yourname@gmail.com
//   SMTP_PASS   its password. For Gmail use an "App password" (Google Account > Security >
//               2-Step Verification > App passwords), not your normal password.
//   SMTP_HOST   optional, default smtp.gmail.com
//   SMTP_PORT   optional, default 465
//   MAIL_FROM   optional sender address, default SMTP_USER. The display name is always "Aurafin".
//
// To send as aurafinsupport@gmail.com, set SMTP_USER to that address and SMTP_PASS to its app
// password. (Gmail always sends from the logged-in mailbox, so the address and SMTP_USER must match.)
import nodemailer from 'nodemailer';

const clean = (v) => String(v ?? '').trim().replace(/^(['"`])([\s\S]*)\1$/, '$2').trim();

export function mailConfigured() {
  return !!(clean(process.env.SMTP_USER) && clean(process.env.SMTP_PASS));
}

let transport;
function getTransport() {
  if (transport) return transport;
  const port = Number(clean(process.env.SMTP_PORT)) || 465;
  transport = nodemailer.createTransport({
    host: clean(process.env.SMTP_HOST) || 'smtp.gmail.com',
    port,
    secure: port === 465,
    // Google shows app passwords in groups of four with spaces; they must be removed.
    auth: { user: clean(process.env.SMTP_USER), pass: clean(process.env.SMTP_PASS).replace(/\s+/g, '') },
  });
  return transport;
}

const SUPPORT_EMAIL = 'aurafinsupport@gmail.com';

// Pulls just the address out of "Name <a@b.com>" or "a@b.com".
const addressOf = (v) => (String(v).match(/<([^>]+)>/)?.[1] ?? String(v)).trim();

export async function sendMail({ to, subject, html, text }) {
  const user = clean(process.env.SMTP_USER);
  const address = addressOf(clean(process.env.MAIL_FROM) || user);
  await getTransport().sendMail({
    // Inbox shows "Aurafin" as the sender name.
    from: { name: 'Aurafin', address },
    // Replies go to the support inbox.
    replyTo: { name: 'Aurafin', address: SUPPORT_EMAIL },
    to,
    subject,
    html,
    text,
  });
}
