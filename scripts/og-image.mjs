#!/usr/bin/env node
// Renders public/og.png, the 1200×630 link-preview image shown by Discord, Telegram, etc.
// Run after changing the branding: node scripts/og-image.mjs
import { chromium } from '@playwright/test'

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0 }
  body { width: 1200px; height: 630px; font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #eef1f5;
    background: radial-gradient(900px 420px at 80% -10%, rgba(245,165,36,.18), transparent 70%), #0e1013; padding: 72px 80px; display: flex; flex-direction: column; }
  .brand { display: flex; align-items: center; gap: 22px; font-size: 40px; font-weight: 800; letter-spacing: -.01em }
  h1 { margin-top: 64px; font-size: 68px; line-height: 1.05; font-weight: 800; letter-spacing: -.03em; max-width: 1060px }
  p { margin-top: 24px; font-size: 32px; color: #a3acba; max-width: 900px }
  .row { margin-top: auto; display: flex; gap: 16px }
  .chip { padding: 12px 22px; border-radius: 12px; font-size: 26px; font-weight: 700; background: #1c2129; border: 1px solid #323a46 }
  .elite { background: #f5a524; color: #1a1305; border: 0 }
  .our { color: #3ecf8e } .enemy { color: #f2555a }
</style></head><body>
  <div class="brand">
    <svg width="64" height="64" viewBox="0 0 32 32"><path d="M16 2 28.1 9v14L16 30 3.9 23V9z" fill="#F5A524"/><path d="M17.5 7 10 17.5h5.2L14 25l8-10.8h-5.3z" fill="#1a1305"/></svg>
    Blitz Replay Lab
  </div>
  <h1>WoT Blitz replays → team stats</h1>
  <p>BPR 2.0, damage, accuracy and win rate for both teams. Runs in your browser — replays never leave your device.</p>
  <div class="row">
    <span class="chip elite">BPR 1.24</span>
    <span class="chip"><span class="our">2 499</span> : <span class="enemy">2 105</span> ADR</span>
    <span class="chip">Scrims · Personal · Share</span>
  </div>
</body></html>`

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
await page.setContent(html)
await page.screenshot({ path: new URL('../public/og.png', import.meta.url).pathname })
await browser.close()
console.log('wrote public/og.png')
