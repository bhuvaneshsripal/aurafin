/**
 * Pure helpers for the growth-journey section. No DOM and no three.js here,
 * so this file stays cheap to import from both the page and the 3D scene.
 */

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** 0 → 1 as `p` travels from `a` to `b`. */
export const ramp = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));

/** Smoothstep easing for a 0–1 value. */
export const smooth = (t: number) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);

/**
 * Opacity of a caption or panel over the scroll range.
 * Fades in across [a, b] and out across [c, d].
 * `a <= 0` means visible from the very start; `d >= 1` means it stays to the end.
 */
export function band(p: number, a: number, b: number, c: number, d: number): number {
  const fadeIn = a <= 0 ? 1 : smooth(ramp(p, a, b));
  const fadeOut = d >= 1 ? 1 : 1 - smooth(ramp(p, c, d));
  return fadeIn * fadeOut;
}

/**
 * Shared scroll state. GSAP's ScrollTrigger writes `progress` (0 → 1);
 * the 3D scene reads `smooth`, a lightly damped copy that keeps motion
 * fluid even when the scroll is jerky. Written outside React on purpose:
 * this changes every frame and must not trigger re-renders.
 */
export const scrollState = { progress: 0, smooth: 0 };

/** Deterministic PRNG so the tree, leaves and floating coins look the same every visit. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Illustrative monthly-SIP projection. This is a hypothetical calculation
 * with an assumed rate. It is not a forecast and does not promise a return.
 */
export function sipProjection(monthly: number, annualRatePct: number, years: number) {
  const n = years * 12;
  const r = annualRatePct / 100 / 12;
  return {
    invested: monthly * n,
    value: monthly * (((1 + r) ** n - 1) / r) * (1 + r),
  };
}

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** Indian-style compact rupee amount: ₹24.0 L, ₹1.20 Cr. */
export function formatLakh(v: number) {
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(1)} L`;
  return `₹${inr.format(Math.round(v))}`;
}
