import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { analyze } from '../src/analysis/analyze'
import { playerForm } from '../src/analysis/form'
import { deleteArchived, exportArchive, importArchive, loadAll, loadArchived, maintainArchive, newArchiveId, restoreArchived, saveToArchive, summarize, SUMMARY_VERSION } from '../src/archive'
import { db } from '../src/lib/db'
import type { Session } from '../src/store'
import { battle, CLAN_A, CLAN_B } from './helpers'

const session = (battles: Session['battles'], extra: Partial<Session> = {}) => ({
  battles,
  errors: [],
  mode: 'scrim' as const,
  roster: [],
  title: '',
  ...extra,
  archiveId: extra.archiveId ?? newArchiveId(),
})

beforeEach(async () => {
  for (const s of await loadAll()) await deleteArchived(s.meta.id)
})

describe('archive', () => {
  it('saves a session with a summary and loads it back', async () => {
    const meta = await saveToArchive(session([battle('1', CLAN_A, CLAN_B, 1, 1), battle('2', CLAN_A, CLAN_B, 2, 1)]))
    expect(meta).toMatchObject({ battles: 2, record: { win: 1, loss: 1, draw: 0 }, enemyClan: 'BBB', mode: 'scrim' })
    const back = await loadArchived(meta.id)
    expect(back?.battles.map((b) => b.arenaId)).toEqual(['1', '2'])
  })

  it('updates the same entry when saved again', async () => {
    const first = await saveToArchive(session([battle('1', CLAN_A, CLAN_B, 1, 1)]))
    const again = await saveToArchive(session([battle('1', CLAN_A, CLAN_B, 1, 1), battle('2', CLAN_A, CLAN_B, 1, 1)], { archiveId: first.id, title: 'Weekly' }))
    expect(again.id).toBe(first.id)
    const all = await loadAll()
    expect(all).toHaveLength(1)
    expect(all[0].meta).toMatchObject({ battles: 2, title: 'Weekly' })
  })

  it('deletes with undo', async () => {
    const meta = await saveToArchive(session([battle('1', CLAN_A, CLAN_B, 1, 1)]))
    const removed = await deleteArchived(meta.id)
    expect(await loadAll()).toHaveLength(0)
    await restoreArchived(removed!)
    expect((await loadAll())[0].meta.id).toBe(meta.id)
  })

  it('round-trips through a backup file and skips what is already there', async () => {
    await saveToArchive(session([battle('1', CLAN_A, CLAN_B, 1, 1)]))
    await saveToArchive(session([battle('2', CLAN_A, CLAN_B, 2, 1)]))
    const text = await (await exportArchive()).text()
    expect(await importArchive(text)).toEqual({ added: 0, skipped: 2, invalid: 0 })

    for (const s of await loadAll()) await deleteArchived(s.meta.id)
    expect(await importArchive(text)).toEqual({ added: 2, skipped: 0, invalid: 0 })
    expect((await loadAll()).map((s) => s.meta.battles)).toEqual([1, 1])
  })

  it('rejects foreign files and re-validates every battle on import', async () => {
    await expect(importArchive('not json')).rejects.toThrow()
    await expect(importArchive('{"kind":"something else","sessions":[]}')).rejects.toThrow()
    const tampered = JSON.stringify({
      kind: 'blitz-replay-lab/archive',
      version: 1,
      sessions: [
        { meta: { id: 'ok-1', title: 'fine' }, battles: [battle('9', CLAN_A, CLAN_B, 1, 1)], roster: [] },
        { meta: { id: 'bad-1' }, battles: [{ arenaId: 'x', results: 'oops' }], roster: [] },
        { meta: { id: '../../etc' }, battles: [battle('8', CLAN_A, CLAN_B, 1, 1)], roster: [] },
        // Summary numbers in the file are ignored and rebuilt from the battles.
        { meta: { id: 'ok-2', battles: 999, ourAvgBpr: 99 }, battles: [battle('7', CLAN_A, CLAN_B, 1, 1)], roster: [] },
      ],
    })
    expect(await importArchive(tampered)).toEqual({ added: 2, skipped: 0, invalid: 2 })
    const ok2 = (await loadAll()).find((s) => s.meta.id === 'ok-2')!
    expect(ok2.meta.battles).toBe(1)
    expect(ok2.meta.ourAvgBpr).toBeLessThan(5)
  })

  it('keeps the index in IndexedDB', async () => {
    await saveToArchive(session([battle('1', CLAN_A, CLAN_B, 1, 1)]))
    expect(await db.get<unknown[]>('archive:index')).toHaveLength(1)
  })
})

describe('player form', () => {
  it('follows a player across sessions by account, not nickname', async () => {
    const week1 = await saveToArchive(session([battle('1', CLAN_A, CLAN_B, 1, 1, { 1: 1000 })]))
    const b2 = battle('2', CLAN_A, CLAN_B, 1, 1, { 1: 3000 })
    b2.timestamp = 10
    b2.players = b2.players.map((p) => (p.accountId === 1 ? { ...p, nickname: 'renamed' } : p))
    const week2 = await saveToArchive(session([b2]))
    const form = playerForm(await loadAll())
    const p1 = form.find((f) => f.id === 1)!
    expect(p1.nick).toBe('renamed')
    expect(p1.points.map((p) => p.sessionId)).toEqual([week1.id, week2.id])
    expect(p1.delta).toBeGreaterThan(0)
    expect(form.every((f) => CLAN_A.includes(f.id))).toBe(true)
  })
})

describe('archive regressions', () => {
  it('keeps every entry when several saves race (other tabs)', async () => {
    await Promise.all([1, 2, 3].map((i) => saveToArchive(session([battle(String(i), CLAN_A, CLAN_B, 1, 1)]))))
    expect(await loadAll()).toHaveLength(3)
  })

  it('updates one entry when the same session is saved twice at once (double click)', async () => {
    const s = session([battle('1', CLAN_A, CLAN_B, 1, 1)])
    await Promise.all([saveToArchive(s), saveToArchive(s)])
    expect(await loadAll()).toHaveLength(1)
  })

  it('names an opponent only for a scrim against one clan', () => {
    const b = battle('1', CLAN_A, CLAN_B, 1, 1)
    expect(summarize('x', { ...session([b]), mode: 'individual' }).enemyClan).toBeNull()
    expect(summarize('x', session([b])).enemyClan).toBe('BBB')
    const mixed = { ...b, players: b.players.map((p) => (p.accountId > 13 ? { ...p, clanTag: `R${p.accountId}` } : p)) }
    expect(summarize('x', session([mixed])).enemyClan).toBeNull()
  })

  it('refreshes old summaries and removes orphaned data', async () => {
    const meta = await saveToArchive(session([battle('1', CLAN_A, CLAN_B, 1, 1)]))
    const index = (await db.get<Record<string, unknown>[]>('archive:index'))!
    await db.set('archive:index', index.map((m) => ({ ...m, v: undefined, battles: 999 })))
    await db.set('archive:orphan-1', { battles: [], roster: [] })
    await maintainArchive()
    const [fixed] = (await loadAll()).map((s) => s.meta)
    expect(fixed).toMatchObject({ id: meta.id, v: SUMMARY_VERSION, battles: 1 })
    expect(await db.get('archive:orphan-1')).toBeUndefined()
    expect(await db.get(`archive:${meta.id}`)).toBeDefined()
  })

  it('never deletes data behind an index record it cannot read', async () => {
    const meta = await saveToArchive(session([battle('1', CLAN_A, CLAN_B, 1, 1)]))
    // A record from some future or damaged format: unreadable, but still referenced.
    await db.set('archive:index', [{ id: meta.id, weird: true }])
    await maintainArchive()
    expect(await db.get(`archive:${meta.id}`)).toBeDefined()
  })

  it('rejects oversized backups before parsing', async () => {
    await expect(importArchive(' '.repeat(50 * 1024 * 1024 + 1))).rejects.toThrow()
  })
})

describe('player form regressions', () => {
  it('counts a replay once even if it sits in two sessions', async () => {
    await saveToArchive(session([battle('1', CLAN_A, CLAN_B, 1, 1)]))
    const b2 = battle('2', CLAN_A, CLAN_B, 1, 1)
    b2.timestamp = 5
    await saveToArchive(session([battle('1', CLAN_A, CLAN_B, 1, 1), b2]))
    expect(playerForm(await loadAll()).find((f) => f.id === 1)!.battles).toBe(2)
  })

  it('computes cross-session BPR exactly like one combined session', async () => {
    const tweak = (id: string, stats: object) => {
      const b = battle(id, CLAN_A, CLAN_B, 1, 1)
      b.timestamp = Number(id)
      b.results = b.results.map((r) => (r.accountId === 1 ? { ...r, ...stats } : r))
      return b
    }
    const b1 = tweak('1', { enemiesDestroyed: 0, shots: 10, hits: 3, penetrations: 1, damageAssisted: 0 })
    const b2 = tweak('2', { enemiesDestroyed: 5, shots: 4, hits: 4, penetrations: 4, damageAssisted: 2000 })
    await saveToArchive(session([b1]))
    await saveToArchive(session([b2]))
    const form = playerForm(await loadAll()).find((f) => f.id === 1)!
    const combined = analyze([b1, b2], { roster: [] }).our.find((r) => r.id === 1)!
    expect(form.bpr).toBeCloseTo(combined.bpr, 10)
    expect(form.adr).toBeCloseTo(combined.adr, 10)
  })
})
