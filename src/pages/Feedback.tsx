import { useState } from 'react';
import { MessageSquarePlus } from 'lucide-react';

export default function Feedback() {
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);

  const submit = () => {
    if (!message.trim()) return;
    setSent(true);
    setMessage('');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Feedback</h1>
        <p className="text-slate-500 text-base mt-1">Tell us what's working, and what isn't.</p>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 max-w-xl">
        <div className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
          <MessageSquarePlus size={20} className="text-brand-600" />
          <span className="font-semibold">Share your thoughts</span>
        </div>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          placeholder="What should we build or fix next?"
          className="w-full border border-slate-200 dark:border-slate-700 bg-transparent rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <button
          onClick={submit}
          className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-base font-medium"
        >
          Send Feedback
        </button>
        {sent && <p className="text-sm text-brand-600">Thanks — we got your feedback!</p>}
      </div>
    </div>
  );
}
