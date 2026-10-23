import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Coins, PiggyBank, ShieldCheck, Target, TrendingUp, Wallet, Landmark } from 'lucide-react';
import type { ComponentType } from 'react';

/**
 * Centre carousel for the login page. 7 slides, auto-advancing every 6s.
 *
 * Each slide looks for a real photo at /public/login-slides/<n>.jpg
 * (.png). Wide or small images are shown whole (object-fit: contain) over a blurred copy of themselves, so nothing is cropped.
 * Until a photo exists - or if it fails to load - the slide shows a themed
 * gradient with an icon, so the page never looks broken.
 */
interface Slide {
  title: string;
  sub: string;
  alt: string;
  image: string;
  Icon: ComponentType<{ size?: number | string; strokeWidth?: number | string }>;
  gradient: string;
}

const SLIDES: Slide[] = [
  { title: 'Track the markets', sub: 'Live charts and trends, always in view.', alt: 'Glowing stock market chart with candlesticks and price numbers', image: '/login-slides/1.png', Icon: Wallet, gradient: 'linear-gradient(135deg,#0f3d2b,#2f9e6a)' },
  { title: 'Smart investments', sub: 'Stocks, funds and gold in one view.', alt: 'Old book with the word Investments on its spine', image: '/login-slides/2.png', Icon: TrendingUp, gradient: 'linear-gradient(135deg,#0b2545,#1c7ed6)' },
  { title: 'Confident trading', sub: 'Follow every move with live prices.', alt: 'Phone showing a candlestick trading chart', image: '/login-slides/3.png', Icon: Landmark, gradient: 'linear-gradient(135deg,#1b1b2f,#5b4a8a)' },
  { title: 'All your assets together', sub: 'Stocks, crypto and cash, tracked in one place.', alt: 'Phone, tablet and laptop showing crypto and trading screens with coins behind', image: '/login-slides/4.png', Icon: Coins, gradient: 'linear-gradient(135deg,#3a0f3f,#e0526b)' },
  { title: 'Live prices', sub: 'Real-time gains and losses across your holdings.', alt: 'Screen full of green and red stock percentage changes', image: '/login-slides/5.png', Icon: PiggyBank, gradient: 'linear-gradient(135deg,#4a2c00,#e9a23b)' },
  { title: 'Bull or bear, stay in control', sub: 'Plan your goals through every market cycle.', alt: 'Toy bear and bull facing each other on a newspaper stock page', image: '/login-slides/6.png', Icon: Target, gradient: 'linear-gradient(135deg,#102a43,#3e8ea6)' },
  { title: 'Save first, spend the rest', sub: 'Build savings habits that compound over time.', alt: 'Investor quote graphic about saving before spending', image: '/login-slides/7.png', Icon: ShieldCheck, gradient: 'linear-gradient(135deg,#17352a,#3d6b5a)' },
];

const INTERVAL_MS = 6000;

export default function LoginShowcase() {
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState<Record<number, boolean>>({});
  const timer = useRef<number | null>(null);

  const restart = useCallback(() => {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = window.setInterval(() => setIndex((i) => (i + 1) % SLIDES.length), INTERVAL_MS);
  }, []);

  useEffect(() => {
    restart();
    return () => {
      if (timer.current !== null) window.clearInterval(timer.current);
    };
  }, [restart]);

  const go = (i: number) => {
    setIndex((i + SLIDES.length) % SLIDES.length);
    restart();
  };

  const active = SLIDES[index];

  return (
    <section className="lp-showcase" aria-roledescription="carousel" aria-label="Aurafin highlights">
      <div className="lp-stage">
        {SLIDES.map((s, i) => (
          <div key={s.title} className={`lp-slide${i === index ? ' is-on' : ''}`} aria-hidden={i !== index} style={{ background: s.gradient }}>
            {!failed[i] && (
              <img src={s.image} alt="" aria-hidden="true" className="lp-bg" draggable={false} />
            )}
            {!failed[i] && (
              <img
                src={s.image}
                alt={s.alt}
                className="lp-img"
                loading={i === 0 ? 'eager' : 'lazy'}
                draggable={false}
                onError={() => setFailed((f) => ({ ...f, [i]: true }))}
              />
            )}
            {failed[i] && (
              <div className="lp-fallback">
                <s.Icon size="35%" strokeWidth={1.4} />
              </div>
            )}
          </div>
        ))}
        <button type="button" className="lp-arrow lp-prev" onClick={() => go(index - 1)} aria-label="Previous slide">
          <ChevronLeft size={22} />
        </button>
        <button type="button" className="lp-arrow lp-next" onClick={() => go(index + 1)} aria-label="Next slide">
          <ChevronRight size={22} />
        </button>
      </div>

      <div className="lp-caption" aria-live="polite">
        <h2 className="font-brand text-ink">{active.title}</h2>
        <p className="text-slate-600">{active.sub}</p>
      </div>

      <div className="lp-dots" role="tablist" aria-label="Choose slide">
        {SLIDES.map((s, i) => (
          <button key={s.title} type="button" role="tab" aria-selected={i === index} aria-label={`Slide ${i + 1}: ${s.title}`} className={`lp-dot${i === index ? ' is-on' : ''}`} onClick={() => go(i)} />
        ))}
      </div>
    </section>
  );
}
