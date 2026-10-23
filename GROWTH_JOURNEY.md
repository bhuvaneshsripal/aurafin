# Investment growth journey (Login page section)

A scroll-driven 3D section shown on the public Login page, between the
showcase carousel and the stock analysis article. The authenticated app is unchanged.

## Files
- `src/components/growth/GrowthJourney.tsx` – section layout, GSAP ScrollTrigger pin + scrub, captions, counters, 2D fallback, reduced-motion layout.
- `src/components/growth/GrowthScene.tsx` – React Three Fiber scene (lazy-loaded): seed coin, coin stacks, compounding graph, golden tree, arrow, camera path.
- `src/components/growth/growthMath.ts` – easing, caption bands, shared scroll state, illustrative SIP maths.
- `src/components/growth/deviceTier.ts` – picks `high` / `low` / `none` (fallback) from WebGL support and device hints.
- `src/components/growth/growth.css` – scoped styles (`.gj-*`).

## Behaviour
- The section pins for ~3.6 viewports of scroll; progress 0 → 1 drives every element. Scrolling up reverses it.
- Device tiers: `high` (bloom, shadows, more particles), `low` (no bloom/shadows, lower pixel ratio), `none` (2D SVG chart; used when WebGL is missing, the device is very weak, or the user prefers reduced motion).
- The 3D bundle (three.js, drei, postprocessing) loads only when the section approaches the viewport.
- The render loop pauses when the section is off-screen.

## Figures
The growth numbers are a hypothetical calculation (₹10,000/month, 20 years, assumed 8% a year). They are labelled as illustrative. Do not present them as forecasts or guaranteed returns.

## Changing the copy or timing
Caption text lives in `GrowthJourney.tsx`. Scroll ranges for each caption are in the `BANDS` table. Camera keyframes are in `GrowthScene.tsx` (`CAM_POS`, `CAM_LOOK`).
