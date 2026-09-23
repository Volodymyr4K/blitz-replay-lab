import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * GitHub Pages cannot send security headers, so the policy ships as a <meta> tag.
 * Build only: the dev server relies on inline scripts for hot reload.
 * Everything is same-origin; Excel export spins up workers from blob: URLs.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

const contentSecurityPolicy = (): Plugin => ({
  name: 'content-security-policy',
  apply: 'build',
  transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' }],
})

// Relative base so the build works from any GitHub Pages sub-path.
export default defineConfig({
  base: './',
  plugins: [react(), contentSecurityPolicy()],
  worker: { format: 'es' },
})
