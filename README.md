# Aurafin

A privacy-first personal net worth tracker: assets, liabilities, goals, and income/expenses in one dashboard, built with React, TypeScript, Vite, Tailwind CSS, Zustand, and Firebase.

This is an original app inspired by the idea of an all-in-one net worth dashboard for Indian investors (EPF/PPF, SGBs, mutual funds, multi-currency, etc.) - it is not a copy of any existing product's code, design, or content. Feel free to reshape the branding, copy, and features however you like.

## Features

- **Overview** - collapsible Wealth / Cashflow / Investments / Goals sections, each summarized at a glance, plus a headline net worth card
- **Wealth** - tabbed view combining Assets, Liabilities, and Allocation; add/edit/delete assets across 10 asset classes, export any list to CSV
- **Money** - income and expense tracking with a quick "Add" menu (Expense/Income) and CSV export
- **Essentials** - a simple financial health check (income/expense/savings-rate score) plus your savings Goals with progress bars
- **Import** - upload a CSV or Excel (.xlsx/.xls) file to bulk-add assets. Columns like Name, Value, Asset Class, and Currency are auto-detected by header name; each row can be reviewed, its asset class corrected, or skipped before saving
- **Calculators** - SIP (with optional annual step-up), Lumpsum, and Fixed Deposit calculators with growth charts
- **Settings** - profile info, base currency
- **Topbar** - dark/light theme toggle, a privacy "eye" that masks amounts across the Overview page, a notifications dropdown, a global "Add" menu grouped into Cashflow (Expense/Income/Transfer) and Wealth (Asset/Liability/Snapshot), and a profile menu synced to your Google account photo/name with a confirmation step before signing out
- **Auth** - Firebase Email/Password + Google sign-in
- **Cloud sync** - every collection (assets, liabilities, goals, transactions, snapshots) syncs live to Firestore under `users/{uid}/{collection}` via a generic reusable hook

## Getting started

```bash
npm install
cp .env.example .env
```

### 1. Set up Firebase

1. Create a project at console.firebase.google.com
2. Enable Authentication -> Email/Password and Google providers
3. Enable Firestore (start in production mode)
4. In Project Settings -> General, register a Web App and copy the config values into your `.env` file (matches the keys in `.env.example`)
5. Deploy the security rules in `firestore.rules` (or paste them into the Firestore Rules tab in the console)

### 2. Run the dev server

```bash
npm run dev
```

### 3. Build for production

```bash
npm run build
```

## Project structure

```
src/
  firebase/config.ts         Firebase app/auth/firestore initialization
  store/                     Zustand stores (auth, assets, liabilities, goals, transactions, snapshots)
  hooks/useFirestoreSync.ts  Generic Firestore <-> Zustand sync (subscribe + upsert + delete)
  pages/                     Dashboard, Assets, Liabilities, Goals, Transactions, Settings, Login
  components/                Sidebar, StatCard, Modal
  types/                     Shared TypeScript interfaces
  utils/currency.ts          Currency formatting + asset class labels/colors
```

## Notes on extending this

- **Snapshots**: there's a `snapshotsStore` and Firestore sync wired in, but no UI yet to create a snapshot - add a button on the Dashboard that writes the current net worth as a new Snapshot document.
- **Live prices**: no market data integration is wired up. You'd need a price API and a scheduled refresh.
- **Multi-currency conversion**: currencies are stored per-item but not converted to a single base currency yet - you'll want an FX rate API if you want true multi-currency net worth rollups.
