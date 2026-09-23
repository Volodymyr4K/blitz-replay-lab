// Expected values mirror eigenein/wotbreplay-parser's own test-suite (MIT).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { tankInfo } from '../src/data/lookup'
import { parseReplay } from '../src/parser/replay'

const load = (name: string) => parseReplay(new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url))))

describe('parseReplay', () => {
  it('reads player results', () => {
    const r = load('player_results.wotbreplay')
    expect(r.arenaId).toBe('1661909200500084')
    expect(r.winnerTeam).toBe(2)
    expect(r.roomType).toBe(1)
    expect(r.authorTeam).toBe(2)
    expect(r.authorId).toBe(594778041)
    expect(r.meta.mapName).toBe('grossberg')

    const snak = r.results[3]
    expect(snak).toMatchObject({
      damageDealt: 2584,
      accountId: 566225799,
      rating: 4070,
      shots: 6,
      hits: 5,
      penetrations: 5,
      tankId: 5233,
      enemiesDamaged: 3,
      enemiesDestroyed: 2,
      baseXp: 929,
    })

    const zeek = r.results[10]
    expect(zeek).toMatchObject({
      damageDealt: 1438,
      damageAssisted: 31,
      damageBlocked: 190,
      accountId: 594778041,
      rating: 4277,
      hitsReceived: 3,
      penetrationsReceived: 3,
      victoryPointsEarned: 40,
      victoryPointsSeized: 40,
      tankId: 26657,
      enemiesDamaged: 2,
      enemiesDestroyed: 1,
    })

    expect(r.results[8].rating).toBeNull()
  })

  it('reads player info', () => {
    const r = load('player_results.wotbreplay')
    expect(r.players[1].clanTag).toBe('AN0NY')
    expect(r.players[10].clanTag).toBe('BBS')
    expect(r.players[11].clanTag).toBeNull()
    expect(r.players.find((p) => p.accountId === r.authorId)?.nickname).toBe('zeekrab')
    expect(new Set(r.players.map((p) => p.team))).toEqual(new Set([1, 2]))
  })

  it('reads victory points', () => {
    const r = load('victory_points.wotbreplay')
    expect(r.results[1]).toMatchObject({ victoryPointsSeized: 40, victoryPointsEarned: 40 })
    expect(r.results[3]).toMatchObject({ victoryPointsSeized: 0, victoryPointsEarned: 112 })
    expect(r.results[5]).toMatchObject({ victoryPointsSeized: 0, victoryPointsEarned: 280 })
  })

  it('handles a draw', () => {
    expect(load('draw.wotbreplay').winnerTeam).toBeNull()
  })

  it('handles a training room', () => {
    const r = load('training_rank.wotbreplay')
    expect(r.roomType).toBe(2)
    expect(r.players.length).toBeGreaterThan(0)
  })

  it('reads a 2026 (11.18) training-room scrim', () => {
    const r = load('scrim_2026.wotbreplay')
    expect(r.meta.version).toBe('11.18.0_apple')
    expect(r.roomType).toBe(2)
    expect(r.winnerTeam).toBe(1)
    expect(r.players).toHaveLength(14)
    expect(r.results).toHaveLength(14)
    const author = r.results.find((x) => x.accountId === r.authorId)!
    expect(author).toMatchObject({ tankId: 28689, damageDealt: 3267, shots: 13, hits: 13, penetrations: 12, enemiesDestroyed: 1, damageAssisted: 1071 })
  })

  it('rejects garbage', () => {
    expect(() => parseReplay(new Uint8Array([1, 2, 3]))).toThrow()
  })
})

describe('tank data', () => {
  it('knows the class of every tank in the 2026 scrim fixture', () => {
    const r = load('scrim_2026.wotbreplay')
    const missing = r.results.map((x) => tankInfo(x.tankId)).filter((t) => !t.type)
    expect(missing.map((t) => t.name)).toEqual([])
  })

  it('fills known class gaps without overriding real data', () => {
    expect(tankInfo(28689)).toEqual({ name: 'Rhm. Pzw.', type: 'LT', tier: 10 })
    expect(tankInfo(20097).type).toBe('HT')
    expect(tankInfo(1)).toEqual({ name: 'T-34', type: 'MT', tier: 5 })
    expect(tankInfo(999999)).toEqual({ name: 'Tank #999999', type: '', tier: 0 })
  })
})
