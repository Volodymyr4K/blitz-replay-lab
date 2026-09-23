// Share links come from strangers: decoding must reject junk quickly and never hang.
import { readFileSync } from 'node:fs'
import { deflateSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { analyze, type StoredBattle } from '../src/analysis/analyze'
import { decodeReport, encodeReport, SHARE_PAYLOAD_BUDGET } from '../src/analysis/share'
import { parseReplay } from '../src/parser/replay'

const load = (name: string): StoredBattle => ({
  ...parseReplay(new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)))),
  fileName: name,
})
/** A 7v7 scrim battle — the typical shared report. */
const analysis = analyze([load('scrim_2026.wotbreplay')], { roster: [] })
/** Personal randoms: ~55 different strangers across 4 battles. */
const randoms = analyze(['player_results', 'victory_points', 'draw', 'training_rank'].map((n) => load(`${n}.wotbreplay`)), { roster: [] })

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url')

describe('share links', () => {
  it('round-trips every stat exactly', () => {
    const r = decodeReport(encodeReport(analysis, 'individual', 'Тест · [CLAN]'))
    expect(r.title).toBe('Тест · [CLAN]')
    expect(r.mode).toBe('individual')
    expect(r.analysis.record).toEqual(analysis.record)
    expect(r.analysis.focusId).toBe(analysis.focusId)
    expect(r.analysis.omitted).toEqual({ battles: false, tankDetail: false, players: 0 })
    for (const side of ['our', 'enemy'] as const) {
      expect(r.analysis[side].map((p) => [p.id, p.nick, p.clan, p.battles, p.damage, p.iPoints, p.bpr])).toEqual(
        analysis[side].map((p) => [p.id, p.nick, p.clan, p.battles, p.damage, p.iPoints, p.bpr]),
      )
    }
    expect(r.analysis.battles.map((b) => [b.mapId, b.outcome, b.timestamp, b.ourDamage])).toEqual(
      analysis.battles.map((b) => [b.mapId, b.outcome, b.timestamp, b.ourDamage]),
    )
  })

  it('keeps a scrim report complete and under the budget', () => {
    const payload = encodeReport(analysis, 'scrim', 'Scrim vs [CLAN], 23 Sep')
    expect(payload.length).toBeLessThanOrEqual(SHARE_PAYLOAD_BUDGET)
    expect(decodeReport(payload).analysis.omitted).toEqual({ battles: false, tankDetail: false, players: 0 })
  })

  it('trims a randoms session to fit but keeps team numbers exact', () => {
    const payload = encodeReport(randoms, 'individual', '')
    expect(payload.length).toBeLessThanOrEqual(SHARE_PAYLOAD_BUDGET)
    const r = decodeReport(payload).analysis
    expect(r.omitted!.players).toBeGreaterThan(0)
    // Freed space is refilled with occasional players rather than wasted.
    expect(payload.length).toBeGreaterThan(SHARE_PAYLOAD_BUDGET * 0.9)
    expect(r.our.length + r.enemy.length + r.omitted!.players).toBe(randoms.our.length + randoms.enemy.length)
    expect(r.battles).toHaveLength(0)
    expect(r.record).toEqual(randoms.record)
    expect(r.ourAvgBpr).toBeCloseTo(randoms.ourAvgBpr, 3)
    expect(r.enemyAvgBpr).toBeCloseTo(randoms.enemyAvgBpr, 3)
    for (const k of ['adr', 'kpr', 'accH', 'accP', 'assistAvg', 'blockedAvg'] as const) {
      expect(r.ourTotal[k]).toBeCloseTo(randoms.ourTotal[k], 10)
      expect(r.enemyTotal[k]).toBeCloseTo(randoms.enemyTotal[k], 10)
    }
    expect(r.ourTotal.classes).toEqual(randoms.ourTotal.classes)
    // The focus player always survives the trim.
    expect(r.our.find((p) => p.id === randoms.focusId)?.battles).toBe(4)
  })

  it('drops per-tank results before players', () => {
    const r = decodeReport(encodeReport(analysis, 'scrim', '', 500)).analysis
    expect(r.omitted?.battles).toBe(true)
    expect(Object.values(r.our[0].tanks)[0].wins).toBe(0)
    expect(r.our[0].bpr).toBeCloseTo(analysis.our[0].bpr, 10)
  })

  it('rejects junk', () => {
    for (const bad of ['', 'abc', '!!!!', '<script>', 'A'.repeat(5000), b64(deflateSync(new TextEncoder().encode('{"v":1}')))]) {
      expect(() => decodeReport(bad)).toThrow()
    }
  })

  it('refuses decompression bombs without inflating them', () => {
    const bomb = b64(deflateSync(new Uint8Array(50 * 1024 * 1024), { level: 9 }))
    const started = performance.now()
    expect(() => decodeReport(bomb)).toThrow()
    expect(performance.now() - started).toBeLessThan(2000)
  })

  it('survives every truncation and random corruption', () => {
    const good = encodeReport(analysis, 'scrim', 'x')
    for (let n = 0; n < good.length; n++) {
      try {
        decodeReport(good.slice(0, n))
      } catch {
        /* rejecting is fine */
      }
    }
    let seed = 7
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
    for (let i = 0; i < 2000; i++) {
      const chars = good.split('')
      chars[Math.floor(rand() * chars.length)] = alphabet[Math.floor(rand() * 64)]
      try {
        const r = decodeReport(chars.join(''))
        // Anything that decodes must still be plain text and finite numbers.
        for (const p of [...r.analysis.our, ...r.analysis.enemy]) {
          expect(typeof p.nick).toBe('string')
          expect(Number.isFinite(p.battles) && p.battles >= 0).toBe(true)
        }
      } catch {
        /* rejecting is fine */
      }
    }
  })
})
