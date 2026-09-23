// The main user journeys, in a real browser against the production build.
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const fixture = (name: string) => fileURLToPath(new URL(`../test/fixtures/${name}.wotbreplay`, import.meta.url))
const SCRIM = fixture('scrim_2026')
const RANDOMS = ['player_results', 'victory_points', 'draw'].map(fixture)

/** Fail the test on any uncaught error, console error or CSP violation. */
function watchErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`))
  return errors
}

async function upload(page: Page, files: string[]) {
  await page.locator('.dropzone input[type=file][accept=".wotbreplay"]').setInputFiles(files)
  await expect(page.locator('.veil')).toHaveCount(0)
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('bra:lang', 'en'))
})

test('analyzes a scrim end to end', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('./')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Turn replays into team stats')

  await upload(page, [SCRIM])
  await expect(page.locator('.stat-strip')).toContainText('1–0–0')
  await expect(page.locator('.team-col.our li')).toHaveCount(7)
  await expect(page.locator('.team-col.enemy li')).toHaveCount(7)
  await expect(page.locator('.stat-strip')).toContainText('KroKoDiIiLY_DZhaviLy')

  // Player dialog: opens, traps focus, closes on Escape and returns focus.
  const first = page.locator('.team-col.our li button').first()
  await first.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('BPR components')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(first).toBeFocused()

  // Team table: search narrows, sorting by a header works from the keyboard.
  await page.getByRole('tab', { name: /Our team/ }).click()
  await page.getByRole('textbox', { name: 'Search player…' }).fill('KroKo')
  await expect(page.locator('.grid tbody tr')).toHaveCount(1)
  await page.getByRole('textbox', { name: 'Search player…' }).fill('')
  await page.getByRole('button', { name: 'ADR' }).press('Enter')
  const adr = await page.locator('.grid tbody tr td:nth-child(8)').allInnerTexts()
  const values = adr.map((v) => Number(v.replace(/\s/g, '')))
  expect(values).toEqual([...values].sort((a, b) => b - a))

  expect(errors).toEqual([])
})

test('share link reproduces the report and bad links fail gently', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('./')
  await upload(page, [SCRIM])
  const mvp = await page.locator('.stat-strip .stat.clickable .stat-value').first().innerText()

  await page.getByRole('button', { name: 'Share' }).click()
  const url = await page.locator('.share-url').inputValue()
  expect(url.length).toBeLessThan(2000)
  await page.keyboard.press('Escape')

  await page.goto(url)
  await expect(page.locator('.shared-bar')).toContainText('Shared report')
  await expect(page.locator('.stat-strip')).toContainText(mvp)
  await expect(page.locator('.team-col.our li')).toHaveCount(7)

  for (const bad of ['#/s/!!!', '#/s/AAAA', `#/s/${'A'.repeat(4000)}`]) {
    await page.goto(`./${bad}`)
    await expect(page.getByText('This share link is broken or incomplete.')).toBeVisible()
  }
  expect(errors).toEqual([])
})

test('session survives reload, clears with undo, reports bad files', async ({ page }) => {
  await page.goto('./')
  const asPayload = (path: string) => ({ name: basename(path), mimeType: 'application/octet-stream', buffer: readFileSync(path) })
  await page.locator('.dropzone input[type=file][accept=".wotbreplay"]').setInputFiles([
    ...RANDOMS.map(asPayload),
    { name: 'broken.wotbreplay', mimeType: 'application/octet-stream', buffer: Buffer.from('not a replay') },
  ])
  await expect(page.locator('.stat-strip')).toContainText('2–0–1')
  await expect(page.locator('.stat.bad')).toContainText('1')

  await page.reload()
  await expect(page.locator('.stat-strip')).toContainText('2–0–1')

  await page.getByRole('button', { name: 'New analysis' }).click()
  await expect(page.locator('.hero')).toBeVisible()
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.locator('.stat-strip')).toContainText('2–0–1')

  await page.getByRole('tab', { name: /Battles/ }).click()
  await expect(page.locator('.error-list')).toContainText('broken.wotbreplay')
  await expect(page.locator('.error-list')).toContainText('not a WoT Blitz replay')
})

test('exports an Excel workbook', async ({ page }) => {
  await page.goto('./')
  await upload(page, [SCRIM])
  await page.locator('.title-input').fill('Scrim test')
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Excel' }).click()])
  expect(download.suggestedFilename()).toBe('Scrim test.xlsx')
  const bytes = readFileSync(await download.path())
  expect(bytes.subarray(0, 2).toString()).toBe('PK')
  expect(bytes.length).toBeGreaterThan(5000)
})

test('layout never scrolls sideways', async ({ page }) => {
  await page.goto('./')
  await upload(page, RANDOMS)
  for (const tab of [/Overview/, /Our team/, /Battles/]) {
    await page.getByRole('tab', { name: tab }).click()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, `horizontal overflow on ${tab}`).toBeLessThanOrEqual(0)
  }
})
