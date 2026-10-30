import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Plus, SlidersHorizontal, Trash2 } from 'lucide-react';
import { Card, CardHeader } from './ui';
import Modal from './Modal';
import InfoTip from './ui/InfoTip';
import { useUiStore } from '../store/uiStore';
import { maskAmount } from '../utils/currency';
import { buildSectorAllocation, customSectorDefs, isSectorAsset } from '../utils/sectors';
import { useSectorProfiles } from '../hooks/useSectorProfiles';
import type { ValuedAsset } from '../utils/portfolioAnalytics';
import { DEFAULT_TARGETS, useSectorTargetsStore } from '../store/sectorTargetsStore';
import { checkTargets, type TargetCheck } from '../utils/sectorTargets';
import { ALL_SECTORS } from '../utils/sectors';

const PILL: Record<'low' | 'high' | 'ok', string> = {
  low: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  high: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  ok: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
};
const PILL_TEXT = { low: 'Low', high: 'High', ok: 'Medium' } as const;
// Display order: High first, then Medium (inside target range), then Low.
const STATUS_RANK = { high: 0, ok: 1, low: 2 } as const;

const pctLabel = (p: number) => (p <= 0 ? '0%' : p < 0.1 ? '<0.1%' : `${p.toFixed(1)}%`);

/**
 * Sector allocation — what share of your stocks and ETFs (at
 * current value) sits in each sector. Every important sector is always listed,
 * with 0% when you hold nothing in it. Tap a sector to see which of your
 * holdings were placed there.
 */
export default function SectorAllocationCard({ items, currency }: { items: ValuedAsset[]; currency: string }) {
  const privacyMode = useUiStore((s) => s.privacyMode);
  const eligible = useMemo(() => items.filter((i) => isSectorAsset(i.asset)), [items]);
  const { profiles, loading } = useSectorProfiles(useMemo(() => eligible.map((i) => i.asset), [eligible]));
  const [open, setOpen] = useState<string | null>(null);
  const targetsOn = useSectorTargetsStore((s) => s.enabled);
  const targets = useSectorTargetsStore((s) => s.targets);
  const customSectors = useSectorTargetsStore((s) => s.customSectors);
  const customs = useMemo(() => customSectorDefs(customSectors ?? {}), [customSectors]);
  const trackedKeys = useMemo(() => Object.keys(targets), [targets]);
  const { total, rows } = useMemo(
    () => buildSectorAllocation(eligible, profiles, trackedKeys, customs),
    [eligible, profiles, trackedKeys, customs]
  );

  const maxPct = Math.max(1, ...rows.map((r) => r.pct));

  const [editing, setEditing] = useState(false);
  const [showWarn, setShowWarn] = useState(false);
  const check = useMemo(() => checkTargets(rows, total, targets), [rows, total, targets]);
  // Sort High -> Medium -> Low (largest share first within each group); untracked sectors go last.
  const sortedRows = useMemo(() => {
    if (!targetsOn || total <= 0) return [...rows].sort((a, b) => b.pct - a.pct);
    const rank = (key: string) => {
      const st = check.bySector.get(key)?.status;
      return st ? STATUS_RANK[st] : 3;
    };
    return [...rows].sort((a, b) => rank(a.key) - rank(b.key) || b.pct - a.pct);
  }, [rows, check, targetsOn, total]);
  const money = (v: number) => maskAmount(Math.round(v / 100) * 100, currency, privacyMode, { fractionDigits: 0 });
  const advice = (c: TargetCheck) =>
    c.status === 'low'
      ? `Below ${c.range.min}% · add about ${money(c.amount)}`
      : `Above ${c.range.max}% · trim about ${money(c.amount)}`;

  return (
    <Card padding="lg">
      <CardHeader
        title={
          <span className="inline-flex items-center gap-1.5">
            Sector allocation
            <InfoTip>
              Counts your stocks and ETFs at their current value. Mutual funds, SIPs and commodities (physical gold, silver, SGBs) aren't included. Single stocks are placed by
              company sector; gold ETFs and jewellery / gold-loan companies go under Gold; broad index ETFs are shown as
              Diversified. Debt, cash and property aren't included.
            </InfoTip>
          </span>
        }
        description={
          total > 0
            ? `Share of ${maskAmount(total, currency, privacyMode, { fractionDigits: 0 })} in stocks & ETFs`
            : 'Add stocks or ETFs to see your sector mix.'
        }
        actions={
          <span className="inline-flex items-center gap-3">
            {loading && <span className="text-xs text-muted">Looking up sectors…</span>}
            {targetsOn && total > 0 && (
              <button
                type="button"
                onClick={() => setShowWarn((v) => !v)}
                aria-expanded={showWarn}
                aria-label={check.off.length ? `${check.off.length} sectors outside target range` : 'All sectors inside target range'}
                title={check.off.length ? `${check.off.length} outside target range` : 'All inside target range'}
                className="tap-scale relative inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-surface-hover"
              >
                {check.off.length ? (
                  <>
                    <AlertTriangle size={18} className="text-amber-600" />
                    <span className="absolute -top-0.5 -right-0.5 min-w-[16px] rounded-full bg-amber-500 px-1 text-center text-[10px] font-bold leading-4 text-white">
                      {check.off.length}
                    </span>
                  </>
                ) : (
                  <CheckCircle2 size={18} className="text-emerald-600" />
                )}
              </button>
            )}
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="tap-scale inline-flex items-center gap-1 text-xs font-medium text-primary-ink hover:underline"
            >
              <SlidersHorizontal size={13} /> Targets
            </button>
          </span>
        }
      />

      {targetsOn && total > 0 && showWarn && (
        <div
          className={`mb-3 rounded-xl border px-3.5 py-3 text-xs ${
            check.off.length
              ? 'border-amber-200 bg-amber-50/70 dark:border-amber-500/30 dark:bg-amber-500/10'
              : 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-500/30 dark:bg-emerald-500/10'
          }`}
        >
          {check.off.length ? (
            <>
              <p className="flex items-center gap-1.5 font-semibold text-ink">
                <AlertTriangle size={14} className="text-amber-600" />
                {check.off.length} {check.off.length === 1 ? 'sector is' : 'sectors are'} outside your target range
              </p>
              <ul className="mt-2 space-y-1">
                {check.off.map((c) => (
                  <li key={c.key} className="flex flex-wrap items-baseline justify-between gap-x-3 text-muted">
                    <span className="text-ink">
                      {c.label} <span className="font-numeric">{pctLabel(c.pct)}</span>
                    </span>
                    <span className={c.status === 'low' ? 'text-amber-700 dark:text-amber-300' : 'text-red-600 dark:text-red-400'}>
                      {advice(c)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="flex items-center gap-1.5 font-semibold text-ink">
              <CheckCircle2 size={14} className="text-emerald-600" /> Every sector is inside your target range.
            </p>
          )}
        </div>
      )}

      <ul className="divide-y divide-line-soft">
        {sortedRows.map((r) => {
          const held = r.holdings.length > 0;
          const expanded = open === r.key && held;
          const c = targetsOn && total > 0 ? check.bySector.get(r.key) : undefined;
          return (
            <li key={r.key}>
              <button
                type="button"
                disabled={!held}
                onClick={() => setOpen(expanded ? null : r.key)}
                aria-expanded={expanded}
                className={`w-full text-left py-2.5 flex items-center gap-3 ${held ? 'cursor-pointer' : 'cursor-default'}`}
              >
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: r.color, opacity: held ? 1 : 0.35 }} />
                <span className={`flex-1 min-w-0 text-sm truncate ${held ? 'text-ink font-medium' : 'text-muted'}`}>{r.label}</span>
                <span className="hidden sm:block w-40 h-1.5 rounded-full bg-surface-hover overflow-hidden">
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${(r.pct / maxPct) * 100}%`, background: r.color }}
                  />
                </span>
                {c && (
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${PILL[c.status]}`}>{PILL_TEXT[c.status]}</span>
                )}
                <span className={`font-numeric text-sm w-14 text-right ${held ? 'text-ink font-semibold' : 'text-muted'}`}>
                  {pctLabel(r.pct)}
                </span>
                <ChevronDown
                  size={14}
                  className={`shrink-0 transition-transform ${held ? 'text-muted' : 'opacity-0'} ${expanded ? 'rotate-180' : ''}`}
                />
              </button>

              {expanded && (
                <div className="pb-3 pl-6 pr-2">
                  <ul className="space-y-1.5">
                    {r.holdings.map((h) => (
                      <li key={h.id} className="flex items-center justify-between gap-3 text-xs">
                        <span className="min-w-0 truncate text-ink">{h.name}</span>
                        <span className="font-numeric text-muted shrink-0">
                          {pctLabel(h.pct)} · {maskAmount(h.value, currency, privacyMode, { fractionDigits: 0 })}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <Modal open={editing} onClose={() => setEditing(false)} title="Sector targets">
        <TargetsEditor />
      </Modal>
    </Card>
  );
}

/** Edit, remove or add the sectors you track (stored on this device). */
function TargetsEditor() {
  const enabled = useSectorTargetsStore((s) => s.enabled);
  const setEnabled = useSectorTargetsStore((s) => s.setEnabled);
  const targets = useSectorTargetsStore((s) => s.targets);
  const setTarget = useSectorTargetsStore((s) => s.setTarget);
  const addTarget = useSectorTargetsStore((s) => s.addTarget);
  const addCustom = useSectorTargetsStore((s) => s.addCustom);
  const customSectors = useSectorTargetsStore((s) => s.customSectors) ?? {};
  const removeTarget = useSectorTargetsStore((s) => s.removeTarget);
  const reset = useSectorTargetsStore((s) => s.reset);
  const [version, setVersion] = useState(0); // remounts the inputs after a reset
  const [toAdd, setToAdd] = useState('');

  const labelOf = (key: string) => customSectors[key]?.label ?? ALL_SECTORS.find((x) => x.key === key)?.label ?? key;
  const keys = Object.keys(targets);
  const available = ALL_SECTORS.filter((d) => d.key !== 'unclassified' && !targets[d.key]);
  const submitAdd = () => {
    const text = toAdd.trim();
    if (!text) return;
    const known = ALL_SECTORS.find((d) => d.key !== 'unclassified' && d.label.toLowerCase() === text.toLowerCase());
    if (known) addTarget(known.key);
    else addCustom(text);
    setToAdd('');
  };
  const clamp = (n: number) => Math.min(100, Math.max(0, Number.isFinite(n) ? n : 0));

  const commit = (key: string, field: 'min' | 'max', raw: string) => {
    const cur = targets[key] ?? DEFAULT_TARGETS[key] ?? { min: 0, max: 100 };
    const v = clamp(parseFloat(raw));
    const next = { ...cur, [field]: v };
    if (next.min > next.max) {
      if (field === 'min') next.max = next.min;
      else next.min = next.max;
    }
    setTarget(key, next);
    // Redraw the inputs only when a value was corrected (the other end moved, or the number was clamped).
    if ((field === 'min' && next.max !== cur.max) || (field === 'max' && next.min !== cur.min) || String(v) !== raw.trim()) setVersion((n) => n + 1);
  };

  const inputCls = 'h-9 w-full rounded-lg border border-line bg-surface px-2 text-center font-numeric text-sm';

  return (
    <div className="space-y-3">
      <label className="flex items-center justify-between gap-3 text-sm text-ink">
        Show warnings
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 accent-[var(--color-brand-600)]" />
      </label>
      {keys.length > 0 ? (
        <div className="grid grid-cols-[1fr_4rem_4rem_2rem] items-center gap-x-2 gap-y-2 text-sm">
          <span className="text-xs text-muted">Sector</span>
          <span className="text-xs text-muted text-center">Min %</span>
          <span className="text-xs text-muted text-center">Max %</span>
          <span />
          {keys.map((key) => {
            const t = targets[key];
            return (
              <div key={`${key}:${version}`} className="contents">
                <span className="text-ink truncate">{labelOf(key)}</span>
                <input type="number" inputMode="decimal" min={0} max={100} step={1} defaultValue={t.min}
                  onBlur={(e) => commit(key, 'min', e.target.value)} className={inputCls} aria-label={`${labelOf(key)} minimum percent`} />
                <input type="number" inputMode="decimal" min={0} max={100} step={1} defaultValue={t.max}
                  onBlur={(e) => commit(key, 'max', e.target.value)} className={inputCls} aria-label={`${labelOf(key)} maximum percent`} />
                <button type="button" onClick={() => removeTarget(key)} aria-label={`Remove ${labelOf(key)}`} title="Remove"
                  className="tap-scale inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:text-red-600 hover:bg-surface-hover">
                  <Trash2 size={15} />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-muted">No sectors tracked. Add one below.</p>
      )}

      <form
        className="flex items-center gap-2 pt-1"
        onSubmit={(e) => {
          e.preventDefault();
          submitAdd();
        }}
      >
        <input
          type="text"
          list="sector-suggestions"
          value={toAdd}
          onChange={(e) => setToAdd(e.target.value)}
          placeholder="Type a sector name…"
          aria-label="Sector to add"
          maxLength={40}
          className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-sm text-ink"
        />
        <datalist id="sector-suggestions">
          {available.map((d) => (
            <option key={d.key} value={d.label} />
          ))}
        </datalist>
        <button type="submit" disabled={!toAdd.trim()}
          className="btn-press inline-flex h-9 items-center gap-1 rounded-lg border border-line px-3 text-sm font-medium text-ink disabled:opacity-50">
          <Plus size={14} /> Add
        </button>
      </form>
      <p className="text-[11px] text-muted">
        Pick a suggestion or type your own. A typed sector collects holdings whose name or symbol contains that text.
      </p>

      <button type="button" onClick={() => { reset(); setVersion((v) => v + 1); }} className="btn-press text-xs font-medium text-primary-ink hover:underline">
        Reset to the 10 default sectors
      </button>
    </div>
  );
}
