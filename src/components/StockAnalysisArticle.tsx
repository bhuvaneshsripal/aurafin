import { useEffect, useRef, type ReactNode } from 'react';
import { AlertTriangle, BookOpen, ExternalLink, ListChecks } from 'lucide-react';

/**
 * Educational article shown below the carousel on the landing page.
 */
interface Metric {
  abbr: string;
  name: string;
  what: string;
  tip: string;
}

const METRICS: Metric[] = [
  {
    abbr: 'EPS',
    name: 'Earnings per share',
    what: 'The profit the company earns for each share. Rising EPS over several years is a good sign.',
    tip: 'Net profit ÷ number of shares',
  },
  {
    abbr: 'P/E',
    name: 'Price to earnings',
    what: 'How much you pay for each ₹1 of yearly profit. A high P/E expects strong growth; a low one may mean doubt.',
    tip: 'Share price ÷ EPS. Compare only within the same industry.',
  },
  {
    abbr: 'P/B',
    name: 'Price to book',
    what: 'Compares the share price with the net worth the company holds per share. Useful for banks and asset-heavy firms.',
    tip: 'Share price ÷ book value per share',
  },
  {
    abbr: 'ROE',
    name: 'Return on equity',
    what: 'How much profit the company makes on shareholders’ money. Steady, healthy ROE shows a strong business.',
    tip: 'Net profit ÷ shareholders’ equity',
  },
  {
    abbr: 'ROCE',
    name: 'Return on capital employed',
    what: 'How well the company uses all its capital, both equity and debt, to earn operating profit.',
    tip: 'EBIT ÷ (total assets − current liabilities)',
  },
  {
    abbr: 'D/E',
    name: 'Debt to equity',
    what: 'Shows how much the company relies on borrowing. Higher debt means higher risk when business slows down.',
    tip: 'Total debt ÷ shareholders’ equity. Banks and NBFCs are judged differently.',
  },
  {
    abbr: 'Growth',
    name: 'Earnings growth',
    what: 'How fast profit and sales grow year after year. Look for steady growth over 5 to 10 years, not one lucky year.',
    tip: 'Check 3, 5 and 10 year profit and sales growth',
  },
];

const STEPS = [
  'Understand the business: how does the company make money, and who are its customers?',
  'Read 5 to 10 years of sales, profit and cash flow, not just the latest quarter.',
  'Check the ratios above and ask whether they are improving or getting worse.',
  'Compare with industry peers. A ratio means little without a benchmark.',
  'Review the annual report, including promoter holding, pledged shares and management comments.',
  'Confirm facts on official NSE, BSE and SEBI sources before you invest.',
];

const RED_FLAGS = [
  'Profit grows but cash from operations does not',
  'Debt rising faster than earnings',
  'Large share of promoter shares pledged',
  'Frequent auditor changes or delayed filings',
  'Growth that depends on one customer or a one-time gain',
];

const SOURCES = [
  { label: 'NSE India', href: 'https://www.nseindia.com' },
  { label: 'BSE India', href: 'https://www.bseindia.com' },
  { label: 'SEBI', href: 'https://www.sebi.gov.in' },
];

/**
 * Fades its children in when they scroll into view and fades them out again
 * when they leave (e.g. scrolling back up). Works in both directions.
 */
function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      el.classList.add('is-in');
      return;
    }
    const io = new IntersectionObserver(([entry]) => el.classList.toggle('is-in', entry.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={`lp-reveal ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

export default function StockAnalysisArticle() {
  return (
    <article className="lp-article" aria-labelledby="lp-article-title">
      <Reveal>
      <header className="lp-article-head">
        <span className="lp-article-kicker">
          <BookOpen size={14} aria-hidden="true" /> Learn
        </span>
        <h2 id="lp-article-title" className="font-brand lp-article-title">
          How to Analyze a Stock Before Investing in India
        </h2>
        <p className="lp-article-lede">
          Before investing in a stock, analyze the company’s financial performance, business model, and future growth potential.
        </p>
      </header>
      </Reveal>

      <Reveal>
      <section aria-labelledby="lp-metrics-title">
        <h3 id="lp-metrics-title" className="lp-article-h3">
          The key numbers to know
        </h3>
        <div className="lp-metrics">
          {METRICS.map((m, i) => (
            <Reveal key={m.abbr} className="lp-metric-wrap" delay={(i % 3) * 90}>
            <div className="lp-metric">
              <div className="lp-metric-top">
                <span className="lp-metric-abbr">{m.abbr}</span>
                <span className="lp-metric-name">{m.name}</span>
              </div>
              <p className="lp-metric-what">{m.what}</p>
              <p className="lp-metric-tip">{m.tip}</p>
            </div>
            </Reveal>
          ))}
        </div>
        <p className="lp-article-note">
          Good values differ by industry, so there is no single “right” number. Always judge a ratio against similar companies.
        </p>
      </section>
      </Reveal>

      <div className="lp-article-cols">
        <Reveal>
        <section aria-labelledby="lp-steps-title" className="lp-panel">
          <h3 id="lp-steps-title" className="lp-article-h3">
            <ListChecks size={18} aria-hidden="true" /> A simple checklist
          </h3>
          <ol className="lp-steps">
            {STEPS.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </section>
        </Reveal>

        <Reveal delay={150}>
        <section aria-labelledby="lp-flags-title" className="lp-panel lp-panel-warn">
          <h3 id="lp-flags-title" className="lp-article-h3">
            <AlertTriangle size={18} aria-hidden="true" /> Red flags to watch
          </h3>
          <ul className="lp-flags">
            {RED_FLAGS.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </section>
        </Reveal>
      </div>

      <Reveal>
      <section aria-labelledby="lp-sources-title" className="lp-sources">
        <h3 id="lp-sources-title" className="lp-article-h3">
          Check official sources
        </h3>
        <p>Compare financial ratios with industry peers, review annual reports, and check official NSE, BSE, and SEBI sources before making investment decisions.</p>
        <div className="lp-source-links">
          {SOURCES.map((s) => (
            <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" className="lp-source-link">
              {s.label} <ExternalLink size={14} aria-hidden="true" />
            </a>
          ))}
        </div>
      </section>
      </Reveal>

      <Reveal>
      <p className="lp-disclaimer">
        <strong>Disclaimer:</strong> This article is for educational purposes only and is not financial advice. All investments carry risk.
      </p>
      </Reveal>
    </article>
  );
}
