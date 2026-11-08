import { useNavigate } from 'react-router-dom';
import {
  Activity, Bell, Bookmark, BookOpen, Calculator, CircleUserRound, Eye, FileUp, Gem, LayoutDashboard,
  LineChart, Lock, LogOut, Moon, PieChart, Settings as SettingsIcon, Smartphone, Target, TrendingUp, Users, Wallet,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Button, Card, PageHeader } from '../components/ui';
import ValuationIcon from '../components/icons/ValuationIcon';
import { SHORTCUT_GROUPS } from '../config/shortcuts';

/* ───────────── Annotated pictures ─────────────
 * Each guide has a picture of the screen with numbered circles. The circle
 * numbers match the notes beside it. Pictures are drawn from the app's own
 * colours (so they follow light/dark mode) and use sample numbers. */

/** Two hand-drawn loops (as if circled with a red pen). Both overshoot where they start and end. */
const LOOPS = [
  'M10 26 C 18 6, 66 0, 92 16 C 106 28, 100 72, 80 88 C 58 102, 16 98, 5 72 C -2 52, 6 34, 22 18 C 32 10, 44 6, 58 6',
  'M88 14 C 70 0, 24 2, 8 22 C -4 40, 2 78, 22 92 C 44 104, 86 100, 98 76 C 106 56, 100 30, 82 14 C 74 8, 62 4, 50 4',
];

/** Circles an element in red pen and numbers it. Wrap the part of the picture you mean. */
function Mark({ n, children, inline, className = '' }: { n: number; children: ReactNode; inline?: boolean; className?: string }) {
  return (
    <div className={`relative ${inline ? 'inline-block' : ''} rounded-lg ${className}`}>
      <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute -inset-2.5 h-[calc(100%+20px)] w-[calc(100%+20px)] z-10 overflow-visible">
        <path d={LOOPS[n % 2]} fill="none" stroke="#e11d2e" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="absolute -top-4 -left-4 z-20 h-[22px] w-[22px] rounded-full bg-red-600 text-white text-[11px] font-bold flex items-center justify-center shadow-md">
        {n}
      </span>
      {children}
    </div>
  );
}

function Frame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface-muted overflow-hidden" role="img" aria-label={`${title} screen with numbered notes`}>
      <div className="flex items-center gap-1.5 px-3 h-8 border-b border-line bg-surface">
        <span className="h-2 w-2 rounded-full bg-line" /><span className="h-2 w-2 rounded-full bg-line" /><span className="h-2 w-2 rounded-full bg-line" />
        <span className="ml-2 text-[11px] font-medium text-muted">{title}</span>
      </div>
      <div className="p-4 pt-5 min-h-[250px]">{children}</div>
    </div>
  );
}

const bar = 'rounded-full bg-line';
const Line = ({ w = 'w-full' }: { w?: string }) => <div className={`${bar} h-2 ${w}`} />;

function Trend({ up = true, h = 'h-12' }: { up?: boolean; h?: string }) {
  const d = up ? 'M0 36 L20 30 L40 33 L60 22 L80 24 L100 12 L120 6' : 'M0 8 L20 14 L40 12 L60 24 L80 22 L100 32 L120 36';
  return (
    <svg viewBox="0 0 120 42" preserveAspectRatio="none" className={`w-full ${h}`}>
      <path d={d} fill="none" stroke={up ? 'var(--color-brand-500)' : 'var(--color-red-500)'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Band() {
  return (
    <svg viewBox="0 0 120 50" preserveAspectRatio="none" className="w-full h-16">
      <path d="M0 34 L40 28 L80 16 L120 4 L120 46 L80 38 L40 34 L0 34 Z" fill="var(--color-brand-500)" opacity="0.18" />
      <path d="M0 34 L40 31 L80 27 L120 24" fill="none" stroke="var(--color-brand-600)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Donut() {
  const segs = [['var(--color-brand-600)', 46], ['var(--color-accent-500)', 26], ['var(--color-amber-400)', 16], ['var(--color-orange-400)', 12]] as const;
  let offset = 25;
  return (
    <svg viewBox="0 0 42 42" className="h-24 w-24 shrink-0">
      {segs.map(([c, v]) => {
        const el = <circle key={c} cx="21" cy="21" r="15.9" fill="none" stroke={c} strokeWidth="6" strokeDasharray={`${v} ${100 - v}`} strokeDashoffset={offset} />;
        offset -= v;
        return el;
      })}
    </svg>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: 'up' | 'down' }) {
  const c = tone === 'up' ? 'text-brand-600 dark:text-brand-400' : tone === 'down' ? 'text-red-600 dark:text-red-400' : 'text-ink';
  return (
    <div className="rounded-lg bg-surface border border-line p-2 min-w-0">
      <p className="text-[10px] text-muted truncate">{label}</p>
      <p className={`text-[13px] font-semibold ${c}`}>{value}</p>
    </div>
  );
}

function Chips({ items, active = 0 }: { items: string[]; active?: number }) {
  return (
    <div className="flex gap-1 overflow-hidden">
      {items.map((t, i) => (
        <span key={t} className={`text-[11px] font-medium px-2 py-1 rounded-md whitespace-nowrap ${i === active ? 'bg-brand-600 text-white' : 'bg-surface text-muted border border-line'}`}>{t}</span>
      ))}
    </div>
  );
}

function Row({ a, b, c, down, flag }: { a: string; b: string; c: string; down?: boolean; flag?: string }) {
  return (
    <div className="flex items-center gap-2 py-2 border-b border-line-soft last:border-0 px-1">
      <span className="h-6 w-6 rounded-full bg-brand-50 dark:bg-brand-500/15 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-ink truncate">{a}</p>
        <p className="text-[10px] text-muted truncate">{b}</p>
      </div>
      {flag && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 flex items-center gap-1"><Bell size={9} />{flag}</span>}
      <span className={`text-[11px] font-semibold ${down ? 'text-red-600 dark:text-red-400' : 'text-brand-600 dark:text-brand-400'}`}>{c}</span>
    </div>
  );
}

const gap = <div className="h-4" />;

const pictures: Record<string, ReactNode> = {
  account: (
    <Frame title="Account menu">
      <div className="mx-auto w-60 rounded-xl border border-line bg-surface shadow-lg overflow-hidden">
        <div className="p-3 border-b border-line-soft">
          <Mark n={1} className="flex items-center gap-2 p-1.5">
            <CircleUserRound size={26} className="text-muted" />
            <span className="text-sm font-semibold text-ink">Your name</span>
          </Mark>
        </div>
        <div className="p-2 space-y-2">
          <Mark n={2} className="flex items-center gap-2.5 px-2.5 py-2 text-sm font-medium text-ink-2"><BookOpen size={16} className="text-muted" />Tutorial</Mark>
          <Mark n={3} className="flex items-center gap-2.5 px-2.5 py-2 text-sm font-medium text-ink-2"><Moon size={16} className="text-muted" />Dark mode</Mark>
          <Mark n={4} className="flex items-center gap-2.5 px-2.5 py-2 text-sm font-medium text-red-600 dark:text-red-400"><LogOut size={16} />Log out</Mark>
        </div>
      </div>
    </Frame>
  ),
  overview: (
    <Frame title="Overview">
      <Mark n={1} className="p-3 bg-surface">
        <p className="text-[10px] text-muted">Net worth</p>
        <p className="text-[24px] font-semibold text-ink leading-tight">₹ 24,60,000</p>
      </Mark>
      {gap}
      <Mark n={2} className="px-3 py-2 bg-surface"><Trend /></Mark>
      {gap}
      <Mark n={3} className="grid grid-cols-3 gap-1.5 p-1.5">
        <Tile label="Assets" value="₹ 27.1L" /><Tile label="Liabilities" value="₹ 2.5L" tone="down" /><Tile label="Today" value="+0.8%" tone="up" />
      </Mark>
      {gap}
      <Mark n={4} className="px-3 py-2 bg-surface flex items-center justify-between"><span className="text-[11px] font-medium text-ink">Top holdings</span><span className="text-[11px] text-muted">⌄</span></Mark>
    </Frame>
  ),
  wealth: (
    <Frame title="Wealth">
      <Mark n={1} inline className="p-1"><Chips items={['Assets', 'Liabilities', 'Performs', 'Net worth', 'Allocation', 'Analytics']} /></Mark>
      <div className="flex items-center gap-3 mt-5">
        <Mark n={2} className="p-2 shrink-0"><Donut /></Mark>
        <div className="flex-1 min-w-0">
          <Mark n={3} className="px-2 bg-surface">
            <Row a="Reliance Industries" b="Avg ₹ 2,410 · 12 shares" c="+14.2%" />
            <Row a="Nifty 50 index fund" b="Monthly SIP" c="+9.8%" />
          </Mark>
        </div>
      </div>
      <div className="mt-5 flex justify-end"><Mark n={4} inline className="px-3 py-1.5 bg-brand-600 text-white text-[12px] font-semibold">+ Add</Mark></div>
    </Frame>
  ),
  analytics: (
    <Frame title="Wealth › Analytics">
      <Mark n={1} inline className="p-1"><Chips items={['Allocation', 'Risk', 'Tax', 'Projection', 'Calendar', 'IPO']} active={3} /></Mark>
      <div className="mt-5"><Mark n={2} className="p-2 bg-surface"><Band /></Mark></div>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <Mark n={3} className="p-2 bg-surface"><p className="text-[10px] text-muted">Tax-loss harvesting</p><Line w="w-2/3" /></Mark>
        <Mark n={4} className="p-2 bg-surface"><p className="text-[10px] text-muted">Turning long-term soon</p><Line w="w-1/2" /></Mark>
      </div>
    </Frame>
  ),
  performance: (
    <Frame title="Performance">
      <Mark n={1} inline className="p-1"><Chips items={['All', 'Stocks', 'ETFs', 'Mutual Funds', 'Gold', 'Crypto']} /></Mark>
      <div className="mt-5 flex gap-2 flex-wrap">
        <Mark n={2} inline className="p-1"><Chips items={['All', 'Active', 'Partially Sold', 'Sold']} /></Mark>
        <Mark n={3} inline className="p-1"><Chips items={['Today', 'This Week', 'This Year']} active={2} /></Mark>
      </div>
      <div className="mt-5"><Mark n={4} className="px-2 bg-surface"><Row a="Reliance Industries" b="Invested ₹ 28,900" c="+₹ 4,120" /><Row a="Suzlon (sold)" b="Booked" c="-₹ 610" down /></Mark></div>
    </Frame>
  ),
  money: (
    <Frame title="Money">
      <Mark n={1} inline className="p-1"><Chips items={['Transactions', 'Budget', 'Accounts', 'Insights']} /></Mark>
      <div className="mt-5"><Mark n={2} className="px-2 bg-surface"><Row a="Salary" b="Bank account" c="+₹ 85,000" /><Row a="Groceries" b="Card" c="-₹ 3,420" down /><Row a="Electricity" b="Bank account" c="-₹ 1,180" down /></Mark></div>
      <div className="mt-5 flex justify-end"><Mark n={3} inline className="px-3 py-1.5 bg-brand-600 text-white text-[12px] font-semibold">+ Add</Mark></div>
    </Frame>
  ),
  essentials: (
    <Frame title="Essentials">
      <Mark n={1} inline className="p-1"><Chips items={['Financial health', 'Goals']} /></Mark>
      <div className="mt-5 grid grid-cols-[1fr_auto] gap-3 items-center">
        <Mark n={2} className="p-2 bg-surface grid grid-cols-3 gap-1.5"><Tile label="Age" value="32" /><Tile label="Income / mo" value="₹ 85k" /><Tile label="Expense / mo" value="₹ 48k" /></Mark>
        <Mark n={3} className="p-1.5 bg-surface"><div className="h-14 w-14 rounded-full border-[6px] border-brand-500 flex items-center justify-center text-[14px] font-semibold text-ink">78</div></Mark>
      </div>
      <div className="mt-5"><Mark n={4} className="p-2 bg-surface"><p className="text-[10px] text-muted mb-1">Emergency fund</p><div className="h-1.5 rounded-full bg-line"><div className="h-1.5 rounded-full bg-brand-500 w-3/5" /></div></Mark></div>
    </Frame>
  ),
  import: (
    <Frame title="Import">
      <Mark n={1} className="bg-surface flex flex-col items-center justify-center h-16 gap-1 border border-dashed border-line"><FileUp size={16} className="text-muted" /><span className="text-[10px] text-muted">holdings.xlsx</span></Mark>
      <div className="mt-5"><Mark n={2} className="px-2 bg-surface"><Row a="HDFC Bank" b="Equity · matched from your headers" c="Ready" /><Row a="Unknown row" b="Asset class not found" c="Fix" down /></Mark></div>
      <div className="mt-5 flex justify-end"><Mark n={3} inline className="px-3 py-1.5 bg-brand-600 text-white text-[12px] font-semibold">Save assets</Mark></div>
    </Frame>
  ),
  watchlist: (
    <Frame title="Watchlist">
      <Mark n={1} inline className="p-1"><Chips items={['All', 'IT stocks', 'Dividend']} /></Mark>
      <div className="mt-5"><Mark n={2} className="px-2 bg-surface"><Row a="TCS" b="₹ 3,912" c="+1.2%" flag="≥ 4,000" /><Row a="Infosys" b="₹ 1,548" c="-0.4%" down /></Mark></div>
      <div className="mt-5"><Mark n={3} className="p-2 bg-surface"><p className="text-[10px] text-muted">Note: wait for results in January</p></Mark></div>
    </Frame>
  ),
  valuation: (
    <Frame title="X/2 · X/3 valuation">
      <Mark n={1} className="px-3 py-2 bg-surface text-[11px] text-muted">Search a stock, e.g. TCS</Mark>
      <div className="mt-5">
        <Mark n={2} className="p-2 bg-surface">
          <div className="relative h-3 rounded-full overflow-hidden flex"><span className="flex-1" style={{ background: '#a8571c' }} /><span className="flex-1" style={{ background: '#0b8a6a' }} /><span className="flex-1" style={{ background: '#2b5fd9' }} /><span className="absolute top-0 bottom-0 left-[58%] w-0.5 bg-white" /></div>
          <div className="flex justify-between text-[10px] text-muted mt-1"><span>X/3</span><span>X/2</span><span>X</span></div>
        </Mark>
      </div>
      <div className="mt-5"><Mark n={3} className="p-2 bg-amber-50 dark:bg-amber-500/10"><p className="text-[11px] font-medium text-amber-700 dark:text-amber-300">Things to check</p><Line w="w-3/4" /></Mark></div>
    </Frame>
  ),
  volume: (
    <Frame title="High volume">
      <Mark n={1} inline className="p-1"><Chips items={['Volume', 'Price change', 'Volume spike']} /></Mark>
      <div className="mt-5"><Mark n={2} className="px-2 bg-surface"><Row a="Yes Bank" b="3.2× usual volume" c="+4.1%" /><Row a="IDEA" b="2.6× usual volume" c="+1.9%" /><Row a="BEL" b="2.1× usual volume" c="-0.7%" down /></Mark></div>
    </Frame>
  ),
  swing: (
    <Frame title="Swing scanner">
      <div className="flex gap-2 flex-wrap">
        <Mark n={1} inline className="p-1"><Chips items={['Nifty 50', 'Nifty 200', 'Nifty 500']} active={1} /></Mark>
        <Mark n={2} inline className="p-1"><Chips items={['Breakout', 'Pullback', 'Bounce']} /></Mark>
      </div>
      <div className="mt-5"><Mark n={3} className="p-2 bg-surface flex items-center justify-between"><span className="text-[12px] font-semibold text-ink">Sample stock</span><span className="text-[11px] font-semibold text-brand-600 dark:text-brand-400">Score 78 · RSI 62</span></Mark></div>
      <div className="mt-5"><Mark n={4} className="grid grid-cols-3 gap-1.5 p-1.5"><Tile label="Entry" value="₹ 410" /><Tile label="Stop" value="₹ 392" tone="down" /><Tile label="Target" value="₹ 452" tone="up" /></Mark></div>
    </Frame>
  ),
  calculators: (
    <Frame title="Calculators">
      <Mark n={1} inline className="p-1"><Chips items={['XIRR', 'SIP', 'Lumpsum', 'Phased', 'CAGR', 'EMI']} active={1} /></Mark>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <Mark n={2} className="p-2 bg-surface space-y-2"><Line /><Line w="w-4/5" /><Line w="w-3/5" /></Mark>
        <Mark n={3} className="p-2 bg-surface"><Trend h="h-16" /></Mark>
      </div>
    </Frame>
  ),
  settings: (
    <Frame title="Settings">
      <div className="grid grid-cols-2 gap-3">
        <Mark n={1} className="px-2 bg-surface">
          {['Basic details', 'Reports', 'Change password', 'Change Aurafin pincode', 'Preferences'].map((t) => <div key={t} className="py-1.5 border-b border-line-soft last:border-0 text-[11px] text-ink">{t}</div>)}
        </Mark>
        <Mark n={2} className="px-2 bg-surface">
          {['Notifications', 'Profiles', 'Shared access', 'Data', 'Shortcuts'].map((t) => <div key={t} className="py-1.5 border-b border-line-soft last:border-0 text-[11px] text-ink">{t}</div>)}
        </Mark>
      </div>
      <div className="mt-5"><Mark n={3} className="p-2 bg-surface flex items-center justify-between"><span className="text-[11px] text-ink">Export portfolio as PDF</span><span className="text-[11px] font-semibold text-brand-600 dark:text-brand-400">Export</span></Mark></div>
    </Frame>
  ),
};

/* ───────────── Content ───────────── */

interface Guide {
  id: string;
  title: string;
  icon: ReactNode;
  path?: string;
  summary: string;
  notes: { title: string; text: string }[]; // one per numbered circle, in order
  advanced: string[];
}

const guides: Guide[] = [
  {
    id: 'account', title: 'Account menu', icon: <CircleUserRound size={16} />,
    summary: 'Your profile menu, at the top right of the screen. On a phone, tap the ⋮ button instead.',
    notes: [
      { title: 'Your profile', text: 'Shows the name and photo from your account. Change them in Settings under Basic details.' },
      { title: 'Tutorial', text: 'Opens this guide again whenever you need it.' },
      { title: 'Dark mode', text: 'Switches the whole app between light and dark. Once it is on, this button turns into Light mode.' },
      { title: 'Log out', text: 'Logs you out straight away, with no extra confirmation. Everything stays saved in your account.' },
    ],
    advanced: ['The menu closes by itself when you scroll or click outside it.', 'If logging out fails (for example you are offline), the app tells you and keeps you signed in.'],
  },
  {
    id: 'overview', title: 'Overview', icon: <LayoutDashboard size={16} />, path: '/',
    summary: 'Your home screen: one number at the top, then sections that summarise everything else.',
    notes: [
      { title: 'Net worth', text: 'Everything you own minus everything you owe, in your base currency, using live prices where available.' },
      { title: 'Net worth over time', text: 'A history chart. It starts empty and fills in as the app records your net worth, so a new account shows "No history yet".' },
      { title: 'Quick figures', text: 'Assets, liabilities and today\'s change at a glance. Amounts follow the eye icon, so they hide when privacy mode is on.' },
      { title: 'Sections', text: 'Asset allocation, Income & expenses, Goals, Recent transactions and Top holdings. Open or collapse each one.' },
    ],
    advanced: ['If a section says "No assets yet" or "No goals yet", that section is waiting for data from the page named in its message.', 'Press Ctrl+O from anywhere to jump back here.', 'You can export a PDF of your portfolio from Settings, under Reports.'],
  },
  {
    id: 'wealth', title: 'Wealth', icon: <Gem size={16} />, path: '/wealth',
    summary: 'Everything you own and owe, in six tabs.',
    notes: [
      { title: 'Tabs', text: 'Assets, Liabilities, Performs, Net worth, Allocation and Analytics. Your tab is kept in the address, so a refresh keeps you in place.' },
      { title: 'Allocation chart', text: 'How your wealth is split across asset classes. Tap Equity to break it into Direct stock, ETF and SIP.' },
      { title: 'Holdings', text: 'Each row shows current value, what you invested and your return. Columns can show returns, market price with the 1-day change, or average price.' },
      { title: 'Add', text: 'Starts the Add asset flow. Shortcut: Ctrl+A. Free accounts can track up to 30 assets.' },
    ],
    advanced: ['Assets can be in different currencies, and include stocks, mutual funds, gold, EPF, PPF, property and deposits.', 'On a stock holding you can record buys and sells. The Tax tab uses these lots to build your capital-gains report.', 'Property assets track area, ownership share, value per sq ft, rent and growth per year.', 'Use Alt+W to jump to Wealth.'],
  },
  {
    id: 'analytics', title: 'Wealth › Analytics', icon: <PieChart size={16} />, path: '/wealth?tab=analytics',
    summary: 'The advanced tools. Open Wealth, then the Analytics tab.',
    notes: [
      { title: 'Six analysis tabs', text: 'Allocation, Risk, Tax, Projection, Calendar and IPO.' },
      { title: 'Projection', text: 'Runs 2,000 simulated futures for your net worth. The shaded band covers the middle 80% of outcomes. Leave the assumptions blank to use the return and volatility suggested by your own mix.' },
      { title: 'Tax-loss harvesting', text: 'Lists unrealised losses you could book to offset gains. Losses are set off within the same bucket: a short-term loss against either, a long-term loss only against long-term.' },
      { title: 'Turning long-term soon', text: 'Lots that will soon cross the long-term line. Waiting for them can lower the tax on selling.' },
    ],
    advanced: [
      'Allocation lets you set a target allocation, then gives a rebalancing plan and a Concentration check.',
      '"Rebalance with new money" tells you where to add fresh money so you do not have to sell winners and trigger tax.',
      'Risk shows plain-English risk flags and your biggest positions as a share of the portfolio.',
      'Gain harvesting shows long-term equity gains you can book tax-free, up to what is left of this year\'s exemption.',
      'Realised lots are matched first-in, first-out, as tax rules require.',
      'Calendar collects deposit and bond maturities and your SIPs. IPO tracks IPO and Pre-IPO positions by stage.',
    ],
  },
  {
    id: 'performance', title: 'Performance', icon: <LineChart size={16} />, path: '/wealth/performance',
    summary: 'Profit and loss for your investments, including ones you have sold.',
    notes: [
      { title: 'Type filter', text: 'All, Stocks, ETFs, Mutual Funds, Gold, Crypto, FDs & Bonds or Other.' },
      { title: 'Status filter', text: 'All, Active, Partially Sold or Sold. You can also show only Profitable or Loss-making holdings.' },
      { title: 'Period', text: 'Today, This Week, This Month, This Year or All Time. Charts have their own ranges from 1M to ALL.' },
      { title: 'Holdings', text: 'What you invested against what it is worth now. Open one for its detail.' },
    ],
    advanced: ['Combine filters, for example Mutual Funds + Active + Loss-making + This Year, to find what is dragging a year down.', 'Press Ctrl+P to jump here.', 'Tapping the Performance tab again while you are already on it refreshes the data.'],
  },
  {
    id: 'money', title: 'Money', icon: <Wallet size={16} />, path: '/transactions',
    summary: 'Day-to-day income and spending.',
    notes: [
      { title: 'Four tabs', text: 'Transactions (all income and expenses), Budget (plan the month, then watch how it goes), Accounts (bank, card, cash and wallet) and Insights (see where your money goes).' },
      { title: 'Transaction list', text: 'Green is income, red is spending. Each line shows which account it belongs to.' },
      { title: 'Add', text: 'Log an expense, income or transfer. Transactions can be exported to CSV.' },
    ],
    advanced: ['Set up accounts first so each transaction can be assigned to one.', 'Budget alerts can notify you in the app. Turn them on in Settings under Notifications.', 'Your monthly income and expenses feed the Cashflow section on Overview and the Essentials health score.'],
  },
  {
    id: 'essentials', title: 'Essentials', icon: <Target size={16} />, path: '/essentials',
    summary: 'A financial health check, and your savings goals.',
    notes: [
      { title: 'Two tabs', text: 'Financial health and Goals.' },
      { title: 'Your details', text: 'Enter age, monthly income and monthly expenses. They are saved to your account.' },
      { title: 'Health score', text: 'A single score built from your income, expenses, assets and liabilities.' },
      { title: 'Checks', text: 'Individual checks, such as emergency fund and debt ratio, each with its own status.' },
    ],
    advanced: ['Wait until your assets and liabilities have finished loading before trusting a "Critical" status. The page waits for the server to confirm them to avoid a false alarm.', 'On the Goals tab, create a goal and a progress bar tracks it.'],
  },
  {
    id: 'import', title: 'Import', icon: <FileUp size={16} />, path: '/import',
    summary: 'Add many assets at once from a spreadsheet.',
    notes: [
      { title: 'Upload', text: 'Choose a .csv, .xlsx or .xls file. Columns such as Name, Value, Asset Class and Currency are recognised by their header names.' },
      { title: 'Review every row', text: 'Correct a row\'s asset class, or skip it. Nothing is saved yet.' },
      { title: 'Save', text: 'Adds the rows you kept as assets.' },
    ],
    advanced: ['If many rows fail to match, rename your column headers to Name, Value, Asset Class and Currency and upload again.', 'Counting the free limit: free accounts can hold up to 30 assets, so import in batches if you are near it.'],
  },
  {
    id: 'watchlist', title: 'Watchlist', icon: <Bookmark size={16} />, path: '/watchlist',
    summary: 'Follow stocks you do not own yet.',
    notes: [
      { title: 'Lists', text: 'The All list shows every saved stock. Create your own lists to group them.' },
      { title: 'Table', text: 'Each stock shows price, trend, 52-week range, and a bell badge if you set a price alert (≥ means rises to, ≤ means falls to).' },
      { title: 'Notes', text: 'Attach a note to a stock to remember why you saved it.' },
    ],
    advanced: ['There is a cap on how many stocks you can save.', 'Your lists and notes sync to your account.'],
  },
  {
    id: 'valuation', title: 'Valuation (X/2 · X/3)', icon: <ValuationIcon size={16} />, path: '/valuation',
    summary: 'A quick check of whether a stock looks cheap or expensive.',
    notes: [
      { title: 'Search', text: 'Pick a stock. The page fetches its fundamentals.' },
      { title: 'Levels bar', text: 'Shows the price against three levels: X, X/2 and X/3, based on the stock\'s lowest P/E and EPS growth. The white line is today\'s price.' },
      { title: 'Things to check', text: 'Appears when the result may mislead, for example cyclical companies or unreliable earnings.' },
    ],
    advanced: ['Your valuation history and watchlist are saved to your account.', 'Treat it as one input. It is not a buy or sell signal.'],
  },
  {
    id: 'volume', title: 'High volume', icon: <Activity size={16} />, path: '/volume',
    summary: 'Stocks trading on unusually heavy volume.',
    notes: [
      { title: 'Sort', text: 'By volume, price change or volume spike.' },
      { title: 'Results', text: 'Each row shows how many times the usual volume is trading, and the price change.' },
    ],
    advanced: ['A big spike with a big price move often means news or a large buyer.', 'A spike with a small move can mean heavy buying and selling cancelling out.'],
  },
  {
    id: 'swing', title: 'Swing scan', icon: <TrendingUp size={16} />, path: '/swing',
    summary: 'Stocks ranked by swing-trading setups on the daily chart.',
    notes: [
      { title: 'Universe', text: 'Choose Nifty 50, Nifty 200 or Nifty 500.' },
      { title: 'Setup', text: 'Breakout, Pullback or Bounce. A bounce means oversold (low RSI) and starting to turn up.' },
      { title: 'Score and sort', text: 'Each stock gets a score. Sort by score, % change, RSI, volume ×, 52-week high or price, and filter to Score 50+ or 70+.' },
      { title: 'Plan', text: 'Entry, stop and target for the setup, with RSI (14) and volume.' },
    ],
    advanced: ['Set your own stop, even if the scan suggests one.', 'Setups are ideas to study, not advice.'],
  },
  {
    id: 'calculators', title: 'Calculators', icon: <Calculator size={16} />, path: '/calculators',
    summary: 'Nine calculators for planning.',
    notes: [
      { title: 'Pick one', text: 'XIRR, SIP, Lumpsum, Phased investment, CAGR, EMI, SWP with inflation, Retirement and FD.' },
      { title: 'Inputs', text: 'Change amounts, rates and years. The result updates with them.' },
      { title: 'Chart', text: 'Shows the growth so you can see the result, not just read it.' },
    ],
    advanced: ['Phased investment lets you add several phases, each with an amount and a from-to range in years.', 'FD can compound annually, half-yearly or quarterly.'],
  },
  {
    id: 'settings', title: 'Settings', icon: <SettingsIcon size={16} />, path: '/settings',
    summary: 'Your account, security and how the app behaves.',
    notes: [
      { title: 'Account and security', text: 'Basic details, Reports, Change password, Change Aurafin pincode and Preferences.' },
      { title: 'Sharing and data', text: 'Notifications, Profiles, Shared access, Data and Shortcuts.' },
      { title: 'Reports', text: 'Choose sections and export a PDF: Portfolio summary, Monthly cashflow, Asset breakdown, Liabilities, Current holdings and Sold investments.' },
    ],
    advanced: ['Shared access gives someone view-only access.', 'Notifications include a weekly digest by email and budget alerts in the app.', 'Press Ctrl+Q to jump to Settings.'],
  },
];

/* ───────────── Page ───────────── */

export default function Tutorial() {
  const navigate = useNavigate();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Tutorial"
        actions={<Button onClick={() => navigate('/wealth')}>Add your first asset</Button>}
      />

      <section aria-labelledby="pages">
        <div className="space-y-5 min-w-0">
          <h2 id="pages" className="text-lg font-semibold tracking-tight text-ink">Every screen, explained</h2>
          {guides.map((g) => (
            <Card key={g.id} id={g.id} className="scroll-mt-20">
              <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
                <div className="min-w-0">{pictures[g.id]}</div>
                <div className="min-w-0">
                  <h3 className="flex items-center gap-2 text-base font-semibold text-ink"><span className="text-brand-600 dark:text-brand-400">{g.icon}</span>{g.title}</h3>
                  <p className="text-sm text-muted mt-1.5 leading-relaxed">{g.summary}</p>
                  <ol className="mt-4 space-y-3">
                    {g.notes.map((n, i) => (
                      <li key={n.title} className="flex gap-3">
                        <span className="h-[22px] w-[22px] rounded-full bg-red-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-ink">{n.title}</p>
                          <p className="text-[13px] text-ink-2 leading-relaxed">{n.text}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                  <div className="mt-4 rounded-xl bg-brand-50 dark:bg-brand-500/10 p-3.5">
                    <p className="text-[13px] font-semibold text-brand-800 dark:text-brand-300">Advanced</p>
                    <ul className="mt-1.5 space-y-1.5">
                      {g.advanced.map((a) => (
                        <li key={a} className="text-[13px] text-ink-2 leading-relaxed pl-3.5 relative before:absolute before:left-0 before:top-[0.6em] before:h-1 before:w-1 before:rounded-full before:bg-brand-600">{a}</li>
                      ))}
                    </ul>
                  </div>
                  {g.path && <div className="mt-4"><Button variant="secondary" size="sm" onClick={() => navigate(g.path!)}>Open {g.title.split(' (')[0]}</Button></div>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="phone" className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 id="phone" className="flex items-center gap-2 text-base font-semibold text-ink"><Smartphone size={17} className="text-brand-600 dark:text-brand-400" />On your phone</h2>
          <ul className="mt-3 space-y-2 text-[13px] text-ink-2 leading-relaxed">
            <li>The bottom bar has Overview, Wealth, Valuation and Settings.</li>
            <li>Swipe up along the bottom bar, or tap More, for Watchlist, Performance, Money, Essentials, Import, High volume, Swing scan and Calculators.</li>
            <li>Tap the ⋮ menu at the top right for this Tutorial, dark mode and log out.</li>
            <li>Tap a tab while inside a holding to go back to that tab's first page. Tap it again to refresh.</li>
            <li>Open Install app to add Aurafin to your home screen.</li>
          </ul>
        </Card>
        <Card>
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink"><Lock size={17} className="text-brand-600 dark:text-brand-400" />Privacy and security</h2>
          <ul className="mt-3 space-y-2 text-[13px] text-ink-2 leading-relaxed">
            <li className="flex gap-2"><Eye size={15} className="mt-0.5 shrink-0 text-muted" /><span>The eye icon hides every amount. Press Ctrl+M to switch it fast, for example when someone is looking.</span></li>
            <li className="flex gap-2"><Lock size={15} className="mt-0.5 shrink-0 text-muted" /><span>Set an Aurafin pincode in Settings to lock the app. You can change it anytime.</span></li>
            <li className="flex gap-2"><Users size={15} className="mt-0.5 shrink-0 text-muted" /><span>Profiles keep family members separate. Shared access lets someone view, not edit.</span></li>
            <li className="flex gap-2"><Gem size={15} className="mt-0.5 shrink-0 text-muted" /><span>Your data is saved to your account in the cloud, so logging out does not delete anything.</span></li>
          </ul>
        </Card>
      </section>

      <section aria-labelledby="keys">
        <h2 id="keys" className="text-lg font-semibold tracking-tight text-ink mb-3">Keyboard shortcuts</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {SHORTCUT_GROUPS.map((group) => (
            <Card key={group.title} padding="none">
              <h3 className="px-5 pt-4 pb-2 text-sm font-semibold text-ink">{group.title}</h3>
              <ul>
                {group.items.map((it) => (
                  <li key={it.label} className="flex items-center justify-between gap-3 px-5 py-2.5 border-t border-line-soft">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-ink">{it.label}</p>
                      <p className="text-xs text-muted">{it.description}</p>
                    </div>
                    <span className="flex gap-1 shrink-0">
                      {it.keys.map((k) => <kbd key={k} className="px-1.5 py-0.5 rounded-md border border-line bg-surface-muted text-[11px] font-medium text-ink-2">{k}</kbd>)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </section>

      <Card className="text-center">
        <h2 className="text-base font-semibold text-ink">Still stuck?</h2>
        <p className="text-sm text-muted mt-1">Tell us what confused you and we will make it clearer.</p>
        <div className="mt-3 flex justify-center gap-2 flex-wrap">
          <Button variant="secondary" onClick={() => navigate('/feedback')}>Send feedback</Button>
          <Button variant="secondary" onClick={() => navigate('/whats-new')}>See what is new</Button>
        </div>
      </Card>
    </div>
  );
}
