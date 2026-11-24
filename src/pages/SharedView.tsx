import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { Eye, Lock } from 'lucide-react';
import { db } from '../firebase/config';
import { formatCurrency } from '../utils/currency';
import { ASSET_CLASS_LABELS, ASSET_CLASS_TO_CATEGORY, LIABILITY_CLASS_LABELS } from '../utils/taxonomy';
import { LOGO_SRC } from '../config/logo';
import type { ShareDoc, SharePayload } from '../utils/shareLink';

type Status = 'loading' | 'ready' | 'missing' | 'error';

function parsePayload(json: string): SharePayload | null {
  try {
    const p = JSON.parse(json) as SharePayload;
    if (p && p.v === 1 && Array.isArray(p.assets) && Array.isArray(p.liabilities)) {
      return { ...p, goals: p.goals ?? [], profiles: p.profiles ?? [] };
    }
  } catch {
    /* fall through */
  }
  return null;
}

function timeAgo(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function Panel({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="bg-surface rounded-[20px] shadow-card dark:bg-surface-muted dark:border dark:border-white/10 dark:shadow-none p-4 sm:p-5 min-w-0">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'pos' | 'neg' }) {
  return (
    <div className="bg-surface rounded-[20px] shadow-card dark:bg-surface-muted dark:border dark:border-white/10 dark:shadow-none p-4 min-w-0">
      <p className="text-xs text-muted">{label}</p>
      <p
        className={`mt-1.5 text-lg sm:text-xl font-semibold tabular-nums truncate ${
          tone === 'pos' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'neg' ? 'text-red-600 dark:text-red-400' : 'text-ink'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

/**
 * Public, read-only page opened from a view-only link (/share/<token>). It never signs in and
 * has no edit controls: it only reads the shared copy and keeps it live while the page is open.
 */
export default function SharedView({ token }: { token: string }) {
  const [status, setStatus] = useState<Status>('loading');
  const [meta, setMeta] = useState<{ ownerName: string; updatedAt: number } | null>(null);
  const [data, setData] = useState<SharePayload | null>(null);
  const [profileId, setProfileId] = useState<string>('all');
  const [, tick] = useState(0);

  // Keep the shared page out of search engines.
  useEffect(() => {
    const m = document.createElement('meta');
    m.name = 'robots';
    m.content = 'noindex, nofollow';
    document.head.appendChild(m);
    const prev = document.title;
    document.title = 'Shared portfolio · Aurafin';
    return () => {
      m.remove();
      document.title = prev;
    };
  }, []);

  useEffect(() => {
    return onSnapshot(
      doc(db, 'shares', token),
      (snap) => {
        if (!snap.exists()) {
          setStatus('missing');
          return;
        }
        const d = snap.data() as ShareDoc;
        const p = typeof d.payload === 'string' ? parsePayload(d.payload) : null;
        if (!p) {
          setStatus('error');
          return;
        }
        setData(p);
        setMeta({ ownerName: d.ownerName || '', updatedAt: d.updatedAt || d.createdAt || Date.now() });
        setStatus('ready');
      },
      (err) => setStatus(err?.code === 'permission-denied' || err?.code === 'not-found' ? 'missing' : 'error')
    );
  }, [token]);

  // "Updated 3 min ago" stays current.
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const view = useMemo(() => {
    if (!data) return null;
    const inScope = (pid?: string) => profileId === 'all' || pid === profileId;
    const assets = data.assets.filter((a) => inScope(a.profileId)).sort((a, b) => b.value - a.value);
    const liabilities = data.liabilities.filter((l) => inScope(l.profileId)).sort((a, b) => b.outstanding - a.outstanding);
    const goals = data.goals.filter((g) => inScope(g.profileId));
    const totalAssets = assets.reduce((s, a) => s + a.value, 0);
    const totalLiab = liabilities.reduce((s, l) => s + l.outstanding, 0);
    const invested = assets.reduce((s, a) => s + (a.invested ?? 0), 0);
    const withCost = assets.filter((a) => a.invested !== undefined && a.pnl !== undefined);
    const pnl = withCost.reduce((s, a) => s + (a.pnl ?? 0), 0);
    const cost = withCost.reduce((s, a) => s + (a.invested ?? 0), 0);

    const byCat = new Map<string, { label: string; color: string; value: number }>();
    assets.forEach((a) => {
      const cat = ASSET_CLASS_TO_CATEGORY[a.cls];
      const key = cat?.key ?? 'other';
      const cur = byCat.get(key) ?? { label: cat?.label ?? 'Other', color: cat?.color ?? '#94a3b8', value: 0 };
      cur.value += a.value;
      byCat.set(key, cur);
    });
    const allocation = [...byCat.values()].filter((c) => c.value > 0).sort((a, b) => b.value - a.value);
    return {
      assets, liabilities, goals, totalAssets, totalLiab, netWorth: totalAssets - totalLiab,
      invested, pnl, pnlPct: cost > 0 ? (pnl / cost) * 100 : null, hasPnl: withCost.length > 0, allocation,
    };
  }, [data, profileId]);

  const fmt = (n: number) => formatCurrency(n, data?.currency ?? 'INR');

  return (
    <div className="min-h-screen bg-page text-ink">
      <header className="sticky top-0 z-10 bg-page/90 backdrop-blur border-b border-line">
        <div className="max-w-[960px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <img src={LOGO_SRC} alt="" className="h-7 w-7 rounded-full" />
            <span className="font-semibold tracking-tight">Aurafin</span>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 bg-brand-50 dark:bg-brand-500/10 dark:text-brand-400 px-2.5 py-1 rounded-full">
            <Eye size={13} /> View only
          </span>
        </div>
      </header>

      <main className="max-w-[960px] mx-auto px-4 sm:px-6 py-6 pb-16">
        {status === 'loading' && <p className="text-sm text-muted py-20 text-center">Loading shared portfolio…</p>}

        {status === 'missing' && (
          <div className="py-20 text-center max-w-sm mx-auto">
            <Lock size={28} className="mx-auto text-muted" />
            <h1 className="mt-3 text-lg font-semibold">This link is no longer active</h1>
            <p className="mt-1.5 text-sm text-muted">The owner stopped sharing it or created a new link. Ask them for the current one.</p>
          </div>
        )}

        {status === 'error' && (
          <div className="py-20 text-center max-w-sm mx-auto">
            <h1 className="text-lg font-semibold">Couldn't open this link</h1>
            <p className="mt-1.5 text-sm text-muted">Check your connection and reload the page.</p>
          </div>
        )}

        {status === 'ready' && data && view && meta && (
          <div className="space-y-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                {meta.ownerName ? `${meta.ownerName}'s portfolio` : 'Shared portfolio'}
              </h1>
              <p className="text-xs text-muted mt-1">Read-only · Updated {timeAgo(meta.updatedAt)}</p>
            </div>

            {data.profiles.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {[{ id: 'all', name: 'All' }, ...data.profiles].map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setProfileId(p.id)}
                    className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                      profileId === p.id
                        ? 'bg-brand-600 border-brand-600 text-white'
                        : 'border-line text-ink-2 hover:bg-surface-hover'
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Stat label="Net worth" value={fmt(view.netWorth)} />
              <Stat label="Total assets" value={fmt(view.totalAssets)} />
              <Stat label="Liabilities" value={fmt(view.totalLiab)} />
              <Stat
                label="Profit / loss"
                value={
                  view.hasPnl
                    ? `${view.pnl >= 0 ? '+' : '−'}${fmt(Math.abs(view.pnl))}${view.pnlPct !== null ? ` (${Math.abs(view.pnlPct).toFixed(1)}%)` : ''}`
                    : '—'
                }
                tone={view.hasPnl ? (view.pnl >= 0 ? 'pos' : 'neg') : undefined}
              />
            </div>

            {view.allocation.length > 0 && (
              <Panel title="Asset allocation">
                <div className="flex h-3 rounded-full overflow-hidden bg-line-soft">
                  {view.allocation.map((c) => (
                    <div key={c.label} style={{ width: `${(c.value / view.totalAssets) * 100}%`, background: c.color }} title={c.label} />
                  ))}
                </div>
                <ul className="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-2">
                  {view.allocation.map((c) => (
                    <li key={c.label} className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: c.color }} />
                        <span className="truncate">{c.label}</span>
                      </span>
                      <span className="tabular-nums text-muted shrink-0">
                        {((c.value / view.totalAssets) * 100).toFixed(1)}% · {fmt(c.value)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}

            <Panel title={`Holdings (${view.assets.length})`}>
              {view.assets.length === 0 ? (
                <p className="text-sm text-muted">Nothing to show.</p>
              ) : (
                <ul className="divide-y divide-line-soft">
                  {view.assets.map((a) => (
                    <li key={a.id} className="py-2.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{a.name}</p>
                        <p className="text-xs text-muted truncate">{ASSET_CLASS_LABELS[a.cls] ?? 'Other'}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-medium tabular-nums">{fmt(a.value)}</p>
                        {a.pnl !== undefined && a.invested !== undefined && (
                          <p className={`text-xs tabular-nums ${a.pnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                            {a.pnl >= 0 ? '+' : '−'}{fmt(Math.abs(a.pnl))}
                            {a.pct !== undefined ? ` (${Math.abs(a.pct).toFixed(1)}%)` : ''}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            {view.liabilities.length > 0 && (
              <Panel title="Liabilities">
                <ul className="divide-y divide-line-soft">
                  {view.liabilities.map((l) => (
                    <li key={l.id} className="py-2.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{l.name}</p>
                        <p className="text-xs text-muted truncate">
                          {(l.cls && LIABILITY_CLASS_LABELS[l.cls]) || 'Loan'}
                          {l.lender ? ` · ${l.lender}` : ''}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-medium tabular-nums">{fmt(l.outstanding)}</p>
                        {l.emi ? <p className="text-xs text-muted tabular-nums">EMI {fmt(l.emi)}</p> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}

            {view.goals.length > 0 && (
              <Panel title="Goals">
                <ul className="space-y-3.5">
                  {view.goals.map((g) => {
                    const current = g.linked ? Math.max(0, view.netWorth) : g.current;
                    const pct = g.target > 0 ? Math.min(100, (current / g.target) * 100) : 0;
                    return (
                      <li key={g.id}>
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="font-medium truncate">{g.name}</span>
                          <span className="text-xs text-muted tabular-nums shrink-0">
                            {fmt(current)} / {fmt(g.target)}
                          </span>
                        </div>
                        <div className="mt-1.5 h-2 rounded-full bg-line-soft overflow-hidden">
                          <div className="h-full rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Panel>
            )}

            <p className="text-xs text-muted text-center pt-2">
              A read-only copy shared from Aurafin. Nothing on this page can be changed.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
