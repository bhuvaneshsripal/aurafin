import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Coins, PiggyBank, ShieldCheck, Target, TrendingUp, Wallet, Landmark } from 'lucide-react';
import type { ComponentType } from 'react';

/**
 * Centre carousel for the login page. 7 slides, auto-advancing every 6s.
 *
 * Each slide looks for a real photo at /public/login-slides/<n>.jpg
 * (.jpg). Images fill the whole frame (object-fit: cover); `pos` sets which part stays in view.
 * Until a photo exists - or if it fails to load - the slide shows a themed
 * gradient with an icon, so the page never looks broken.
 */
interface Slide {
  title: string;
  sub: string;
  alt: string;
  image: string;
  /** CSS object-position, i.e. which part of the photo stays visible when cropped. */
  pos?: string;
  Icon: ComponentType<{ size?: number | string; strokeWidth?: number | string }>;
  gradient: string;
}

const SLIDES: Slide[] = [
  { title: 'Build wealth, step by step', sub: 'Invest, save and grow your money over time.', alt: 'Wooden blocks spelling Invest, Save, Grow and Build Wealth in front of coin stacks and a Financial Freedom jar', image: '/login-slides/1.webp', Icon: Wallet, gradient: 'linear-gradient(135deg,#0f3d2b,#2f9e6a)' },
  { title: 'Track the Nifty live', sub: 'Watch prices and gains across your favourite stocks.', alt: 'Laptop showing the Nifty 50 candlestick chart beside a list of rising stock prices', image: '/login-slides/2.webp', Icon: TrendingUp, gradient: 'linear-gradient(135deg,#0b2545,#1c7ed6)' },
  { title: 'Start with SIPs', sub: 'Mutual funds that compound your money steadily.', alt: 'Coin stacks topped with SIP, MF, Index, Equity and Wealth blocks beside a mutual fund checklist', image: '/login-slides/3.webp', Icon: Landmark, gradient: 'linear-gradient(135deg,#1b1b2f,#5b4a8a)' },
  { title: 'Gold, silver and more', sub: 'Diversify across precious metals, stocks and property.', alt: 'Gold bar, silver bars and coins beside a panel of gold, silver, stock and real estate returns', image: '/login-slides/4.webp', Icon: Coins, gradient: 'linear-gradient(135deg,#3a0f3f,#e0526b)' },
  { title: 'Plan your retirement', sub: 'Emergency funds, insurance and a plan you can repeat.', alt: 'Notebook with a retirement plan checklist and a pen', image: '/login-slides/5.webp', Icon: PiggyBank, gradient: 'linear-gradient(135deg,#4a2c00,#e9a23b)' },
  { title: 'Diversify your portfolio', sub: 'Balance funds, stocks, gold and cash to manage risk.', alt: 'Pie chart of a portfolio split across mutual funds, stocks, gold and cash', image: '/login-slides/6.webp', Icon: Target, gradient: 'linear-gradient(135deg,#102a43,#3e8ea6)' },
  { title: 'Reach your financial goals', sub: 'From buying a home to living freely.', alt: 'Notebook listing financial goals such as buying a house and early retirement, with a city sunset behind', image: '/login-slides/7.webp', Icon: ShieldCheck, gradient: 'linear-gradient(135deg,#17352a,#3d6b5a)' },
];

const INTERVAL_MS = 6000;

export default function LoginShowcase({ onCta }: { onCta?: () => void }) {
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState<Record<number, boolean>>({});
  const timer = useRef<number | null>(null);

  const restart = useCallback(() => {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = window.setInterval(() => setIndex((i) => (i + 1) % SLIDES.length), INTERVAL_MS);
  }, []);

  const root = useRef<HTMLElement | null>(null);

  // Auto-advance only while the carousel is on screen; stop once scrolled past it.
  useEffect(() => {
    const stop = () => {
      if (timer.current !== null) window.clearInterval(timer.current);
      timer.current = null;
    };
    const el = root.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      restart();
      return stop;
    }
    const io = new IntersectionObserver(([entry]) => (entry.isIntersecting ? restart() : stop()), { threshold: 0.2 });
    io.observe(el);
    return () => {
      io.disconnect();
      stop();
    };
  }, [restart]);

  const go = (i: number) => {
    setIndex((i + SLIDES.length) % SLIDES.length);
    restart();
  };

  const active = SLIDES[index];

  return (
    <section ref={root} className="lp-showcase" aria-roledescription="carousel" aria-label="Aurafin highlights">
      <div className="lp-stage">
        {SLIDES.map((s, i) => {
          // Absolute-positioned lazy images are all considered on-screen by
          // some browsers, which downloaded every full-resolution slide at
          // once. Keep only the active slide and its neighbours in the DOM;
          // the rest retain their existing gradient until needed.
          const forward = (i - index + SLIDES.length) % SLIDES.length;
          const backward = (index - i + SLIDES.length) % SLIDES.length;
          const shouldLoad = Math.min(forward, backward) <= 1;
          return (
          <div key={s.title} className={`lp-slide${i === index ? ' is-on' : ''}`} aria-hidden={i !== index} style={{ background: s.gradient }}>
            {s.image && shouldLoad && !failed[i] && (
              <img
                src={s.image}
                alt={s.alt}
                className="lp-img"
                style={{ objectPosition: s.pos ?? 'center' }}
                loading={i === 0 ? 'eager' : 'lazy'}
                fetchPriority={i === 0 ? 'high' : 'auto'}
                decoding="async"
                draggable={false}
                onError={() => setFailed((f) => ({ ...f, [i]: true }))}
              />
            )}
            {(!s.image || failed[i]) && (
              <div className="lp-fallback">
                <s.Icon size="35%" strokeWidth={1.4} />
              </div>
            )}
          </div>
          );
        })}
        <div className="lp-overlay">
          <div className="lp-caption" aria-live="polite">
            <h2 className="font-brand">{active.title}</h2>
            <p>{active.sub}</p>
          </div>
          <div className="lp-dots" role="tablist" aria-label="Choose slide">
            {SLIDES.map((s, i) => (
              <button key={s.title} type="button" role="tab" aria-selected={i === index} aria-label={`Slide ${i + 1}: ${s.title}`} className={`lp-dot${i === index ? ' is-on' : ''}`} onClick={() => go(i)} />
            ))}
          </div>
        </div>
        <button type="button" className="lp-arrow lp-prev" onClick={() => go(index - 1)} aria-label="Previous slide">
          <ChevronLeft size={22} />
        </button>
        <button type="button" className="lp-arrow lp-next" onClick={() => go(index + 1)} aria-label="Next slide">
          <ChevronRight size={22} />
        </button>
      </div>

      {onCta && (
        <button type="button" className="lp-cta btn-press" onClick={onCta}>
          Get started
        </button>
      )}
    </section>
  );
}
