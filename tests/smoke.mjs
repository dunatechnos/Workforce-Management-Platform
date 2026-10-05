import { spawn } from 'node:child_process'
import { chromium } from '@playwright/test'

const shot = n => `C:\\Users\\kesha\\AppData\\Local\\Temp\\opencode\\smoke-${n}.png`
let ready = process.argv.includes('--external')
let server = null
if (!ready) {
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', '4173', '--strictPort'], { cwd: new URL('..', import.meta.url).pathname })
  server.stdout.on('data', d => { if (String(d).includes('4173')) ready = true })
}
try {
  for (let i = 0; i < 60 && !ready; i++) await new Promise(r => setTimeout(r, 500))
  if (!ready) throw new Error('preview server did not start')
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1360, height: 850 } })
  const errors = []
  page.on('pageerror', e => errors.push('pageerror: ' + e.message))
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()) })
  await page.goto('http://localhost:4173', { waitUntil: 'networkidle' })
  const body = await page.textContent('body')
  const unconfigured = body.includes('Connect your workspace')
  for (const needle of unconfigured ? ['Welcome to HV.', 'Connect your workspace', 'supabase/schema.sql'] : ['Welcome to HV.', 'Company email', 'Password', 'Create account']) {
    if (!body.includes(needle)) throw new Error('missing expected text: ' + needle)
  }
  await page.screenshot({ path: shot('login') })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(400)
  await page.screenshot({ path: shot('mobile') })
  await browser.close()
  if (errors.length) throw new Error('JS errors: ' + errors.join(' | '))
  console.log('SMOKE OK')
} finally {
  if (server) server.kill()
}
