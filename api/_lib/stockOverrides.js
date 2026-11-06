// Hand-checked facts that neither Yahoo nor NSE provide (or provide differently from
// what Indian stock sites show). Keyed by bare NSE symbol. Anything listed here wins
// over the fetched value; anything not listed is left exactly as fetched.
//
// To add a stock, copy the block below and fill only the fields you have verified.
//   founded       year the company was founded / incorporated
//   ceo           name as you want it shown
//   industry      industry label
//   faceValue     face value per share in rupees
//   quarterly     [{ date, revenueCr, profitCr, revenueYoy, profitYoy }] replaces the fetched
//                 quarters (use when the data source has gaps or a wrong quarter).
//   shareholding  { 'YYYY-MM-DD quarter end': { public, dii, fii } } in percent;
//                 promoters stays as fetched. Only add when you have all three.
export const STOCK_OVERRIDES = {
  LALITHAA: {
    founded: 1985, // incorporated 26 Nov 1985
    ceo: 'Kiran Jain',
    industry: 'Jewellery',
    faceValue: 5,
    shareholding: {
      '2026-09-30': { public: 9.61, dii: 4.65, fii: 2.9 },
    },
    // Consolidated, from the company's results. Only these three quarters have been
    // published: Sep '25 and Dec '25 were never reported (it listed in Aug 2026).
    quarterly: [
      { date: '2025-06-30', revenueCr: 4786.12, profitCr: 265.57, revenueYoy: null, profitYoy: null },
      { date: '2026-03-31', revenueCr: 6500, profitCr: 345.66, revenueYoy: null, profitYoy: null },
      { date: '2026-06-30', revenueCr: 6031.23, profitCr: 208.22, revenueYoy: 26.02, profitYoy: -21.6 },
    ],
  },
};

export function applyOverrides(detail) {
  const o = STOCK_OVERRIDES[String(detail?.symbol ?? '').toUpperCase()];
  if (!o) return detail;
  if (o.faceValue != null) detail.fundamentals.faceValue = o.faceValue;
  if (o.ceo) detail.about.ceo = o.ceo;
  if (o.industry) detail.about.industry = o.industry;
  if (o.founded != null) detail.about.founded = o.founded;
  if (o.quarterly) {
    detail.financials.quarterly = o.quarterly.map((q) => ({
      date: q.date,
      revenue: q.revenueCr * 1e7,
      profit: q.profitCr * 1e7,
      revenueYoy: q.revenueYoy,
      profitYoy: q.profitYoy,
    }));
  }
  if (o.shareholding) {
    detail.shareholding = detail.shareholding.map((q) =>
      o.shareholding[q.date] ? { ...q, ...o.shareholding[q.date] } : q
    );
  }
  return detail;
}

// Peer groups used to work out an Industry P/E when NSE does not supply one.
// A stock belongs to a group if its industry / sector text matches `match`
// or its symbol is listed. The Industry P/E is the median trailing P/E of the
// group's other members (taken live from Yahoo), so one very expensive peer
// cannot drag it up. Add more groups the same way.
export const PEER_GROUPS = [
  {
    name: 'Jewellery',
    match: /jewel|gems|diamond|luxury goods/i,
    symbols: ['TITAN', 'KALYANKJIL', 'SENCO', 'THANGAMAYL', 'PNGJL', 'RAJESHEXPO', 'SKYGOLD', 'MOTISONS', 'RBZJEWEL', 'LALITHAA'],
  },
];

export function peerGroupFor(symbol, industryText) {
  const sym = String(symbol ?? '').toUpperCase();
  return (
    PEER_GROUPS.find((g) => g.symbols.includes(sym)) ??
    PEER_GROUPS.find((g) => g.match.test(industryText ?? '')) ??
    null
  );
}
