import { Sparkles } from 'lucide-react';

export default function WhatsNew() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">What's New</h1>
        <p className="text-slate-500 text-base mt-1">Latest updates and improvements to <span className="font-luxury">Aurafin</span>.</p>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 text-center">
        <Sparkles size={28} className="mx-auto text-brand-600 mb-3" />
        <p className="text-slate-500 text-base">
          We're always shipping. Check back here for release notes and new features.
        </p>
      </div>
    </div>
  );
}
