// Reference vectors produced by CPython's pickle (protocols 1–5); see test/fixtures/pickle-vectors.json.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { unpickle, type PickleValue } from '../src/parser/pickle'

interface Vector {
  name: string
  proto: number
  hex: string
  expect: unknown
  unsafe: boolean
}

const vectors: Vector[] = JSON.parse(readFileSync(new URL('./fixtures/pickle-vectors.json', import.meta.url), 'utf8'))
const fromHex = (h: string) => Uint8Array.from(h.match(/../g) ?? [], (b) => parseInt(b, 16))
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('')

/** Same shape the generator wrote: ints as decimal strings, bytes as hex. */
function normalize(v: PickleValue): unknown {
  if (v === null || typeof v === 'boolean') return v
  if (typeof v === 'number' || typeof v === 'bigint') return { int: String(v) }
  if (v instanceof Uint8Array) return { bytes: hex(v) }
  if (typeof v === 'string') return v
  return v.map(normalize)
}

describe('unpickle', () => {
  const safe = vectors.filter((v) => !v.unsafe)
  it.each(safe.map((v) => [`${v.name} (protocol ${v.proto})`, v] as const))('decodes %s', (_, v) => {
    expect(normalize(unpickle(fromHex(v.hex)))).toEqual(v.expect)
  })

  it('covers every protocol from 1 to 5', () => {
    expect(new Set(safe.map((v) => v.proto))).toEqual(new Set([1, 2, 3, 4, 5]))
  })

  it('refuses to resolve globals (the pickle code-execution path)', () => {
    const unsafe = vectors.filter((v) => v.unsafe)
    expect(unsafe.length).toBeGreaterThan(0)
    for (const v of unsafe) expect(() => unpickle(fromHex(v.hex))).toThrow(/unsupported opcode/)
  })

  it('reads a Python 2 str (BINSTRING) as bytes, like battle_results.dat', () => {
    // (7, 'ab') pickled by Python 2 with protocol 2: PROTO 2, BININT1 7, SHORT_BINSTRING 'ab', TUPLE2, STOP
    const py2 = fromHex('80024b0755026162862e')
    const [n, s] = unpickle(py2) as [number, Uint8Array]
    expect(n).toBe(7)
    expect(hex(s)).toBe('6162')
  })

  it('shares memoized objects instead of copying them', () => {
    const v = vectors.find((x) => x.name === 'shared_ref' && x.proto === 4)!
    const [a, b] = unpickle(fromHex(v.hex)) as PickleValue[][]
    expect(a).toBe(b)
  })

  it('rejects truncated and empty input', () => {
    const v = vectors.find((x) => x.name === 'battle_results_like' && x.proto === 2)!
    const bytes = fromHex(v.hex)
    for (let n = 0; n < bytes.length; n++) expect(() => unpickle(bytes.subarray(0, n))).toThrow()
  })
})
