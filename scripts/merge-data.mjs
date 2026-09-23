// Pure merge logic for game data, kept apart from the network code so it can be tested.

/** @typedef {[name: string, cls: string, tier: number]} TankEntry */
/** @typedef {Record<string, TankEntry>} TankTable */

export const CLASS = { heavyTank: 'HT', mediumTank: 'MT', lightTank: 'LT', 'AT-SPG': 'TD' }

// Upstream data is third-party, so accept only plain display names and sane values.
const SAFE_NAME = /^[\p{L}\p{N} .,'’()\-–+/&!#:*]{1,40}$/u
export const safeName = (s) => typeof s === 'string' && SAFE_NAME.test(s)
const safeTier = (t) => (Number.isInteger(t) && t >= 0 && t <= 10 ? t : 0)

/**
 * Normalise one source into { id: [name, class, tier] }.
 * `rows` maps tank IDs to objects; `pick` extracts { name, cls, tier } from each.
 * @param {Record<string, any> | undefined} rows
 * @param {(row: any) => { name?: string, cls?: string, tier?: number } | undefined} pick
 * @param {string[]} rejected
 * @returns {TankTable}
 */
export function normalizeTanks(rows, pick, rejected) {
  /** @type {TankTable} */
  const out = {}
  for (const [id, row] of Object.entries(rows ?? {})) {
    const { name, cls, tier } = pick(row) ?? {}
    if (!name) continue
    if (!/^\d+$/.test(id) || !safeName(name)) {
      rejected.push(`tank ${id}: ${JSON.stringify(name)}`)
      continue
    }
    out[id] = [name, CLASS[cls] ?? '', safeTier(tier)]
  }
  return out
}

/** Aftermath asset dump: { id: { names: { en }, class, tier } }. @type {(rows: any, rejected: string[]) => TankTable} */
export const fromAftermath = (rows, rejected) => normalizeTanks(rows, (v) => ({ name: v?.names?.en, cls: v?.class, tier: v?.tier }), rejected)

/** Wargaming API encyclopedia/vehicles `data`: { id: { name, type, tier } }. @type {(rows: any, rejected: string[]) => TankTable} */
export const fromWargaming = (rows, rejected) => normalizeTanks(rows, (v) => ({ name: v?.name, cls: v?.type, tier: v?.tier }), rejected)

/**
 * Layer sources over the existing table, lowest priority first. A later source replaces an
 * entry, but never wipes a known class or tier with an empty one. Nothing is ever removed,
 * so tanks that leave the game still resolve in old replays.
 * @param {Record<string, any>} existing
 * @param {...TankTable} sources
 * @returns {{ tanks: TankTable, changes: number }}
 */
export function mergeTanks(existing, ...sources) {
  const tanks = { ...existing }
  let changes = 0
  for (const source of sources) {
    for (const [id, [name, cls, tier]] of Object.entries(source)) {
      const prev = tanks[id]
      const next = [name, cls || prev?.[1] || '', tier || prev?.[2] || 0]
      if (JSON.stringify(prev) !== JSON.stringify(next)) {
        tanks[id] = next
        changes++
      }
    }
  }
  return { tanks, changes }
}

/**
 * @param {Record<string, { en: string, uk: string }>} existing
 * @param {Record<string, any>} rows
 * @param {string[]} rejected
 * @returns {{ maps: Record<string, { en: string, uk: string }>, changes: number }}
 */
export function mergeMaps(existing, rows, rejected) {
  const maps = { ...existing }
  let changes = 0
  for (const [id, m] of Object.entries(rows ?? {})) {
    const en = m?.names?.en
    if (!en) continue
    const uk = m.names.uk || en
    if (!/^\d+$/.test(id) || !safeName(en) || !safeName(uk)) {
      rejected.push(`map ${id}: ${JSON.stringify([en, uk])}`)
      continue
    }
    const next = { en, uk }
    if (JSON.stringify(maps[id]) !== JSON.stringify(next)) {
      maps[id] = next
      changes++
    }
  }
  return { maps, changes }
}
