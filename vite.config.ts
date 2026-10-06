import type { Plugin } from 'vite'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function imageProxy(): Plugin {
  return {
    name: 'aurora-image-proxy',
    configureServer(server) {
      server.middlewares.use('/proxy-image', (req, res) => {
        const raw = req.url ?? ''
        const query = raw.includes('?') ? raw.slice(raw.indexOf('?')) : ''
        const target = new URLSearchParams(query).get('url')
        if (!target || !allowedImageHost(target)) {
          res.statusCode = 400
          res.end()
          return
        }
        void fetch(target)
          .then(async (upstream) => {
            if (!upstream.ok) {
              res.statusCode = 502
              res.end()
              return
            }
            const type = upstream.headers.get('content-type') || 'image/jpeg'
            res.setHeader('Content-Type', type.startsWith('image/') ? type : 'image/jpeg')
            res.setHeader('Cache-Control', 'public, max-age=3600')
            res.end(Buffer.from(await upstream.arrayBuffer()))
          })
          .catch(() => {
            if (!res.headersSent) res.statusCode = 502
            res.end()
          })
      })
    },
  }
}

function allowedImageHost(raw: string): boolean {
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:') return false
    const host = url.hostname.toLowerCase()
    return (
      host.endsWith('.tiktokcdn.com') ||
      host.endsWith('.tiktokcdn-us.com') ||
      host.endsWith('.tiktokcdn-eu.com') ||
      host.endsWith('.tiktok.com') ||
      host.endsWith('.byteimg.com') ||
      host.endsWith('.ibyteimg.com') ||
      host.endsWith('.muscdn.com') ||
      host.endsWith('.tiktokv.com') ||
      host.endsWith('.ttwstatic.com')
    )
  } catch {
    return false
  }
}

export default defineConfig({
  plugins: [react(), imageProxy()],
  server: {
    port: 5173,
    strictPort: false,
  },
})
