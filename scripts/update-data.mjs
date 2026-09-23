#!/usr/bin/env node
// Refreshes src/data/tanks.json and src/data/maps.json from the community-maintained
// Aftermath asset dump (github.com/Cufee/aftermath-assets). Existing entries are kept,
// so tanks that disappear upstream still resolve in old replays.
import { readFile, writeFile } from 'node:fs/promises'

const BASE = 'https://raw.githubusercontent.com/Cufee/aftermath-assets/main/assets'
const CLASS = { heavyTank: 'HT', mediumTank: 'MT', lightTank: 'LT', 'AT-SPG': 'TD' }
const root = new URL('../src/data/', import.meta.url)

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
  const next = [name, CLASS[v.class] ?? '', v.tier ?? 0]
  if (JSON.stringify(tanks[id]) !== JSON.stringify(next)) {
    tanks[id] = next
    tankChanges++
  }
}

let mapChanges = 0
for (const [id, m] of Object.entries(maps)) {
  const en = m.names?.en
  if (!en) continue
  const next = { en, uk: m.names.uk || en }
  if (JSON.stringify(mapNames[id]) !== JSON.stringify(next)) {
    mapNames[id] = next
    mapChanges++
  }
}

await write('tanks.json', tanks)
await write('maps.json', mapNames)
console.log(`tanks: ${Object.keys(tanks).length} (${tankChanges} updated), maps: ${Object.keys(mapNames).length} (${mapChanges} updated)`)
