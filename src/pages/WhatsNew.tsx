import { useEffect, useState } from 'react';
import { ArrowRight, Check, RefreshCw } from 'lucide-react';
import { Button, Card, PageHeader } from '../components/ui';
import { useWhatsNew } from '../components/useWhatsNew';
import { APP_VERSION } from '../config/version';
import { hardRefresh } from '../utils/hardRefresh';
import { isNewVersionDeployed } from '../utils/updateChecks';
import { useUpdateStore } from '../store/updateStore';

/** "Today, 9:36 pm" for a check made today, otherwise "5 Nov, 9:36 pm". */
function formatLastChecked(d: Date): string {
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  return sameDay ? `Today, ${time}` : `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, ${time}`;
}

/** A normal page (not an overlay), so the top bar, bottom nav and every other
 *  button keep working while it is open. */
export default function WhatsNew() {
  const pendingUpdate = useUpdateStore((s) => s.updateAvailable);
  const [status, setStatus] = useState<'checking' | 'available' | 'uptodate'>(pendingUpdate ? 'available' : 'checking');
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [checkNonce, setCheckNonce] = useState(0); // bumped by "Check again"
  const [updating, setUpdating] = useState(false);
  const notes = useWhatsNew(pendingUpdate || status === 'available');

  useEffect(() => {
    let cancelled = false;
    setStatus(pendingUpdate ? 'available' : 'checking');
    const minSpinner = new Promise((r) => window.setTimeout(r, pendingUpdate ? 0 : 250));
    void Promise.all([isNewVersionDeployed(), minSpinner]).then(([deployed]) => {
      if (cancelled) return;
      setLastChecked(new Date());
      setStatus(pendingUpdate || deployed === true ? 'available' : 'uptodate');
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkNonce]);

  const update = () => {
    setUpdating(true);
    void hardRefresh().then((ok) => {
      if (!ok) setUpdating(false);
    });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={status === 'available' ? 'Update available' : "What's new"}
        description={
          <>
            Latest updates and improvements to <span className="font-luxury">Aurafin</span>.
          </>
        }
      />

      {status === 'checking' && (
        <Card className="flex flex-col items-center gap-3 py-12 text-muted" role="status" aria-live="polite">
          <RefreshCw size={28} className="animate-spin text-brand-600" />
          <p className="text-sm">Checking for updates…</p>
        </Card>
      )}

      {status === 'uptodate' && (
        <Card className="flex flex-col items-center text-center py-8">
          <span className="h-16 w-16 rounded-full bg-primary-soft text-primary-ink inline-flex items-center justify-center">
            <Check size={30} strokeWidth={2.5} />
          </span>
          <h2 className="mt-4 text-xl font-semibold text-ink tracking-tight">You're up to date</h2>
          <p className="mt-1.5 text-sm text-muted">You have the latest version of AuraFin.</p>
          <dl className="mt-5 w-full max-w-[420px] rounded-2xl border border-line px-4 text-left text-sm">
            <div className="flex items-center justify-between py-3">
              <dt className="text-muted">Version</dt>
              <dd className="font-semibold text-ink">{APP_VERSION}</dd>
            </div>
            <div className="flex items-center justify-between py-3 border-t border-line-soft">
              <dt className="text-muted">Last checked</dt>
              <dd className="font-semibold text-ink">{lastChecked ? formatLastChecked(lastChecked) : '—'}</dd>
            </div>
          </dl>
          <Button variant="secondary" className="mt-4" onClick={() => setCheckNonce((n) => n + 1)}>
            <RefreshCw size={15} /> Check again
          </Button>
          <p className="mt-3 text-[12.5px] text-muted">Updates are installed only from this page.</p>
        </Card>
      )}

      {status === 'available' && (
        <Card>
          <p className="text-[15px] font-semibold text-ink">A new version of AuraFin is ready</p>
          <p className="mt-1.5 text-sm text-muted">It brings improvements and fixes. Tap Update now to get the latest version.</p>
          {notes && notes.items.length > 0 && (
            <ul className="mt-4 space-y-3">
              {notes.items.map((i) => (
                <li key={i.title} className="flex gap-3">
                  {i.emoji && <span aria-hidden>{i.emoji}</span>}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">{i.title}</p>
                    {i.description && <p className="text-[13px] text-muted">{i.description}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Button className="mt-5" disabled={updating} onClick={update}>
            {updating ? 'Updating…' : 'Update now'}
            {updating ? <RefreshCw size={15} className="animate-spin" /> : <ArrowRight size={16} />}
          </Button>
        </Card>
      )}
    </div>
  );
}
