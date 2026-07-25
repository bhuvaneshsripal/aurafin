// One-time-code flow used to reset the App Lock PIN when someone forgets it.
// The code is generated on the device, emailed to the signed-in user's own
// address via EmailJS (a client-side email API — no backend server needed),
// and verified locally before the PIN can be changed.

const OTP_KEY = 'aurafin-pin-reset-otp';
const OTP_TTL_MS = 10 * 60_000; // 10 minutes

const EMAILJS_SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID as string | undefined;
const EMAILJS_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID as string | undefined;
const EMAILJS_PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY as string | undefined;

export function isOtpEmailConfigured() {
  return !!(EMAILJS_SERVICE_ID && EMAILJS_TEMPLATE_ID && EMAILJS_PUBLIC_KEY);
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function sendPinResetOtp(email: string) {
  if (!isOtpEmailConfigured()) {
    throw new Error(
      'Email sending isn\u2019t set up yet. Add EmailJS credentials to your .env file (see .env.example) to enable OTP emails.'
    );
  }

  const code = generateCode();
  const expiresAt = Date.now() + OTP_TTL_MS;
  sessionStorage.setItem(OTP_KEY, JSON.stringify({ code, email, expiresAt }));

  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: EMAILJS_SERVICE_ID,
      template_id: EMAILJS_TEMPLATE_ID,
      user_id: EMAILJS_PUBLIC_KEY,
      template_params: {
        to_email: email,
        otp_code: code,
        expires_in: '10 minutes',
      },
    }),
  });

  if (!res.ok) {
    throw new Error('Could not send the reset email. Please try again in a moment.');
  }
}

// Shared Access invite email — reuses the same EmailJS account as the PIN
// reset flow above, but points at its own template (so the wording can say
// "X invited you to Aurafin" instead of "here's your OTP"). Add
// VITE_EMAILJS_INVITE_TEMPLATE_ID to .env with a template that expects
// {{to_email}}, {{inviter_email}}, {{role}} variables.
const EMAILJS_INVITE_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_INVITE_TEMPLATE_ID as
  | string
  | undefined;

export function isInviteEmailConfigured() {
  return !!(EMAILJS_SERVICE_ID && EMAILJS_INVITE_TEMPLATE_ID && EMAILJS_PUBLIC_KEY);
}

export async function sendSharedAccessInvite(params: {
  inviteeEmail: string;
  inviterEmail: string;
  role: 'view' | 'full';
}) {
  if (!isInviteEmailConfigured()) {
    throw new Error(
      'Invite emails aren\u2019t set up yet. Add VITE_EMAILJS_INVITE_TEMPLATE_ID (and the other EmailJS variables) to your .env file \u2014 see .env.example.'
    );
  }

  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: EMAILJS_SERVICE_ID,
      template_id: EMAILJS_INVITE_TEMPLATE_ID,
      user_id: EMAILJS_PUBLIC_KEY,
      template_params: {
        to_email: params.inviteeEmail,
        inviter_email: params.inviterEmail,
        role: params.role === 'full' ? 'Full Access' : 'View Only',
      },
    }),
  });

  if (!res.ok) {
    throw new Error('Could not send the invite email. Please try again in a moment.');
  }
}

export function verifyPinResetOtp(email: string, code: string): boolean {
  const raw = sessionStorage.getItem(OTP_KEY);
  if (!raw) return false;
  try {
    const stored = JSON.parse(raw) as { code: string; email: string; expiresAt: number };
    if (stored.email !== email) return false;
    if (Date.now() > stored.expiresAt) return false;
    if (stored.code !== code) return false;
    sessionStorage.removeItem(OTP_KEY);
    return true;
  } catch {
    return false;
  }
}
