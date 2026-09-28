import fs from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Phone testing (start.sh phone): HTTPS with a self-signed certificate, because
// mobile browsers only allow GPS on HTTPS pages.
const certDir = process.env.METSURI_DEV_CERT_DIR
const https =
  certDir && fs.existsSync(`${certDir}/key.pem`)
    ? { key: fs.readFileSync(`${certDir}/key.pem`), cert: fs.readFileSync(`${certDir}/cert.pem`) }
    : undefined

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    https,
    proxy: {
      // Proxy API requests to backend during development
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        // The browser origin may be a LAN address (phone); the backend only needs to see the proxy
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => proxyReq.removeHeader('origin'))
        },
      },
    },
  },
})
