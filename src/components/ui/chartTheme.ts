/** Shared, restrained chart styling — one place to tune every chart in the app.
 *  Structural colours reference the same CSS variables as the rest of the UI, so
 *  charts follow light/dark automatically. Series colours stay fixed hex values. */
export const chart = {
  primary: '#247a4d',
  primarySoft: 'rgba(36,122,77,0.10)',
  positive: '#1b7f4b',
  negative: '#c93a32',
  warning: '#c48a1c',
  grid: 'var(--color-line-soft)',
  axis: 'var(--color-faint)',
  tick: { fontSize: 12, fill: 'var(--color-muted)' },
  tooltip: {
    contentStyle: {
      background: 'var(--color-surface)',
      border: '1px solid var(--color-line)',
      borderRadius: 10,
      boxShadow: '0 8px 24px -6px rgba(0,0,0,0.18)',
      fontSize: 12,
      padding: '8px 10px',
      color: 'var(--color-ink)',
    },
    labelStyle: { color: 'var(--color-muted)', marginBottom: 2, fontWeight: 500 },
    itemStyle: { color: 'var(--color-ink)', padding: 0 },
    cursor: { stroke: 'var(--color-line)', strokeWidth: 1 },
  },
} as const;
