// Side assignment across a session where replays come from different people.
import { describe, expect, it } from 'vitest'
import { analyze, mvp, type StoredBattle } from '../src/analysis/analyze'
import type { ReplayPlayerResult } from '../src/parser/replay'

const CLAN_A = [1, 2, 3, 4, 5, 6, 7]
const CLAN_B = [11, 12, 13, 14, 15, 16, 17]

function result(accountId: number, damage = 1000): ReplayPlayerResult {
  return {
    accountId, tankId: 1, damageDealt: damage, damageAssisted: 0, damageBlocked: 0, shots: 5, hits: 4, penetrations: 3,
    enemiesDamaged: 2, enemiesDestroyed: 1, hitsReceived: 0, penetrationsReceived: 0, victoryPointsEarned: 0,
    victoryPointsSeized: 0, baseXp: 0, rating: null,
  }
}

/** A 7v7 battle; `a`/`b` are the account IDs fighting for team 1/2. */
function battle(id: string, a: number[], b: number[], winner: 1 | 2, author: number, extra: Partial<Record<number, number>> = {}): StoredBattle {
  const team = (acc: number) => (a.includes(acc) ? 1 : 2)
  return {
    arenaId: id, fileName: `${id}.wotbreplay`, timestamp: Number(id), mapId: 1, winnerTeam: winner, roomType: 2,
    authorId: author, authorTeam: team(author),
    players: [...a, ...b].map((acc) => ({ accountId: acc, nickname: `p${acc}`, team: team(acc), clanTag: acc < 10 ? 'AAA' : 'BBB', platoonId: null })),
    results: [...a, ...b].map((acc) => result(acc, extra[acc] ?? 1000)),
    meta: { version: null, playerName: null, mapName: null, battleDuration: null, arenaBonusType: 2 },
  }
}

describe('side assignment', () => {
  it('keeps sides stable when the enemy recorded some replays', () => {
    const a = analyze(
      [
        battle('1', CLAN_A, CLAN_B, 1, 1),
        battle('2', CLAN_B, CLAN_A, 1, 11), // enemy's replay, clan A on team 2, lost
        battle('3', CLAN_A, CLAN_B, 2, 1),
        battle('4', CLAN_B, CLAN_A, 2, 12), // enemy's replay, clan A won
      ],
      { roster: [] },
    )
    expect(a.our.map((r) => r.id).sort((x, y) => x - y)).toEqual(CLAN_A)
    expect(a.record).toEqual({ win: 2, loss: 2, draw: 0 })
    expect(a.battles.filter((b) => b.sideVia === 'anchor').map((b) => b.id)).toEqual(['2', '4'])
  })

  it('uses usual teammates when the anchor sat out a battle', () => {
    const subbed = [8, 2, 3, 4, 5, 6, 7] // player 1 benched, 8 subbed in
    const a = analyze(
      [battle('1', CLAN_A, CLAN_B, 1, 1), battle('2', CLAN_A, CLAN_B, 1, 1), battle('3', CLAN_B, subbed, 2, 11)],
      { roster: [] },
    )
    expect(a.our.map((r) => r.id)).toContain(8)
    expect(a.enemy.map((r) => r.id).sort((x, y) => x - y)).toEqual(CLAN_B)
    expect(a.record.win).toBe(3)
  })

  it('lets the roster override everything', () => {
    const a = analyze([battle('1', CLAN_A, CLAN_B, 1, 1)], { roster: ['[BBB]'] })
    expect(a.our.map((r) => r.id).sort((x, y) => x - y)).toEqual(CLAN_B)
    expect(a.record).toEqual({ win: 0, loss: 1, draw: 0 })
  })

  it('does not crown a one-battle substitute as MVP', () => {
    const sub = [9, 2, 3, 4, 5, 6, 7]
    const a = analyze(
      [
        battle('1', CLAN_A, CLAN_B, 1, 1, { 1: 2000 }),
        battle('2', CLAN_A, CLAN_B, 1, 1, { 1: 2000 }),
        battle('3', sub, CLAN_B, 1, 2, { 9: 6000 }),
      ],
      { roster: [] },
    )
    expect(a.our[0].id).toBe(9)
    expect(mvp(a)?.id).toBe(1)
  })
})
