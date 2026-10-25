// Downloads each broker's own logo into public/broker-logos/<key>.(png|svg).
// Run on a machine with internet:   npm run logos
// Already-downloaded logos are kept; use `npm run logos -- --force` to redo them.
import { mkdir, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'broker-logos');
const FORCE = process.argv.includes('--force');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

const BROKERS = {
  zerodha: ['zerodha.com'],
  groww: ['groww.in'],
  indmoney: ['indmoney.com'],
  upstox: ['upstox.com'],
  icici: ['www.icicidirect.com', 'icicidirect.com', 'www.icicisecurities.com'],
  cdsl: ['www.cdslindia.com', 'web.cdslindia.com'],
  angelone: ['www.angelone.in'],
  aionion: ['www.aionioncapital.com', 'aionioncapital.com'],
  chola: ['www.cholasecurities.com', 'cholasecurities.com'],
  mstock: ['www.mstock.com', 'trade.mstock.com', 'mstock.com'],
  '5paisa': ['www.5paisa.com'],
  vested: ['vestedfinance.com'],
  tickertape: ['www.tickertape.in'],
  stockal: ['www.stockal.com', 'stockal.com'],
  ibkr: ['www.interactivebrokers.com'],
  kuvera: ['kuvera.in', 'www.kuvera.in'],
  mfcentral: ['www.mfcentral.com', 'mfcentral.com'],
};

const exists = (p) => access(p).then(() => true, () => false);

async function get(url, ms = 12000) {
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA, accept: '*/*' }, redirect: 'follow', signal: AbortSignal.timeout(ms) });
    if (!res.ok) return null;
    return { buf: Buffer.from(await res.arrayBuffer()), type: res.headers.get('content-type') || '', url: res.url };
  } catch {
    return null;
  }
}

function sniff(buf) {
  const h = buf.subarray(0, 12);
  if (h[0] === 0x89 && h[1] === 0x50) return 'png';
  if (h[0] === 0xff && h[1] === 0xd8) return 'png'; // jpeg: browsers sniff it fine
  if (h[0] === 0 && h[1] === 0 && h[2] === 1 && h[3] === 0) return 'png'; // .ico
  if (buf.subarray(0, 4).toString() === 'RIFF') return 'png'; // webp
  const head = buf.subarray(0, 300).toString('utf8').toLowerCase();
  if (head.includes('<svg') || (head.includes('<?xml') && head.includes('svg'))) return 'svg';
  return null;
}

/** Icon URLs a site advertises in its own HTML, biggest/most logo-like first. */
async function pageIcons(domain) {
  const page = await get(`https://${domain}/`);
  if (!page) return [];
  const html = page.buf.toString('utf8');
  const found = [];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const rel = /rel=["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase() ?? '';
    const href = /href=["']([^"']+)["']/i.exec(tag)?.[1];
    if (!href || !/icon/.test(rel)) continue;
    const size = parseInt(/sizes=["'](\d+)/i.exec(tag)?.[1] ?? '0', 10);
    found.push({ href, score: (rel.includes('apple') ? 1000 : 0) + (href.endsWith('.svg') ? 500 : 0) + size });
  }
  found.sort((a, b) => b.score - a.score);
  const urls = found.map((f) => new URL(f.href, page.url).href);
  const og = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1];
  if (og) urls.push(new URL(og, page.url).href);
  return urls;
}

// Google answers unknown sites with one fixed generic-globe image; remember it so we can reject it.
const placeholder = (await get('https://www.google.com/s2/favicons?domain=zz-no-such-site-12345.invalid&sz=128'))?.buf;
const isPlaceholder = (buf) => !!placeholder && buf.equals(placeholder);

async function fetchLogo(key, domains) {
  const candidates = [];
  for (const d of domains) candidates.push(...(await pageIcons(d)));
  for (const d of domains) {
    candidates.push(`https://${d}/apple-touch-icon.png`);
    candidates.push(`https://www.google.com/s2/favicons?domain=${d}&sz=256`);
    candidates.push(`https://${d}/favicon.ico`);
  }
  for (const url of [...new Set(candidates)]) {
    const r = await get(url);
    if (!r || r.buf.length < 200 || isPlaceholder(r.buf)) continue;
    const kind = sniff(r.buf);
    if (!kind) continue;
    return { ...r, kind, source: url };
  }
  return null;
}

await mkdir(OUT, { recursive: true });
let ok = 0;
const missing = [];
for (const [key, domains] of Object.entries(BROKERS)) {
  const existing = (await exists(join(OUT, `${key}.png`))) || (await exists(join(OUT, `${key}.svg`)));
  if (existing && !FORCE) {
    console.log(`skip   ${key} (already there)`);
    ok++;
    continue;
  }
  const logo = await fetchLogo(key, domains);
  if (!logo) {
    console.log(`MISSING ${key}`);
    missing.push(key);
    continue;
  }
  await writeFile(join(OUT, `${key}.${logo.kind}`), logo.buf);
  console.log(`saved  ${key}.${logo.kind}  <- ${logo.source}`);
  ok++;
}
console.log(`\n${ok}/${Object.keys(BROKERS).length} logos ready.`);
if (missing.length) console.log(`Save these by hand as public/broker-logos/<key>.png: ${missing.join(', ')}`);
