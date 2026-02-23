import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
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
  plugins: [react(), anthropicProxy()],
})
