import { BrowserRouter } from 'react-router-dom';
import { Moon, Sun } from 'lucide-react';
import { useUiStore } from '../store/uiStore';
import Calculators from './Calculators';
import '../components/landing.css';

/**
 * Signed-out /calculators page, opened from the "Calculators" link on the login
 * page. Reuses the in-app calculators (SIP, lumpsum, EMI, XIRR, CAGR, SWP, FD,
 * retirement, phased) with the same header look as the login page. Nothing here
 * reads or saves any account data.
 */
export default function PublicCalculators() {
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);

  return (
    <div className="animate-page-in lp-screen bg-page">
      <header className="lp-header bg-surface border-b border-line">
        <a href="/" className="lp-brand" aria-label="Aurafin home">
          <img src="/logo-icon.png" alt="" className="lp-brand-logo" />
          <span className="font-brand text-ink lp-brand-name">
            Aurafin<span className="text-brand-500">.</span>
          </span>
        </a>
        <nav className="lp-nav">
          <div className="fb-nav-links">
            <a href="/#features">Features</a>
            <a href="/#reviews">Reviews</a>
            <a href="/#privacy">Privacy</a>
            <a href="/#faq">FAQ</a>
            <a href="/calculators" aria-current="page" className="text-ink font-semibold">Calculators</a>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            className="btn-press lp-theme-btn"
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <a href="/" className="btn-press lp-nav-btn bg-brand-600 hover:bg-brand-700 text-white">
            Sign in
          </a>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 sm:px-6 py-8">
        <BrowserRouter>
          <Calculators />
        </BrowserRouter>
        <p className="mt-10 text-xs text-ink-2">
          Projections are estimates for illustration, not financial advice. Nothing you enter here is saved.
        </p>
      </main>
    </div>
  );
}
