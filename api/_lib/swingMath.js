// Indicators and swing-setup rules for the Swing scanner. Pure functions: no
// network, so they are easy to test. Everything here is a mechanical technical
// screen, not a prediction or advice.

/** Exponential moving average; entries before the first full window are null. */
export function ema(values, n) {
  const out = new Array(values.length).fill(null);
  if (values.length < n) return out;
  const k = 2 / (n + 1);
  let prev = values.slice(0, n).reduce((a, b) => a + b, 0) / n;
  out[n - 1] = prev;
  for (let i = n; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function sma(values, n) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= n) sum -= values[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

/** Wilder RSI. */
export function rsi(closes, n = 14) {
  const out = new Array(closes.length).fill(null);
  if (closes.length <= n) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  gain /= n;
  loss /= n;
  const val = () => (loss === 0 ? 100 : 100 - 100 / (1 + gain / loss));
  out[n] = val();
  for (let i = n + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (n - 1) + Math.max(d, 0)) / n;
    loss = (loss * (n - 1) + Math.max(-d, 0)) / n;
    out[i] = val();
  }
  return out;
}

/** Wilder average true range. */
export function atr(highs, lows, closes, n = 14) {
  const out = new Array(closes.length).fill(null);
  if (closes.length <= n) return out;
  const tr = (i) => Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
  let prev = 0;
  for (let i = 1; i <= n; i++) prev += tr(i);
  prev /= n;
  out[n] = prev;
  for (let i = n + 1; i < closes.length; i++) {
    prev = (prev * (n - 1) + tr(i)) / n;
    out[i] = prev;
  }
  return out;
}

/** MACD histogram (12, 26, 9). */
export function macdHistogram(closes) {
  const e12 = ema(closes, 12);
  const e26 = ema(closes, 26);
  const line = closes.map((_, i) => (e12[i] != null && e26[i] != null ? e12[i] - e26[i] : null));
  const start = line.findIndex((v) => v != null);
  const hist = new Array(closes.length).fill(null);
  if (start < 0) return hist;
  const sig = ema(line.slice(start), 9);
  for (let i = 0; i < sig.length; i++) if (sig[i] != null) hist[start + i] = line[start + i] - sig[i];
  return hist;
}

export const SETUPS = {
  breakout: 'Breakout',
  pullback: 'Pullback',
  bounce: 'Oversold bounce',
  none: 'No setup',
};

const round = (v, d = 2) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

/**
 * Analyse one stock from daily bars (oldest first):
 * [{ o, h, l, c, v }]. Returns null when there isn't enough history.
 */
export function analyse(bars) {
  const n = bars.length;
  if (n < 60) return null;
  const c = bars.map((b) => b.c);
  const h = bars.map((b) => b.h);
  const l = bars.map((b) => b.l);
  const v = bars.map((b) => b.v);
  const i = n - 1;

  const e20 = ema(c, 20);
  const e50 = ema(c, 50);
  const s200 = sma(c, 200);
  const r = rsi(c, 14);
  const a = atr(h, l, c, 14);
  const hist = macdHistogram(c);
  const avgVol = sma(v, 20)[i - 1]; // average of the 20 sessions before today
  const relVol = avgVol > 0 ? v[i] / avgVol : null;
  const prior20High = Math.max(...h.slice(i - 20, i));
  const swingLow10 = Math.min(...l.slice(i - 9, i + 1));
  const high52 = Math.max(...h.slice(Math.max(0, n - 250)));

  const close = c[i];
  const up50 = close > e50[i];
  const trendUp = e20[i] > e50[i] && up50;
  const aboveS200 = s200[i] != null ? close > s200[i] : null;
  const histNow = hist[i];
  const histRising = hist[i] != null && hist[i - 1] != null && hist[i] > hist[i - 1];
  const rsiNow = r[i];
  const distE20 = (close - e20[i]) / e20[i];

  let setup = 'none';
  const reasons = [];
  if (close > prior20High && relVol != null && relVol >= 1.3 && up50) {
    setup = 'breakout';
    reasons.push(`Closed above its 20-day high (₹${round(prior20High)})`);
    reasons.push(`Volume ${round(relVol, 1)}× its 20-day average`);
  } else if (trendUp && distE20 >= -0.02 && distE20 <= 0.03 && rsiNow >= 38 && rsiNow <= 60) {
    setup = 'pullback';
    reasons.push('Uptrend: 20-day average above 50-day, price above both');
    reasons.push(`Pulled back to the 20-day average (${round(distE20 * 100, 1)}% away)`);
    reasons.push(`RSI ${round(rsiNow, 0)}: cooled off, not weak`);
  } else if (rsiNow < 38 && close > c[i - 1] && (aboveS200 !== false || close > s200[i] * 0.9)) {
    setup = 'bounce';
    reasons.push(`RSI ${round(rsiNow, 0)}: oversold`);
    reasons.push('Today closed higher than yesterday: first sign of a turn');
  }

  // 0–100 strength score. A matched setup is the base; trend, momentum and volume add to it.
  let score = setup === 'none' ? 0 : 30;
  if (e20[i] > e50[i]) score += 12;
  if (up50) score += 8;
  if (aboveS200) score += 10;
  if (histNow != null && histNow > 0) score += 8;
  if (histRising) score += 7;
  if (relVol != null) score += relVol >= 2 ? 15 : relVol >= 1.5 ? 10 : relVol >= 1.2 ? 5 : 0;
  if (setup === 'breakout' && rsiNow >= 55 && rsiNow <= 78) score += 10;
  if (setup === 'pullback' && rsiNow >= 40 && rsiNow <= 55) score += 10;
  if (setup === 'bounce' && rsiNow < 35) score += 10;
  if (close >= high52 * 0.9) { score += 5; if (setup !== 'none') reasons.push('Within 10% of its 52-week high'); }
  score = Math.min(100, score);

  // Illustrative long plan: stop below the 10-day swing low (or 1.5 ATR), target 2× the risk.
  let plan = null;
  if (setup !== 'none' && a[i]) {
    const entry = close;
    let stop = Math.min(swingLow10, entry - 1.5 * a[i]);
    if (entry - stop > entry * 0.08) stop = entry * 0.92; // never risk more than 8%
    const risk = entry - stop;
    if (risk > 0) plan = { entry: round(entry), stop: round(stop), target: round(entry + 2 * risk), riskPct: round((risk / entry) * 100, 1), rr: 2 };
  }

  return {
    setup,
    score,
    close: round(close),
    changePct: round(((close - c[i - 1]) / c[i - 1]) * 100),
    rsi: round(rsiNow, 0),
    ema20: round(e20[i]),
    ema50: round(e50[i]),
    sma200: round(s200[i]),
    atr: round(a[i]),
    relVol: round(relVol, 1),
    macdHist: round(histNow, 2),
    high52: round(high52),
    reasons,
    plan,
    // Last 60 sessions for the detail chart.
    series: { c: c.slice(-60).map((x) => round(x)), e20: e20.slice(-60).map((x) => round(x)), e50: e50.slice(-60).map((x) => round(x)) },
  };
}
