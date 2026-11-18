// Weekly portfolio digest email: every Saturday 10:00 AM IST, sent from the server so it
// arrives whether or not the app is open.
//
// Where the numbers come from (so the email stays accurate):
//  * The app saves a compact copy of each person's holdings to users/{uid}/meta/digestInput
//    every time it is open (see src/hooks/useDigestSync.ts). Those values use the app's own
//    valuation (SIP NAVs, gold rate, deposit interest, PPF, ...), so they match the dashboard.
//  * Stocks / ETFs (anything with a ticker and a quantity) are RE-PRICED here at send time
//    with the same quote source the app uses, so they reflect the latest close (Friday's).
//  * "This week" moves for those stocks compare that price with the close one week earlier
//    (Yahoo's chartPreviousClose for a 5-trading-day range). Quantity changes during the week
//    are not treated as gains or losses.
//  * Everything else (mutual funds, SIPs, gold, deposits, ...) is shown as of the person's last
//    visit to the app, and the email says so with the date.
import { getAuth } from 'firebase-admin/auth';
import { resolveQuote } from './quote.js';
import { fetchHistory } from './stockDetail.js';
import { sendMail } from './mail.js';

const DAY_MS = 24 * 60 * 60_000;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = (n) => {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 2 });
};
const signedInr = (n) => `${n >= 0 ? '+' : '−'}${inr(Math.abs(n))}`;
const pct = (n) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(2)}%`;
const tone = (n) => (n > 0 ? '#047857' : n < 0 ? '#B91C1C' : '#475569');
const fmtDate = (ms) => new Date(ms).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });

/** Runs `fn` over `items` with a small concurrency limit. */
async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    })
  );
  return out;
}

/** Re-prices the stocks / ETFs and works out every figure the email shows. */
export async function computeDigest(input, nowMs = Date.now()) {
  const holdings = Array.isArray(input.holdings) ? input.holdings.map((h) => ({ ...h })) : [];

  // One quote + one week-ago close per distinct symbol.
  const priced = holdings.filter((h) => h.repriceable && h.symbol && h.qty > 0);
  const keys = [...new Set(priced.map((h) => `${h.market === 'US' ? 'US' : 'IN'}:${h.symbol}`))];
  const bySymbol = new Map();
  await pool(keys, 6, async (key) => {
    const [market, symbol] = [key.slice(0, 2), key.slice(3)];
    const [q, hist] = await Promise.all([
      resolveQuote(symbol, market).catch(() => null),
      fetchHistory(symbol, market, 'NSE', '1W').catch(() => null),
    ]);
    bySymbol.set(key, { price: q?.price ?? null, weekAgo: hist?.previousClose ?? null });
  });

  let repriced = 0;
  for (const h of holdings) {
    const s = bySymbol.get(`${h.market === 'US' ? 'US' : 'IN'}:${h.symbol}`);
    if (!h.repriceable || !s) continue;
    if (s.price) {
      h.value = h.qty * s.price;
      h.price = s.price;
      repriced++;
    }
    if (s.price && s.weekAgo) {
      h.weekAgo = s.weekAgo;
      h.weekChange = h.qty * (s.price - s.weekAgo);
      h.weekPct = (s.price / s.weekAgo - 1) * 100;
    }
  }

  const totalAssets = holdings.reduce((a, h) => a + (h.value || 0), 0);
  const totalInvested = holdings.reduce((a, h) => a + (h.invested ?? h.value ?? 0), 0);
  const totalLiabilities = Number(input.totalLiabilities) || 0;
  const pnl = totalAssets - totalInvested;
  const pnlPct = totalInvested > 0 ? (pnl / totalInvested) * 100 : 0;

  const movers = holdings.filter((h) => typeof h.weekChange === 'number' && Number.isFinite(h.weekChange));
  const weekChange = movers.reduce((a, h) => a + h.weekChange, 0);
  const weekBase = movers.reduce((a, h) => a + h.qty * h.weekAgo, 0);
  const weekPct = weekBase > 0 ? (weekChange / weekBase) * 100 : null;
  const sorted = [...movers].sort((a, b) => b.weekChange - a.weekChange);
  const gainers = sorted.filter((h) => h.weekChange > 0).slice(0, 3);
  const losers = sorted.filter((h) => h.weekChange < 0).reverse().slice(0, 3);

  const byValue = [...holdings].sort((a, b) => (b.value || 0) - (a.value || 0));
  const top = byValue.slice(0, 5);

  const cat = new Map();
  for (const h of holdings) cat.set(h.cls || 'Other', (cat.get(h.cls || 'Other') ?? 0) + (h.value || 0));
  const allocation = [...cat.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value, share: totalAssets > 0 ? (value / totalAssets) * 100 : 0 }));

  return {
    name: input.name || '',
    asOf: nowMs,
    weekStart: nowMs - 6 * DAY_MS,
    lastAppSync: Number(input.updatedAt) || null,
    count: holdings.length,
    repriced,
    totalAssets, totalInvested, totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
    pnl, pnlPct,
    weekChange: movers.length ? weekChange : null,
    weekPct: movers.length ? weekPct : null,
    movers: movers.length,
    gainers, losers, top, allocation,
  };
}

function rowsHtml(list, mode) {
  if (!list.length) return `<tr><td style="padding:8px 0;font-size:13px;color:#64748B;">Nothing to show.</td></tr>`;
  return list
    .map((h) => {
      const right =
        mode === 'move'
          ? `<span style="color:${tone(h.weekChange)};font-weight:600;">${signedInr(h.weekChange)} (${pct(h.weekPct)})</span>`
          : `<span style="color:#0F172A;font-weight:600;">${inr(h.value)}</span>`;
      return `<tr><td style="padding:8px 0;font-size:14px;color:#0F172A;border-bottom:1px solid #F1F5F9;">${esc(h.name)}</td><td align="right" style="padding:8px 0;font-size:14px;border-bottom:1px solid #F1F5F9;">${right}</td></tr>`;
    })
    .join('');
}

export function buildEmail(d) {
  const range = `${fmtDate(d.weekStart)} – ${fmtDate(d.asOf)}`;
  const hello = d.name ? `Hi ${esc(String(d.name).split(' ')[0])},` : 'Hi,';
  const weekLine =
    d.weekChange === null
      ? `<span style="color:#64748B;">Week-over-week move isn’t available (no stocks or ETFs with live prices).</span>`
      : `Stocks &amp; ETFs this week: <b style="color:${tone(d.weekChange)};">${signedInr(d.weekChange)}${d.weekPct !== null ? ` (${pct(d.weekPct)})` : ''}</b>`;
  const stat = (label, value, color = '#0F172A') =>
    `<td width="50%" style="padding:6px;"><div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:14px;"><div style="font-size:11px;font-weight:600;color:#64748B;text-transform:uppercase;letter-spacing:.06em;">${label}</div><div style="margin-top:4px;font-size:17px;font-weight:700;color:${color};">${value}</div></div></td>`;
  const section = (title, body) =>
    `<tr><td style="padding:20px 32px 0 32px;"><div style="font-size:12px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">${title}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${body}</table></td></tr>`;

  const staleDate = d.lastAppSync ? fmtDate(d.lastAppSync) : null;
  const footnote = [
    `Stock and ETF prices are the latest market close${d.repriced ? '' : ' (live prices could not be fetched this time, so the values saved by the app were used)'}.`,
    `Mutual funds, SIPs, gold, deposits and other holdings are shown as of your last visit to Aurafin${staleDate ? ` (${staleDate})` : ''}.`,
    `Week-over-week figures cover stocks and ETFs only and ignore units you bought or sold during the week.`,
  ];

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:24px 0;"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#fff;border-radius:16px;overflow:hidden;">
<tr><td style="background:#0F172A;padding:28px 32px;"><div style="font-size:20px;font-weight:700;color:#fff;">Aurafin</div><div style="margin-top:14px;font-size:20px;font-weight:700;color:#fff;">${hello} here’s your week</div><div style="margin-top:4px;font-size:13px;color:#94A3B8;">${range}</div></td></tr>
<tr><td style="padding:26px 32px 4px 32px;"><div style="font-size:12px;font-weight:600;color:#64748B;text-transform:uppercase;letter-spacing:.06em;">Portfolio value</div><div style="margin-top:6px;font-size:32px;font-weight:700;color:#0F172A;">${inr(d.totalAssets)}</div><div style="margin-top:6px;font-size:14px;color:#475569;">${weekLine}</div></td></tr>
<tr><td style="padding:12px 26px 0 26px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${stat('Invested', inr(d.totalInvested))}${stat('Total profit / loss', `${signedInr(d.pnl)} (${pct(d.pnlPct)})`, tone(d.pnl))}</tr><tr>${stat('Liabilities', inr(d.totalLiabilities))}${stat('Net worth', inr(d.netWorth))}</tr></table></td></tr>
${section('Top gainers this week', rowsHtml(d.gainers, 'move'))}
${section('Top losers this week', rowsHtml(d.losers, 'move'))}
${section('Largest holdings', rowsHtml(d.top, 'value'))}
${section('Allocation', d.allocation.length ? d.allocation.map((a) => `<tr><td style="padding:6px 0;font-size:14px;color:#0F172A;border-bottom:1px solid #F1F5F9;">${esc(a.label)}</td><td align="right" style="padding:6px 0;font-size:14px;color:#475569;border-bottom:1px solid #F1F5F9;">${a.share.toFixed(1)}% &middot; ${inr(a.value)}</td></tr>`).join('') : '<tr><td style="font-size:13px;color:#64748B;">No holdings yet.</td></tr>')}
<tr><td style="padding:22px 32px 28px 32px;"><div style="font-size:12px;line-height:1.6;color:#64748B;">${footnote.map(esc).join('<br>')}</div><div style="margin-top:12px;font-size:12px;color:#94A3B8;">You get this every Saturday at 10:00 AM IST. Turn it off in Aurafin › Settings › Notifications.</div></td></tr>
</table></td></tr></table></body></html>`;

  const lines = (list, mode) => (list.length ? list.map((h) => `  ${h.name}: ${mode === 'move' ? `${signedInr(h.weekChange)} (${pct(h.weekPct)})` : inr(h.value)}`).join('\n') : '  Nothing to show.');
  const text = [
    `Aurafin weekly digest (${range})`,
    '',
    `Portfolio value: ${inr(d.totalAssets)}`,
    d.weekChange !== null ? `Stocks & ETFs this week: ${signedInr(d.weekChange)}${d.weekPct !== null ? ` (${pct(d.weekPct)})` : ''}` : 'Week-over-week move not available.',
    `Invested: ${inr(d.totalInvested)}`,
    `Total profit/loss: ${signedInr(d.pnl)} (${pct(d.pnlPct)})`,
    `Liabilities: ${inr(d.totalLiabilities)}`,
    `Net worth: ${inr(d.netWorth)}`,
    '',
    'Top gainers this week:', lines(d.gainers, 'move'),
    'Top losers this week:', lines(d.losers, 'move'),
    'Largest holdings:', lines(d.top, 'value'),
    '',
    ...footnote,
  ].join('\n');

  return { subject: `Your Aurafin weekly digest · ${range}`, html, text };
}

/**
 * Sends the digest to everyone who has it on (or just `onlyUid`).
 *  - Scheduled runs claim "sent for this Saturday" first, so the repeated cron calls never double-send,
 *    and release the claim again if building or sending fails so the next call retries.
 *  - `test` (the Settings button) and `force` skip that claim.
 */
export async function runWeeklyDigest(db, { dateKey, onlyUid = null, test = false, force = false }) {
  const summary = { users: 0, sent: 0, skipped: {}, errors: [] };
  const skip = (why) => { summary.skipped[why] = (summary.skipped[why] ?? 0) + 1; };

  let inputs;
  if (onlyUid) {
    const d = await db.collection('users').doc(onlyUid).collection('meta').doc('digestInput').get();
    inputs = d.exists ? [{ uid: onlyUid, data: d.data() }] : [];
  } else {
    const all = await db.collectionGroup('meta').get();
    inputs = all.docs.filter((d) => d.id === 'digestInput').map((d) => ({ uid: d.ref.parent.parent.id, data: d.data() }));
  }
  if (!inputs.length) skip(onlyUid ? 'no saved portfolio yet (open the app once, then try again)' : 'no users');

  for (const { uid, data } of inputs) {
    summary.users++;
    if (data.weeklyDigestEmail === false && !test) { skip('digest turned off'); continue; }
    const stateRef = db.collection('users').doc(uid).collection('meta').doc('digestState');
    let claimed = false;
    try {
      const user = await getAuth().getUser(uid).catch(() => null);
      if (!user?.email) { skip('no email on account'); continue; }

      if (!test && !force) {
        claimed = await db.runTransaction(async (tx) => {
          const s = await tx.get(stateRef);
          if (s.exists && s.data().sentFor === dateKey) return false;
          tx.set(stateRef, { sentFor: dateKey, claimedAt: Date.now() }, { merge: true });
          return true;
        });
        if (!claimed) { skip('already sent this Saturday'); continue; }
      }

      const digest = await computeDigest({ ...data, name: data.name || user.displayName || '' });
      const mail = buildEmail(digest);
      await sendMail({ to: user.email, subject: test ? `[Test] ${mail.subject}` : mail.subject, html: mail.html, text: mail.text });
      summary.sent++;
    } catch (err) {
      summary.errors.push({ uid: uid.slice(0, 6), error: String(err?.message ?? err).slice(0, 300) });
      if (claimed) await stateRef.set({ sentFor: null }, { merge: true }).catch(() => {});
    }
  }
  return summary;
}
