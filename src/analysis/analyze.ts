import type { ParsedReplay, ReplayPlayerResult } from '../parser/replay'
import { tankInfo, type TankClass } from '../data/lookup'
import { bpr, type BprResult } from './bpr'

export interface StoredBattle extends ParsedReplay {
  fileName: string
}

export type Side = 'our' | 'enemy'
export type Outcome = 'win' | 'loss' | 'draw'

export interface TankSums {
  battles: number
  wins: number
  damage: number
  frags: number
}

/** Raw per-player totals. Everything shown in the UI is derived from these, so they merge exactly. */
export interface PlayerSums {
  id: number
  nick: string
  clan: string | null
  side: Side
  battles: number
  wins: number
  damage: number
  frags: number
  shots: number
  hits: number
  pens: number
  assist: number
  blocked: number
  enemiesDamaged: number
  /** Σ (victory points earned − seized) */
  iPoints: number
  /** Σ victory points seized */
  sPoints: number
  hitsReceived: number
  xp: number
  tanks: Record<number, TankSums>
}

export interface PlayerRow extends PlayerSums, BprResult {
  key: string
  adr: number
  kpr: number
  de: number
  assistAvg: number
  blockedAvg: number
  accH: number
  accP: number
  iPointsAvg: number
  sPointsAvg: number
  xpAvg: number
  winRate: number
  mainTankId: number | null
  mainTank: string
  classes: Record<Exclude<TankClass, ''>, number>
}

export interface BattleSummary {
  id: string
  fileName: string
  timestamp: number
  mapId: number
  mapCode: string | null
  duration: number | null
  roomType: number
  outcome: Outcome
  ourTeam: number
  sideVia: 'roster' | 'author'
  authorId: number
  authorNick: string
  ourDamage: number
  enemyDamage: number
  ourFrags: number
  enemyFrags: number
}

export interface Analysis {
  our: PlayerRow[]
  enemy: PlayerRow[]
  battles: BattleSummary[]
  record: Record<Outcome, number>
  ourAvgBpr: number
  enemyAvgBpr: number
  ourAvgAdr: number
  enemyAvgAdr: number
}

export interface AnalyzeOptions {
  /** Lower-cased nicknames and/or clan tags written as `[tag]`. */
  roster: string[]
}

export function normalizeRoster(lines: string[]): string[] {
  return [...new Set(lines.map((l) => l.trim().toLowerCase()).filter(Boolean))]
}

function inRoster(roster: Set<string>, nick: string, clan: string | null): boolean {
  return roster.has(nick.toLowerCase()) || (!!clan && roster.has(`[${clan.toLowerCase()}]`))
}

export function resolveOurTeam(b: ParsedReplay, roster: Set<string>): { team: number; via: 'roster' | 'author' } {
  if (roster.size) {
    const counts = new Map<number, number>()
    for (const p of b.players) {
      if (inRoster(roster, p.nickname, p.clanTag)) counts.set(p.team, (counts.get(p.team) ?? 0) + 1)
    }
    const ranked = [...counts].sort((a, z) => z[1] - a[1])
    if (ranked.length && (ranked.length === 1 || ranked[0][1] > ranked[1][1])) {
      return { team: ranked[0][0], via: 'roster' }
    }
  }
  return { team: b.authorTeam, via: 'author' }
}

function emptySums(id: number, nick: string, clan: string | null, side: Side): PlayerSums {
  return {
    id,
    nick,
    clan,
    side,
    battles: 0,
    wins: 0,
    damage: 0,
    frags: 0,
    shots: 0,
    hits: 0,
    pens: 0,
    assist: 0,
    blocked: 0,
    enemiesDamaged: 0,
    iPoints: 0,
    sPoints: 0,
    hitsReceived: 0,
    xp: 0,
    tanks: {},
  }
}

export function addResult(s: PlayerSums, r: ReplayPlayerResult, won: boolean) {
  s.battles++
  if (won) s.wins++
  s.damage += r.damageDealt
  s.frags += r.enemiesDestroyed
  s.shots += r.shots
  s.hits += r.hits
  s.pens += r.penetrations
  s.assist += r.damageAssisted
  s.blocked += r.damageBlocked
  s.enemiesDamaged += r.enemiesDamaged
  s.iPoints += r.victoryPointsEarned - r.victoryPointsSeized
  s.sPoints += r.victoryPointsSeized
  s.hitsReceived += r.hitsReceived
  s.xp += r.baseXp
  if (r.tankId) {
    const t = (s.tanks[r.tankId] ??= { battles: 0, wins: 0, damage: 0, frags: 0 })
    t.battles++
    if (won) t.wins++
    t.damage += r.damageDealt
    t.frags += r.enemiesDestroyed
  }
}

export function toRow(s: PlayerSums): PlayerRow {
  const n = Math.max(1, s.battles)
  const adr = s.damage / n
  const kpr = s.frags / n
  const de = s.enemiesDamaged / n
  const assistAvg = s.assist / n
  const blockedAvg = s.blocked / n
  const accH = s.shots ? s.hits / s.shots : 0
  const accP = s.hits ? s.pens / s.hits : 0
  const iPointsAvg = s.iPoints / n
  const sPointsAvg = s.sPoints / n
  const rating = bpr({ adr, kpr, de, assist: assistAvg, blocked: blockedAvg, accH, accP, iPoints: iPointsAvg, sPoints: sPointsAvg })

  const classes = { HT: 0, MT: 0, LT: 0, TD: 0 }
  let mainTankId: number | null = null
  let best = -1
  for (const [idStr, t] of Object.entries(s.tanks)) {
    const id = Number(idStr)
    const info = tankInfo(id)
    if (info.type) classes[info.type] += t.battles
    if (t.battles > best) {
      best = t.battles
      mainTankId = id
    }
  }

  return {
    ...s,
    ...rating,
    key: `${s.side}:${s.id}`,
    adr,
    kpr,
    de,
    assistAvg,
    blockedAvg,
    accH,
    accP,
    iPointsAvg,
    sPointsAvg,
    xpAvg: s.xp / n,
    winRate: s.battles ? s.wins / s.battles : 0,
    mainTankId,
    mainTank: mainTankId === null ? '—' : tankInfo(mainTankId).name,
    classes,
  }
}

export const byBpr = (a: PlayerRow, b: PlayerRow) => b.bpr - a.bpr || b.adr - a.adr

function weightedMean(rows: PlayerRow[], pick: (r: PlayerRow) => number): number {
  const total = rows.reduce((acc, r) => acc + r.battles, 0)
  return total ? rows.reduce((acc, r) => acc + pick(r) * r.battles, 0) / total : 0
}

export function summarizeRows(our: PlayerRow[], enemy: PlayerRow[], battles: BattleSummary[]): Analysis {
  const record = { win: 0, loss: 0, draw: 0 }
  for (const b of battles) record[b.outcome]++
  return {
    our: [...our].sort(byBpr),
    enemy: [...enemy].sort(byBpr),
    battles,
    record,
    ourAvgBpr: weightedMean(our, (r) => r.bpr),
    enemyAvgBpr: weightedMean(enemy, (r) => r.bpr),
    ourAvgAdr: weightedMean(our, (r) => r.adr),
    enemyAvgAdr: weightedMean(enemy, (r) => r.adr),
  }
}

export function outcomeFor(winnerTeam: number | null, team: number): Outcome {
  if (winnerTeam === null || winnerTeam === 0) return 'draw'
  return winnerTeam === team ? 'win' : 'loss'
}

export function analyze(battles: StoredBattle[], opts: AnalyzeOptions): Analysis {
  const roster = new Set(normalizeRoster(opts.roster))
  const sums = new Map<string, PlayerSums>()
  const summaries: BattleSummary[] = []

  for (const b of battles) {
    const { team: ourTeam, via } = resolveOurTeam(b, roster)
    const info = new Map(b.players.map((p) => [p.accountId, p]))
    let ourDamage = 0
    let enemyDamage = 0
    let ourFrags = 0
    let enemyFrags = 0

    for (const r of b.results) {
      const p = info.get(r.accountId)
      if (!p) continue
      const side: Side = p.team === ourTeam ? 'our' : 'enemy'
      const key = `${side}:${r.accountId}`
      let s = sums.get(key)
      if (!s) sums.set(key, (s = emptySums(r.accountId, p.nickname, p.clanTag, side)))
      s.nick = p.nickname
      s.clan = p.clanTag ?? s.clan
      addResult(s, r, b.winnerTeam === p.team)
      if (side === 'our') {
        ourDamage += r.damageDealt
        ourFrags += r.enemiesDestroyed
      } else {
        enemyDamage += r.damageDealt
        enemyFrags += r.enemiesDestroyed
      }
    }

    summaries.push({
      id: b.arenaId,
      fileName: b.fileName,
      timestamp: b.timestamp,
      mapId: b.mapId,
      mapCode: b.meta.mapName,
      duration: b.meta.battleDuration,
      roomType: b.roomType,
      outcome: outcomeFor(b.winnerTeam, ourTeam),
      ourTeam,
      sideVia: via,
      authorId: b.authorId,
      authorNick: info.get(b.authorId)?.nickname ?? b.meta.playerName ?? '—',
      ourDamage,
      enemyDamage,
      ourFrags,
      enemyFrags,
    })
  }

  summaries.sort((a, b) => a.timestamp - b.timestamp)
  const rows = [...sums.values()].map(toRow)
  return summarizeRows(
    rows.filter((r) => r.side === 'our'),
    rows.filter((r) => r.side === 'enemy'),
    summaries,
  )
}

export interface PlayerBattle {
  battleId: string
  timestamp: number
  mapId: number
  mapCode: string | null
  outcome: Outcome
  tankId: number
  row: PlayerRow
}

/** Per-battle breakdown for one player (needs raw battles, so not available in shared reports). */
export function playerBattles(battles: StoredBattle[], accountId: number, side: Side, opts: AnalyzeOptions): PlayerBattle[] {
  const roster = new Set(normalizeRoster(opts.roster))
  const out: PlayerBattle[] = []
  for (const b of battles) {
    const p = b.players.find((x) => x.accountId === accountId)
    const r = b.results.find((x) => x.accountId === accountId)
    if (!p || !r) continue
    const { team } = resolveOurTeam(b, roster)
    if ((p.team === team ? 'our' : 'enemy') !== side) continue
    const s = emptySums(accountId, p.nickname, p.clanTag, side)
    addResult(s, r, b.winnerTeam === p.team)
    out.push({
      battleId: b.arenaId,
      timestamp: b.timestamp,
      mapId: b.mapId,
      mapCode: b.meta.mapName,
      outcome: outcomeFor(b.winnerTeam, p.team),
      tankId: r.tankId,
      row: toRow(s),
    })
  }
  return out.sort((a, b) => a.timestamp - b.timestamp)
}
