# Aurafin — fixes & improvements (this pass)

## Build / deploy
- Added missing peer dependency `postprocessing` (production build failed without it).

## Auth & security
- Login: "Forgot password?" flow; trimmed email; loading/double-submit guard; Enter submits from email; password length check on sign-up; errors clear on mode switch.
- PIN-reset OTP: cryptographically secure code, 5-attempt limit, cleanup when email fails.
- App Lock: wrong-PIN count persists across refresh; remaining-attempts message; storage access guarded (no white screen in private mode).
- LockScreen: PIN validated outside a state updater (no double-counting); `role="alert"` on errors.
- API: symbol validation on logo endpoint; shared 8s timeout for all upstream fetches.
- Exports: CSV/Excel formula-injection neutralised; UTF-8 BOM for Excel; safer blob URL revoke.

## Data correctness
- Quick Add Transfer: no longer creates money when amount exceeds balance; rejects <=0 and cross-currency; error handling.
- Quick Add Transaction: validation, trimmed category, busy state, error toast.
- Buy form: rejects future dates and non-finite numbers.
- Currency helpers: NaN/Infinity safe; no "-₹0.00"; correct axis rollover (e.g. 100L -> 1Cr).
- Market holidays: 2026 NSE weekday holidays added (re-check yearly).
- Import: file type and 10 MB size validated (also for drag & drop).

## Reliability & UX
- Guest/demo logout now warns that data is permanently deleted.
- "Logging out…" overlay no longer sticks if sign-out fails.
- Top-level ErrorBoundary + "Try again" button.
- Storage guards in auth store, lazy-route retry, guest data loader (non-array data).
- Number inputs no longer change value on mouse-wheel scroll.

## Accessibility
- Modal: `role="dialog"`, `aria-modal`, labelled Close buttons.
- "Skip to content" link and focusable `<main>`.
- index.html: meta description + `<noscript>` message.
