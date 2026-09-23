/**
 * Player form across archived sessions: how each of our players did session by session.
 * Players are matched by account ID, so renames and clan changes don't split them.
 */
import type { ArchivedSession } from '../archive'
import { analyze } from './analyze'

export interface FormPoint {
  sessionId: string
  /** Last battle of the session, unix seconds — the x axis. */
  at: number
  battles: number
  bpr: number
  adr: number
  winRate: number
}

export interface PlayerForm {
  id: number
  nick: string
  clan: string | null
  /** Chronological, one point per session the player fought in. */
  points: FormPoint[]
  battles: number
  /** Battle-weighted across sessions. */
  bpr: number
  adr: number
  /** Latest session BPR minus the one before; null with a single session. */
  delta: number | null
}

export function playerForm(sessions: ArchivedSession[]): PlayerForm[] {
  const byId = new Map<number, PlayerForm>()
  const ordered = [...sessions].sort((a, b) => a.meta.to - b.meta.to)
  for (const s of ordered) {
    const a = analyze(s.battles, { roster: s.roster })
    for (const r of a.our) {
      let f = byId.get(r.id)
      if (!f) byId.set(r.id, (f = { id: r.id, nick: r.nick, clan: r.clan, points: [], battles: 0, bpr: 0, adr: 0, delta: null }))
      // Latest session wins for the displayed name and clan.
      f.nick = r.nick
      f.clan = r.clan ?? f.clan
      f.points.push({ sessionId: s.meta.id, at: s.meta.to, battles: r.battles, bpr: r.bpr, adr: r.adr, winRate: r.winRate })
    }
  }
  for (const f of byId.values()) {
    f.battles = f.points.reduce((n, p) => n + p.battles, 0)
    f.bpr = f.points.reduce((n, p) => n + p.bpr * p.battles, 0) / f.battles
    f.adr = f.points.reduce((n, p) => n + p.adr * p.battles, 0) / f.battles
    const [prev, last] = f.points.slice(-2)
    f.delta = f.points.length >= 2 ? last.bpr - prev.bpr : null
  }
  return [...byId.values()].sort((a, b) => b.points.length - a.points.length || b.battles - a.battles || b.bpr - a.bpr)
}
