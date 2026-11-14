# Aurafin — fixes & improvements (this pass)

## X/2 · X/3 valuation: accuracy audit
- Audited: the maths (Year-N EPS = TTM EPS × (1+g)^N, X = Year-N EPS × lowest P/E, X/2, X/3, adequate price = X ÷ (1+r)^N) matches an independent re-implementation on 2,000 random cases (0 mismatches) and reproduces the TATASTEEL screen exactly. No formula change was needed.
- The page computed warnings and the growth-source note but never showed them. Now shown: under the growth and lowest-P/E fields, and in a "Why these numbers may be unreliable / Things to check" card.
- Lowest P/E: the old rule kept whichever series (Yahoo trailing P/E or monthly price ÷ annual EPS) had the longer span, so a sparse series with a handful of points could beat a dense one and step over the real low. Now the lowest value across both series is used (`chooseLowestPe` in `api/_lib/fundamentals.js`). The source, month of the low and number of readings are shown.
- EPS CAGR: exponent is now the real time between the first and last reported year (a year Yahoo skipped no longer inflates growth), input order no longer matters, and the EPS history is returned oldest-first.
- Cyclical / volatile earnings (any loss year, or two or more EPS falls of 25%+) are detected automatically (`analyseEps`), tick "Cyclical business", and mark the result "unreliable" with the reason (best/worst EPS, mid-cycle EPS).
- "Unreliable" now also covers cyclical earnings and the "weak earnings" flag, not only thin P/E history.

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

## Layout / scroll fixes (approved and applied)
- Wealth header: the "Analyse" button was written as `hidden md:inline-flex`, but `Button` always adds `inline-flex` and the built CSS puts `.inline-flex` after `.hidden`, so it never hid on phones and squeezed "Add asset" (label spilled out at 360–390 px). Now `className="max-md:hidden"` (hidden below 768 px, shown from 768 px up).
- Wealth → Net worth history: on phones the baseline row's date was cut to "01-0…" and the "Baseline" badge touched the amount. The badge now sits under the date on phones; from `sm` up it stays beside the date as before.
- Landing page header: "Sign up" wrapped onto two lines at 375 px and narrower. `.lp-nav-btn` is now `white-space: nowrap`, with slightly smaller padding at ≤ 380 px.
- Wealth page with 100+ holdings: scrolling with a mouse was heavy because rows re-ran hover/hit-testing as they passed under the pointer. New `hooks/usePauseHoverOnScroll.ts` sets `data-scrolling` on `<html>` while the page scrolls (cleared 120 ms after the last scroll event); `index.css` turns off pointer events on `.scroll-pause-hover` (the holdings table) only then, and only on devices with real hover. Skipped while a row is being dragged.

## Looked at and left alone
- Sticky cells, `text-rendering`, `zoom` and the scrollbar rule: no measurable effect in testing.
- Live prices refresh every 5 s per stock (about 720 requests/min with 60 stocks) and the login photos are 3000 px wide (5.6 MB in total): not changed in this pass.

## Update notice (new deploys show up fast)
- Before: the app looked for a new deploy every 5 minutes, so people could keep using an old version for several minutes after a code change.
- Now: `utils/updateChecks.ts` re-checks every 30 seconds while the app is on screen, and straight away when it returns to the foreground, regains focus, is restored from the back/forward cache, or comes back online. Nothing is polled while the app is in the background. Checks never overlap and are spaced at least 5 s apart.
- `UpdateBanner` (signed in) and `LoginUpdateButton` (signed out) share this one checker, and both now stop it when they unmount (the banner used to leave its timer and listeners running).
- UPDATED: the app now changes version ONLY when Update is tapped (Settings > New version, or the Update pill on the login page). The notice comes from the `/version.json` check alone. What was changed to make that true:
  - Each build's service worker has its own file name (`sw-<build>.js`, set in `vite.config.ts`). A newer deploy removes the old file, so an installed app finds nothing new to install and stays exactly as it is, even after being closed and reopened (browsers otherwise switch a waiting worker in by themselves at that point).
  - The 8:00 a.m. daily hard refresh is no longer started (`useDailyHardRefresh` is not called from `App.tsx`).
  - Coming back after 30+ minutes no longer switches to a new version (`useResumeRefresh` only shows the price-refresh line).
  - Every chunk (3D login scene, PDF export, Excel) is now saved with the version, because the older files disappear from the server after a deploy.
  - Tapping Update runs `hardRefresh()` (removes the worker and caches, reloads from the network), which registers the new build's worker.
  - Not preventable: the browser's own hard reload (Ctrl+Shift+R) skips the service worker and fetches whatever is deployed.
  - Tested in Chromium: after deploying a second build, normal reload, close and reopen, and a deep link all stayed on the first build; the Update steps moved to the second.
- Tested by serving a build, opening it, then dropping a changed build into the served folder: the notice appeared after about 24 s (old code: not within 100 s), and 0.3 s after returning to the foreground.

## Valuation search dropdown (typed text no longer shows unrelated recents)
- Bug: typing "ARE" and tapping the box showed recent searches (ADANIPOWER, TCS, …) that had nothing to do with the text. The list had no "searching / no match / couldn't search" state, so whenever no matches were available it fell back to recents.
- Now (`pages/Valuation.tsx`): matches while typing; "Searching for …" while the lookup runs (gives up after 10 s); "No matches for …" when nothing is found; "Couldn't reach stock search" with **Try again** when the lookup fails; plus **Try "X" anyway** to load the typed symbol directly (handy when the keyboard covers the Get valuation button). Recent searches show only for an empty box or a stock already picked; while typing they show only if they match the text. Old matches never stay up for unrelated text. Same wording style as the Add Asset form.
- Server (`api/_lib/indiaSearch.js`, `api/market/v1/finance/search.js`): if NSE and Yahoo both failed, the endpoint answered 200 with an empty list and cached it for 5 min (+ up to 1 h stale), so a hiccup looked like "no results" for everyone. Now a total failure is a 502 (not cached), a partly failed lookup is cached 15 s, and an empty result 60 s. Normal results keep the 5 min cache.

## Floating eye button stays where you put it
- Before: the spot was saved as px from the **top** of the screen. A Chrome tab has the address bar on top and the installed app doesn't, so the same saved spot sat about 56 dp apart in the two; and when the keyboard opened the page shrank and the eye hopped up above it. A held finger that wobbled a few px also re-saved a slightly different spot.
- Now (`components/PrivacyFab.tsx`, `store/displaySettingsStore.ts`): the spot is saved as distance from the left and the **bottom** edge (the bottom is identical in the browser and the app). The keyboard no longer moves it (it stays put, under the keyboard if that is where it sits). After the hold, the finger must travel 6 px before anything moves, so a steady hold never nudges it; it only changes when you press, hold and drag.
- Spots saved by the old version are converted once and appear in the same place. Tap still toggles, a quick swipe still doesn't move it, and Settings → "Reset position" still works.

---

## Performance pass 3 — network storm, duplicate DOM, wasted renders

**Live prices: one request instead of one per stock.**
`fetchLiveQuotes` (src/utils/marketPrices.ts) now asks `/api/market/chart/_batch?symbols=A,B,C`
for all holdings at once (40 per request). Before: 60 stocks = ~720 serverless calls/min per open tab.
- The route lives in the existing `api/market/chart/[symbol].js` + `api/_lib/batchQuotes.js`
  (NOT a new file under api/ — the project is at 11 of Vercel Hobby's 12 function limit).
- Dev server mirrors it in vite.config.ts.
- If the batch call fails (old deploy, network blip) the client falls back to the old per-symbol path;
  unpriced symbols get at most 4 individual retries per poll.
- `api/_lib/nse.js`: concurrent calls now share one NSE cookie handshake.
- Index ticker poll: 1 s -> 2 s (`LIVE_MS` in src/utils/indexQuotes.ts). Set back to 1_000 if preferred.

**Wealth → Holdings.**
- Phone list and desktop table were both rendered (one hidden with CSS) -> every holding built twice.
  Now only the visible layout renders (`useMediaQuery('(min-width: 40rem)')`, src/hooks/useMediaQuery.ts).
- Filter / value / totals / sort moved into one `useMemo` (`book`); each asset is valued once, not twice.
- `assets` is memoised (was a new array every render when a profile was active).

**Dashboard.** `assets`, `liabilities`, `transactions`, `goals`, `profileAssets` were fresh arrays every
render, which defeated every `useMemo` that depended on them. Now memoised, along with net worth,
portfolio P&L, cash basis and month income/expense.

**Login.** Slide photos 3000 px / 5.4 MB -> 1920 px / 1.2 MB. Only the current + next slide mount an
`<img>` (stacked opacity:0 images still count as on-screen for lazy loading, so all 7 used to download).

**Selectors.** LockScreen, TopHeader, Topbar, PrivacyFab and App no longer subscribe to whole stores.

Deliberately NOT done: `content-visibility` on rows (would skew scroll restoration), changing CSS `zoom`.

---

# Third pass — whole-site bug sweep

## Stock page (`StockQuote.tsx`)
- A slow reply for the previous stock or chart range could overwrite the current one (open stock A, then B quickly, or tap 1D then 1Y: A's price/chart showed under B, or the 1D chart under the 1Y label). Every quote / chart / details load now takes a ticket and only the newest may update the page.
- A background refresh that failed while the page was still loading left the chart or details spinning forever; it now shows the "Try again" state.
- A price alert that fired cleared the alert of whichever stock page was open, not its own; it now clears the alert it belongs to.

## Live prices (`marketPrices.ts`, Watchlist)
- The ".BO" (BSE) suffix was stripped before asking the server for a price, so BSE stocks were priced from NSE (and "NSE.BO" matched the unrelated NSE symbol "NSE"), even though the server already has BSE-only routing. ".BO" is now kept; only ".NS" is dropped.
- Stocks saved from the BSE stock page (saved as bare symbol + exchange "BSE") are now priced and charted as BSE in the Watchlist.

## Watchlist page
- Export CSV: formula-injection safe (a note like `=HYPERLINK(...)` no longer runs in Excel), UTF-8 BOM so ₹ and non-English names read correctly, list names with `/ : ? *` no longer break the filename, and the download is no longer cancelled in Safari / mobile (the link is added to the page and the URL is revoked after a delay).
- A stock whose 52-week history failed to load stayed without a range bar for 30 minutes; failed loads are retried after 2 minutes.
- Duplicating a list in the same millisecond as another could give two lists the same id.
- Summary line restyled as chips (count, up, down, average).

## Downloads
- Analytics → Tax CSV: same fixes as the Watchlist export (BOM, formula-safe, delayed revoke).
- Backup .json: the download URL was revoked immediately, which can cancel the download in Safari / some mobile browsers.
- New shared helpers in `utils/exportCsv.ts`: `triggerDownload`, `csvCell`, `safeFilename`.

---

# Fourth pass — chart values follow your finger

- **Charts (whole site):** on phones the value card stayed on screen after you lifted your finger. Now the value shows while a finger is on the chart (press, or slide sideways to move along it) and hides when it lifts; a quick tap shows it for ~1.2 s. Mouse hover is unchanged. One shared listener, `utils/chartTouchHide.ts` (installed in `main.tsx`), covers every Recharts chart: Dashboard, Wealth (net worth history, monthly change), Portfolio Performance, Money → Insights, Analytics (allocation, projection) and the Calculators. `.recharts-wrapper` is `touch-action: pan-y` so sideways drags scrub and vertical swipes still scroll.
- **Dashboard → Income & expenses:** no longer tap-to-pin; it uses the same show-while-touching behaviour. (Net worth over time already worked this way.)
- **Allocation rings and the Dashboard legend:** the highlighted ring / row clears when the finger lifts.
- **"What's new" dialog:** if nothing in the list is new by title, the full list is shown instead of the generic message.
