#!/usr/bin/env node
// Refreshes src/data/tanks.json and src/data/maps.json.
//
// Sources, lowest priority first:
//   1. the community Aftermath asset dump (github.com/Cufee/aftermath-assets) — tanks and map names;
//   2. the official Wargaming API, when WG_APP_ID is set (free at developers.wargaming.net) — tanks.
// Existing entries are kept, so tanks that disappear upstream still resolve in old replays.
import { readFile, writeFile } from 'node:fs/promises'
import { fromAftermath, fromWargaming, mergeMaps, mergeTanks } from './merge-data.mjs'

const AFTERMATH = 'https://raw.githubusercontent.com/Cufee/aftermath-assets/main/assets'
const WG_API = 'https://api.wotblitz.eu/wotb/encyclopedia/vehicles/'
const MAX_CHANGES = 150
const root = new URL('../src/data/', import.meta.url)

async function fetchJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${String(url).split('?')[0]}: HTTP ${res.status}`)
  return res.json()
}

async function wargamingVehicles(appId) {
  const url = new URL(WG_API)
  url.search = new URLSearchParams({ application_id: appId, fields: 'name,type,tier', language: 'en' }).toString()
  const body = await fetchJson(url)
  if (body.status !== 'ok') throw new Error(`Wargaming API: ${body.error?.message ?? 'error'}`)
  return body.data
}

const readLocal = async (name) => JSON.parse(await readFile(new URL(name, root), 'utf8'))

async function write(name, data) {
  const sorted = Object.fromEntries(Object.entries(data).sort((a, b) => Number(a[0]) - Number(b[0])))
  await writeFile(new URL(name, root), JSON.stringify(sorted) + '\n')
}

const appId = process.env.WG_APP_ID?.trim()
const rejected = []

const [vehicles, mapRows, tanks, mapNames, official] = await Promise.all([
  fetchJson(`${AFTERMATH}/vehicles.json`),
  fetchJson(`${AFTERMATH}/maps.json`),
  readLocal('tanks.json'),
  readLocal('maps.json'),
  appId ? wargamingVehicles(appId) : null,
])

const sources = [fromAftermath(vehicles, rejected)]
if (official) sources.push(fromWargaming(official, rejected))
const tankResult = mergeTanks(tanks, ...sources)
const mapResult = mergeMaps(mapNames, mapRows, rejected)

if (rejected.length) console.warn(`skipped ${rejected.length} suspicious entries:\n  ${rejected.join('\n  ')}`)
const changes = tankResult.changes + mapResult.changes
if (changes > MAX_CHANGES && !process.env.ALLOW_LARGE_UPDATE) {
  throw new Error(`${changes} changes in one run looks wrong — refusing to write. Review upstream, then rerun with ALLOW_LARGE_UPDATE=1.`)
}

await write('tanks.json', tankResult.tanks)
await write('maps.json', mapResult.maps)
const untyped = Object.values(tankResult.tanks).filter((t) => !t[1]).length
console.log(
  `sources: aftermath${official ? ' + wargaming' : ''} | tanks: ${Object.keys(tankResult.tanks).length} (${tankResult.changes} updated, ${untyped} without class) | maps: ${Object.keys(mapResult.maps).length} (${mapResult.changes} updated)`,
)
