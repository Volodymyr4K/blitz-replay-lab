#!/usr/bin/env node
// Refreshes src/data/tanks.json and src/data/maps.json from the community-maintained
// Aftermath asset dump (github.com/Cufee/aftermath-assets). Existing entries are kept,
// so tanks that disappear upstream still resolve in old replays.
import { readFile, writeFile } from 'node:fs/promises'

const BASE = 'https://raw.githubusercontent.com/Cufee/aftermath-assets/main/assets'
const CLASS = { heavyTank: 'HT', mediumTank: 'MT', lightTank: 'LT', 'AT-SPG': 'TD' }
const root = new URL('../src/data/', import.meta.url)

// Upstream is a third-party repo, so accept only plain display names and sane values.
const SAFE_NAME = /^[\p{L}\p{N} .,'’()\-–+/&!#:*]{1,40}$/u
const MAX_CHANGES = 150
const rejected = []
const safeName = (s) => typeof s === 'string' && SAFE_NAME.test(s)

async function fetchJson(name) {
  const res = await fetch(`${BASE}/${name}`)
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`)
  return res.json()
}

async function readLocal(name) {
  return JSON.parse(await readFile(new URL(name, root), 'utf8'))
}

async function write(name, data) {
  const sorted = Object.fromEntries(Object.entries(data).sort((a, b) => Number(a[0]) - Number(b[0])))
  await writeFile(new URL(name, root), JSON.stringify(sorted) + '\n')
}

const [vehicles, maps, tanks, mapNames] = await Promise.all([
  fetchJson('vehicles.json'),
  fetchJson('maps.json'),
  readLocal('tanks.json'),
  readLocal('maps.json'),
])

let tankChanges = 0
for (const [id, v] of Object.entries(vehicles)) {
  const name = v.names?.en
  if (!name) continue
  const tier = Number.isInteger(v.tier) && v.tier >= 0 && v.tier <= 10 ? v.tier : 0
  if (!/^\d+$/.test(id) || !safeName(name)) {
    rejected.push(`tank ${id}: ${JSON.stringify(name)}`)
    continue
  }
  const next = [name, CLASS[v.class] ?? '', tier]
  if (JSON.stringify(tanks[id]) !== JSON.stringify(next)) {
    tanks[id] = next
    tankChanges++
  }
}

let mapChanges = 0
for (const [id, m] of Object.entries(maps)) {
  const en = m.names?.en
  if (!en) continue
  const uk = m.names.uk || en
  if (!/^\d+$/.test(id) || !safeName(en) || !safeName(uk)) {
    rejected.push(`map ${id}: ${JSON.stringify([en, uk])}`)
    continue
  }
  const next = { en, uk }
  if (JSON.stringify(mapNames[id]) !== JSON.stringify(next)) {
    mapNames[id] = next
    mapChanges++
  }
}

if (rejected.length) console.warn(`skipped ${rejected.length} suspicious entries:\n  ${rejected.join('\n  ')}`)
if (tankChanges + mapChanges > MAX_CHANGES) {
  throw new Error(`${tankChanges + mapChanges} changes in one run looks wrong — refusing to write; review upstream manually`)
}

await write('tanks.json', tanks)
await write('maps.json', mapNames)
console.log(`tanks: ${Object.keys(tanks).length} (${tankChanges} updated), maps: ${Object.keys(mapNames).length} (${mapChanges} updated)`)
