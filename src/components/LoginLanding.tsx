import { useEffect, useState } from 'react';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase/config';
import type { ReactNode } from 'react';
import {
  Briefcase,
  Check,
  ChevronDown,
  Download,
  FileText,
  Globe,
  Landmark,
  Layers,
  Lightbulb,
  ShieldCheck,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  Database,
  Star,
  X,
} from 'lucide-react';
import './landing.css';

/**
 * Marketing sections for the signed-out login page: hero with phone mockup,
 * feature grid, product showcase, privacy promises, FAQ, closing call to action
 * and footer. All figures inside the phone mockups are sample data.
 */

interface Props {
  onSignup: () => void;
  onDemo: () => void;
  demoLoading: boolean;
  demoError: string;
}

/* ------------------------------------------------------------------ */
/* Hero phone                                                          */
/* ------------------------------------------------------------------ */

type TabKey = 'networth' | 'spending' | 'investments' | 'allocation';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'networth', label: 'Net worth' },
  { key: 'spending', label: 'Spending' },
  { key: 'investments', label: 'Investments' },
  { key: 'allocation', label: 'Allocation' },
];

const DONUT = [
  { pct: 34, color: '#2f8558' },
  { pct: 22, color: '#3b82f6' },
  { pct: 18, color: '#8b5cf6' },
  { pct: 14, color: '#ef4444' },
  { pct: 12, color: '#f59e0b' },
];

function Donut({ label, value }: { label: string; value: string }) {
  const r = 38;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="fb-donut">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        {DONUT.map((d) => {
          const len = (d.pct / 100) * c;
          const el = (
            <circle
              key={d.color}
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke={d.color}
              strokeWidth="13"
              strokeDasharray={`${len - 1.5} ${c - len + 1.5}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 50 50)"
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="fb-donut-mid">
        <span>{label}</span>
        <b>{value}</b>
      </div>
    </div>
  );
}

function PhoneScreen({ tab }: { tab: TabKey }) {
  if (tab === 'networth') {
    return (
      <>
        <div className="fb-ph-head">
          <div>
            <h3>Net worth</h3>
            <small>November 2026</small>
          </div>
        </div>
        <div className="fb-ph-card">
          <small className="fb-caps">Your current net worth</small>
          <div className="fb-ph-big">₹71,27,500</div>
          <div className="fb-ph-split">
            <span>Assets <b>₹1.14 Cr</b></span>
            <span>Liabilities <b className="neg">₹42.84L</b></span>
          </div>
        </div>
        <div className="fb-ph-tip"><Lightbulb size={14} /><p><b>Up 24.7%</b> since you started. Keep adding a snapshot every month.</p></div>
        <div className="fb-ph-card">
          <small className="fb-caps">Net worth history · sample</small>
          <Line />
        </div>
      </>
    );
  }
  if (tab === 'investments') {
    return (
      <>
        <div className="fb-ph-head">
          <div>
            <h3>Investments</h3>
            <small>Sample portfolio</small>
          </div>
        </div>
        <div className="fb-ph-row2">
          <div className="fb-ph-card"><small>Invested</small><b>₹28.4L</b></div>
          <div className="fb-ph-card"><small>Current</small><b>₹35.4L</b></div>
        </div>
        <div className="fb-ph-card">
          <small className="fb-caps">Gain</small>
          <div className="fb-ph-big pos">+₹7.0L</div>
          <small>+24.7% overall</small>
        </div>
        <div className="fb-ph-card">
          <small className="fb-caps">Net worth history · sample</small>
          <Line />
        </div>
      </>
    );
  }
  if (tab === 'allocation') {
    return (
      <>
        <div className="fb-ph-head">
          <div>
            <h3>Allocation</h3>
            <small>Where your money sits</small>
          </div>
        </div>
        <div className="fb-ph-card fb-ph-chart">
          <small className="fb-caps">Asset allocation · % of net worth</small>
          <Donut label="Total" value="₹71.3L" />
          <div className="fb-legend">
            {['Property', 'Mutual funds', 'Stocks', 'EPF / PPF', 'Gold'].map((n, i) => (
              <span key={n}><i style={{ background: DONUT[i].color }} />{n}</span>
            ))}
          </div>
        </div>
      </>
    );
  }
  return (
    <>
      <div className="fb-ph-head">
        <div>
          <h3>Money Insights</h3>
          <small>November 2026</small>
        </div>
      </div>
      <div className="fb-ph-row2">
        <div className="fb-ph-card fb-ph-stat">
          <span className="fb-ph-ico pos"><TrendingUp size={14} /></span>
          <div><small>Total Income</small><b>₹1.71L</b></div>
        </div>
        <div className="fb-ph-card fb-ph-stat">
          <span className="fb-ph-ico neg"><TrendingDown size={14} /></span>
          <div><small>Total Expenses</small><b className="neg">₹43.8K</b></div>
        </div>
      </div>
      <div className="fb-ph-card fb-ph-stat">
        <span className="fb-ph-ico brand"><Briefcase size={14} /></span>
        <div><small>Total Invested</small><b>₹45K</b><small>26% of income</small></div>
      </div>
      <div className="fb-ph-tip">
        <Lightbulb size={14} />
        <p><b>26% invested this month.</b> Keep it consistent and let compounding do the rest.</p>
        <X size={12} />
      </div>
      <div className="fb-ph-card fb-ph-chart">
        <small className="fb-caps">Expenses by category · 1 month</small>
        <Donut label="Total" value="₹43.8K" />
      </div>
    </>
  );
}

function Line() {
  return (
    <svg className="fb-line" viewBox="0 0 220 80" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="fbLineFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2f8558" stopOpacity="0.25" />
          <stop offset="1" stopColor="#2f8558" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M0 70 L25 62 L50 58 L75 50 L100 44 L130 36 L160 28 L190 20 L220 12 L220 80 L0 80 Z" fill="url(#fbLineFill)" />
      <path d="M0 70 L25 62 L50 58 L75 50 L100 44 L130 36 L160 28 L190 20 L220 12" fill="none" stroke="#2f8558" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function Phone({ children, large, fixed }: { children: ReactNode; large?: boolean; fixed?: boolean }) {
  return (
    <div className={`fb-phone${large ? ' is-large' : ''}${fixed ? ' is-fixed' : ''}`}>
      <div className="fb-phone-screen">{children}</div>
    </div>
  );
}

const PHONE_W = 304;
const PHONE_H = 590;

/** Scale for the hero phone so it always fits fully inside the first screen. */
function useHeroScale() {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const calc = () => {
      if (window.innerWidth <= 900) return setScale(1);
      const avail = window.innerHeight - 64 - 70 - 40; // header, tab labels, breathing room
      setScale(Math.max(0.55, Math.min(1, avail / PHONE_H)));
    };
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);
  return scale;
}

const SHOW_W = 340;
const SHOW_H = 480;

/** Scale for the showcase phones so heading + phones + captions fit one screen. */
function useShowScale() {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const calc = () => {
      if (window.innerWidth <= 640) return setScale(1);
      const avail = window.innerHeight - 64 - 120 - 90 - 70; // header, heading, captions, padding
      setScale(Math.max(0.5, Math.min(1, avail / SHOW_H)));
    };
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);
  return scale;
}

function ScaledPhone({ scale, children }: { scale: number; children: ReactNode }) {
  return (
    <div style={{ width: SHOW_W * scale, height: SHOW_H * scale }}>
      <div style={{ width: SHOW_W, height: SHOW_H, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        <Phone large fixed>{children}</Phone>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Static content                                                      */
/* ------------------------------------------------------------------ */

const FEATURES = [
  { Icon: Layers, title: 'Every asset and loan', body: 'PPF, EPF, NPS, FD, mutual funds, stocks, gold and property, minus your loans, in one net worth.' },
  { Icon: FileText, title: 'Income and expenses', body: 'Track salary and spending by category, set budgets and see what you saved each month.' },
  { Icon: Download, title: 'Import from brokers', body: 'Bring in holdings from Zerodha, Groww, INDmoney, ICICI Direct, Tickertape and more.' },
  { Icon: Landmark, title: 'Loans and EMIs', body: 'Home, car and personal loans, with the outstanding balance worked out from each EMI.' },
  { Icon: Globe, title: 'Multiple currencies', body: 'US stocks in USD, savings in SGD, the total in INR or any base currency.' },
  { Icon: Target, title: 'Goals tied to real assets', body: 'Link the funds meant for retirement or a child’s education and track progress.' },
];

const PRIVACY = [
  { Icon: ShieldCheck, title: 'No Broker Access', body: 'We never connect to your brokerage or bank accounts. You control what gets entered.' },
  { Icon: Database, title: 'No Data Selling', body: 'We don’t sell your financial data or use it for ads. It’s used to run Aurafin for you.' },
  { Icon: Download, title: 'Full Data Export', body: 'Export your data (assets, liabilities, goals, transactions) anytime.' },
  { Icon: Trash2, title: 'Delete Any Time', body: 'Delete your account and all your financial data from Settings. No dark patterns.' },
];

/** TEMPORARY placeholder reviews. Replace with real feedback from your users, then set
 *  REVIEWS_ARE_PLACEHOLDER to false to hide the "sample" caption. */
type Review = { quote: string; name: string; handle?: string; rating?: number };
const SAMPLE_REVIEWS: Review[] = [
  { quote: 'I used to track everything in a spreadsheet. This feels like a real app.', name: 'Member name', handle: '@username' },
  { quote: 'All my investments in one clean place.', name: 'Member name', handle: '@username' },
  { quote: 'Easy to start, easy to navigate, even as a beginner.', name: 'Member name', handle: '@username' },
  { quote: 'Income, expenses and investments together. Exactly what I needed.', name: 'Member name', handle: '@username' },
  { quote: 'Well designed and simple to use. I can see all my assets at a glance.', name: 'Member name', handle: '@username' },
  { quote: 'Seeing my net worth grow every month keeps me saving more.', name: 'Member name', handle: '@username' },
];

const FAQ = [
  { q: 'Does Aurafin connect to my bank or broker accounts?', a: 'No. Aurafin is intentionally manual-first. You add assets yourself or import holdings files from Zerodha, Groww, INDmoney and other brokers, or any CSV. We never ask for your broker credentials and never connect to your bank. Your financial data stays in your control.' },
  { q: 'Is Aurafin really free?', a: 'Yes. You can create an account and start tracking your net worth with no credit card required.' },
  { q: 'What Indian assets does Aurafin support?', a: 'Aurafin understands Indian finances deeply. You can track EPF, VPF, PPF, NPS, Sukanya Samriddhi, NSC, KVP, SCSS, Sovereign Gold Bonds, equity, mutual funds, SIPs, fixed deposits, real estate, gold, silver, crypto and more. 50+ asset types covering everything on a typical Indian investor’s balance sheet.' },
  { q: 'Can NRIs use Aurafin with assets in multiple currencies?', a: 'Yes. Add assets in any of 15 currencies (INR, USD, EUR, SGD, GBP, AED and more) and see your consolidated net worth in INR, or whichever base currency you choose.' },
  { q: 'How is my data secured?', a: 'Your data is stored with Google Firebase and protected by your sign-in, and you can add a PIN lock to the app. We never sell your data or use it for ads. You can export your data anytime and delete your account and all your financial data from Settings.' },
];

function Reveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`fb-reveal ${className}`}>{children}</div>;
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

export default function LoginLanding({ onSignup, onDemo, demoLoading, demoError }: Props) {
  const [tab, setTab] = useState<TabKey>('spending');
  const [paused, setPaused] = useState(false);
  const [openFaq, setOpenFaq] = useState<number[]>([]);
  // Newest 6 real reviews (older ones stay in the database); samples until any exist.
  const [liveReviews, setLiveReviews] = useState<Review[]>([]);
  useEffect(() => {
    let alive = true;
    getDocs(query(collection(db, 'reviews'), orderBy('createdAt', 'desc'), limit(6)))
      .then((snap) => {
        if (!alive) return;
        setLiveReviews(
          snap.docs.map((d) => {
            const v = d.data() as { name?: string; message?: string; rating?: number };
            return { quote: v.message ?? '', name: v.name || 'Member', rating: v.rating };
          }).filter((r) => r.quote)
        );
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  const reviews = liveReviews.length ? liveReviews : SAMPLE_REVIEWS;
  const heroScale = useHeroScale();
  const showScale = useShowScale();

  // Rotate the phone mockup through its four views.
  useEffect(() => {
    if (paused) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setInterval(() => {
      setTab((t) => TABS[(TABS.findIndex((x) => x.key === t) + 1) % TABS.length].key);
    }, 3000);
    return () => window.clearInterval(id);
  }, [paused]);

  // Fade sections in as they scroll into view.
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('.fb-reveal'));
    if (typeof IntersectionObserver === 'undefined') {
      els.forEach((e) => e.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('is-in');
            io.unobserve(e.target);
          }
        }),
      { threshold: 0.12 }
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);

  return (
    <div className="fb">
      {/* Hero */}
      <section className="fb-hero">
        <div className="fb-hero-copy">
          <span className="fb-kicker">Personal finance, simplified</span>
          <h1 className="fb-serif">All your money, in one place.</h1>
          <p className="fb-lede">
            Track every account, asset, expense and goal in one dashboard. Mutual funds, stocks, PPF, EPF, gold and
            loans, added up into one net worth. No bank or broker logins, no ad trackers.
          </p>
          <div className="fb-cta-row">
            <button type="button" className="btn-press fb-btn fb-btn-primary" onClick={onSignup}>Get Started</button>
            <button type="button" className="btn-press fb-btn fb-btn-ghost" onClick={onDemo} disabled={demoLoading}>
              {demoLoading ? 'Starting demo…' : 'Try the live demo'}
            </button>
          </div>
          {demoError && <p className="lf-msg" role="alert">{demoError}</p>}
          <ul className="fb-checks">
            <li><Check size={14} /> Multiple currencies</li>
            <li><Check size={14} /> 50+ asset types</li>
            <li><Check size={14} /> Imports from your brokers</li>
          </ul>
        </div>

        <div className="fb-hero-visual" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
          <div className="fb-blob" aria-hidden="true" />
          <div style={{ width: PHONE_W * heroScale, height: PHONE_H * heroScale, position: 'relative' }}>
            <div style={{ width: PHONE_W, height: PHONE_H, transform: `scale(${heroScale})`, transformOrigin: 'top left' }}>
              <Phone fixed>
                <div key={tab} className="fb-fade"><PhoneScreen tab={tab} /></div>
              </Phone>
            </div>
          </div>
          <div className="fb-tabs" role="tablist" aria-label="Preview">
            {TABS.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={`fb-tab${tab === t.key ? ' is-on' : ''}`} onClick={() => setTab(t.key)}>
                <i />
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="fb-section" id="features">
        <Reveal>
          <h2 className="fb-serif fb-h2">Everything you own, owe and spend, in one place.</h2>
          <p className="fb-sub">Bring in your holdings, log what comes in and goes out, and see it all add up to one net worth.</p>
        </Reveal>
        <Reveal>
          <div className="fb-grid">
            {FEATURES.map(({ Icon, title, body }) => (
              <article key={title} className="fb-cell">
                <div className="fb-cell-head">
                  <span className="fb-ico"><Icon size={18} /></span>
                  <h3>{title}</h3>
                </div>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </Reveal>
      </section>

      {/* Showcase */}
      <section className="fb-show">
        <Reveal>
          <h2 className="fb-serif fb-h2 fb-center">Watch it grow. Know what it is made of.</h2>
        </Reveal>
        <Reveal className="fb-show-row">
          <figure>
            <ScaledPhone scale={showScale}>
              <div className="fb-ph-card">
                <small className="fb-caps">Your current net worth</small>
                <div className="fb-ph-big">₹71,27,500</div>
                <div className="fb-ph-split">
                  <span>Assets <b>₹1.14 Cr</b></span>
                  <span>Liabilities <b className="neg">₹42.84L</b></span>
                </div>
              </div>
              <div className="fb-ph-card">
                <b className="fb-ph-title">Net Worth History</b>
                <small>Values in ₹ INR · sample</small>
                <div className="fb-chart-wrap">
                  <div className="fb-yaxis"><span>₹62.72L</span><span>₹59.33L</span><span>₹55.95L</span><span>₹52.57L</span></div>
                  <Line />
                </div>
                <div className="fb-xaxis"><span>Mar 26</span><span>May 26</span><span>Jul 26</span><span>Sept 26</span><span>Nov 26</span></div>
              </div>
              <div className="fb-ph-card">
                <small className="fb-caps">Growth</small>
                <div className="fb-ph-big pos">₹12.3L</div>
                <small>+24.7% total</small>
              </div>
            </ScaledPhone>
            <figcaption><b>Net worth over time</b><span>Every month you save a snapshot, the line moves.</span></figcaption>
          </figure>
          <figure>
            <ScaledPhone scale={showScale}>
              <div className="fb-ph-card">
                <b className="fb-ph-title">Biggest holdings</b>
                <small>Your top 5 are 84% of your investments · sample</small>
                {[
                  ['2BHK, Whitefield', '₹65L', 59],
                  ['Nifty 50 Index Fund', '₹8.62L', 8],
                  ['EPF / VPF', '₹7.81L', 7],
                  ['Flexi Cap Fund', '₹6.34L', 6],
                  ['PPF', '₹5.23L', 5],
                ].map(([n, v, p]) => (
                  <div className="fb-hold" key={n as string}>
                    <div><span>{n}</span><b>{v}</b></div>
                    <div className="fb-bar"><i style={{ width: `${p}%` }} /></div>
                    <small>{p}%</small>
                  </div>
                ))}
              </div>
              <div className="fb-ph-card">
                <b className="fb-ph-title">Best performers</b>
                <div className="fb-perf"><span>Nifty 50 Index Fund</span><b>+₹2.52L (+41.3%)</b></div>
                <div className="fb-perf"><span>Nasdaq 100 Fund</span><b>+₹1.1L (+35.5%)</b></div>
              </div>
            </ScaledPhone>
            <figcaption><b>Your biggest holdings</b><span>Your flat, index fund, EPF and PPF, ranked by value.</span></figcaption>
          </figure>
        </Reveal>
      </section>

      {/* Reviews */}
      <section className="fb-section" id="reviews">
        <Reveal>
          <h2 className="fb-serif fb-h2">What our members say</h2>
          {!liveReviews.length && <p className="fb-sample-note">Sample reviews, shown until real ones are added.</p>}
        </Reveal>
        <Reveal>
          <div className="fb-reviews">
            {reviews.map((r, i) => (
              <figure key={i} className="fb-review">
                <span className="fb-quote-mark" aria-hidden="true">“</span>
                <blockquote>{r.quote}</blockquote>
                <figcaption>
                  <span className="fb-avatar">{r.name.charAt(0)}</span>
                  <span>
                    <b>{r.name}</b>
                    {r.rating ? (
                      <small className="fb-stars" aria-label={`${r.rating} out of 5 stars`}>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Star key={n} size={14} className={n <= r.rating! ? 'on' : ''} />
                        ))}
                      </small>
                    ) : (
                      <small>{r.handle}</small>
                    )}
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </Reveal>
      </section>

      {/* Privacy */}
      <section className="fb-dark" id="privacy">
        <Reveal className="fb-dark-in">
          <div>
            <h2 className="fb-serif fb-h2">Your finances, without handing over your logins.</h2>
            <p className="fb-dark-sub">
              What we do and don’t do with your data, in plain terms. The full version is in our{' '}
              <a href="/privacy" target="_blank" rel="noopener noreferrer">privacy policy</a>.
            </p>
          </div>
          <div className="fb-priv">
            {PRIVACY.map(({ Icon, title, body }) => (
              <div key={title} className="fb-priv-item">
                <div className="fb-cell-head"><span className="fb-ico"><Icon size={18} /></span><h3>{title}</h3></div>
                <p>{body}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* FAQ */}
      <section className="fb-section fb-faq" id="faq">
        <Reveal className="fb-faq-in">
          <h2 className="fb-serif fb-h2">Questions people ask first</h2>
          <div className="fb-faq-list">
            {FAQ.map((f, i) => (
              <div key={f.q} className={`fb-q${openFaq.includes(i) ? ' is-open' : ''}`}>
                <button type="button" aria-expanded={openFaq.includes(i)} onClick={() => setOpenFaq((c) => (c.includes(i) ? c.filter((x) => x !== i) : [...c, i]))}>
                  <span>{f.q}</span>
                  <ChevronDown size={18} />
                </button>
                {openFaq.includes(i) && <p>{f.a}</p>}
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* Closing CTA */}
      <section className="fb-final">
        <Reveal className="fb-final-in">
          <div>
            <h2 className="fb-serif">Start tracking your net worth today.</h2>
            <p>Add your assets, loans and goals in minutes. No credit card, no bank logins.</p>
          </div>
          <div className="fb-final-btns">
            <button type="button" className="btn-press fb-btn fb-btn-light" onClick={onSignup}>Get Started</button>
            <button type="button" className="btn-press fb-btn fb-btn-outline-light" onClick={onDemo} disabled={demoLoading}>
              {demoLoading ? 'Starting demo…' : 'Try the live demo'}
            </button>
          </div>
        </Reveal>
      </section>

      {/* Footer */}
      <footer className="fb-footer">
        <div className="fb-footer-in">
          <div>
            <span className="fb-serif fb-foot-brand">Aurafin<span>.</span></span>
            <p>All your money, in one place.</p>
          </div>
          <div>
            <h4>Product</h4>
            <button type="button" onClick={onDemo}>Live demo</button>
            <a href="#features">Features</a>
            <a href="#faq">FAQ</a>
          </div>
          <div>
            <h4>Legal</h4>
            <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
            <a href="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a>
          </div>
        </div>
        <div className="fb-footer-base">© 2026 Aurafin · Made in India</div>
      </footer>
    </div>
  );
}
