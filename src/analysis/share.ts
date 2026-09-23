/**
 * Shareable reports live entirely in the URL: aggregated player sums are written in a
 * compact binary form (varints, no field names), deflated and base64url-encoded.
 * No server, no expiry.
 *
 * Links come from strangers, so decoding treats the payload as hostile: output size is
 * capped before inflating, every read is bounds-checked, and every count and string is
 * limited. A bad link throws; it never hangs the tab or renders non-text values.
 */
import { deflateSync, inflateSync } from 'fflate'
import { knownMap } from '../data/lookup'
import { SUM_KEYS, summarizeRows, toRow, type Analysis, type BattleSummary, type Outcome, type PlayerRow, type PlayerSums, type Side, type TankSums } from './analyze'

export type Mode = 'scrim' | 'individual'

export interface SharedReport {
  analysis: Analysis
  mode: Mode
  createdAt: number
  title: string
}

const VERSION = 2
const OUTCOMES: Outcome[] = ['win', 'loss', 'draw']
const MODES: Mode[] = ['scrim', 'individual']

/** Limits for decoding; generous for real sessions, tight enough to stop abuse. */
const LIMITS = {
  inflated: 256 * 1024,
  players: 300,
  tanksPerPlayer: 200,
  battles: 1000,
  string: 128,
  title: 80,
}

/**
 * Discord (the usual destination) caps messages at 2000 characters without Nitro.
 * Keep the payload below this so the full URL still fits with room to spare.
 */
export const SHARE_PAYLOAD_BUDGET = 1800

const FLAG_BATTLES = 1
const FLAG_TANK_DETAIL = 2
const FLAG_ALL_PLAYERS = 4

export class ShareError extends Error {}

class Writer {
  private bytes: number[] = []

  uint(n: number) {
    let v = Math.max(0, Math.floor(n))
    while (v >= 0x80) {
      this.bytes.push((v % 0x80) | 0x80)
      v = Math.floor(v / 0x80)
    }
    this.bytes.push(v)
  }

  /** Zigzag so small negatives stay short. */
  int(n: number) {
    const v = Math.trunc(n)
    this.uint(v >= 0 ? v * 2 : -v * 2 - 1)
  }

  str(s: string) {
    const b = new TextEncoder().encode(s)
    this.uint(b.length)
    this.bytes.push(...b)
  }

  done() {
    return new Uint8Array(this.bytes)
  }
}

class Reader {
  private pos = 0
  private buf: Uint8Array

  constructor(buf: Uint8Array) {
    this.buf = buf
  }

  uint(max = Number.MAX_SAFE_INTEGER): number {
    let result = 0
    let mul = 1
    for (let i = 0; i < 8; i++) {
      if (this.pos >= this.buf.length) throw new ShareError('truncated')
      const b = this.buf[this.pos++]
      result += (b & 0x7f) * mul
      if (!(b & 0x80)) {
        if (result > max) throw new ShareError('value out of range')
        return result
      }
      mul *= 0x80
    }
    throw new ShareError('varint too long')
  }

  int(): number {
    const v = this.uint()
    return v % 2 ? -(v + 1) / 2 : v / 2
  }

  str(max = LIMITS.string): string {
    const len = this.uint(max * 4)
    if (this.pos + len > this.buf.length) throw new ShareError('truncated')
    const s = new TextDecoder('utf-8', { fatal: true }).decode(this.buf.subarray(this.pos, this.pos + len))
    this.pos += len
    return s.slice(0, max)
  }

  end() {
    if (this.pos !== this.buf.length) throw new ShareError('trailing data')
  }
}

const b64url = {
  encode(bytes: Uint8Array): string {
    let bin = ''
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  },
  decode(s: string): Uint8Array {
    if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new ShareError('bad characters')
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  },
}

/** Counters on the wire: all unsigned except capture points, which are earned minus seized. */
function writeSums(w: Writer, p: PlayerSums) {
  for (const k of SUM_KEYS) if (k === 'iPoints') w.int(p[k])
  else w.uint(p[k])
}

function readSums(r: Reader, s: PlayerSums) {
  for (const k of SUM_KEYS) s[k] = k === 'iPoints' ? r.int() : r.uint()
}

function writeTotal(w: Writer, t: PlayerRow) {
  writeSums(w, t)
  for (const c of ['HT', 'MT', 'LT', 'TD'] as const) w.uint(t.classes[c])
}

function readTotal(r: Reader, side: Side): PlayerRow {
  const s = blank(0, '', null, side)
  readSums(r, s)
  const row = toRow(s)
  for (const c of ['HT', 'MT', 'LT', 'TD'] as const) row.classes[c] = r.uint()
  return row
}

const blank = (id: number, nick: string, clan: string | null, side: Side): PlayerSums =>
  ({ id, nick, clan, side, tanks: {} as Record<number, TankSums> }) as PlayerSums

/** BPR can be negative, so it travels zigzagged in 1/10000ths. */
const BPR_SCALE = 10_000

const isRegular = (p: PlayerRow, a: Analysis) => p.battles >= 2 || (p.side === 'our' && p.id === a.focusId)

/** Occasional players worth keeping first when space is short: our side, then by BPR. */
function extrasByInterest(a: Analysis): PlayerRow[] {
  const rest = (rows: PlayerRow[]) => rows.filter((p) => !isRegular(p, a))
  return [...rest(a.our), ...rest(a.enemy)]
}

function encodeWith(analysis: Analysis, mode: Mode, title: string, flags: number, extras: PlayerRow[] = []): string {
  const all = [...analysis.our, ...analysis.enemy]
  // Without FLAG_ALL_PLAYERS only regulars (2+ battles, or the focus player) travel, plus chosen extras.
  const keep = new Set(extras)
  const players = flags & FLAG_ALL_PLAYERS ? all : all.filter((p) => isRegular(p, analysis) || keep.has(p))

  const w = new Writer()
  w.uint(VERSION)
  w.uint(flags)
  w.uint(Math.floor(Date.now() / 1000))
  w.uint(MODES.indexOf(mode))
  w.str(title.slice(0, LIMITS.title))
  w.uint(analysis.focusId ?? 0)
  w.uint(analysis.record.win)
  w.uint(analysis.record.loss)
  w.uint(analysis.record.draw)
  w.int(Math.round(analysis.ourAvgBpr * BPR_SCALE))
  w.int(Math.round(analysis.enemyAvgBpr * BPR_SCALE))
  writeTotal(w, analysis.ourTotal)
  writeTotal(w, analysis.enemyTotal)
  w.uint(all.length - players.length)

  w.uint(players.length)
  for (const p of players) {
    w.uint(p.side === 'our' ? 0 : 1)
    w.uint(p.id)
    w.str(p.nick)
    w.str(p.clan ?? '')
    writeSums(w, p)
    const tanks = Object.entries(p.tanks)
    w.uint(tanks.length)
    for (const [id, t] of tanks) {
      w.uint(Number(id))
      w.uint(t.battles)
      if (flags & FLAG_TANK_DETAIL) {
        w.uint(t.wins)
        w.uint(t.damage)
        w.uint(t.frags)
      }
    }
  }

  if (flags & FLAG_BATTLES) {
    const battles = analysis.battles.slice(-LIMITS.battles)
    const base = battles[0]?.timestamp ?? 0
    w.uint(battles.length)
    w.uint(base)
    for (const b of battles) {
      w.uint(b.mapId)
      w.uint(OUTCOMES.indexOf(b.outcome))
      w.uint(b.timestamp - base)
      w.uint(b.ourDamage)
      w.uint(b.enemyDamage)
      w.uint(b.ourFrags)
      w.uint(b.enemyFrags)
      w.uint(b.roomType)
      // The raw map code is only a fallback name for maps our table does not know.
      w.str(knownMap(b.mapId) ? '' : (b.mapCode ?? ''))
    }
  }
  return b64url.encode(deflateSync(w.done(), { level: 9 }))
}

/**
 * Encode as much detail as fits the budget: everything, then without the battle list,
 * then without per-tank results, then without one-battle players (randoms). Team totals,
 * averages and the record are always exact. The recipient sees what was left out.
 */
export function encodeReport(analysis: Analysis, mode: Mode, title: string, budget = SHARE_PAYLOAD_BUDGET): string {
  const levels = [
    FLAG_ALL_PLAYERS | FLAG_BATTLES | FLAG_TANK_DETAIL,
    FLAG_ALL_PLAYERS | FLAG_TANK_DETAIL,
    FLAG_ALL_PLAYERS,
    0,
  ]
  for (const flags of levels) {
    const payload = encodeWith(analysis, mode, title, flags)
    if (payload.length <= budget || flags === 0) {
      if (flags !== 0) return payload
      // Regulars only fit (or nothing does): add as many occasional players as the budget allows.
      const extras = extrasByInterest(analysis)
      let lo = 0
      let hi = extras.length
      let best = payload
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2)
        const candidate = encodeWith(analysis, mode, title, 0, extras.slice(0, mid))
        if (candidate.length <= budget) {
          lo = mid
          best = candidate
        } else hi = mid - 1
      }
      return best
    }
  }
  return ''
}

function inflateCapped(data: Uint8Array): Uint8Array {
  // fflate stops writing at the end of a fixed buffer; one spare byte tells us it overflowed.
  const out = inflateSync(data, { out: new Uint8Array(LIMITS.inflated + 1) })
  if (out.length > LIMITS.inflated) throw new ShareError('report too large')
  return out
}

export function decodeReport(payload: string): SharedReport {
  let raw: Uint8Array
  try {
    raw = inflateCapped(b64url.decode(payload))
  } catch (e) {
    throw e instanceof ShareError ? e : new ShareError('not a report')
  }
  const r = new Reader(raw)
  if (r.uint() !== VERSION) throw new ShareError('unsupported version')
  const flags = r.uint(FLAG_ALL_PLAYERS | FLAG_BATTLES | FLAG_TANK_DETAIL)
  const createdAt = r.uint() * 1000
  const mode = MODES[r.uint(MODES.length - 1)]
  const title = r.str(LIMITS.title)
  const focusId = r.uint() || null
  const maxRecord = LIMITS.battles * 10
  const record = { win: r.uint(maxRecord), loss: r.uint(maxRecord), draw: r.uint(maxRecord) }
  const ourAvgBpr = r.int() / BPR_SCALE
  const enemyAvgBpr = r.int() / BPR_SCALE
  const ourTotal = readTotal(r, 'our')
  const enemyTotal = readTotal(r, 'enemy')
  const omittedPlayers = r.uint(LIMITS.players * 100)

  const count = r.uint(LIMITS.players)
  const sums: PlayerSums[] = []
  for (let i = 0; i < count; i++) {
    const side = r.uint(1) === 0 ? 'our' : 'enemy'
    const s = blank(r.uint(), r.str(), null, side)
    s.clan = r.str() || null
    readSums(r, s)
    const tanks = r.uint(LIMITS.tanksPerPlayer)
    for (let j = 0; j < tanks; j++) {
      const tankId = r.uint()
      const battles = r.uint()
      s.tanks[tankId] = flags & FLAG_TANK_DETAIL ? { battles, wins: r.uint(), damage: r.uint(), frags: r.uint() } : { battles, wins: 0, damage: 0, frags: 0 }
    }
    sums.push(s)
  }

  const battles: BattleSummary[] = []
  const battleCount = flags & FLAG_BATTLES ? r.uint(LIMITS.battles) : 0
  const base = flags & FLAG_BATTLES ? r.uint() : 0
  for (let i = 0; i < battleCount; i++) {
    const mapId = r.uint()
    const outcome = OUTCOMES[r.uint(OUTCOMES.length - 1)]
    const timestamp = base + r.uint()
    const ourDamage = r.uint()
    const enemyDamage = r.uint()
    const ourFrags = r.uint()
    const enemyFrags = r.uint()
    const roomType = r.uint()
    const mapCode = r.str() || null
    battles.push({
      id: String(i),
      fileName: '',
      timestamp,
      mapId,
      mapCode,
      duration: null,
      roomType,
      outcome,
      ourTeam: 0,
      sideVia: 'author',
      authorId: 0,
      authorNick: '',
      ourDamage,
      enemyDamage,
      ourFrags,
      enemyFrags,
    })
  }
  r.end()

  const rows = sums.map(toRow)
  const analysis = summarizeRows(
    rows.filter((x) => x.side === 'our'),
    rows.filter((x) => x.side === 'enemy'),
    battles,
    focusId,
    { record, ourAvgBpr, enemyAvgBpr, ourTotal, enemyTotal },
  )
  analysis.omitted = { battles: !(flags & FLAG_BATTLES), tankDetail: !(flags & FLAG_TANK_DETAIL), players: omittedPlayers }
  return { analysis, mode, createdAt, title }
}
