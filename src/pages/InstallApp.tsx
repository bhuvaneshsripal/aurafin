import { Smartphone, Monitor } from 'lucide-react';

export default function InstallApp() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Install App</h1>
        <p className="text-slate-500 text-base mt-1">
          Add Aurafin to your home screen or desktop for quick access.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
          <Smartphone size={22} className="text-brand-600 mb-3" />
          <p className="font-semibold text-slate-800 dark:text-slate-100 mb-1">Mobile</p>
          <p className="text-sm text-slate-500">
            Open this site in your phone's browser, then choose "Add to Home Screen" from the
            browser menu.
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
          <Monitor size={22} className="text-brand-600 mb-3" />
          <p className="font-semibold text-slate-800 dark:text-slate-100 mb-1">Desktop</p>
          <p className="text-sm text-slate-500">
            Click the install icon in your browser's address bar to add Aurafin as a desktop app.
          </p>
        </div>
      </div>
    </div>
  );
}
