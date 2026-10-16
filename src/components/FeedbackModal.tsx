import { useState } from 'react';
import Modal from './Modal';
import { useAuthStore } from '../store/authStore';
import { sendFeedback } from '../utils/feedback';

export default function FeedbackModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user = useAuthStore((s) => s.user);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const close = () => {
    onClose();
    // Reset after the close so reopening starts fresh.
    setTimeout(() => {
      setMessage('');
      setSent(false);
      setError('');
    }, 200);
  };

  const submit = async () => {
    const text = message.trim();
    if (!text) return;
    setSending(true);
    setError('');
    try {
      await sendFeedback({
        message: text,
        fromName: user?.displayName ?? '',
        fromEmail: user?.email ?? '',
      });
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title="Send feedback">
      {sent ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Thank you! Your feedback has been sent.</p>
          <button
            type="button"
            onClick={close}
            className="h-10 px-4 rounded-lg bg-brand-600 text-white text-sm font-medium hover:opacity-90"
          >
            Done
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Found a bug or have an idea? Tell us — it goes straight to the developer.
          </p>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            maxLength={2000}
            placeholder="Type your feedback here…"
            className="w-full rounded-lg border border-line bg-surface p-3 text-sm text-ink outline-none focus:border-brand-600"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={close}
              className="h-10 px-4 rounded-lg border border-line text-sm font-medium text-slate-600 hover:bg-surface-hover"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={sending || !message.trim()}
              className="h-10 px-4 rounded-lg bg-brand-600 text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
