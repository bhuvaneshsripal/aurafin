import { useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, MessageSquare, Send } from 'lucide-react';
import Modal from './Modal';
import { Button, Textarea } from './ui';
import { useAuthStore } from '../store/authStore';
import { isFeedbackConfigured, sendFeedback } from '../utils/feedback';

const MAX = 1000;

export default function FeedbackModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user = useAuthStore((s) => s.user);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  // Until the EmailJS feedback template is configured, show "Coming soon".
  // It switches to the real form automatically once the env var is set.
  const comingSoon = !isFeedbackConfigured();

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

  // Portaled to <body>: the sidebar is a sticky element with its own stacking
  // context, so rendering the modal inside it let the page content draw over
  // the dialog and left the top bar un-dimmed.
  return createPortal(
    <Modal open={open} onClose={close} title="Send feedback">
      {comingSoon ? (
        <div className="flex flex-col items-center text-center py-4">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary-ink">
            <MessageSquare size={22} />
          </span>
          <p className="text-[15px] font-semibold text-ink">Coming soon</p>
          <p className="mt-1 text-sm text-muted">Feedback will be available shortly.</p>
          <Button className="mt-5" variant="secondary" onClick={close}>
            Close
          </Button>
        </div>
      ) : sent ? (
        <div className="flex flex-col items-center text-center py-4">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary-ink">
            <CheckCircle2 size={24} />
          </span>
          <p className="text-[15px] font-semibold text-ink">Thank you!</p>
          <p className="mt-1 text-sm text-muted">Your feedback has been sent to the developer.</p>
          <Button className="mt-5" onClick={close}>
            Done
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl bg-surface-muted p-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-ink">
              <MessageSquare size={16} />
            </span>
            <p className="text-sm text-muted leading-relaxed">
              Found a bug or have an idea? Tell me.
            </p>
          </div>

          <div>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, MAX))}
              rows={5}
              placeholder="Type your feedback here…"
              autoFocus
            />
            <p className="mt-1 text-right text-xs text-faint">
              {message.length}/{MAX}
            </p>
          </div>

          {error && <p className="text-sm text-negative">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button
              onClick={submit}
              loading={sending}
              disabled={!message.trim()}
              leftIcon={<Send size={15} />}
            >
              Send
            </Button>
          </div>
        </div>
      )}
    </Modal>,
    document.body
  );
}
