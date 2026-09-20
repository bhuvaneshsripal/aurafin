import { useState } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import { Button, Card, Field, PageHeader, Textarea } from '../components/ui';

export default function Feedback() {
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);

  const submit = () => {
    if (!message.trim()) return;
    setSent(true);
    setMessage('');
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Feedback" description="Tell us what's working, and what isn't." />

      <Card padding="lg" className="space-y-4 max-w-xl">
        <div className="flex items-center gap-2 text-ink">
          <MessageSquarePlus size={18} className="text-primary-ink" />
          <span className="text-sm font-semibold">Share your thoughts</span>
        </div>
        <Field label="Your message">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            placeholder="What should we build or fix next?"
          />
        </Field>
        <Button onClick={submit}>Send feedback</Button>
        {sent && <p className="text-sm text-positive">Thanks — we got your feedback!</p>}
      </Card>
    </div>
  );
}
