# Aurafin – review & fixes

You sent 8 source files (not a full project: no package.json / index / other pages), so I could review and
fix these files by reading and testing the maths, but could not run the whole app. Please run your normal
`npm run build` / `tsc` once after copying the files over.

Layout is unchanged — no styling/CSS was touched, apart from one touch-device visibility class (see 9).

## Bugs fixed
1. **Add Liability silently failed** (Wealth.tsx): it called `upsertDoc(user.uid, …)` while every other call passes `user`.
2. **Editing an asset/liability dropped fields** it doesn't show (household profile, sale history, SIP pause history,
   account colour/icon, IPO details…). Saves now keep everything the form doesn't edit.
3. **Dates off by a day / first SIP installment skipped** in IST and other timezones: `new Date('yyyy-mm-dd')` is UTC
   midnight. Added `parseLocalDate` and used it for SIP, RD, FD and upcoming-event maths.
4. **PPF "withdraw full balance from" date was a year late** (now the day after maturity).
5. **Impossible dates (e.g. 2026-02-31) were accepted** in PPF and property maths — now rejected.
6. **Property sale tax**: improvements with no date dropped out of the indexed cost; they now count at face value.
7. **PPF and property summaries never appeared** on the asset page (the code sat in a screen those assets never use).
   Added PPF and Property cards to the asset detail page.
8. **Privacy mode leaked** invested amount, P&L, purchase price and SIP amounts on the asset page — now masked.
9. **Clicking the "Tags" label removed the first tag** (label wrapped buttons) — Tags and Gold Purity now use a div group.
10. **Deposit assets (FD/RD…) with no amount** showed "fix the highlighted field" with nothing highlighted; now highlighted.
11. **Maturity before start date** was accepted for deposits — now blocked with a message.
12. Fully-sold holdings were counted in "N assets" and caused the wrong empty-state message.
13. Delete liability / save or delete net-worth snapshot had no error handling — now show a message on failure.
14. Wrong labels/text: "More options" button actually exports CSV; maturity hint said "simple-interest" but uses
    quarterly compounding; "Ticker *" looked required but isn't.
15. `crypto.randomUUID()` crashes on plain-http / older browsers — replaced everywhere with a safe `newId()` (utils/id.ts).
16. Keyboard: pressing Enter on a row's "..." button also opened the row; desktop rows are now keyboard-focusable.
17. Upcoming events: stock/ETF "recurring investment" reminders never showed up; RD end-date was timezone-sensitive.

## Small additions
- **Tags filter now works** (it was an empty, dead dropdown).
- Row "..." menu is always visible on touch devices (it only appeared on hover before).
- PPF: warnings for deposits dated before the opening date, a yearly plan above ₹1.5 lakh or under ₹500;
  deposits are only marked "already counted" once a year-end balance is really entered.
- Maturity-date picker won't offer dates before the start date.

## Checked and left as is
CII 384 for FY 2026-27 and the PPF rate of 7.1% (Oct–Dec 2026) match current notifications.

## Known limits (design, not changed)
- Totals add holdings in different currencies as if they were INR.
- Net-worth tab ignores the active household profile.
- Legacy PPF migration caps a single old lump sum at ₹1.5 lakh.
