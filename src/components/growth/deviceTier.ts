/**
 * 'high' → full 3D with bloom and shadows
 * 'low'  → 3D with fewer particles, no bloom or shadows, lower pixel ratio
 * 'none' → no WebGL, or a very weak device: show the 2D fallback instead
 */
export type GraphicsTier = 'high' | 'low' | 'none';

export function detectGraphicsTier(): GraphicsTier {
  if (typeof window === 'undefined' || typeof document === 'undefined') return 'none';

  try {
    const probe = document.createElement('canvas');
    const gl = (probe.getContext('webgl2') || probe.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return 'none';
    // Release the probe context right away so it doesn't count against the browser's limit.
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    return 'none';
  }

  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency ?? 4;
  const memory = nav.deviceMemory ?? 8;
  if (cores <= 2 || memory <= 2) return 'none';

  const mobile = /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent);
  if (mobile || cores <= 4 || memory <= 4) return 'low';
  return 'high';
}
