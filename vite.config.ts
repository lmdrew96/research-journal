import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import type { Plugin } from 'vite'

function anthropicProxy(): Plugin {
  let apiKey = ''

  return {
    name: 'anthropic-proxy',
    configResolved(config) {
      const env = loadEnv(config.mode, config.root, '')
      apiKey = env.VITE_ANTHROPIC_API_KEY || ''
    },
    configureServer(server) {
      server.middlewares.use('/api/anthropic', async (req, res) => {
        const chunks: Buffer[] = []
        req.on('data', (chunk: Buffer) => chunks.push(chunk))
        req.on('end', async () => {
          try {
            const body = Buffer.concat(chunks).toString()
            const targetPath = (req.url || '').replace(/^\//, '')
            const url = `https://api.anthropic.com/v1/${targetPath}`

            const response = await fetch(url, {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
              },
              body,
            })

            const responseBody = await response.text()
            res.writeHead(response.status, { 'content-type': 'application/json' })
            res.end(responseBody)
          } catch (err) {
            res.writeHead(500, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ error: String(err) }))
          }
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    anthropicProxy(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'ThreadNotes',
        short_name: 'ThreadNotes',
        description: 'A personal research journal — questions, literature, and the notes between them.',
        theme_color: '#e08420',
        background_color: '#05080f',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // The SPA fallback must not swallow serverless routes — without this,
        // an offline /api/* or /mcp/* request is answered with index.html.
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/mcp\//],
        runtimeCaching: [
          {
            // User data: prefer the network, fall back to the last good copy
            // so the library and journal stay readable offline.
            urlPattern: ({ url }) => url.pathname === '/api/data',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'threadnotes-data',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
})
