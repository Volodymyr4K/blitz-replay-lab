// Side assignment across a session where replays come from different people.
import { describe, expect, it } from 'vitest'
import { analyze, mvp } from '../src/analysis/analyze'
import { battle, CLAN_A, CLAN_B } from './helpers'

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
