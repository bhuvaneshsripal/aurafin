import { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { CURRENCIES } from '../utils/currency';

export default function Settings() {
  const user = useAuthStore((s) => s.user);
  const [baseCurrency, setBaseCurrency] = useState('INR');

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Settings</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Manage your profile and preferences.</p>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Profile</h2>
        <div className="text-sm text-slate-600 dark:text-slate-300">
          <div className="mb-1">
            <span className="text-slate-400 dark:text-slate-500">Name: </span>
            {user?.displayName ?? '—'}
          </div>
          <div>
            <span className="text-slate-400 dark:text-slate-500">Email: </span>
            {user?.email ?? '—'}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Base Currency</h2>
        <select
          value={baseCurrency}
          onChange={(e) => setBaseCurrency(e.target.value)}
          className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Your net worth and totals will be shown in this currency across the dashboard.
        </p>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-3">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Data</h2>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Your data is stored in your own Firebase project. Export or delete it any time from the
          Firebase console, or wire up export/delete buttons here later.
        </p>
      </div>
    </div>
  );
}
