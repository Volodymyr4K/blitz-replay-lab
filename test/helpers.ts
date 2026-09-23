// Synthetic battles for logic tests: 7v7, clan AAA (ids 1-9) vs clan BBB (ids 11+).
import type { StoredBattle } from '../src/analysis/analyze'
import type { ReplayPlayerResult } from '../src/parser/replay'

export const CLAN_A = [1, 2, 3, 4, 5, 6, 7]
export const CLAN_B = [11, 12, 13, 14, 15, 16, 17]

function result(accountId: number, damage = 1000): ReplayPlayerResult {
  return {
    accountId, tankId: 1, damageDealt: damage, damageAssisted: 0, damageBlocked: 0, shots: 5, hits: 4, penetrations: 3,
    enemiesDamaged: 2, enemiesDestroyed: 1, hitsReceived: 0, penetrationsReceived: 0, victoryPointsEarned: 0,
    victoryPointsSeized: 0, baseXp: 0, rating: null,
  }
}

/** A 7v7 battle; `a`/`b` are the account IDs fighting for team 1/2. */
export function battle(id: string, a: number[], b: number[], winner: 1 | 2, author: number, extra: Partial<Record<number, number>> = {}): StoredBattle {
  const team = (acc: number) => (a.includes(acc) ? 1 : 2)
  return {
    arenaId: id, fileName: `${id}.wotbreplay`, timestamp: Number(id), mapId: 1, winnerTeam: winner, roomType: 2,
    authorId: author, authorTeam: team(author),
    players: [...a, ...b].map((acc) => ({ accountId: acc, nickname: `p${acc}`, team: team(acc), clanTag: acc < 10 ? 'AAA' : 'BBB', platoonId: null })),
    results: [...a, ...b].map((acc) => result(acc, extra[acc] ?? 1000)),
    meta: { version: null, playerName: null, mapName: null, battleDuration: null, arenaBonusType: 2 },
  }
}

