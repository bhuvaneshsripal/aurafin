import { Component, lazy, Suspense, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { band, formatLakh, ramp, scrollState, sipProjection, smooth } from './growthMath';
import { detectGraphicsTier, type GraphicsTier } from './deviceTier';
import './growth.css';

gsap.registerPlugin(ScrollTrigger);

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
 * progress, so it still animates with scroll (or shows its final frame).
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

  // Scroll-linked timeline. The section pins while progress runs 0 → 1,
  // and scrub ties every change to the scroll position (reverses on scroll up).
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
      // ---- Guided scroll -------------------------------------------------------------------
      // When the section reaches the top of the screen, page scrolling is held in place and the
      // person's scroll / swipe / arrow-key input drives the animation instead. The animation
      // moves at a limited speed, so it can never be skipped by scrolling fast. Once it has
      // played to the end (or back to the start) the page scrolls on normally.
      const MAX_RATE = 1 / 8; // fastest possible: the whole journey in ~8 seconds
      const AUTO_RATE = 1 / 11; // hands-free speed: the journey plays by itself in ~11 seconds
      const LEAD = 0.05; // how far input may run ahead of what is on screen
      const SCREENS = 4; // scroll distance (in screen heights) that equals the whole journey
      let current = 0; // what is on screen
      let target = 0; // where input wants it to be
      let locked = false;
      let touchY = 0;

      let st: ScrollTrigger | undefined;
      const startY = () => st?.start ?? window.scrollY;

      const push = (deltaPx: number): boolean => {
        // Returns true when the animation used the input (so the page must not scroll).
        if (deltaPx > 0 && current >= 0.9995) return false;
        if (deltaPx < 0 && current <= 0.0005) return false;
        const next = target + deltaPx / (window.innerHeight * SCREENS);
        target = Math.min(1, Math.max(0, current - LEAD, Math.min(next, current + LEAD)));
        return true;
      };

      const onWheel = (e: WheelEvent) => {
        const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1;
        if (push(e.deltaY * unit)) e.preventDefault();
        else unlock();
      };
      const onTouchStart = (e: TouchEvent) => {
        touchY = e.touches[0].clientY;
      };
      const onTouchMove = (e: TouchEvent) => {
        const y = e.touches[0].clientY;
        const d = touchY - y;
        touchY = y;
        if (push(d * 1.4)) {
          if (e.cancelable) e.preventDefault();
        } else unlock();
      };
      const onKey = (e: KeyboardEvent) => {
        const vh = window.innerHeight;
        const d =
          e.key === 'ArrowDown' ? vh * 0.2 :
          e.key === 'ArrowUp' ? -vh * 0.2 :
          e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey) ? vh * 0.6 :
          e.key === 'PageUp' || (e.key === ' ' && e.shiftKey) ? -vh * 0.6 : 0;
        if (!d) return;
        if (push(d)) e.preventDefault();
        else unlock();
      };
      // Keeps the page still while locked (covers scrollbar dragging and other scroll sources).
      const onScrollHold = () => {
        if (locked && Math.abs(window.scrollY - startY()) > 1) window.scrollTo(0, startY());
      };

      const lock = () => {
        if (locked) return;
        locked = true;
        window.scrollTo(0, startY());
        window.addEventListener('wheel', onWheel, { passive: false });
        window.addEventListener('touchstart', onTouchStart, { passive: true });
        window.addEventListener('touchmove', onTouchMove, { passive: false });
        window.addEventListener('keydown', onKey);
        window.addEventListener('scroll', onScrollHold, { passive: true });
      };
      function unlock() {
        if (!locked) return;
        locked = false;
        window.removeEventListener('wheel', onWheel);
        window.removeEventListener('touchstart', onTouchStart);
        window.removeEventListener('touchmove', onTouchMove);
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('scroll', onScrollHold);
      }

      st = ScrollTrigger.create({
        trigger: wrap,
        start: 'top top',
        end: '+=2',
        invalidateOnRefresh: true,
        onEnter: () => {
          // Arriving from above: play from the start unless it has already finished.
          if (current < 0.9995) lock();
        },
        onEnterBack: () => {
          // Arriving from below: finish playing forward if it was left part-way.
          if (current < 0.9995) lock();
        },
        onLeave: () => {
          // Scrolled straight past the section (fast flick, scrollbar drag, End key) before the
          // animation finished: pull the page back to the section so the animation still plays.
          if (current < 0.9995) {
            lock();
            window.scrollTo(0, startY());
          } else {
            unlock();
          }
        },
        onLeaveBack: unlock,
      });

      const tick = (_time: number, deltaMs: number) => {
        const dt = Math.min(deltaMs, 100) / 1000;
        // Hands-free: while the section is on screen the journey advances by itself, so nobody
        // has to scroll to see it. Scroll / swipe / keys still speed it up (within LEAD).
        if (target < 1) {
          const r = wrap.getBoundingClientRect();
          const vh = window.innerHeight;
          if (r.top < vh * 0.35 && r.bottom > vh * 0.5) {
            target = Math.min(1, current + LEAD, target + AUTO_RATE * dt);
          }
        }
        const diff = target - current;
        if (diff === 0) return;
        if (Math.abs(diff) < 0.00005) {
          current = target;
        } else {
          current += Math.sign(diff) * Math.min(Math.abs(diff), MAX_RATE * dt);
        }
        render(current);
      };
      gsap.ticker.add(tick);
      cleanupTick = () => {
        gsap.ticker.remove(tick);
        unlock();
      };
    }, wrap);

    // Re-measure once the page-in fade has settled, so pin positions are exact.
    const refreshTimer = window.setTimeout(() => ScrollTrigger.refresh(), 800);

    return () => {
      window.clearTimeout(refreshTimer);
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
