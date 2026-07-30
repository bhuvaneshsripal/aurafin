import { useEffect } from 'react';
import { Smartphone, Monitor } from 'lucide-react';
import { useInstallPromptStore, triggerInstallPrompt } from '../store/installPromptStore';

export default function InstallApp() {
  const installed = useInstallPromptStore((s) => s.installed);

  // Visiting this page from the nav is itself a request to install —
  // show the same prompt used everywhere else in the app.
  useEffect(() => {
    if (!installed) triggerInstallPrompt();
  }, [installed]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Install App</h1>
        <p className="text-slate-500 text-base mt-1">
          Add <span className="font-luxury">Aurafin</span> to your home screen or desktop for quick access.
        </p>
      </div>

      {installed ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
          <p className="text-sm font-medium text-brand-600">
            <span className="font-luxury">Aurafin</span> is already installed as an app on this device.
          </p>
        </div>
      ) : (
        <>
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
                Click the install icon in your browser's address bar to add{' '}
                <span className="font-luxury">Aurafin</span> as a desktop app.
              </p>
            </div>
          </div>

          <button
            onClick={triggerInstallPrompt}
            className="border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Show Install Prompt
          </button>
        </>
      )}
    </div>
  );
}
