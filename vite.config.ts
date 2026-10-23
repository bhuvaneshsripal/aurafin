import { defineConfig, type Connect, type ViteDevServer, type PreviewServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
// @ts-expect-error - plain JS helper shared with the api/market/* Vercel functions, no .d.ts
import { searchIndia } from './api/_lib/indiaSearch.js'
// @ts-expect-error - plain JS helper shared with the api/market/* Vercel functions, no .d.ts
import { resolveQuote } from './api/_lib/quote.js'
// @ts-expect-error - plain JS helper shared with the api/market/* Vercel functions, no .d.ts
import { fetchLiveGoldPricePerGram24k } from './api/_lib/gold.js'
// @ts-expect-error - plain JS helper shared with the api/market/* Vercel functions, no .d.ts
import { fetchFundamentals } from './api/_lib/fundamentals.js'
// @ts-expect-error - plain JS helper shared with the api/market/* Vercel functions, no .d.ts
import { fetchIndices } from './api/_lib/indices.js'
// @ts-expect-error - plain JS helper shared with the api/market/* Vercel functions, no .d.ts
import { resolveLogo } from './api/_lib/logo.js'
// @ts-expect-error - plain JS helper shared with the api/market/* Vercel functions, no .d.ts
import { fetchGlobalIndices } from './api/_lib/globalIndices.js'
// @ts-expect-error - plain JS helper shared with the api/market/* Vercel functions, no .d.ts
import { fetchIndianIndices } from './api/_lib/indianIndices.js'

// Local-dev/preview stand-in for the api/market/* serverless functions.
// A plain URL-rewrite proxy (like /api/mf below) can't work for NSE,
// because NSE requires a cookie handshake before its API will answer —
// so this middleware runs the same NSE-first, Yahoo-fallback logic
// in-process, sharing the NSE helper with the real serverless functions.
function marketApiDevMiddleware(): Connect.NextHandleFunction {
  return async (req, res, next) => {
    if (!req.url || !req.url.startsWith('/api/market')) return next()
    const url = new URL(req.url, 'http://localhost')

    const send = (status: number, body: unknown) => {
      res.statusCode = status
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(body))
    }

    if (url.pathname.startsWith('/api/market/chart/')) {
      const raw = decodeURIComponent(url.pathname.split('/').pop() ?? '').toUpperCase()
      const market = (url.searchParams.get('market') ?? 'IN').toUpperCase() === 'US' ? 'US' : 'IN'
      try {
        const quote = await resolveQuote(raw, market)
        if (!quote) {
          console.error(`[dev/market] no live price for ${raw}`)
          send(502, { error: `Could not get a live price for ${raw}` })
          return
        }
        send(200, {
          symbol: raw.replace(/\.(NS|BO)$/i, ''),
          price: quote.price,
          previousClose: quote.previousClose,
          currency: quote.currency,
          source: quote.source,
        })
      } catch (err) {
        console.error(`[dev/market] ${raw} failed:`, err instanceof Error ? err.message : err)
        send(502, { error: 'Could not reach the live price source' })
      }
      return
    }

    if (url.pathname === '/api/market/logo') {
      const symbol = (url.searchParams.get('symbol') ?? '').trim()
      const market = (url.searchParams.get('market') ?? 'IN').toUpperCase() === 'US' ? 'US' : 'IN'
      if (!symbol) { res.statusCode = 400; res.end(); return }
      try {
        const logo = await resolveLogo(symbol, market, url.searchParams.get('isin') ?? '', undefined, url.searchParams.get('name') ?? '')
        if (!logo) { res.statusCode = 404; res.end(); return }
        res.statusCode = 200
        res.setHeader('Content-Type', logo.contentType)
        res.setHeader('Cache-Control', 'public, max-age=2592000, immutable')
        res.end(logo.buffer)
      } catch { res.statusCode = 502; res.end() }
      return
    }

    if (url.pathname === '/api/market/valuation') {
      const symbol = (url.searchParams.get('symbol') ?? '').trim()
      const exchange = (url.searchParams.get('exchange') ?? 'NSE').toUpperCase() === 'BSE' ? 'BSE' : 'NSE'
      if (!symbol) { send(400, { error: 'Missing symbol' }); return }
      try {
        const data = await fetchFundamentals(symbol, exchange, 10)
        if (!data) { send(404, { error: `No fundamentals found for ${symbol}` }); return }
        send(200, data)
      } catch (err) {
        console.error(`[dev/valuation] ${symbol} failed:`, err instanceof Error ? err.message : err)
        send(502, { error: 'Could not reach the fundamentals source' })
      }
      return
    }

    if (url.pathname === '/api/market/indian-indices') {
      try {
        const indices = await fetchIndianIndices()
        if (!indices) { send(502, { error: 'Could not fetch Indian indices' }); return }
        send(200, { indices, asOf: Date.now() })
      } catch (err) {
        console.error('[dev/indian-indices] failed:', err instanceof Error ? err.message : err)
        send(502, { error: 'Could not reach the index data source' })
      }
      return
    }

    if (url.pathname === '/api/market/global-indices') {
      try {
        const indices = await fetchGlobalIndices()
        if (!indices) { send(502, { error: 'Could not fetch global indices' }); return }
        send(200, { indices, asOf: Date.now() })
      } catch (err) {
        console.error('[dev/global-indices] failed:', err instanceof Error ? err.message : err)
        send(502, { error: 'Could not reach the index data source' })
      }
      return
    }

    if (url.pathname === '/api/market/indices') {
      try {
        const indices = await fetchIndices()
        if (!indices) { send(502, { error: 'Could not fetch index levels' }); return }
        send(200, { indices })
      } catch (err) {
        console.error('[dev/indices] failed:', err instanceof Error ? err.message : err)
        send(502, { error: 'Could not reach the index data source' })
      }
      return
    }

    if (url.pathname === '/api/market/fx') {
      const from = (url.searchParams.get('from') ?? 'USD').toUpperCase()
      const to = (url.searchParams.get('to') ?? 'INR').toUpperCase()
      if (from === to) {
        send(200, { rate: 1, from, to, asOf: Date.now() })
        return
      }
      try {
        const upstream = await fetch(
          `https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(from)}&symbols=${encodeURIComponent(to)}`
        )
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const json = (await upstream.json()) as any
        const rate = json?.rates?.[to]
        if (typeof rate !== 'number') {
          send(502, { error: 'Exchange rate not available for this currency pair' })
          return
        }
        send(200, { rate, from, to, asOf: Date.now() })
      } catch {
        send(502, { error: 'Could not reach the exchange rate source' })
      }
      return
    }

    if (url.pathname === '/api/market/v1/finance/search') {
      const q = url.searchParams.get('q') ?? ''
      if (!q.trim()) {
        send(200, { quotes: [] })
        return
      }

      try {
        if (url.searchParams.get('market')?.toUpperCase() === 'US') {
          const upstream = await fetch(
            `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`,
            { headers: { 'User-Agent': 'Mozilla/5.0' } }
          )
          send(200, await upstream.json())
          return
        }
        send(200, await searchIndia(q))
      } catch (err) {
        console.error(`[dev/market] Could not reach NSE or Yahoo Finance for "${q}":`, err instanceof Error ? err.message : err)
        send(502, { error: 'Could not reach NSE or Yahoo Finance' })
      }
      return
    }

    if (url.pathname === '/api/market/gold') {
      try {
        const result = await fetchLiveGoldPricePerGram24k()
        if (!result) {
          console.error('[dev/gold] every gold-price source failed (gold-api.com, Yahoo, frankfurter.dev) — check your network/firewall/proxy can reach external hosts')
          send(502, { error: 'Could not fetch a live gold price right now' })
          return
        }
        send(200, {
          pricePerGram24k: result.pricePerGram24k,
          currency: 'INR',
          basis: 'global-spot-estimate',
          asOf: result.asOf,
        })
      } catch (err) {
        console.error('[dev/gold] fetch failed:', err)
        send(502, { error: 'Could not fetch a live gold price right now' })
      }
      return
    }

    next()
  }
}

function marketApiDevPlugin() {
  return {
    name: 'market-api-dev',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(marketApiDevMiddleware())
    },
    configurePreviewServer(server: PreviewServer) {
      server.middlewares.use(marketApiDevMiddleware())
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    marketApiDevPlugin(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'favicon-32.png', 'favicon-16.png', 'maskable-512.png'],
      manifest: {
        name: 'Aurafin · Net Worth Tracker',
        short_name: 'Aurafin',
        description: 'Your whole financial picture, in one place.',
        theme_color: '#247a4d',
        background_color: '#f7f7f5',
        id: '/',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'portrait',
        categories: ['finance', 'productivity'],
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/favicon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/favicon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // Dedicated maskable icon with safe-zone padding so Android's
          // round/squircle masks don't crop the logo.
          { src: '/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Wealth', url: '/wealth', icons: [{ src: '/favicon-192.png', sizes: '192x192' }] },
          { name: 'Performance', url: '/wealth/performance', icons: [{ src: '/favicon-192.png', sizes: '192x192' }] },
          { name: 'Money', url: '/transactions', icons: [{ src: '/favicon-192.png', sizes: '192x192' }] },
        ],
      },
      workbox: {
        // Pre-cache the built app shell so opening the installed app is instant,
        // even offline. Firebase/auth calls always go to the network.
        importScripts: ['/notification-sw.js'],
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        globIgnores: ['**/xlsx-*.js'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        // A new deploy installs in the background and WAITS (skipWaiting off)
        // until the user taps "Update" in the top banner (UpdateBanner), so
        // an open tab keeps its own matching cached chunks and lazy routes
        // never 404 mid-session. clientsClaim lets the first install control
        // the page immediately.
        skipWaiting: false,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // The top-bar ticker polls once a second. It must always hit the
            // network (the app keeps its own last-quote copy for offline),
            // otherwise the worker adds latency / can hand back an old quote.
            urlPattern: ({ url }) => url.pathname === '/api/market/indices',
            handler: 'NetworkOnly',
          },
          {
            // Company logos never change: serve from cache first (instant and
            // free on a slow connection) and only hit the network the first
            // time. Kept in their own cache so they can't evict price data.
            urlPattern: ({ url }) => url.pathname === '/api/market/logo' || url.pathname.startsWith('/company-logos/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'company-logos',
              expiration: { maxEntries: 500, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/market'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'market-data',
              // Fresh when online; on a weak/no connection fall back to the
              // last saved response (up to 7 days) instead of showing nothing.
              expiration: { maxEntries: 50, maxAgeSeconds: 7 * 24 * 60 * 60 },
              networkTimeoutSeconds: 3,
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/mf'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'mf-data',
              expiration: { maxEntries: 50, maxAgeSeconds: 7 * 24 * 60 * 60 },
              networkTimeoutSeconds: 3,
            },
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  server: {
    // Pinned so the app always runs at the same origin. Firebase Auth
    // persistence (and all other localStorage/IndexedDB data) is scoped
    // per-origin *including the port* — if Vite falls back to a different
    // port because 5173 was still busy from a previous run, the browser
    // treats it as a completely different, empty storage bucket and you
    // get bounced back to the login screen even though nothing is wrong.
    // `strictPort: true` makes that failure loud (an error) instead of a
    // silent port hop, so it's easy to notice/kill the stray process.
    port: 5173,
    strictPort: true,
    proxy: {
      '/api/mf': {
        target: 'https://api.mfapi.in',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/mf/, '/mf'),
      },
    },
  },
  preview: {
    proxy: {
      '/api/mf': {
        target: 'https://api.mfapi.in',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/mf/, '/mf'),
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules')) {
            if (id.includes('recharts') || id.includes('d3-')) return 'charts';
            if (id.includes('firebase')) return 'firebase';
            if (id.includes('xlsx')) return 'xlsx';
            if (id.includes('framer-motion')) return 'motion';
            if (id.includes('react-dom') || id.includes('react-router') || id.includes('/react/') || id.includes('zustand')) {
              return 'vendor';
            }
          }
        },
      },
    },
  },
})
