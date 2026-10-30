import type { Asset } from '../types';

/**
 * Sector classification for the "Sector allocation" card.
 *
 * Nothing here is invented per user: a holding's sector comes from (in order)
 *   1. its asset class (physical gold / SGB / silver are the Gold / Silver sector),
 *   2. the built-in NSE/US symbol map below,
 *   3. the company profile Yahoo Finance publishes (sector + industry, fetched via
 *      /api/market/valuation?mode=sector and cached on the device),
 *   4. keywords in the fund / ETF name.
 * Anything that still can't be placed is shown as "Unclassified" rather than guessed.
 */

export interface SectorDef {
  key: string;
  label: string;
  /** Short note on what is counted — shown in the row's info text. */
  note: string;
  color: string;
}

/** The sectors that are ALWAYS listed (0% when you hold nothing in them). */
export const CORE_SECTORS: SectorDef[] = [
  { key: 'banking', label: 'Banking', note: 'Public & private banks', color: '#0f766e' },
  { key: 'financial', label: 'Finance', note: 'NBFCs, insurance, housing finance, fintech lenders', color: '#0e7490' },
  { key: 'capmarket', label: 'Capital markets', note: 'Exchanges, brokers, asset managers, depositories', color: '#0284c7' },
  { key: 'it', label: 'IT & technology', note: 'IT services, software, semiconductors', color: '#2563eb' },
  { key: 'pharma', label: 'Pharma & healthcare', note: 'Pharma, hospitals, diagnostics', color: '#7c3aed' },
  { key: 'fmcg', label: 'FMCG', note: 'Packaged food, personal care, beverages, tobacco', color: '#c2410c' },
  { key: 'auto', label: 'Automobile', note: 'Vehicles, auto parts, tyres', color: '#b45309' },
  { key: 'oilgas', label: 'Oil, gas & coal', note: 'Refining, exploration, gas utilities, coal', color: '#475569' },
  { key: 'power', label: 'Power & utilities', note: 'Generation, transmission, renewables', color: '#ca8a04' },
  { key: 'metals', label: 'Metals & mining', note: 'Steel, aluminium, zinc, copper, mining', color: '#64748b' },
  { key: 'gold', label: 'Gold', note: 'Gold ETFs, gold-loan & jewellery companies, gold miners', color: '#d4a017' },
  { key: 'silver', label: 'Silver', note: 'Silver ETFs and silver miners', color: '#94a3b8' },
  { key: 'infra', label: 'Infrastructure', note: 'Construction, EPC, ports, railways, logistics', color: '#0369a1' },
  { key: 'capgoods', label: 'Capital goods', note: 'Industrial machinery, electricals, engineering', color: '#4f46e5' },
  { key: 'defence', label: 'Defence & aerospace', note: 'Defence manufacturers, shipyards, aerospace', color: '#be123c' },
  { key: 'realty', label: 'Realty', note: 'Real-estate developers', color: '#be185d' },
  { key: 'telecom', label: 'Telecom', note: 'Telecom operators & equipment', color: '#0891b2' },
  { key: 'chemicals', label: 'Chemicals & fertilisers', note: 'Specialty chemicals, agrochemicals, fertilisers', color: '#15803d' },
  { key: 'cement', label: 'Cement & building materials', note: 'Cement and construction materials', color: '#a16207' },
  { key: 'consumer', label: 'Consumer & retail', note: 'Retail, paints, jewellery brands, hotels, media, internet platforms', color: '#db2777' },
];

/** Extra rows that only appear when you actually hold something there. */
export const EXTRA_SECTORS: SectorDef[] = [
  { key: 'diversified', label: 'Diversified funds', note: 'Index funds, flexi-cap / hybrid funds and broad-market ETFs', color: '#16a34a' },
  { key: 'international', label: 'International / global', note: 'Overseas index funds and ETFs', color: '#9333ea' },
  { key: 'unclassified', label: 'Unclassified', note: "Sector couldn't be determined", color: '#9ca3af' },
];

/** The sectors tracked first, always shown at the top in this order (even at 0%). */
export const PRIORITY_SECTORS = ['banking', 'financial', 'capmarket', 'auto', 'it', 'capgoods', 'defence', 'pharma', 'power', 'gold'];

export const ALL_SECTORS: SectorDef[] = [...CORE_SECTORS, ...EXTRA_SECTORS];
export const SECTOR_BY_KEY = new Map(ALL_SECTORS.map((s) => [s.key, s]));

// ---------------------------------------------------------------- symbol map
const RAW_MAP: Record<string, string> = {
  banking:
    'HDFCBANK ICICIBANK SBIN KOTAKBANK AXISBANK INDUSINDBK BANKBARODA PNB CANBK UNIONBANK IDFCFIRSTB FEDERALBNK BANDHANBNK AUBANK RBLBANK YESBANK IDBI BANKINDIA INDIANB CENTRALBK MAHABANK UCOBANK SOUTHBANK KARURVYSYA CUB TMB DCBBANK IOB UJJIVANSFB EQUITASBNK CSBBANK PSB JKBANK ' +
    'JPM BAC WFC C',
  financial:
    'BAJFINANCE BAJAJFINSV HDFCLIFE SBILIFE ICICIGI ICICIPRULI SBICARD CHOLAFIN SHRIRAMFIN PFC RECLTD IRFC LICHSGFIN JIOFIN LICI POLICYBZR PAYTM M&MFIN POONAWALLA ABCAPITAL IIFL IREDA HUDCO MFSL STARHEALTH GICRE NIACL PNBHOUSING CANFINHOME AAVAS HOMEFIRST CREDITACC SPANDANA PIRAMAL MONEYVIEW PHONEPE PINELABS PAYU MOBIKWIK FIVESTAR SBFC AADHARHFC APTUS PROTEAN PAISALO MASFIN FUSION SATIN CREDAGRI RELIGARE SUNDARMFIN TATACAP TATACAPITAL NIVABUPA ICICIPRULI GODIGIT' +
    'V MA BRK-B AXP PYPL',
  capmarket:
    'BSE CDSL ANGELONE MOTILALOFS NUVAMA 360ONE CAMS KFINTECH MCX HDFCAMC NAM-INDIA ABSLAMC UTIAMC CRISIL ICRA ANANDRATHI PRUDENT GS MS BLK SCHW ICE CME',
  it:
    'TCS INFY WIPRO HCLTECH TECHM LTIM LTTS PERSISTENT COFORGE MPHASIS OFSS KPITTECH TATAELXSI CYIENT BSOFT ZENSARTECH SONATSOFTW MASTEK INTELLECT TANLA NEWGEN ECLERX HAPPSTMNDS RATEGAIN LATENTVIEW ' +
    'AAPL MSFT GOOGL GOOG NVDA META AMD INTC ORCL CRM ADBE CSCO IBM AVGO QCOM TSM MU PLTR SNOW NOW',
  pharma:
    'SUNPHARMA DRREDDY CIPLA DIVISLAB LUPIN AUROPHARMA TORNTPHARM ZYDUSLIFE ALKEM MANKIND BIOCON GLENMARK APOLLOHOSP MAXHEALTH FORTIS LALPATHLAB METROPOLIS ABBOTINDIA IPCALAB LAURUSLABS GRANULES NATCOPHARM AJANTPHARM SYNGENE PFIZER GLAXO SANOFI JBCHEPHARM GLAND KIMS NARAYANA RAINBOW MEDANTA THYROCARE ERIS CAPLIPOINT SUVEN ' +
    'JNJ PFE UNH LLY MRK ABBV TMO ABT',
  fmcg:
    'HINDUNILVR ITC NESTLEIND BRITANNIA DABUR MARICO GODREJCP COLPAL TATACONSUM UBL UNITDSPR MCDOWELL-N VBL RADICO EMAMILTD PATANJALI BIKAJI GILLETTE PGHH HATSUN JYOTHYLAB BAJAJCON AWL ZYDUSWELL GODFRYPHLP VSTIND CUPID ' +
    'KO PEP PG WMT COST PM MDLZ',
  auto:
    'MARUTI TATAMOTORS M&M BAJAJ-AUTO EICHERMOT HEROMOTOCO TVSMOTOR ASHOKLEY BOSCHLTD MOTHERSON BALKRISIND MRF APOLLOTYRE CEATLTD SONACOMS UNOMINDA ESCORTS TIINDIA ENDURANCE EXIDEIND ARE&M OLAELEC TATAMTRDVR FORCEMOT SUNDRMFAST JKTYRE MINDACORP ' +
    'TSLA F GM TM',
  oilgas:
    'RELIANCE ONGC BPCL IOC HINDPETRO GAIL OIL PETRONET IGL MGL GUJGASCNG GSPL COALINDIA CASTROLIND MRPL CHENNPETRO ATGL ADANIGAS GULFOILLUB HINDOILEXP ' +
    'XOM CVX COP SHEL BP',
  power:
    'NTPC POWERGRID TATAPOWER ADANIPOWER ADANIGREEN ADANIENSOL JSWENERGY NHPC SJVN TORNTPOWER CESC NTPCGREEN SUZLON INOXWIND WAAREEENER PREMIERENE IEX INOXGREEN WAAREERTL SWSOLAR',
  metals:
    'TATASTEEL JSWSTEEL HINDALCO VEDL SAIL JINDALSTEL NMDC HINDZINC NATIONALUM APLAPOLLO JSL LLOYDSME WELCORP RATNAMANI MOIL JINDALSAW GVKPIL SHYAMMETL ' +
    'FCX AA NUE X CLF',
  gold:
    'MUTHOOTFIN MANAPPURAM KALYANKJIL SENCO THANGAMAYL PNGJL LALITHAA LALITHAAJEWELLERY RAJESHEXPO GOLDIAM SKYGOLD MOTISONS TBZ RBZJEWEL ' +
    'GOLDBEES GOLDIETF GOLDCASE AXISGOLD HDFCGOLD KOTAKGOLD SBIGETS LICMFGOLD GOLDSHARE QGOLDHALF BSLGOLDETF TATAGOLD GOLD1 ' +
    'NEM AEM FNV WPM GFI KGC GDX GDXJ GLD IAU SGOL',
  silver: 'SILVERBEES SILVERIETF SILVER1 HDFCSILVER AXISILVER ' + 'SLV PAAS AG HL',
  infra:
    'LT ADANIPORTS IRCON RVNL RITES NBCC NCC KEC KALPATPOWR IRB GMRAIRPORT GMRINFRA CONCOR HGINFRA PNCINFRA ASHOKA JWL TITAGARH ENGINERSIN GPPL JSWINFRA ADANIENT TEXRAIL',
  capgoods:
    'SIEMENS ABB BHEL CUMMINSIND THERMAX HONAUT POLYCAB KEI HAVELLS CGPOWER ELGIEQUIP KIRLOSENG LAKSHMIMACH GRINDWELL AIAENG SKFINDIA TIMKEN DIXON FINCABLES APARINDS SOLARINDS HBLENGINE BHARATFORG KAYNES AMBER VOLTAMP TRIVENI GENUSPOWER' +
    'GE CAT DE HON',
  defence:
    'HAL BEL BDL MAZDOCK COCHINSHIP GRSE BEML ASTRAMICRO DATAPATTNS ZENTEC PARAS ' +
    'BA LMT RTX NOC GD',
  realty: 'DLF GODREJPROP OBEROIRLTY PRESTIGE PHOENIXLTD LODHA MACROTECH BRIGADE SOBHA MAHLIFE SIGNATURE ANANTRAJ DBREALTY KOLTEPATIL',
  telecom: 'BHARTIARTL BHARTIHEXA IDEA VODAFONEIDEA VI JIOPLATFORMS JIOPLATFORM JIOPL JIO INDUSTOWER TATACOMM HFCL TEJASNET RAILTEL ROUTE TTML STLTECH ' + 'T VZ TMUS',
  chemicals:
    'PIDILITIND SRF UPL AARTIIND DEEPAKNTR NAVINFLUOR TATACHEM PIIND ATUL VINATIORG CHAMBLFERT COROMANDEL FACT RCF GNFC GSFC SUMICHEM CLEAN BASF ALKYLAMINE FINEORG GALAXYSURF TATVA ANURAS BALAMINES LXCHEM PCBL',
  cement: 'ULTRACEMCO GRASIM AMBUJACEM ACC SHREECEM DALBHARAT JKCEMENT RAMCOCEM JKLAKSHMI NUVOCO HEIDELBERG BIRLACORPN STARCEMENT SAGCEM ORIENTCEM CERA KAJARIACER CENTURYPLY GREENPANEL ASTRAL SUPREMEIND',
  consumer:
    'TITAN ASIANPAINT BERGEPAINT KANSAINER INDIGOPNTS ZOMATO ETERNAL SWIGGY NYKAA FSN TRENT DMART ABFRL PAGEIND VMART SHOPERSTOP JUBLFOOD DEVYANI WESTLIFE SAPPHIRE BATAINDIA RELAXO CAMPUS METROBRAND BLUESTARCO VOLTAS WHIRLPOOL CROMPTON PVRINOX SUNTV ZEEL NETWORK18 INDIGO IRCTC MAKEMYTRIP LEMONTREE INDHOTEL CHALET EIHOTEL NAUKRI INFOEDGE INDIAMART JUSTDIAL HONASA LENSKART MEDPLUS ARVIND ' +
    'AMZN NFLX DIS NKE SBUX MCD HD LOW UBER ABNB BKNG',
};

const SYMBOL_SECTOR = new Map<string, string>();
for (const [sector, list] of Object.entries(RAW_MAP)) {
  for (const sym of list.split(/\s+/)) {
    if (sym) SYMBOL_SECTOR.set(sym.toUpperCase(), sector);
  }
}

/** Upper-cased ticker without the exchange suffix / prefix ("NSE:TCS", "TCS.NS" → "TCS"). */
export function normaliseSymbol(symbol: string | undefined): string {
  return (symbol ?? '')
    .trim()
    .toUpperCase()
    .replace(/^(NSE|BSE|NASDAQ|NYSE):/, '')
    .replace(/\.(NS|BO|NSE|BSE)$/, '');
}

export function sectorFromSymbol(symbol: string | undefined): string | undefined {
  const s = normaliseSymbol(symbol);
  return s ? SYMBOL_SECTOR.get(s) : undefined;
}

// ------------------------------------------------------- company-name rules
/** Fallback for stocks whose ticker isn't in the map and that Yahoo has no profile for (e.g. brand-new listings). */
const NAME_RULES: [RegExp, string][] = [
  [/muthoot|manappuram/i, 'gold'],
  [/jewel|jewell?ers|\bgold\b/i, 'gold'],
  // Telecom operators — checked before anything Yahoo says (it files Jio under internet / IT).
  [/jio platforms|^jio\b|reliance jio|vodafone|bharti airtel|\bairtel\b|telecom|tower corp|indus towers/i, 'telecom'],
  // Banks, then lenders / fintech / insurers / brokers (Moneyview, Paytm, Bajaj Finance...).
  [/asset management|\bamc\b|stock ?broking|\bbroking\b|capital markets|\bwealth\b|depositor(y|ies)|stock exchange/i, 'capmarket'],
  [/\bbank\b|\bbancorp\b/i, 'banking'],
  [/money ?view|fintech|\bfinance\b|\bfinserv|financial services|\binsurance\b|\bnbfc\b|micro ?finance|housing finance|asset management|\bamc\b|stock ?broking|\bbroking\b|\blending\b|\bcredit\b|\bpayments?\b|wealth|\bcapital markets\b/i, 'financial'],
  [/defen[cs]e|aerospace|shipbuilders|ordnance/i, 'defence'],
  [/cupid/i, 'fmcg'],
];

export function sectorFromCompanyName(name: string | undefined): string | undefined {
  if (!name) return undefined;
  for (const [re, sector] of NAME_RULES) if (re.test(name)) return sector;
  return undefined;
}

// ------------------------------------------------------------ Yahoo mapping
/** Maps the sector/industry strings Yahoo Finance returns onto our sectors. */
export function mapYahooSector(sector?: string | null, industry?: string | null): string | undefined {
  const ind = industry ?? '';
  const sec = sector ?? '';
  if (/^gold/i.test(ind)) return 'gold';
  if (/^silver/i.test(ind)) return 'silver';
  if (/internet retail|luxury|apparel|footwear|restaurants|lodging|leisure|travel|specialty retail|department|home improvement|furnishings|household appliances|entertainment|broadcasting|publishing|advertising|gambling|resorts|personal services|education/i.test(ind)) return 'consumer';
  if (/telecom|communication equipment/i.test(ind)) return 'telecom';
  if (/banks/i.test(ind)) return 'banking';
  if (/asset management|capital markets|financial data|exchanges/i.test(ind)) return 'capmarket';
  if (/fintech|payment|lending|credit|financial/i.test(ind)) return 'financial';
  if (/insurance|credit services|mortgage|financial|shell/i.test(ind)) return 'financial';
  if (/information technology|software|computer|semiconductor|electronic components|consumer electronics|scientific & technical|internet content/i.test(ind)) return 'it';
  if (/drug|biotech|medical|healthcare|diagnostic|pharma|health information/i.test(ind)) return 'pharma';
  if (/auto/i.test(ind)) return 'auto';
  if (/oil & gas|coal|uranium/i.test(ind)) return 'oilgas';
  if (/utilities/i.test(ind)) return 'power';
  if (/steel|aluminum|copper|metals|mining|precious/i.test(ind)) return 'metals';
  if (/chemicals|agricultural inputs/i.test(ind)) return 'chemicals';
  if (/building materials|cement/i.test(ind)) return 'cement';
  if (/engineering|construction|infrastructure|railroads|airports|marine|trucking|freight|conglomerates|airlines|waste/i.test(ind)) return 'infra';
  if (/aerospace|defense/i.test(ind)) return 'defence';
  if (/machinery|electrical equipment|tools|industrial|metal fabrication|business equipment|building products/i.test(ind)) return 'capgoods';
  if (/telecom/i.test(ind)) return 'telecom';
  if (/real estate/i.test(ind)) return 'realty';
  if (/packaged foods|household|beverages|tobacco|confectioners|farm products|grocery|personal products|food distribution/i.test(ind)) return 'fmcg';

  switch (sec) {
    case 'Technology': return 'it';
    case 'Financial Services': return 'financial';
    case 'Healthcare': return 'pharma';
    case 'Consumer Defensive': return 'fmcg';
    case 'Consumer Cyclical': return 'consumer';
    case 'Energy': return 'oilgas';
    case 'Utilities': return 'power';
    case 'Basic Materials': return 'metals';
    case 'Industrials': return 'capgoods';
    case 'Real Estate': return 'realty';
    case 'Communication Services': return 'telecom';
    default: return undefined;
  }
}

// ------------------------------------------------------------ name keywords
/** Funds / ETFs: read the sector (or theme) out of the instrument's name. */
export function sectorFromName(text: string): string | undefined {
  const t = text.toLowerCase();
  if (/\bgold(?!man)|\bsgb\b/.test(t)) return 'gold';
  if (/\bsilver/.test(t)) return 'silver';
  if (/nasdaq|s&p ?500|\bsp500\b|\bnyse\b|\bfang\b|hang seng|\bchina\b|msci (world|eafe|em)|international|global|\bus\b equity|\bus\b|overseas|world/.test(t)) return 'international';
  if (/psu bank|private bank|bank/.test(t)) return 'banking';
  if (/capital market/.test(t)) return 'capmarket';
  if (/financial services|fin ?serv|\bfinancial\b|\bnbfc\b|insurance/.test(t)) return 'financial';
  if (/pharma|health|hospital/.test(t)) return 'pharma';
  if (/\bnifty it\b|\bit etf\b|\bit fund\b|infotech|information tech|technology|digital/.test(t)) return 'it';
  if (/fmcg/.test(t)) return 'fmcg';
  if (/consumption|consumer/.test(t)) return 'consumer';
  if (/\bauto\b|automobile|mobility/.test(t)) return 'auto';
  if (/infra/.test(t)) return 'infra';
  if (/realty|real estate/.test(t)) return 'realty';
  if (/metal|mining/.test(t)) return 'metals';
  if (/oil|energy|\bgas\b/.test(t)) return 'oilgas';
  if (/power|utilit/.test(t)) return 'power';
  if (/defence|defense|aerospace/.test(t)) return 'defence';
  if (/manufactur|capital goods|industrial|\bpse\b|cpse/.test(t)) return 'capgoods';
  if (/telecom|communication/.test(t)) return 'telecom';
  if (/chemical/.test(t)) return 'chemicals';
  if (/cement/.test(t)) return 'cement';
  return undefined;
}

// ----------------------------------------------------------- classification
/** Asset classes included in the sector view: stocks and ETFs only.
 *  Mutual funds, index funds, hybrid funds, SIPs and commodities (physical gold,
 *  SGBs, physical silver) are deliberately left out. */
export const SECTOR_ASSET_CLASSES = new Set<string>([
  'stock',
  'etf',
  'international_equity',
  'ipo_pre_ipo',
  'equity_other',
]);

/** Classes whose sector comes from a company profile (single stocks). */
const SINGLE_STOCK_CLASSES = new Set<string>(['stock', 'international_equity', 'ipo_pre_ipo', 'equity_other']);

export function isSectorAsset(asset: Asset): boolean {
  return SECTOR_ASSET_CLASSES.has(asset.assetClass);
}

/** Does this holding need a Yahoo company-profile lookup to be classified? */
export function needsProfileLookup(asset: Asset): boolean {
  return (
    SINGLE_STOCK_CLASSES.has(asset.assetClass) &&
    !!asset.symbol &&
    !sectorFromSymbol(asset.symbol)
  );
}

export function profileKey(asset: Asset): string {
  return `${asset.market === 'US' || asset.assetClass === 'international_equity' ? 'US' : 'IN'}:${normaliseSymbol(asset.symbol)}`;
}

export interface SectorProfile {
  sector: string | null;
  industry: string | null;
}

/** Final sector key for one holding. `profiles` = cached Yahoo lookups by profileKey(). */
export function classifyAsset(
  asset: Asset,
  profiles: Record<string, SectorProfile | null | undefined>,
  customs: SectorDef[] = []
): string {
  // Sectors you typed yourself win: a holding whose name or symbol contains the typed text goes there.
  if (customs.length) {
    const hay = `${asset.name ?? ''} ${asset.symbol ?? ''}`.toLowerCase();
    const hit = customs.find((c) => hay.includes(c.label.toLowerCase()));
    if (hit) return hit.key;
  }
  if (asset.assetClass === 'gold' || asset.assetClass === 'sovereign_gold_bond') return 'gold';
  if (asset.assetClass === 'silver') return 'silver';

  const nameHay = `${asset.name ?? ''} ${asset.symbol ?? ''}`;

  if (SINGLE_STOCK_CLASSES.has(asset.assetClass)) {
    const bySymbol = sectorFromSymbol(asset.symbol);
    if (bySymbol) return bySymbol;
    // The company's own name beats Yahoo's profile, which files some businesses
    // under the wrong heading (Jio as internet/IT, Moneyview as software).
    const byCompany = sectorFromCompanyName(asset.name);
    if (byCompany) return byCompany;
    if (asset.symbol) {
      const p = profiles[profileKey(asset)];
      const mapped = p ? mapYahooSector(p.sector, p.industry) : undefined;
      if (mapped) return mapped;
    }
    return sectorFromName(nameHay) ?? 'unclassified';
  }

  // ETF / mutual fund / index fund / SIP / hybrid
  const bySymbol = sectorFromSymbol(asset.symbol);
  if (bySymbol) return bySymbol;
  return sectorFromName(nameHay) ?? 'diversified';
}

// ----------------------------------------------------------------- breakdown
export interface SectorHolding {
  id: string;
  name: string;
  value: number;
  /** % of the sector-eligible portfolio. */
  pct: number;
}

export interface SectorRow extends SectorDef {
  value: number;
  /** % of the sector-eligible portfolio (0 when nothing is held). */
  pct: number;
  holdings: SectorHolding[];
}

export function buildSectorAllocation(
  items: { asset: Asset; value: number }[],
  profiles: Record<string, SectorProfile | null | undefined>,
  trackedKeys: string[] = PRIORITY_SECTORS,
  customs: SectorDef[] = []
): { total: number; rows: SectorRow[] } {
  const eligible = items.filter((i) => isSectorAsset(i.asset) && i.value > 0);
  const total = eligible.reduce((s, i) => s + i.value, 0);

  const bucket = new Map<string, { value: number; holdings: SectorHolding[] }>();
  for (const { asset, value } of eligible) {
    const key = classifyAsset(asset, profiles, customs);
    const b = bucket.get(key) ?? { value: 0, holdings: [] };
    b.value += value;
    b.holdings.push({ id: asset.id, name: asset.name, value, pct: total > 0 ? (value / total) * 100 : 0 });
    bucket.set(key, b);
  }

  const make = (def: SectorDef): SectorRow => {
    const b = bucket.get(def.key);
    return {
      ...def,
      value: b?.value ?? 0,
      pct: b && total > 0 ? (b.value / total) * 100 : 0,
      holdings: (b?.holdings ?? []).sort((a, c) => c.value - a.value),
    };
  };

  // Tracked sectors come first in their own order (shown even at 0%); every
  // other sector is listed only when something is held in it, biggest first.
  const priority = trackedKeys.map((k) => SECTOR_BY_KEY.get(k) ?? customs.find((c) => c.key === k)).filter((d): d is SectorDef => !!d).map(make);
  const rest = ALL_SECTORS.filter((d) => !trackedKeys.includes(d.key))
    .map(make)
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);
  return { total, rows: [...priority, ...rest] };
}

const CUSTOM_COLORS = ['#0d9488', '#e11d48', '#7c3aed', '#ea580c', '#0284c7', '#65a30d', '#c026d3', '#ca8a04'];

/** Turns typed sectors into rows definitions (stable colour per name). */
export function customSectorDefs(customs: Record<string, { label: string }>): SectorDef[] {
  return Object.entries(customs).map(([key, c]) => {
    let h = 0;
    for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return { key, label: c.label, note: `Holdings with “${c.label}” in the name`, color: CUSTOM_COLORS[h % CUSTOM_COLORS.length] };
  });
}
