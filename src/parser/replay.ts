/**
 * `.wotbreplay` reader.
 *
 * A replay is a ZIP archive with `meta.json`, `data.wotreplay` and `battle_results.dat`.
 * `battle_results.dat` is a pickled `(arena_unique_id, protobuf_bytes)` tuple.
 * Field numbers follow eigenein/wotbreplay-parser (MIT).
 */
import { unzipSync } from 'fflate'
import { unpickle } from './pickle'
import { ProtoMessage } from './protobuf'

export interface ReplayMeta {
  version: string | null
  playerName: string | null
  mapName: string | null
  battleDuration: number | null
  arenaBonusType: number | null
}

export interface ReplayPlayer {
  accountId: number
  nickname: string
  team: number
  clanTag: string | null
  platoonId: number | null
}

export interface ReplayPlayerResult {
  accountId: number
  tankId: number
  damageDealt: number
  damageAssisted: number
  damageBlocked: number
  shots: number
  hits: number
  penetrations: number
  enemiesDamaged: number
  enemiesDestroyed: number
  hitsReceived: number
  penetrationsReceived: number
  victoryPointsEarned: number
  victoryPointsSeized: number
  baseXp: number
  /** Displayed rating (3000 + mm_rating × 10), null outside rating battles. */
  rating: number | null
}

export interface ParsedReplay {
  arenaId: string
  timestamp: number
  mapId: number
  winnerTeam: number | null
  roomType: number
  authorId: number
  authorTeam: number
  players: ReplayPlayer[]
  results: ReplayPlayerResult[]
  meta: ReplayMeta
}

export function parseReplay(file: Uint8Array): ParsedReplay {
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(file, {
      filter: (f) => f.name === 'battle_results.dat' || f.name === 'meta.json',
    })
  } catch {
    throw new Error('not a valid replay archive')
  }

  const dat = entries['battle_results.dat']
  if (!dat) throw new Error('battle_results.dat missing (unfinished battle?)')

  const root = unpickle(dat)
  if (!Array.isArray(root) || root.length < 2 || !(root[1] instanceof Uint8Array)) {
    throw new Error('unexpected battle_results.dat layout')
  }
  const arenaId = String(root[0])
  const br = new ProtoMessage(root[1])

  const author = br.message(8)
  if (!author) throw new Error('battle results have no author')

  const players: ReplayPlayer[] = br.messages(201).flatMap((p) => {
    const info = p.message(2)
    if (!info) return []
    return [
      {
        accountId: p.uint(1),
        nickname: info.string(1) ?? 'unknown',
        team: info.uint(3),
        clanTag: info.string(5) || null,
        platoonId: info.optUint(2),
      },
    ]
  })

  const results: ReplayPlayerResult[] = br.messages(301).flatMap((r) => {
    const i = r.message(2)
    if (!i) return []
    const mm = i.float(107)
    return [
      {
        accountId: i.uint(101),
        tankId: i.uint(103),
        damageDealt: i.uint(8),
        damageAssisted: i.uint(9) + i.uint(10),
        damageBlocked: i.uint(117),
        shots: i.uint(4),
        hits: i.uint(5),
        penetrations: i.uint(7),
        enemiesDamaged: i.uint(17),
        enemiesDestroyed: i.uint(18),
        hitsReceived: i.uint(12),
        penetrationsReceived: i.uint(15),
        victoryPointsEarned: i.uint(32),
        victoryPointsSeized: i.uint(33),
        baseXp: i.uint(3),
        rating: mm === null ? null : Math.trunc(mm * 10 + 3000),
      },
    ]
  })

  const modeMapId = br.uint(1)
  return {
    arenaId,
    timestamp: br.uint(2),
    mapId: modeMapId & 0xffff,
    winnerTeam: br.optUint(3),
    roomType: br.uint(9),
    authorId: author.uint(101),
    authorTeam: author.uint(102),
    players,
    results,
    meta: readMeta(entries['meta.json']),
  }
}

function readMeta(raw: Uint8Array | undefined): ReplayMeta {
  const empty: ReplayMeta = {
    version: null,
    playerName: null,
    mapName: null,
    battleDuration: null,
    arenaBonusType: null,
  }
  if (!raw) return empty
  try {
    const m = JSON.parse(new TextDecoder().decode(raw))
    return {
      version: typeof m.version === 'string' ? m.version : null,
      playerName: typeof m.playerName === 'string' ? m.playerName : null,
      mapName: typeof m.mapName === 'string' ? m.mapName : null,
      battleDuration: typeof m.battleDuration === 'number' ? m.battleDuration : null,
      arenaBonusType: typeof m.arenaBonusType === 'number' ? m.arenaBonusType : null,
    }
  } catch {
    return empty
  }
}
