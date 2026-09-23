import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { analyze, type StoredBattle } from '../src/analysis/analyze'
import { bpr } from '../src/analysis/bpr'
import { parseReplay } from '../src/parser/replay'

const load = (name: string): StoredBattle => ({
  ...parseReplay(new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)))),
  fileName: name,
})

const battles = [load('player_results.wotbreplay'), load('victory_points.wotbreplay'), load('draw.wotbreplay')]

describe('bpr', () => {
  it('matches the reference Python implementation', () => {
    // Values computed with stats.py calc_stats() from the original project.
    const r = bpr({ adr: 1500, kpr: 1, de: 3, assist: 200, blocked: 500, accH: 0.8, accP: 0.9, iPoints: 50, sPoints: 20 })
    expect(r.firepower).toBeCloseTo(((100 + 1500) * 2 ** (1 / 7) - 777) / 20, 10)
    expect(r.bpr).toBeCloseTo((17 * r.firepower + 3 * r.aim + 2 * r.support + 3 * r.supremacy) / 25 / 76, 10)
  })
})

describe('analyze', () => {
  it('splits teams by replay author', () => {
    const a = analyze([battles[0]], { roster: [] })
    expect(a.our).toHaveLength(7)
    expect(a.enemy).toHaveLength(7)
    expect(a.our.some((p) => p.nick === 'zeekrab')).toBe(true)
    expect(a.record).toEqual({ win: 1, loss: 0, draw: 0 })
    expect(a.battles[0].outcome).toBe('win')
  })

  it('aggregates the same player across battles', () => {
    const a = analyze(battles, { roster: [] })
    const me = a.our.find((p) => p.nick === 'zeekrab' || p.id === 594778041)!
    expect(me.battles).toBe(3)
    expect(a.record.draw).toBe(1)
  })

  it('uses the roster to pick our side', () => {
    const b = battles[0]
    const enemyNick = b.players.find((p) => p.team !== b.authorTeam)!.nickname
    const a = analyze([b], { roster: [enemyNick] })
    expect(a.battles[0].sideVia).toBe('roster')
    expect(a.our.some((p) => p.nick === enemyNick)).toBe(true)
    expect(a.battles[0].outcome).toBe('loss')
  })

})
