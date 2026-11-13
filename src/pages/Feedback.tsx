import { useState } from 'react';
import { CheckCircle2, MessageSquarePlus, Send } from 'lucide-react';
import { Button, Card, Field, PageHeader, Textarea } from '../components/ui';
import { useAuthStore } from '../store/authStore';
import { sendFeedback } from '../utils/feedback';

const MAX = 1000;

export default function Feedback() {
  const user = useAuthStore((s) => s.user);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    const text = message.trim();
    if (!text || sending) return;
    setSending(true);
    setError('');
    try {
      await sendFeedback({
        message: text,
        fromName: user?.displayName ?? '',
        fromEmail: user?.email ?? '',
        uid: user?.uid,
        isGuest: user?.isAnonymous === true,
      });
      setSent(true);
      setMessage('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Feedback" description="Tell us what's working, and what isn't." />

      <Card padding="lg" className="space-y-4 max-w-xl">
        {sent ? (
          <div className="flex flex-col items-center text-center py-4">
            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary-ink">
              <CheckCircle2 size={24} />
            </span>
            <p className="text-[15px] font-semibold text-ink">Thank you!</p>
            <p className="mt-1 text-sm text-muted">Your feedback has been sent to the developer.</p>
            <Button className="mt-5" variant="secondary" onClick={() => setSent(false)}>
              Send another
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 text-ink">
              <MessageSquarePlus size={18} className="text-primary-ink" />
              <span className="text-sm font-semibold">Share your thoughts</span>
            </div>
            <Field label="Your message" required>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, MAX))}
                rows={5}
                placeholder="What should we build or fix next?"
              />
            </Field>
            <p className="-mt-2 text-right text-xs text-faint">
              {message.length}/{MAX}
            </p>
            {error && <p className="text-sm text-negative">{error}</p>}
            <Button onClick={submit} loading={sending} disabled={!message.trim()} leftIcon={<Send size={15} />}>
              Send feedback
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
