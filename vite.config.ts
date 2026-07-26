import { defineConfig, type Connect, type ViteDevServer, type PreviewServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
// @ts-expect-error - plain JS helper shared with the api/market/* Vercel functions, no .d.ts
import { fetchNseQuote, searchNseSymbol } from './api/_lib/nse.js'

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
      const bareSymbol = raw.replace(/\.(NS|BO)$/i, '')

      try {
        const quote = await fetchNseQuote(bareSymbol)
        send(200, { symbol: bareSymbol, price: quote.price, currency: quote.currency, source: 'nse' })
        return
      } catch {
        // fall through to Yahoo
      }

      try {
        const yahooSymbol = /\.(NS|BO)$/i.test(raw) ? raw : `${raw}.NS`
        const upstream = await fetch(
          `https://query1.finance.yahoo.com/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=1d`,
          { headers: { 'User-Agent': 'Mozilla/5.0' } }
        )
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = (await upstream.json()) as any
        const meta = data?.chart?.result?.[0]?.meta
        const price = meta?.regularMarketPrice ?? meta?.previousClose
        if (typeof price !== 'number') {
          send(502, { error: 'Could not get a live price from NSE or Yahoo' })
          return
        }
        send(200, { symbol: bareSymbol, price, currency: meta?.currency ?? 'INR', source: 'yahoo' })
      } catch {
        send(502, { error: 'Could not reach NSE or Yahoo Finance' })
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
        const result = await searchNseSymbol(q)
        if (result.quotes.length > 0) {
          send(200, result)
          return
        }
      } catch {
        // fall through to Yahoo
      }

      try {
        const upstream = await fetch(
          `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=5&newsCount=0`,
          { headers: { 'User-Agent': 'Mozilla/5.0' } }
        )
        send(200, await upstream.json())
      } catch {
        send(502, { error: 'Could not reach NSE or Yahoo Finance' })
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
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'favicon-32.png', 'favicon-16.png'],
      manifest: {
        name: 'Aurafin · Net Worth Tracker',
        short_name: 'Aurafin',
        description: 'Your whole financial picture, in one place.',
        theme_color: '#2c6e49',
        background_color: '#f6f3ea',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/favicon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/favicon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/favicon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Pre-cache the built app shell so opening the installed app is instant,
        // even offline. Firebase/auth calls always go to the network.
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        navigateFallback: '/index.html',
        // Without these, a tab left open across a redeploy keeps its old
        // service worker (and its old cached chunk list) until every tab is
        // fully closed — so clicking into a lazy-loaded route like Wealth
        // tries to fetch a JS chunk that no longer exists on the new
        // deployment and the page goes blank. This makes a new deploy take
        // over open tabs right away instead.
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/market'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'market-data',
              expiration: { maxEntries: 50, maxAgeSeconds: 5 * 60 },
              networkTimeoutSeconds: 5,
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/mf'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'mf-data',
              expiration: { maxEntries: 50, maxAgeSeconds: 5 * 60 },
              networkTimeoutSeconds: 5,
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
            if (id.includes('react-dom') || id.includes('react-router') || id.includes('/react/') || id.includes('zustand')) {
              return 'vendor';
            }
          }
        },
      },
    },
  },
})
