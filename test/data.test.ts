import { fromAftermath, fromWargaming, mergeMaps, mergeTanks } from '../scripts/merge-data.mjs'
import { describe, expect, it } from 'vitest'

describe('game data merge', () => {
  it('lets official Wargaming data win over the community dump', () => {
    const rejected: string[] = []
    const community = fromAftermath({ 1: { names: { en: 'T-34' }, class: 'lightTank', tier: 4 } }, rejected)
    const official = fromWargaming({ 1: { name: 'T-34', type: 'mediumTank', tier: 5 } }, rejected)
    expect(mergeTanks({}, community, official).tanks[1]).toEqual(['T-34', 'MT', 5])
  })

  it('never wipes a known class or removes old tanks', () => {
    const existing = { 7: ['Old Tank', 'HT', 8], 9: ['Gone', 'TD', 6] }
    const { tanks } = mergeTanks(existing, fromAftermath({ 7: { names: { en: 'Old Tank' } } }, []))
    expect(tanks[7]).toEqual(['Old Tank', 'HT', 8])
    expect(tanks[9]).toEqual(['Gone', 'TD', 6])
  })

  it('rejects hostile names and bad values', () => {
    const rejected: string[] = []
    const out = fromWargaming(
      {
        1: { name: '<img src=x onerror=alert(1)>', type: 'heavyTank', tier: 10 },
        2: { name: 'A'.repeat(200), type: 'heavyTank', tier: 10 },
        x: { name: 'Bad id', type: 'heavyTank', tier: 10 },
        3: { name: 'TOG II*', type: 'heavyTank', tier: 99 },
      },
      rejected,
    )
    expect(Object.keys(out)).toEqual(['3'])
    expect(out[3]).toEqual(['TOG II*', 'HT', 0])
    expect(rejected).toHaveLength(3)
  })

  it('never publishes supertest vehicles', () => {
    const out = fromAftermath({ 1: { names: { en: 'Secret' }, class: 'heavyTank', tier: 10, superTest: true }, 2: { names: { en: 'Public' }, class: 'heavyTank', tier: 10 } }, [])
    expect(Object.keys(out)).toEqual(['2'])
  })

  it('merges map names', () => {
    const { maps, changes } = mergeMaps({ 5: { en: 'Old', uk: 'Old' } }, { 5: { names: { en: 'Falls Creek', uk: 'Протока' } }, 6: { names: { en: '<b>' } } }, [])
    expect(maps[5]).toEqual({ en: 'Falls Creek', uk: 'Протока' })
    expect(maps[6]).toBeUndefined()
    expect(changes).toBe(1)
  })
})
