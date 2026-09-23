// Hostile-input checks: the parser must either succeed or throw a ReplayError — never hang,
// crash with a foreign error type, or allocate unbounded memory.
import { readFileSync } from 'node:fs'
import { strToU8, unzipSync, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { ReplayError, parseReplay } from '../src/parser/replay'

const fixture = new Uint8Array(readFileSync(new URL('./fixtures/scrim_2026.wotbreplay', import.meta.url)))
const entries = unzipSync(fixture, { filter: (f) => f.name !== 'data.wotreplay' })
const dat = entries['battle_results.dat']
const meta = entries['meta.json']

/** Rebuild a small replay around a (possibly mangled) battle_results.dat; stored, not deflated, to keep the loop fast. */
const withDat = (d: Uint8Array) => zipSync({ 'meta.json': meta, 'battle_results.dat': d }, { level: 0 })

function outcome(bytes: Uint8Array): 'ok' | string {
  try {
    parseReplay(bytes)
    return 'ok'
  } catch (e) {
    if (e instanceof ReplayError) return e.code
    throw e
  }
}

// Deterministic PRNG so failures are reproducible.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 2 ** 32
  }
}

describe('parser robustness', () => {
  it('classifies obviously wrong inputs', () => {
    expect(outcome(new Uint8Array())).toBe('not_replay')
    expect(outcome(strToU8('hello'))).toBe('not_replay')
    expect(outcome(zipSync({ 'readme.txt': strToU8('hi') }))).toBe('not_replay')
    expect(outcome(zipSync({ 'meta.json': meta }))).toBe('no_results')
    expect(outcome(withDat(strToU8('not a pickle')))).toBe('corrupt')
  })

  it('survives every truncation of battle_results.dat', () => {
    const seen = new Set<string>()
    for (let n = 0; n < dat.length; n += 7) seen.add(outcome(withDat(dat.subarray(0, n))))
    expect(seen.has('corrupt')).toBe(true)
  }, 30_000)

  it('survives truncated archives', () => {
    for (let n = 0; n < fixture.length; n += 4999) outcome(fixture.subarray(0, n))
  })

  it('survives random byte corruption', () => {
    const rand = rng(42)
    const started = performance.now()
    for (let i = 0; i < 3000; i++) {
      const copy = dat.slice()
      const flips = 1 + Math.floor(rand() * 8)
      for (let j = 0; j < flips; j++) copy[Math.floor(rand() * copy.length)] = Math.floor(rand() * 256)
      outcome(withDat(copy))
    }
    expect(performance.now() - started).toBeLessThan(20_000)
  }, 30_000)

  it('refuses oversized entries (zip bombs)', () => {
    const bomb = zipSync({ 'meta.json': meta, 'battle_results.dat': new Uint8Array(32 * 1024 * 1024) })
    expect(bomb.length).toBeLessThan(200_000)
    expect(outcome(bomb)).toBe('too_large')
  })

  it('refuses a bomb that lies about its size', () => {
    const bomb = zipSync({ 'meta.json': meta, 'battle_results.dat': new Uint8Array(32 * 1024 * 1024) })
    // Overwrite the declared uncompressed size (local header +22, central directory +24) with 1 KB.
    const view = new DataView(bomb.buffer)
    for (let i = 0; i + 4 <= bomb.length; i++) {
      const sig = view.getUint32(i, true)
      if (sig === 0x04034b50 && view.getUint32(i + 22, true) === 32 * 1024 * 1024) view.setUint32(i + 22, 1024, true)
      if (sig === 0x02014b50 && view.getUint32(i + 24, true) === 32 * 1024 * 1024) view.setUint32(i + 24, 1024, true)
    }
    expect(['too_large', 'not_replay', 'corrupt']).toContain(outcome(bomb))
  })

  it('parses hundreds of replays quickly', () => {
    const started = performance.now()
    for (let i = 0; i < 300; i++) parseReplay(fixture)
    expect(performance.now() - started).toBeLessThan(10_000)
  })
})
