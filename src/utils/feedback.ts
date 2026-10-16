/**
 * Sends in-app feedback straight to the owner's inbox through EmailJS (the
 * same service already used for PIN-reset and invite emails — no backend
 * needed). Requires a feedback template in EmailJS with the variables
 * {{message}}, {{from_name}}, {{from_email}} and {{page}}, and its ID in
 * VITE_EMAILJS_FEEDBACK_TEMPLATE_ID. In the EmailJS template, set "To Email"
 * to sribhuvi6264@gmail.com.
 */
const SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID as string | undefined;
const TEMPLATE_ID = import.meta.env.VITE_EMAILJS_FEEDBACK_TEMPLATE_ID as string | undefined;
const PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY as string | undefined;

export function isFeedbackConfigured(): boolean {
  return Boolean(SERVICE_ID && TEMPLATE_ID && PUBLIC_KEY);
}

export async function sendFeedback(params: {
  message: string;
  fromName: string;
  fromEmail: string;
}) {
  if (!isFeedbackConfigured()) {
    throw new Error(
      'Feedback isn\u2019t set up yet. Add VITE_EMAILJS_FEEDBACK_TEMPLATE_ID to your .env file \u2014 see .env.example.'
    );
  }
  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: SERVICE_ID,
      template_id: TEMPLATE_ID,
      user_id: PUBLIC_KEY,
      template_params: {
        message: params.message,
        from_name: params.fromName || 'Aurafin user',
        from_email: params.fromEmail || 'not available',
        page: typeof window !== 'undefined' ? window.location.pathname : '',
      },
    }),
  });
  if (!res.ok) {
    throw new Error('Could not send your feedback. Please try again in a moment.');
  }
}
