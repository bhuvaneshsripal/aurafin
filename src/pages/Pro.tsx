import { useState } from 'react';
import {
  Crown,
  Check,
  Sparkles,
  Layers,
  PieChart,
  Users,
  Globe2,
  Share2,
  FileUp,
  TrendingUp,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { PRO_FEATURES } from '../config/proFeatures';

const FEATURE_ICONS: Record<string, typeof Layers> = {
  'unlimited-assets-goals': Layers,
  'income-expense-insights': PieChart,
  'family-profiles': Users,
  'multi-currency': Globe2,
  'share-with-others': Share2,
  'broker-import': FileUp,
  'phased-investment-calculator': TrendingUp,
};

const PRICE = 199;

function GoldIconTile({ Icon }: { Icon: typeof Layers }) {
  return (
    <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-amber-100 to-amber-50 dark:from-amber-500/20 dark:to-amber-500/5 flex items-center justify-center text-amber-600 dark:text-amber-300 shrink-0 ring-1 ring-amber-200/70 dark:ring-amber-500/20">
      <Icon size={20} strokeWidth={2} />
    </div>
  );
}

export default function Pro() {
  const [clicked, setClicked] = useState(false);

  return (
    <div className="space-y-10 max-w-5xl mx-auto pb-8">
      {/* ---- Hero ---- */}
      <div className="relative overflow-hidden rounded-3xl border border-amber-200/60 dark:border-amber-500/20 bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/40 px-6 py-12 sm:px-12 sm:py-16 text-center shadow-soft-md">
        {/* ambient gold glow */}
        <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-72 w-[36rem] rounded-full bg-amber-400/20 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:22px_22px]" />

        <div className="relative">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-500 shadow-[0_8px_30px_rgba(217,161,20,0.45)] mb-6 animate-[float_4s_ease-in-out_infinite]">
            <Crown size={30} className="text-amber-950" strokeWidth={2.25} />
          </div>
          <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-amber-300 mb-3">
            <Sparkles size={12} /> Introducing
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-white">
            Aurafin <span className="bg-gradient-to-r from-amber-300 via-yellow-300 to-amber-400 bg-clip-text text-transparent">Pro</span>
          </h1>
          <p className="text-slate-300 text-base sm:text-lg mt-4 max-w-xl mx-auto leading-relaxed">
            The complete picture of your wealth — unlimited tracking, deeper insights, and a
            household you can share it all with.
          </p>
        </div>
      </div>

      {/* ---- Pricing card + feature checklist ---- */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        {/* Pricing card */}
        <div className="lg:col-span-2 lg:sticky lg:top-6">
          <div className="group relative rounded-3xl border-2 border-amber-300/60 dark:border-amber-500/30 bg-white dark:bg-slate-900 p-7 shadow-soft-md transition-transform duration-300 hover:-translate-y-1 hover:shadow-[0_20px_50px_-15px_rgba(217,161,20,0.35)]">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span className="inline-flex items-center gap-1 bg-gradient-to-r from-amber-400 to-yellow-500 text-amber-950 text-[10px] font-bold uppercase tracking-wide px-3 py-1 rounded-full shadow-sm">
                <Sparkles size={10} /> Most loved
              </span>
            </div>

            <div className="flex items-center gap-2 mt-2">
              <Crown size={18} className="text-amber-500" />
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Aurafin Pro</h2>
            </div>

            <div className="flex items-baseline gap-1 mt-4">
              <span className="text-4xl font-bold text-slate-900 dark:text-white">₹{PRICE}</span>
              <span className="text-slate-400 dark:text-slate-500 text-sm">/month</span>
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Cancel anytime. No hidden fees.</p>

            <ul className="mt-6 space-y-3">
              {PRO_FEATURES.map((f) => (
                <li key={f.id} className="flex items-start gap-2.5 text-sm text-slate-700 dark:text-slate-200">
                  <span className="mt-0.5 flex items-center justify-center h-4 w-4 rounded-full bg-amber-100 dark:bg-amber-500/20 shrink-0">
                    <Check size={11} strokeWidth={3} className="text-amber-600 dark:text-amber-300" />
                  </span>
                  {f.label}
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={() => setClicked(true)}
              className="mt-7 w-full flex items-center justify-center gap-2 bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-amber-950 font-semibold px-5 py-3 rounded-2xl text-sm shadow-[0_6px_20px_rgba(217,161,20,0.4)] transition-all duration-200 hover:shadow-[0_8px_26px_rgba(217,161,20,0.5)] active:scale-[0.98]"
            >
              <Crown size={16} />
              {clicked ? "You're already Pro" : 'Upgrade to Pro'}
            </button>
            <p className="text-center text-[11px] font-medium text-amber-600 dark:text-amber-400 mt-2.5">
              {clicked
                ? 'Every Pro feature is unlocked for you already — enjoy!'
                : 'Available soon — every Pro feature already works for you'}
            </p>
          </div>
        </div>

        {/* Feature checklist / illustrations */}
        <div className="lg:col-span-3 space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 px-1">
            Everything included
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {PRO_FEATURES.map((f) => {
              const Icon = FEATURE_ICONS[f.id] ?? Sparkles;
              return (
                <div
                  key={f.id}
                  className="group flex items-start gap-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 transition-all duration-200 hover:border-amber-300 dark:hover:border-amber-500/40 hover:-translate-y-0.5 hover:shadow-soft"
                >
                  <GoldIconTile Icon={Icon} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                      {f.label}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                      {f.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 p-4 mt-4">
            <ShieldCheck size={18} className="text-brand-600 dark:text-brand-300 shrink-0" />
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              All Pro features are fully unlocked for every account right now, while Aurafin Pro
              finishes rolling out. Nothing you use today will be taken away.
            </p>
          </div>
        </div>
      </div>

      {/* ---- Bottom strip ---- */}
      <div className="flex items-center justify-center gap-2 text-xs text-slate-400 dark:text-slate-500">
        <Zap size={13} className="text-amber-500" />
        Built for people who take their money seriously.
      </div>
    </div>
  );
}
