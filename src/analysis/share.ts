/**
 * Shareable reports live entirely in the URL: aggregated player sums are packed
 * into positional arrays, deflated and base64url-encoded. No server, no expiry.
 */
import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate'
import {
  summarizeRows,
  toRow,
  type Analysis,
  type BattleSummary,
  type Outcome,
  type PlayerRow,
  type PlayerSums,
  type TankSums,
} from './analyze'

export type Mode = 'scrim' | 'individual'

export interface SharedReport {
  analysis: Analysis
  mode: Mode
  createdAt: number
  title: string
}

const OUTCOMES: Outcome[] = ['win', 'loss', 'draw']

type PackedPlayer = [
  side: 0 | 1,
  id: number,
  nick: string,
  clan: string,
  battles: number,
  wins: number,
  damage: number,
  frags: number,
  shots: number,
  hits: number,
  pens: number,
  assist: number,
  blocked: number,
  enemiesDamaged: number,
  iPoints: number,
  sPoints: number,
  hitsReceived: number,
  xp: number,
  tanks: number[],
]

type PackedBattle = [mapId: number, outcome: number, timestamp: number, ourDamage: number, enemyDamage: number, ourFrags: number, enemyFrags: number, roomType: number, mapCode: string]

interface Packed {
  v: 1
  c: number
  m: Mode
  t: string
  p: PackedPlayer[]
  b: PackedBattle[]
}

const MAX_BATTLES = 200

function packPlayer(r: PlayerRow): PackedPlayer {
  const tanks = Object.entries(r.tanks).flatMap(([id, t]) => [Number(id), t.battles, t.wins, t.damage, t.frags])
  return [
    r.side === 'our' ? 0 : 1,
    r.id,
    r.nick,
    r.clan ?? '',
    r.battles,
    r.wins,
    r.damage,
    r.frags,
    r.shots,
    r.hits,
    r.pens,
    r.assist,
    r.blocked,
    r.enemiesDamaged,
    r.iPoints,
    r.sPoints,
    r.hitsReceived,
    r.xp,
    tanks,
  ]
}

function unpackPlayer(p: PackedPlayer): PlayerSums {
  const tanks: Record<number, TankSums> = {}
  for (let i = 0; i + 4 < p[18].length; i += 5) {
    const [id, battles, wins, damage, frags] = p[18].slice(i, i + 5)
    tanks[id] = { battles, wins, damage, frags }
  }
  return {
    side: p[0] === 0 ? 'our' : 'enemy',
    id: p[1],
    nick: p[2],
    clan: p[3] || null,
    battles: p[4],
    wins: p[5],
    damage: p[6],
    frags: p[7],
    shots: p[8],
    hits: p[9],
    pens: p[10],
    assist: p[11],
    blocked: p[12],
    enemiesDamaged: p[13],
    iPoints: p[14],
    sPoints: p[15],
    hitsReceived: p[16],
    xp: p[17],
    tanks,
  }
}

const b64url = {
  encode(bytes: Uint8Array): string {
    let bin = ''
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  },
  decode(s: string): Uint8Array {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  },
}

export function encodeReport(analysis: Analysis, mode: Mode, title: string): string {
  const packed: Packed = {
    v: 1,
    c: Math.floor(Date.now() / 1000),
    m: mode,
    t: title.slice(0, 80),
    p: [...analysis.our, ...analysis.enemy].map(packPlayer),
    b: analysis.battles
      .slice(-MAX_BATTLES)
      .map((b) => [
        b.mapId,
        OUTCOMES.indexOf(b.outcome),
        b.timestamp,
        b.ourDamage,
        b.enemyDamage,
        b.ourFrags,
        b.enemyFrags,
        b.roomType,
        b.mapCode ?? '',
      ]),
  }
  return b64url.encode(deflateSync(strToU8(JSON.stringify(packed)), { level: 9 }))
}

export function decodeReport(payload: string): SharedReport {
  const packed = JSON.parse(strFromU8(inflateSync(b64url.decode(payload)))) as Packed
  if (packed.v !== 1) throw new Error('unsupported report version')
  const rows = packed.p.map((p) => toRow(unpackPlayer(p)))
  const battles: BattleSummary[] = packed.b.map((b, i) => ({
    id: String(i),
    fileName: '',
    timestamp: b[2],
    mapId: b[0],
    mapCode: b[8] || null,
    duration: null,
    roomType: b[7],
    outcome: OUTCOMES[b[1]] ?? 'draw',
    ourTeam: 0,
    sideVia: 'author',
    authorId: 0,
    authorNick: '',
    ourDamage: b[3],
    enemyDamage: b[4],
    ourFrags: b[5],
    enemyFrags: b[6],
  }))
  return {
    analysis: summarizeRows(
      rows.filter((r) => r.side === 'our'),
      rows.filter((r) => r.side === 'enemy'),
      battles,
    ),
    mode: packed.m === 'individual' ? 'individual' : 'scrim',
    createdAt: packed.c * 1000,
    title: packed.t ?? '',
  }
}
