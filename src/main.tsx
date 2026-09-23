import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import BoldDigits from './utils/boldDigits.tsx'

// Take over scroll restoration ourselves (see useScrollRestoration) instead
// of letting the browser silently restore the old scroll position on a
// reload/back-forward navigation before React has even mounted — that would
// briefly flash the old scroll spot before our own logic jumps back to top.
if (typeof history !== 'undefined' && 'scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BoldDigits>
      <App />
    </BoldDigits>
  </StrictMode>,
)
