/// <reference types="vitest/config" />
import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { version } from './package.json'

const SYMBOL = 'XAU/USD'
const BASE_URL = 'https://api.twelvedata.com/time_series'

/** Only these intervals are proxyable — mirrors the `api/candles.ts` whitelist. */
const ALLOWED_INTERVALS = new Set(['5min', '15min', '1h'])

/** Clamp `outputsize` to [1, 500] (default 200) — mirrors `api/candles.ts`. */
function clampOutputSize(raw: string | null): number {
  const n = Number.parseInt(raw ?? '', 10)
  if (Number.isNaN(n)) return 200
  return Math.min(500, Math.max(1, n))
}

/**
 * Dev-only middleware that mimics the `api/candles.ts` Vercel function.
 *
 * `vite dev` doesn't execute the `api/` directory, so without this, `npm run dev`
 * would have no way to reach Twelve Data. This keeps the key server-side locally too:
 * it reads `TWELVEDATA_KEY` (not the `VITE_`-prefixed var, which Vite would inline into
 * client code) straight from the dev-server process, never handing it to the browser.
 */
function apiCandlesDevProxy(mode: string): Plugin {
  return {
    name: 'api-candles-dev-proxy',
    configureServer(server) {
      const env = loadEnv(mode, process.cwd(), '')
      const key = env.TWELVEDATA_KEY

      server.middlewares.use('/api/candles', async (req: IncomingMessage, res: ServerResponse) => {
        res.setHeader('Content-Type', 'application/json')

        if (!key || key.trim() === '') {
          res.statusCode = 500
          res.end(JSON.stringify({ status: 'error', code: 500, message: 'Server is missing TWELVEDATA_KEY' }))
          return
        }

        const requestUrl = new URL(req.url ?? '', 'http://localhost')
        const interval = requestUrl.searchParams.get('interval') ?? '5min'
        const outputsize = clampOutputSize(requestUrl.searchParams.get('outputsize'))

        if (!ALLOWED_INTERVALS.has(interval)) {
          res.statusCode = 400
          res.end(
            JSON.stringify({
              status: 'error',
              code: 400,
              message: `Invalid interval "${interval}". Must be one of: ${Array.from(ALLOWED_INTERVALS).join(', ')}.`,
            }),
          )
          return
        }

        const url =
          `${BASE_URL}?symbol=${encodeURIComponent(SYMBOL)}` +
          `&interval=${encodeURIComponent(interval)}` +
          `&outputsize=${encodeURIComponent(outputsize)}` +
          // Force UTC — mirrors api/candles.ts; twelveData.ts parses datetimes as UTC.
          `&timezone=UTC` +
          `&apikey=${encodeURIComponent(key)}`

        try {
          const response = await fetch(url)
          const data = await response.json()
          // Pass through verbatim regardless of upstream HTTP status: the client branches
          // on Twelve Data's own `status: 'ok' | 'error'` field (mirrors api/candles.ts).
          res.statusCode = 200
          res.end(JSON.stringify(data))
        } catch (err) {
          res.statusCode = 502
          res.end(JSON.stringify({ status: 'error', code: 502, message: String(err) }))
        }
      })
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), apiCandlesDevProxy(mode)],
  // Baked into the client bundle at build time; surfaced in the footer (see App.tsx).
  define: { __APP_VERSION__: JSON.stringify(version) },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './tests/setup.ts',
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
  },
}))
