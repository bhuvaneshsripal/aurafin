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

  // Best / worst performer by all-time return (value vs what was invested), like the app's own digest.
  const withReturn = holdings
    .filter((h) => typeof h.invested === 'number' && h.invested > 0 && Number.isFinite(h.value))
    .map((h) => ({ name: h.name, pct: ((h.value - h.invested) / h.invested) * 100, pnl: h.value - h.invested }))
    .sort((a, b) => b.pct - a.pct);
  const best = withReturn[0] ?? null;
  const worst = withReturn.length > 1 ? withReturn[withReturn.length - 1] : null;
  const inProfit = withReturn.filter((h) => h.pnl > 0.005).length;
  const inLoss = withReturn.filter((h) => h.pnl < -0.005).length;
  // Holdings the person added or edited during the week (the app saves each holding's updatedAt).
  const changed = holdings
    .filter((h) => Number(h.updatedAt) > nowMs - 7 * DAY_MS)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 5)
    .map((h) => ({ name: h.name, at: Number(h.updatedAt) }));

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
    best, worst, inProfit, inLoss, changed,
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

const SERIF = "Georgia,'Times New Roman',Times,serif";
const GOLD = '#C9A227';
const NAVY = '#0B1226';

/** Public address of the app, used for the logo in the email header. */
function appUrl() {
  const v = process.env.APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || 'aurafin-five.vercel.app';
  return /^https?:\/\//i.test(v) ? v.replace(/\/+$/, '') : `https://${v.replace(/\/+$/, '')}`;
}

export function buildEmail(d) {
  const range = `${fmtDate(d.weekStart)} – ${fmtDate(d.asOf)}`;
  const first = d.name ? esc(String(d.name).trim().split(/\s+/)[0]) : '';
  const staleDate = d.lastAppSync ? fmtDate(d.lastAppSync) : null;

  const weekAmt = d.weekChange === null ? '—' : signedInr(d.weekChange);
  const weekPct = d.weekChange === null || d.weekPct === null ? '—' : pct(d.weekPct);

  const label = (t) => `<div style="font-family:${SERIF};font-size:14px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#4B5563;">${t}</div>`;
  const heading = (t) => `<tr><td style="padding:34px 40px 0 40px;"><div style="font-family:${SERIF};font-size:16px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#4B5563;padding-bottom:12px;border-bottom:1px solid #E5E7EB;">${t}</div></td></tr>`;
  const statRow = (name, value, color = '#111827') =>
    `<tr><td style="padding:18px 0;border-bottom:1px solid #E5E7EB;font-family:${SERIF};font-size:18px;color:#374151;">${name}</td><td align="right" style="padding:18px 0;border-bottom:1px solid #E5E7EB;font-family:${SERIF};font-size:18px;font-weight:700;color:${color};">${value}</td></tr>`;
  const perfCard = (bar, title, p) =>
    `<td width="50%" valign="top" style="padding:0 6px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-left:3px solid ${bar};"><tr><td style="padding:2px 0 2px 14px;"><div style="font-family:${SERIF};font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#6B7280;">${title}</div><div style="margin-top:6px;font-family:${SERIF};font-size:16px;font-weight:700;color:#111827;">${p ? esc(p.name) : 'N/A'}</div>${p ? `<div style="margin-top:2px;font-family:${SERIF};font-size:14px;font-weight:700;color:${tone(p.pct)};">${pct(p.pct)}</div>` : ''}</td></tr></table></td>`;
  const lineRows = (rows) =>
    rows.length
      ? rows.map((r) => `<tr><td style="padding:12px 0;border-bottom:1px solid #F1F2F4;font-family:${SERIF};font-size:16px;color:#111827;">${r.left}</td><td align="right" style="padding:12px 0;border-bottom:1px solid #F1F2F4;font-family:${SERIF};font-size:16px;color:#374151;">${r.right}</td></tr>`).join('')
      : `<tr><td style="padding:12px 0;font-family:${SERIF};font-size:15px;color:#6B7280;">Nothing to show.</td></tr>`;
  const section = (title, rows) => `${heading(title)}<tr><td style="padding:4px 40px 0 40px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr>`;

  const topRows = lineRows(d.top.map((h) => {
    const r = typeof h.invested === 'number' && h.invested > 0 ? ((h.value - h.invested) / h.invested) * 100 : null;
    return { left: esc(h.name), right: `<b style="color:#111827;">${inr(h.value)}</b>${r === null ? '' : ` <span style="color:${tone(r)};">(${pct(r)})</span>`}` };
  }));
  const sectorRows = lineRows(d.allocation.map((a) => ({ left: esc(a.label), right: `<b style="color:#111827;">${a.share.toFixed(1)}%</b> <span style="color:#6B7280;">· ${inr(a.value)}</span>` })));
  const txRows = d.changed.length
    ? lineRows(d.changed.map((c) => ({ left: esc(c.name), right: `updated ${fmtDate(c.at)}` })))
    : `<tr><td style="padding:12px 0;font-family:${SERIF};font-size:15px;color:#6B7280;">No changes to your holdings this week.</td></tr>`;

  const insightParts = [
    d.weekChange !== null
      ? `Your stocks &amp; ETFs are ${d.weekChange >= 0 ? 'up' : 'down'} ${inr(Math.abs(d.weekChange))}${d.weekPct !== null ? ` (${Math.abs(d.weekPct).toFixed(2)}%)` : ''} this week.`
      : 'A week-over-week move is not available this time (no stocks or ETFs with live prices).',
    d.best ? `${esc(d.best.name)} is your top performer, ${pct(d.best.pct)} overall.` : '',
    d.totalLiabilities > 0 ? `You are carrying ${inr(d.totalLiabilities)} in liabilities against ${inr(d.totalAssets)} in assets.` : '',
  ].filter(Boolean);

  const note = [
    `Stock and ETF prices are the latest market close${d.repriced ? '' : ' (live prices could not be fetched this time, so the values saved by the app were used)'}.`,
    `Mutual funds, SIPs, gold, deposits and other holdings are shown as of your last visit to Aurafin${staleDate ? ` (${staleDate})` : ''}.`,
  ];

  const logo = `${appUrl()}/logo-icon.png`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AuraFin Weekly Digest</title></head>
<body style="margin:0;padding:0;background:#ECEEF2;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ECEEF2;padding:28px 0;"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#FFFFFF;">

<tr><td style="background:${NAVY};padding:30px 40px;border-bottom:4px solid ${GOLD};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td width="56" valign="middle"><img src="${logo}" width="44" height="44" alt="AuraFin" style="display:block;border:0;border-radius:10px;color:#fff;font-family:${SERIF};font-size:11px;"></td>
<td valign="middle" style="font-family:${SERIF};font-size:28px;font-weight:700;letter-spacing:.1em;color:#FFFFFF;">AURAFIN</td>
<td align="right" valign="middle" style="font-family:${SERIF};font-size:13px;font-weight:700;letter-spacing:.16em;color:#D9DCE3;">WEEKLY DIGEST</td>
</tr></table></td></tr>

<tr><td style="padding:40px 40px 0 40px;">
<div style="font-family:${SERIF};font-size:26px;font-style:italic;color:#111827;line-height:1.35;">Good week${first ? `, ${first}` : ''}. Here’s where things stand.</div>
<div style="margin-top:6px;font-family:${SERIF};font-size:13px;color:#6B7280;">${range}</div>
</td></tr>

<tr><td style="padding:30px 40px 0 40px;">
${label('Portfolio value')}
<div style="margin-top:8px;font-family:${SERIF};font-size:40px;font-weight:700;color:#111827;">${inr(d.totalAssets)}</div>
<div style="margin-top:8px;font-family:${SERIF};font-size:18px;color:#374151;">This week &nbsp;<b style="color:${d.weekChange === null ? '#6B7280' : tone(d.weekChange)};">${weekAmt}</b> &nbsp;·&nbsp; <b style="color:${d.weekChange === null ? '#6B7280' : tone(d.weekChange)};">${weekPct}</b></div>
</td></tr>

<tr><td style="padding:22px 40px 0 40px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #E5E7EB;">
${statRow('Total invested', inr(d.totalInvested))}
${statRow('Total profit / loss', signedInr(d.pnl), tone(d.pnl))}
${statRow('Overall return', pct(d.pnlPct), tone(d.pnlPct))}
${d.totalLiabilities > 0 ? statRow('Liabilities', inr(d.totalLiabilities)) + statRow('Net worth', inr(d.netWorth)) : ''}
</table></td></tr>

${heading('Performance')}
<tr><td style="padding:18px 34px 0 34px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
${perfCard('#111827', 'Best performer', d.best)}${perfCard(GOLD, 'Worst performer', d.worst)}
</tr></table></td></tr>
<tr><td style="padding:16px 40px 0 40px;font-family:${SERIF};font-size:15px;color:#374151;"><b style="color:#047857;">${d.inProfit}</b> holdings in profit &nbsp;·&nbsp; <b style="color:#B91C1C;">${d.inLoss}</b> in loss</td></tr>

${section('Top holdings', topRows)}
${section('Sector allocation', sectorRows)}
${section('Weekly transactions', txRows)}

<tr><td style="padding:34px 40px 0 40px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F6F3;border-left:4px solid ${GOLD};"><tr><td style="padding:18px 22px;">
<div style="font-family:${SERIF};font-size:14px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#4B5563;">Insight</div>
<div style="margin-top:8px;font-family:${SERIF};font-size:16px;line-height:1.6;color:#1F2937;">${insightParts.join(' ')}</div>
</td></tr></table></td></tr>

<tr><td style="padding:18px 40px 36px 40px;font-family:${SERIF};font-size:12px;line-height:1.6;color:#6B7280;">${note.map(esc).join('<br>')}</td></tr>

<tr><td style="background:${NAVY};padding:28px 40px;text-align:center;">
<div style="font-family:${SERIF};font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${GOLD};">AuraFin · Your personal net worth tracker</div>
<div style="margin-top:10px;font-family:${SERIF};font-size:12px;line-height:1.6;color:#B8BDC9;">You’re receiving this because weekly digest emails are on in your notification preferences.</div>
</td></tr>

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
    d.best ? `Best performer: ${d.best.name} (${pct(d.best.pct)})` : '',
    d.worst ? `Worst performer: ${d.worst.name} (${pct(d.worst.pct)})` : '',
    '',
    'Top gainers this week:', lines(d.gainers, 'move'),
    'Top losers this week:', lines(d.losers, 'move'),
    'Largest holdings:', lines(d.top, 'value'),
    '',
    ...note,
  ].join('\n');

  return { subject: 'Your Weekly Aurafin Summary', html, text };
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
      await sendMail({ to: user.email, subject: mail.subject, html: mail.html, text: mail.text });
      summary.sent++;
    } catch (err) {
      summary.errors.push({ uid: uid.slice(0, 6), error: String(err?.message ?? err).slice(0, 300) });
      if (claimed) await stateRef.set({ sentFor: null }, { merge: true }).catch(() => {});
    }
  }
  return summary;
}
