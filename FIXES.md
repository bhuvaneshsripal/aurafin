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

---

# Second pass — bug & lag audit

## Build / deploy
- `npm run build` was failing (TypeScript unused-code errors in `Onboarding.tsx` and `Wealth.tsx`); dead code removed, build is green again.
- First load: React/Firebase/charts split into their own chunks and the PDF/export modal loads on demand — startup JS 1,517 → 1,082 KB (444 → 323 KB gzip).
- Service worker no longer pre-downloads the unused 1.5 MB `public/logo.png` (precache 6.8 → 5.3 MB). The file itself is untouched.

## Guest ("Try demo") data bugs
- Saving an asset/goal/transaction didn't show up until a page refresh — lists now update immediately.
- Quick-Add transactions, Money → Accounts and Import created records with no profile, so they vanished from the active profile's net worth — they now get the active profile.
- "Delete all data", "Set default profile", "Claim this data" and moving data between profiles did nothing for guests (they targeted Firestore) — they now work on the guest's local data.
- Guest start-up could show a blank screen while Firebase was slow to confirm sign-in — the cached user now remembers it is a guest.

## Lag
- Money → Transactions renders rows progressively (600 transactions: ~360 → ~95 ms to open, 16k → 2k DOM nodes).
- The top ticker and the market-alert hook shared one poller instead of two (33 → 15 requests per 15 s, localStorage writes 30 → 3).
- `Intl` number/date formatters are cached instead of rebuilt on every render (hundreds of constructions per second removed).
- Scroll position is saved on a short debounce instead of on every scroll event; redundant live-price store writes removed.

## Found but NOT changed (CSS/layout — waiting for approval)
- Wealth header: the "Analyse" button is written as `hidden md:inline-flex`, but `Button` always adds `inline-flex` and the built CSS puts `.inline-flex` after `.hidden`, so it never hides on phones and squeezes "Add asset" (label spills out at 360–390 px). Proposed: `className="max-md:hidden"`.
- Wealth → Net worth history: on phones the baseline row's date is cut to "01-0…" and the "Baseline" badge touches the amount. Proposed: stack the badge under the date on small screens.
- Landing page header: "Sign up" wraps onto two lines at 320–375 px. Proposed: `white-space: nowrap` on `.lp-nav-btn` plus slightly smaller padding below 380 px.
- Wealth page with 100+ holdings: scrolling with a mouse is heavy because rows re-run hover/hit-testing as they pass under the pointer (measured −69% main-thread work with hover off during scroll). Proposed: pause row hover while scrolling.
