import { Component, lazy, Suspense, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { gsap } from 'gsap';
import { band, formatLakh, ramp, scrollState, sipProjection, smooth } from './growthMath';
import { detectGraphicsTier, type GraphicsTier } from './deviceTier';
import './growth.css';

// The 3D engine (three.js + R3F) only downloads when this section nears the viewport.
const GrowthScene = lazy(() => import('./GrowthScene'));

/** Scroll ranges for each caption: [fadeInStart, fadeInEnd, fadeOutStart, fadeOutEnd]. */
type BandKey = 'hero' | 'middle' | 'growth' | 'final';
const BANDS: Record<BandKey, [number, number, number, number]> = {
  hero: [0, 0, 0.16, 0.25],
  middle: [0.27, 0.36, 0.46, 0.55],
  growth: [0.55, 0.64, 0.8, 0.88],
  final: [0.86, 0.94, 1, 1],
};

/**
 * Illustrative only: ₹10,000 a month for 20 years at an ASSUMED 8% a year.
 * This is hypothetical arithmetic, not a forecast or a promised return.
 */
const PROJECTION = sipProjection(10000, 8, 20);

/** Catches a WebGL/runtime failure in the 3D scene and swaps in the 2D fallback. */
class SceneBoundary extends Component<
  { children: ReactNode; fallback: ReactNode; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * 2D fallback for devices without WebGL, weak hardware, or reduced-motion
 * preference. Driven by the same --gj-p CSS variable as the 3D scene's
 * progress, so it still autoplays (or shows its final frame).
 */
function FallbackArt() {
  const bars = [
    { x: 118, h: 0.35 },
    { x: 196, h: 0.5 },
    { x: 274, h: 0.66 },
    { x: 352, h: 0.8 },
    { x: 430, h: 0.95 },
  ];
  return (
    <div className="gj-fallback" aria-hidden="true">
      <svg viewBox="0 0 600 400" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="gj-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#34d399" stopOpacity="0.35" />
            <stop offset="1" stopColor="#34d399" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="gj-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#10b981" />
            <stop offset="1" stopColor="#fde68a" />
          </linearGradient>
        </defs>
        <path
          className="gj-fb-area"
          d="M40 340 C 160 330, 220 300, 300 250 S 480 120, 560 60 L 560 360 L 40 360 Z"
          fill="url(#gj-area)"
        />
        {bars.map((b, i) => (
          <rect
            key={b.x}
            className="gj-fb-bar"
            x={b.x}
            y={340 - 260 * b.h}
            width={40}
            height={260 * b.h}
            rx={6}
            fill="#0e7f5a"
            fillOpacity={0.55}
            style={{ '--h': b.h, '--i': i } as CSSProperties}
          />
        ))}
        <path
          className="gj-fb-line"
          pathLength={1}
          d="M40 340 C 160 330, 220 300, 300 250 S 480 120, 560 60"
          fill="none"
          stroke="url(#gj-line)"
          strokeWidth={5}
          strokeLinecap="round"
        />
        <circle className="gj-fb-coin" cx={40} cy={340} r={16} />
        <circle className="gj-fb-tip" cx={560} cy={60} r={9} />
      </svg>
    </div>
  );
}

export default function GrowthJourney() {
  const wrapRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const [reduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [tier] = useState<GraphicsTier>(() => (reduced ? 'none' : detectGraphicsTier()));
  const [nearView, setNearView] = useState(false);
  const [inView, setInView] = useState(false);
  const [sceneBroken, setSceneBroken] = useState(false);

  const useScene = !reduced && tier !== 'none' && !sceneBroken;

  // Mount the 3D scene only when close to the viewport, and pause its loop when off-screen.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setNearView(true);
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setNearView(true);
        setInView(entry.isIntersecting);
      },
      { rootMargin: '300px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Time-driven timeline: progress runs 0 → 1 on its own while the section is visible.
  useEffect(() => {
    const wrap = wrapRef.current;
    const stage = stageRef.current;
    if (!wrap || !stage || reduced) return;

    let cleanupTick = () => {};
    const ctx = gsap.context(() => {
      const bands = Array.from(stage.querySelectorAll<HTMLElement>('[data-band]')).map((el) => ({
        el,
        cfg: BANDS[el.dataset.band as BandKey],
      }));
      const dots = Array.from(stage.querySelectorAll<HTMLElement>('[data-dot]'));
      const counters = Array.from(stage.querySelectorAll<HTMLElement>('[data-counter]'));
      const bar = stage.querySelector<HTMLElement>('[data-progress]');

      const render = (p: number) => {
        scrollState.progress = p;
        stage.style.setProperty('--gj-p', p.toFixed(4));

        for (const { el, cfg } of bands) {
          const v = band(p, cfg[0], cfg[1], cfg[2], cfg[3]);
          el.style.opacity = v.toFixed(3);
          el.style.transform = `translate3d(0, ${((1 - v) * 22).toFixed(1)}px, 0)`;
          el.style.visibility = v < 0.005 ? 'hidden' : 'visible';
        }

        const activeDot = p < 0.27 ? 0 : p < 0.55 ? 1 : p < 0.86 ? 2 : 3;
        dots.forEach((d, i) => d.classList.toggle('is-on', i === activeDot));

        for (const el of counters) {
          const isInvested = el.dataset.counter === 'invested';
          const target = isInvested ? PROJECTION.invested : PROJECTION.value;
          const k = isInvested ? smooth(ramp(p, 0.6, 0.78)) : smooth(ramp(p, 0.6, 0.84));
          el.textContent = formatLakh(target * k);
        }

        if (bar) bar.style.transform = `scaleX(${p.toFixed(4)})`;
      };

      render(0);
      // ---- Autoplay ------------------------------------------------------------------------
      // The journey plays by itself, on a timer, while the section is on screen. Scrolling only
      // moves the page: it never speeds up, skips, pauses or reverses the animation.
      const DURATION = 14; // seconds for the whole journey
      let current = 0;
      let visible = false;

      const io = new IntersectionObserver(
        ([entry]) => {
          visible = entry.isIntersecting;
        },
        { threshold: 0.5 },
      );
      io.observe(wrap);

      const tick = (_time: number, deltaMs: number) => {
        if (!visible || current >= 1) return;
        current = Math.min(1, current + Math.min(deltaMs, 100) / 1000 / DURATION);
        render(current);
      };
      gsap.ticker.add(tick);
      cleanupTick = () => {
        gsap.ticker.remove(tick);
        io.disconnect();
      };
    }, wrap);

    return () => {
      cleanupTick();
      ctx.revert();
      scrollState.progress = 0;
      scrollState.smooth = 0;
    };
  }, [reduced]);

  const sceneTier = tier === 'high' ? 'high' : 'low';

  return (
    <section
      ref={wrapRef}
      className={`gj-wrap${reduced ? ' is-static' : ''}`}
      aria-labelledby="gj-title"
    >
      <div ref={stageRef} className="gj-stage">
        <div className="gj-bg" aria-hidden="true" />

        <div className="gj-visual" aria-hidden="true">
          {useScene && nearView ? (
            <SceneBoundary fallback={<FallbackArt />} onError={() => setSceneBroken(true)}>
              <Suspense fallback={<FallbackArt />}>
                <GrowthScene
                  tier={sceneTier}
                  paused={!inView}
                  onContextLost={() => setSceneBroken(true)}
                />
              </Suspense>
            </SceneBoundary>
          ) : (
            <FallbackArt />
          )}
        </div>
        <div className="gj-vignette" aria-hidden="true" />

        <div className="gj-progress" aria-hidden="true">
          <span className="gj-progress-bar" data-progress />
        </div>

        <div className="gj-copy">
          <div className="gj-cap" data-band="hero">
            <p className="gj-kicker">The compounding journey</p>
            <h2 id="gj-title" className="gj-title">
              Every Great Fortune Starts Small.
            </h2>
            <p className="gj-sub">A steady first step, taken early, is where lasting wealth begins.</p>
          </div>

          <div className="gj-cap" data-band="middle">
            <p className="gj-kicker">The ingredients</p>
            <h2 className="gj-title">Time. Consistency. Compounding.</h2>
            <p className="gj-sub">
              Returns are never guaranteed. Time in the market and regular habits are the levers you control.
            </p>
          </div>

          <div className="gj-cap" data-band="growth">
            <p className="gj-kicker">The growth</p>
            <h2 className="gj-title">Let Your Money Grow.</h2>
            <p className="gj-sub">Illustration: ₹10,000 a month for 20 years, at an assumed 8% a year.</p>
            <div className="gj-stats">
              <div className="gj-stat">
                <span className="gj-stat-label">Total invested</span>
                <span className="gj-stat-value" data-counter="invested">{reduced ? formatLakh(PROJECTION.invested) : '₹0'}</span>
                <span className="gj-stat-note">Your contributions</span>
              </div>
              <div className="gj-stat gj-stat-hi">
                <span className="gj-stat-label">Illustrative value</span>
                <span className="gj-stat-value" data-counter="value">{reduced ? formatLakh(PROJECTION.value) : '₹0'}</span>
                <span className="gj-stat-note">Hypothetical. Not a forecast or a promise.</span>
              </div>
              <div className="gj-stat">
                <span className="gj-stat-label">Time in the market</span>
                <span className="gj-stat-value">20 years</span>
                <span className="gj-stat-note">Regular contributions, patiently held</span>
              </div>
            </div>
          </div>

          <div className="gj-cap" data-band="final">
            <p className="gj-kicker">The destination</p>
            <h2 className="gj-title">Build Wealth for Tomorrow.</h2>
            <p className="gj-sub">Start with what you have. Stay consistent. Let time do its work.</p>
          </div>
        </div>

        <div className="gj-dots" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} data-dot className="gj-dot" />
          ))}
        </div>

        <p className="gj-disclaimer">
          Illustrative visuals for education only. Not financial advice. Returns are not guaranteed, and all
          investments carry market risk.
        </p>
      </div>
    </section>
  );
}
