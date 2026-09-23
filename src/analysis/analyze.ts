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
  xp: number
  tanks: Record<number, TankSums>
}

/** Numeric counters of PlayerSums, i.e. everything that simply adds up. */
export const SUM_KEYS = [
  'battles',
  'wins',
  'damage',
  'frags',
  'shots',
  'hits',
  'pens',
  'assist',
  'blocked',
  'enemiesDamaged',
  'iPoints',
  'sPoints',
  'xp',
] as const satisfies readonly (keyof PlayerSums)[]

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
  sideVia: SideVia
  authorId: number
  authorNick: string
  ourDamage: number
  enemyDamage: number
  ourFrags: number
  enemyFrags: number
}

export interface Analysis {
  /** Our-side player the session is about (the anchor), if known. */
  focusId: number | null
  our: PlayerRow[]
  enemy: PlayerRow[]
  battles: BattleSummary[]
  record: Record<Outcome, number>
  /** Battle-weighted mean of player BPR. */
  ourAvgBpr: number
  enemyAvgBpr: number
  /** Each team's sums merged into one pseudo-player: team ADR, accuracy, class mix… */
  ourTotal: PlayerRow
  enemyTotal: PlayerRow
  /** Parts a shared link left out to stay short; absent for local sessions. */
  omitted?: { battles: boolean; tankDetail: boolean; players: number }
}

/** Team-level numbers a shared link carries so they stay exact even when players are left out. */
export interface TeamFacts {
  record: Record<Outcome, number>
  ourAvgBpr: number
  enemyAvgBpr: number
  ourTotal: PlayerRow
  enemyTotal: PlayerRow
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

export type SideVia = 'roster' | 'anchor' | 'author'

export interface SideAssignment {
  /** Account that anchors "our" side: whoever recorded the most replays. */
  anchorId: number | null
  sides: Map<string, { team: number; via: SideVia }>
}

function rosterTeam(b: ParsedReplay, played: Set<number>, roster: Set<string>): number | null {
  // Only players who actually fought count — training rooms also list benched players and spectators.
  const counts = new Map<number, number>()
  for (const p of b.players) {
    if (played.has(p.accountId) && inRoster(roster, p.nickname, p.clanTag)) counts.set(p.team, (counts.get(p.team) ?? 0) + 1)
  }
  const ranked = [...counts].sort((a, z) => z[1] - a[1])
  return ranked.length && (ranked.length === 1 || ranked[0][1] > ranked[1][1]) ? ranked[0][0] : null
}

/**
 * Decide which team is "ours" in every battle, consistently across the session.
 *
 * Replays of one scrim often come from several people — including the enemy — and a
 * battle is kept once whoever uploaded it, so "the author's team" alone flips sides.
 * Priority: roster → the anchor player's team → the team with more of the anchor's
 * usual teammates → the author's team.
 */
export function assignSides(battles: ParsedReplay[], opts: AnalyzeOptions): SideAssignment {
  const roster = new Set(normalizeRoster(opts.roster))
  const authors = new Map<number, number>()
  for (const b of battles) authors.set(b.authorId, (authors.get(b.authorId) ?? 0) + 1)
  const anchorId = [...authors].sort((a, z) => z[1] - a[1])[0]?.[0] ?? null

  const teamOf = (b: ParsedReplay, id: number | null) => b.players.find((p) => p.accountId === id)?.team
  const playedIn = (b: ParsedReplay) => new Set(b.results.map((r) => r.accountId))

  // How often each player fought alongside the anchor.
  const mates = new Map<number, number>()
  for (const b of battles) {
    const played = playedIn(b)
    const team = anchorId !== null && played.has(anchorId) ? teamOf(b, anchorId) : undefined
    if (team === undefined) continue
    for (const p of b.players) if (p.team === team && p.accountId !== anchorId && played.has(p.accountId)) mates.set(p.accountId, (mates.get(p.accountId) ?? 0) + 1)
  }

  const sides = new Map<string, { team: number; via: SideVia }>()
  for (const b of battles) {
    const played = playedIn(b)
    const viaRoster = roster.size ? rosterTeam(b, played, roster) : null
    if (viaRoster !== null) {
      sides.set(b.arenaId, { team: viaRoster, via: 'roster' })
      continue
    }
    const anchorTeam = anchorId !== null && played.has(anchorId) ? teamOf(b, anchorId) : undefined
    if (anchorTeam !== undefined) {
      sides.set(b.arenaId, { team: anchorTeam, via: anchorTeam === b.authorTeam ? 'author' : 'anchor' })
      continue
    }
    const score = new Map<number, number>()
    for (const p of b.players) if (played.has(p.accountId)) score.set(p.team, (score.get(p.team) ?? 0) + (mates.get(p.accountId) ?? 0))
    const ranked = [...score].sort((a, z) => z[1] - a[1])
    if (ranked.length && ranked[0][1] > 0 && (ranked.length === 1 || ranked[0][1] > ranked[1][1])) {
      sides.set(b.arenaId, { team: ranked[0][0], via: ranked[0][0] === b.authorTeam ? 'author' : 'anchor' })
      continue
    }
    sides.set(b.arenaId, { team: b.authorTeam, via: 'author' })
  }
  return { anchorId, sides }
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

/** Best BPR among our regulars — someone who subbed in for one lucky battle is not the MVP. */
export function mvp(a: Analysis): PlayerRow | undefined {
  const most = Math.max(0, ...a.our.map((r) => r.battles))
  return a.our.find((r) => r.battles * 2 >= most)
}

/** The player a personal session is about: the anchor, else our most frequent player. */
export function focusPlayer(a: Analysis): PlayerRow | undefined {
  return a.our.find((r) => r.id === a.focusId) ?? [...a.our].sort((x, y) => y.battles - x.battles || y.bpr - x.bpr)[0]
}

function weightedMean(rows: PlayerRow[], pick: (r: PlayerRow) => number): number {
  const total = rows.reduce((acc, r) => acc + r.battles, 0)
  return total ? rows.reduce((acc, r) => acc + pick(r) * r.battles, 0) / total : 0
}

/** Merge a team's sums into one pseudo-player so accuracy etc. come from totals, not averages of averages. */
export function teamTotal(rows: PlayerRow[], side: Side): PlayerRow {
  const s = emptySums(0, '', null, side)
  for (const r of rows) {
    for (const k of SUM_KEYS) s[k] += r[k]
    for (const [id, t] of Object.entries(r.tanks)) {
      const m = (s.tanks[Number(id)] ??= { battles: 0, wins: 0, damage: 0, frags: 0 })
      m.battles += t.battles
      m.wins += t.wins
      m.damage += t.damage
      m.frags += t.frags
    }
  }
  return toRow(s)
}

export function summarizeRows(our: PlayerRow[], enemy: PlayerRow[], battles: BattleSummary[], focusId: number | null = null, facts?: TeamFacts): Analysis {
  let record = facts?.record
  if (!record) {
    record = { win: 0, loss: 0, draw: 0 }
    for (const b of battles) record[b.outcome]++
  }
  return {
    focusId,
    our: [...our].sort(byBpr),
    enemy: [...enemy].sort(byBpr),
    battles,
    record,
    ourAvgBpr: facts?.ourAvgBpr ?? weightedMean(our, (r) => r.bpr),
    enemyAvgBpr: facts?.enemyAvgBpr ?? weightedMean(enemy, (r) => r.bpr),
    ourTotal: facts?.ourTotal ?? teamTotal(our, 'our'),
    enemyTotal: facts?.enemyTotal ?? teamTotal(enemy, 'enemy'),
  }
}

export function outcomeFor(winnerTeam: number | null, team: number): Outcome {
  if (winnerTeam === null || winnerTeam === 0) return 'draw'
  return winnerTeam === team ? 'win' : 'loss'
}

export function analyze(battles: StoredBattle[], opts: AnalyzeOptions): Analysis {
  const { anchorId, sides } = assignSides(battles, opts)
  const sums = new Map<string, PlayerSums>()
  const summaries: BattleSummary[] = []

  for (const b of battles) {
    const { team: ourTeam, via } = sides.get(b.arenaId)!
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
    anchorId,
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
  const { sides } = assignSides(battles, opts)
  const out: PlayerBattle[] = []
  for (const b of battles) {
    const p = b.players.find((x) => x.accountId === accountId)
    const r = b.results.find((x) => x.accountId === accountId)
    if (!p || !r) continue
    const { team } = sides.get(b.arenaId)!
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
