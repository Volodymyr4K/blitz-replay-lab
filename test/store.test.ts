import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { db } from '../src/lib/db'
import { parseReplay } from '../src/parser/replay'
import { sanitizeSession } from '../src/store'

const battle = { ...parseReplay(new Uint8Array(readFileSync(new URL('./fixtures/scrim_2026.wotbreplay', import.meta.url)))), fileName: 'a.wotbreplay' }

describe('saved session', () => {
  it('keeps valid data', () => {
    const s = sanitizeSession({ battles: [battle], errors: [{ file: 'x', reason: 'corrupt' }], mode: 'individual', roster: ['nick'], title: 'T' })
    expect(s.battles).toHaveLength(1)
    expect(s).toMatchObject({ mode: 'individual', roster: ['nick'], title: 'T', errors: [{ file: 'x', reason: 'corrupt' }] })
  })

  it('drops damaged parts instead of failing', () => {
    const broken = { ...battle, results: 'oops' }
    const badResult = { ...battle, arenaId: '2', results: [{ ...battle.results[0], damageDealt: 'NaN' }] }
    const s = sanitizeSession({ battles: [broken, badResult, battle, null, 42], errors: [{ file: 3 }], mode: 'weird', roster: [1, 'ok'], title: 42 })
    expect(s.battles.map((b) => b.arenaId)).toEqual([battle.arenaId])
    expect(s).toMatchObject({ errors: [], mode: 'scrim', roster: ['ok'], title: '' })
  })

  it('treats garbage as an empty session', () => {
    for (const junk of [undefined, null, 'x', 5, []]) expect(sanitizeSession(junk).battles).toEqual([])
  })

  it('stores sessions far beyond the old localStorage limit', async () => {
    const many = Array.from({ length: 1500 }, (_, i) => ({ ...battle, arenaId: String(i) }))
    await db.set('session', { battles: many })
    const back = sanitizeSession(await db.get('session'))
    expect(back.battles).toHaveLength(1500)
    await db.del('session')
    expect(await db.get('session')).toBeUndefined()
  })
})
