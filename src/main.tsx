import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import BoldDigits from './utils/boldDigits.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'

// Take over scroll restoration ourselves (see useScrollRestoration) instead
// of letting the browser silently restore the old scroll position on a
// reload/back-forward navigation before React has even mounted — that would
// briefly flash the old scroll spot before our own logic jumps back to top.
if (typeof history !== 'undefined' && 'scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

// Scrolling the mouse wheel over a focused number field silently changes the
// amount (e.g. ₹5,000 -> ₹4,999) — a classic way to corrupt a figure without
// noticing. Dropping focus first lets the page scroll normally instead.
document.addEventListener(
  'wheel',
  () => {
    const el = document.activeElement;
    if (el instanceof HTMLInputElement && el.type === 'number') el.blur();
  },
  { passive: true }
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Last line of defence: a crash outside any page (lock screen, header,
        sidebar) shows a recovery screen instead of a blank white page. */}
    <ErrorBoundary>
      <BoldDigits>
        <App />
      </BoldDigits>
    </ErrorBoundary>
  </StrictMode>,
)
