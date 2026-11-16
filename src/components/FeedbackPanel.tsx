import { useEffect, useRef, useState } from 'react';
import { Bug, CheckCircle2, Clock, Lightbulb, MessageCircle, Paperclip, X } from 'lucide-react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Button, Textarea } from './ui';
import StarRating from './StarRating';
import { useAuthStore } from '../store/authStore';
import { sendFeedback, type FeedbackAttachment, type FeedbackCategory } from '../utils/feedback';

const MAX = 2000;
const MAX_FILE = 600 * 1024; // stored inside the Firestore document (1 MB limit), so keep it small

const CATEGORIES: { key: FeedbackCategory; label: string; Icon: typeof Bug; placeholder: string }[] = [
  { key: 'bug', label: 'Bug Report', Icon: Bug, placeholder: 'What went wrong? What did you expect to happen?' },
  { key: 'feature', label: 'Feature Request', Icon: Lightbulb, placeholder: 'What would you like to see?' },
  { key: 'other', label: 'Other', Icon: MessageCircle, placeholder: 'Tell us what is on your mind…' },
];
const LABEL: Record<string, string> = { bug: 'Bug Report', feature: 'Feature Request', other: 'Other' };

interface HistoryItem { id: string; category: string; message: string; rating?: number; at: number }

function readFile(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error('Could not read the file.'));
    r.readAsDataURL(file);
  });
}

/** Screenshots are shrunk to max 1280px JPEG so they fit comfortably. */
async function shrinkImage(file: File): Promise<string> {
  const src = await readFile(file);
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('Could not read that image.'));
    i.src = src;
  });
  const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.75);
}

export default function FeedbackPanel({ onCancel, onDone }: { onCancel?: () => void; onDone?: () => void }) {
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<'submit' | 'history'>('submit');
  const [category, setCategory] = useState<FeedbackCategory>('feature');
  const [message, setMessage] = useState('');
  const [rating, setRating] = useState(0);
  const [attachment, setAttachment] = useState<FeedbackAttachment | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cat = CATEGORIES.find((c) => c.key === category)!;

  useEffect(() => {
    if (tab !== 'history' || !user?.uid) return;
    let alive = true;
    setHistory(null);
    getDocs(query(collection(db, 'feedback'), where('uid', '==', user.uid)))
      .then((snap) => {
        if (!alive) return;
        const items = snap.docs.map((d) => {
          const v = d.data() as { category?: string; message?: string; rating?: number; createdAt?: { toMillis?: () => number } };
          return { id: d.id, category: v.category ?? 'other', message: v.message ?? '', rating: v.rating, at: v.createdAt?.toMillis?.() ?? Date.now() };
        });
        setHistory(items.sort((a, b) => b.at - a.at));
      })
      .catch(() => alive && setHistory([]));
    return () => { alive = false; };
  }, [tab, user?.uid, sent]);

  const pickFile = async (file?: File) => {
    if (!file) return;
    setError('');
    try {
      if (file.type.startsWith('image/')) {
        const dataUrl = await shrinkImage(file);
        setAttachment({ name: file.name, type: 'image/jpeg', dataUrl });
      } else {
        if (file.size > MAX_FILE) throw new Error('File is too large (max 600 KB). Screenshots are shrunk automatically.');
        setAttachment({ name: file.name, type: file.type || 'application/octet-stream', dataUrl: await readFile(file) });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not attach that file.');
    }
  };

  const submit = async () => {
    const text = message.trim();
    if (!text || !rating || sending) return;
    setSending(true);
    setError('');
    try {
      await sendFeedback({
        message: text,
        rating,
        category,
        attachment: attachment ?? undefined,
        fromName: user?.displayName ?? '',
        fromEmail: user?.email ?? '',
        uid: user?.uid,
        isGuest: user?.isAnonymous === true,
      });
      setSent(true);
      setMessage('');
      setRating(0);
      setAttachment(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const tabBtn = (k: 'submit' | 'history', content: React.ReactNode) => (
    <button
      type="button"
      onClick={() => { setTab(k); if (k === 'submit') setSent(false); }}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition ${tab === k ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
    >
      {content}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-xl bg-surface-muted p-1">
        {tabBtn('submit', 'Submit')}
        {tabBtn('history', <><Clock size={14} /> History</>)}
      </div>

      {tab === 'history' ? (
        <div className="min-h-[10rem]">
          {history === null ? (
            <p className="py-10 text-center text-sm text-muted">Loading…</p>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-center text-muted">
              <MessageCircle size={34} strokeWidth={1.5} />
              <p className="mt-3 text-sm text-ink">No feedback submitted yet</p>
            </div>
          ) : (
            <ul className="max-h-80 space-y-2 overflow-y-auto">
              {history.map((h) => (
                <li key={h.id} className="rounded-xl border border-line p-3">
                  <div className="flex items-center justify-between gap-2 text-xs text-muted">
                    <span className="font-medium text-ink">{LABEL[h.category] ?? 'Other'}</span>
                    <span>{new Date(h.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  </div>
                  {h.rating ? <p className="mt-1 text-xs text-amber-500">{'★'.repeat(h.rating)}<span className="text-faint">{'★'.repeat(5 - h.rating)}</span></p> : null}
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink-2">{h.message}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : sent ? (
        <div className="flex flex-col items-center py-4 text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary-ink">
            <CheckCircle2 size={24} />
          </span>
          <p className="text-[15px] font-semibold text-ink">Thank you!</p>
          <p className="mt-1 text-sm text-muted">Your feedback has been sent to the developer.</p>
          <div className="mt-5 flex gap-2">
            <Button variant="secondary" onClick={() => setSent(false)}>Send another</Button>
            {onDone && <Button onClick={onDone}>Done</Button>}
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            {CATEGORIES.map(({ key, label, Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setCategory(key)}
                aria-pressed={category === key}
                className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-sm transition ${
                  category === key
                    ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200'
                    : 'border-line bg-surface text-ink hover:bg-surface-muted'
                }`}
              >
                <Icon size={18} />
                {label}
              </button>
            ))}
          </div>

          <div>
            <p className="mb-1.5 text-sm font-medium text-ink">Your rating <span className="text-negative">*</span></p>
            <StarRating value={rating} onChange={setRating} size={26} />
          </div>

          <div>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, MAX))}
              rows={5}
              placeholder={cat.placeholder}
              aria-label="Your feedback"
            />
            <p className="mt-1 text-right text-xs text-faint">{message.length}/{MAX}</p>
          </div>

          <div>
            <input ref={fileRef} type="file" hidden onChange={(e) => { void pickFile(e.target.files?.[0]); e.target.value = ''; }} />
            {attachment ? (
              <div className="flex items-center gap-2 text-sm text-ink-2">
                <Paperclip size={15} />
                <span className="truncate">{attachment.name}</span>
                <button type="button" aria-label="Remove attachment" onClick={() => setAttachment(null)} className="text-muted hover:text-ink">
                  <X size={15} />
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-2 text-sm text-muted hover:text-ink">
                <Paperclip size={15} /> Attach screenshot or file
              </button>
            )}
          </div>

          {error && <p className="text-sm text-negative">{error}</p>}

          <div className="flex justify-end gap-2">
            {onCancel && <Button variant="secondary" onClick={onCancel}>Cancel</Button>}
            <Button onClick={submit} loading={sending} disabled={!message.trim() || !rating}>
              Send Feedback
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
