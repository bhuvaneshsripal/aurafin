import { useEffect, useState } from 'react';

/**
 * Re-frames a logo so it fills its tile properly.
 *
 * Logos arrive in every shape: a coloured square that bleeds to the edge, a
 * round mark on a transparent background, a tiny glyph floating in a big
 * white canvas. Dropped into a white tile as-is, they show white rims or look
 * small and off-centre. This reads the pixels, finds the real artwork, centres
 * it with even padding and paints the empty space with the logo's own
 * background colour, so the tile looks seamless.
 *
 * Needs readable pixels (same-origin, or a CORS-enabled host). When the image
 * can't be read, `fitLogo` resolves to null and the caller keeps the original.
 */
export interface FittedLogo {
  /** Re-framed square PNG (data URL). */
  url: string;
  /** Background colour of the tile, matching the logo's own. */
  bg: string;
}

const MAX_ANALYSE = 128;
const OUT = 128;

const cache = new Map<string, Promise<FittedLogo | null>>();
const resolved = new Map<string, FittedLogo | null>();

function loadImage(src: string, cors: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (cors) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('logo load failed'));
    img.src = src;
  });
}

function sameOrigin(src: string): boolean {
  if (src.startsWith('data:') || src.startsWith('/')) return true;
  try {
    return new URL(src, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}

function analyse(img: HTMLImageElement): FittedLogo | null {
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  if (!nw || !nh) return null;
  const k = Math.min(1, MAX_ANALYSE / Math.max(nw, nh));
  const w = Math.max(1, Math.round(nw * k));
  const h = Math.max(1, Math.round(nh * k));

  const probe = document.createElement('canvas');
  probe.width = w;
  probe.height = h;
  const pctx = probe.getContext('2d', { willReadFrequently: true });
  if (!pctx) return null;
  pctx.drawImage(img, 0, 0, w, h);
  let data: Uint8ClampedArray;
  try {
    data = pctx.getImageData(0, 0, w, h).data; // throws if the canvas is tainted
  } catch {
    return null;
  }

  // --- Look at the outer ring to learn what the background is. ---
  // The ring can hold rounded-corner leftovers and anti-aliasing, so rather
  // than averaging everything we find the dominant colour and average that.
  let ringCount = 0;
  let ringTransparent = 0;
  const ring: number[] = [];
  const visitRing = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    ringCount++;
    if (data[i + 3] < 24) {
      ringTransparent++;
      return;
    }
    ring.push(data[i], data[i + 1], data[i + 2]);
  };
  for (let x = 0; x < w; x++) { visitRing(x, 0); visitRing(x, h - 1); }
  for (let y = 1; y < h - 1; y++) { visitRing(0, y); visitRing(w - 1, y); }

  const transparentBg = ringTransparent / ringCount > 0.5;
  let bgR = 255, bgG = 255, bgB = 255;
  let uniform = false;
  const opaqueRing = ring.length / 3;
  if (!transparentBg && opaqueRing > 0) {
    const buckets = new Map<number, number>();
    for (let n = 0; n < ring.length; n += 3) {
      const key = ((ring[n] >> 5) << 6) | ((ring[n + 1] >> 5) << 3) | (ring[n + 2] >> 5);
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    let modeKey = 0, modeCount = 0;
    buckets.forEach((c, key) => {
      if (c > modeCount) { modeCount = c; modeKey = key; }
    });
    let sr = 0, sg = 0, sb = 0, sc = 0;
    for (let n = 0; n < ring.length; n += 3) {
      const key = ((ring[n] >> 5) << 6) | ((ring[n + 1] >> 5) << 3) | (ring[n + 2] >> 5);
      if (key === modeKey) { sr += ring[n]; sg += ring[n + 1]; sb += ring[n + 2]; sc++; }
    }
    bgR = sr / sc; bgG = sg / sc; bgB = sb / sc;
    // Mostly one colour around the edge = a flat background we can extend.
    uniform = sc / opaqueRing >= 0.7;
  }

  // --- Find the artwork's bounding box. ---
  let minX = w, minY = h, maxX = -1, maxY = -1, hits = 0;
  const trimmable = transparentBg || uniform;
  if (trimmable) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (data[i + 3] < 24) continue;
        if (!transparentBg) {
          const d = Math.hypot(data[i] - bgR, data[i + 1] - bgG, data[i + 2] - bgB);
          if (d < 48) continue;
        }
        hits++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (hits < w * h * 0.004) return null; // basically blank: keep the original
  } else {
    minX = 0; minY = 0; maxX = w - 1; maxY = h - 1;
  }

  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;
  const fullBleed = !trimmable || (bw >= w * 0.92 && bh >= h * 0.92);
  // Modest padding also keeps a source file's own faint outline out of frame.
  const pad = fullBleed ? 0 : 0.1;
  const side = Math.max(bw, bh) * (1 + pad * 2);
  const cx = (minX + maxX + 1) / 2;
  const cy = (minY + maxY + 1) / 2;
  const scale = OUT / side;

  const bg = transparentBg ? '#ffffff' : `rgb(${Math.round(bgR)}, ${Math.round(bgG)}, ${Math.round(bgB)})`;

  const out = document.createElement('canvas');
  out.width = OUT;
  out.height = OUT;
  const octx = out.getContext('2d');
  if (!octx) return null;
  octx.fillStyle = bg;
  octx.fillRect(0, 0, OUT, OUT);
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  // Draw the full-resolution image scaled into analysis space, positioned so the artwork is centred.
  octx.drawImage(img, OUT / 2 - cx * scale, OUT / 2 - cy * scale, w * scale, h * scale);
  if (trimmable) {
    // Repaint a thin frame in the background colour: hides a source file's own
    // faint outline / anti-aliased rim so the tile edge is perfectly clean.
    octx.strokeStyle = bg;
    octx.lineWidth = 16;
    octx.strokeRect(0, 0, OUT, OUT);
  }
  try {
    return { url: out.toDataURL('image/png'), bg };
  } catch {
    return null;
  }
}

/** Resolves to the re-framed logo, or null if it can't be read/improved. */
export function fitLogo(src: string): Promise<FittedLogo | null> {
  const hit = cache.get(src);
  if (hit) return hit;
  const p = loadImage(src, !sameOrigin(src))
    // The icon service answers unknown sites with a tiny generic globe: leave
    // that alone so BrokerLogo can still detect it and try the next source.
    .then((img) => (img.naturalWidth <= 16 && src.includes('google.com/s2/favicons') ? null : analyse(img)))
    .catch(() => null)
    .then((r) => {
      resolved.set(src, r);
      return r;
    });
  cache.set(src, p);
  return p;
}

/** React wrapper: null until (and unless) the logo could be re-framed. */
export function useFittedLogo(src: string | null | undefined): FittedLogo | null {
  const [fit, setFit] = useState<FittedLogo | null>(() => (src ? resolved.get(src) ?? null : null));
  useEffect(() => {
    if (!src) {
      setFit(null);
      return;
    }
    const known = resolved.get(src);
    if (known !== undefined) {
      setFit(known);
      return;
    }
    setFit(null);
    let alive = true;
    void fitLogo(src).then((r) => {
      if (alive) setFit(r);
    });
    return () => {
      alive = false;
    };
  }, [src]);
  return fit;
}
