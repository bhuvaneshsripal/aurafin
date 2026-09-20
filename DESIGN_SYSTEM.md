# AuraFin design system

One coherent fintech UI: white cards on a warm-gray page, charcoal text, a single green accent, Inter everywhere.

## Where things live
| What | Where |
|---|---|
| Design tokens (colour, type, radius, shadow, motion, layout) | `src/index.css` → the `@theme` block, plus `.dark` overrides |
| Reusable components | `src/components/ui/` (import from `../components/ui`) |
| App shell | `Sidebar.tsx`, `TopHeader.tsx`, `BottomNav.tsx`, `ProfileSwitcher.tsx` |
| Chart styling | `ui/chartTheme.ts` |
| Money formatting helpers | `src/utils/currency.ts` |

## Tokens
- **Palette** – primary `brand-600 #247A4D`; page `#F7F7F5`; card `#FFF`; border `#E5E5E0`; ink `#171717`; muted `#6B7280`.
  P&L uses `text-positive` / `text-negative` (dark-mode aware). Warnings are muted amber.
- **Semantic classes** (flip in dark mode automatically, no `dark:` needed): `bg-page`, `bg-surface`, `bg-surface-muted`,
  `bg-surface-hover`, `border-line`, `border-line-soft`, `text-ink`, `text-ink-2`, `text-muted`, `text-faint`,
  `text-primary-ink`, `bg-primary-soft`, `bg-positive-soft`, `bg-negative-soft`, `bg-warning-soft`.
  The older `slate-*` / `brand-*` scales still work and resolve to the same palette.
- **Type** – Inter only (loaded by a `<link>` in `index.html`; a CSS `@import` cannot work with Tailwind's layer order).
  Weights: 400 body · 500 nav/labels/table · 600 headings/values · 700 reserved (`font-bold` maps to 600).
  Money uses `.font-numeric` (tabular figures).
- **Shape** – controls 8px, cards 12px (`rounded-2xl`), modals 14px. Fully round only for avatars, dots and the mobile FAB (`.keep-round`).
- **Motion** – 150–200ms opacity/colour/transform only. No flip, 3D, float or blur effects.
- **Layout** – `--sb-w` is the live sidebar width (246px, 72px when collapsed / on tablets). `Modal`'s content panel reads it.

## Components (`src/components/ui`)
`Button` · `IconButton` · `Card` / `CardHeader` · `Input` / `Textarea` / `Label` / `Field` · `Select` · `Badge` ·
`PageHeader` · `EmptyState` · `LoadingState` / `Skeleton` · `Table` family (`TableContainer`, `Table`, `THead`, `TBody`, `Th`, `Tr`, `Td`) ·
`Tabs` / `SegmentedControl` · `StatCard` (`dense` for phone KPI strips) · `Modal` (re-export).

Conventions: every page starts with `PageHeader`; data tables use the `Table` family with `numeric` cells right-aligned;
form fields use `inputClasses` (16px on phones so iOS doesn't zoom, 14px from `sm`).

## Notes
- The user-facing Text size / Screen size settings still drive `--app-zoom` and the root font size.
- `src/pages/Pro.tsx`, `src/components/pro/` and `src/pages/Assets.tsx` / `Liabilities.tsx` / `Goals.tsx` are not routed and were left untouched.
