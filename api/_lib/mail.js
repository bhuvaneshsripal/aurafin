// Sends email from the server over SMTP (works with a Gmail app password, Brevo, Zoho, etc.).
//
// Vercel environment variables:
//   SMTP_USER   the mailbox that sends, e.g. yourname@gmail.com
//   SMTP_PASS   its password. For Gmail use an "App password" (Google Account > Security >
//               2-Step Verification > App passwords), not your normal password.
//   SMTP_HOST   optional, default smtp.gmail.com
//   SMTP_PORT   optional, default 465
//   MAIL_FROM   optional display sender, default "Aurafin <SMTP_USER>"
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

export async function sendMail({ to, subject, html, text }) {
  const user = clean(process.env.SMTP_USER);
  const from = clean(process.env.MAIL_FROM) || `Aurafin <${user}>`;
  await getTransport().sendMail({ from, to, subject, html, text });
}
