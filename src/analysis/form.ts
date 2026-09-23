/**
 * Player form across archived sessions: how each of our players did session by session.
 * Players are matched by account ID, so renames and clan changes don't split them.
 */
import type { ArchivedSession } from '../archive'
import { analyze, teamTotal, type PlayerRow } from './analyze'

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
  /** Chronological, one point per session the player fought in, as that session shows it. */
  points: FormPoint[]
  /** Distinct battles across all sessions. */
  battles: number
  /** From the player's summed stats over those battles, exactly like a single session. */
  bpr: number
  adr: number
  /** Latest session BPR minus the one before; null with a single session. */
  delta: number | null
}

export function playerForm(sessions: ArchivedSession[]): PlayerForm[] {
  const byId = new Map<number, PlayerForm & { rows: PlayerRow[] }>()
  // The same replay can sit in two sessions (loaded twice); totals count each battle once.
  const counted = new Set<string>()
  const ordered = [...sessions].sort((a, b) => a.meta.to - b.meta.to)

  for (const s of ordered) {
    const opts = { roster: s.roster }
    const fresh = s.battles.filter((b) => !counted.has(b.arenaId))
    fresh.forEach((b) => counted.add(b.arenaId))
    const freshRows = new Map(analyze(fresh, opts).our.map((r) => [r.id, r]))

    for (const r of analyze(s.battles, opts).our) {
      let f = byId.get(r.id)
      if (!f) byId.set(r.id, (f = { id: r.id, nick: r.nick, clan: r.clan, points: [], rows: [], battles: 0, bpr: 0, adr: 0, delta: null }))
      // Latest session wins for the displayed name and clan.
      f.nick = r.nick
      f.clan = r.clan ?? f.clan
      f.points.push({ sessionId: s.meta.id, at: s.meta.to, battles: r.battles, bpr: r.bpr, adr: r.adr, winRate: r.winRate })
      const own = freshRows.get(r.id)
      if (own) f.rows.push(own)
    }
  }

  const out: PlayerForm[] = []
  for (const { rows, ...f } of byId.values()) {
    const total = teamTotal(rows, 'our')
    const [prev, last] = f.points.slice(-2)
    out.push({ ...f, battles: total.battles, bpr: total.bpr, adr: total.adr, delta: f.points.length >= 2 ? last.bpr - prev.bpr : null })
  }
  return out.sort((a, b) => b.points.length - a.points.length || b.battles - a.battles || b.bpr - a.bpr)
}
