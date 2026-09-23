/**
 * Saved sessions, kept in this browser's IndexedDB next to the working session.
 *
 * A small index (one meta record per session) is stored apart from the battles so the
 * archive list opens instantly; full battles load only when a session is opened or the
 * player-form view needs them. Nothing leaves the device except through export.
 */
import { useSyncExternalStore } from 'react'
import { analyze, mvp, type Outcome, type StoredBattle } from './analysis/analyze'
import type { Mode } from './analysis/share'
import { db, type WriteOp } from './lib/db'
import { sanitizeSession, type Session } from './store'

export interface ArchiveMeta {
  id: string
  /** Summary format; older ones are recomputed from the battles. */
  v: number
  /** User-given title; empty means "derive one from the date and opponent". */
  title: string
  mode: Mode
  savedAt: number
  /** First and last battle, unix seconds. */
  from: number
  to: number
  battles: number
  record: Record<Outcome, number>
  ourAvgBpr: number
  /** The opposing clan in a scrim, when one clan clearly dominates the enemy side. */
  enemyClan: string | null
  mvp: string | null
}

export interface ArchivedSession {
  meta: ArchiveMeta
  battles: StoredBattle[]
  roster: string[]
}

const INDEX_KEY = 'archive:index'
const entryKey = (id: string) => `archive:${id}`
const EXPORT_KIND = 'blitz-replay-lab/archive'
const EXPORT_VERSION = 1
/** Bump when summarize() changes so stored summaries get recomputed. */
export const SUMMARY_VERSION = 2
const MAX_IMPORT_BYTES = 50 * 1024 * 1024

// ---------- index state (shared across components and tabs) ----------

let index: ArchiveMeta[] = []
let loaded = false
const listeners = new Set<() => void>()
const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('blitz-replay-lab-archive')

function emit(next: ArchiveMeta[]) {
  index = [...next].sort((a, b) => b.to - a.to || b.savedAt - a.savedAt)
  loaded = true
  listeners.forEach((l) => l())
}

async function readIndex(): Promise<ArchiveMeta[]> {
  return indexOf(await db.get<unknown>(INDEX_KEY).catch(() => undefined))
}

// A summary with a missing or odd `v` (saved before versioning) counts as version 1 and is refreshed.
const indexOf = (raw: unknown): ArchiveMeta[] =>
  Array.isArray(raw) ? raw.map((m) => (m && typeof m === 'object' && !isNum((m as { v?: unknown }).v) ? { ...m, v: 1 } : m)).filter(isMeta) : []

/** Every ID the stored index mentions, valid summary or not — data behind these is never pruned. */
const referencedIds = (raw: unknown): Set<string> =>
  new Set(Array.isArray(raw) ? raw.map((m) => (m && typeof m === 'object' ? (m as { id?: unknown }).id : undefined)).filter((id): id is string => typeof id === 'string') : [])

/**
 * Change the index and entries in one transaction, so concurrent saves (double clicks,
 * other tabs) can neither lose an entry nor leave the index pointing at missing data.
 */
async function commit(ops: WriteOp[], change: (index: ArchiveMeta[]) => ArchiveMeta[]) {
  await db.write([...ops, { update: INDEX_KEY, fn: (raw) => change(indexOf(raw)) }])
  emit(await readIndex())
  channel?.postMessage('changed')
}

if (channel) channel.onmessage = async () => emit(await readIndex())
if (typeof window !== 'undefined') void readIndex().then(emit)

let snapshot = { index, loaded }
export function useArchive(): { index: ArchiveMeta[]; loaded: boolean } {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => {
      if (snapshot.index !== index || snapshot.loaded !== loaded) snapshot = { index, loaded }
      return snapshot
    },
  )
}

// ---------- validation ----------

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function isMeta(m: unknown): m is ArchiveMeta {
  if (typeof m !== 'object' || m === null) return false
  const x = m as Record<string, unknown>
  const r = x.record as Record<string, unknown> | undefined
  return (
    typeof x.id === 'string' &&
    isNum(x.v) &&
    typeof x.title === 'string' &&
    (x.mode === 'scrim' || x.mode === 'individual') &&
    [x.savedAt, x.from, x.to, x.battles, x.ourAvgBpr].every(isNum) &&
    !!r &&
    [r.win, r.loss, r.draw].every(isNum) &&
    (x.enemyClan === null || typeof x.enemyClan === 'string') &&
    (x.mvp === null || typeof x.mvp === 'string')
  )
}

// ---------- summaries ----------

/** Build the index record for a session; also used to refresh it after edits. */
export function summarize(id: string, s: Pick<Session, 'battles' | 'roster' | 'mode' | 'title'>, savedAt = Date.now()): ArchiveMeta {
  const a = analyze(s.battles, { roster: s.roster })
  // Randoms have strangers on the other side; only name an opponent in a scrim where one
  // clan fills at least half of the enemy slots.
  const clans = new Map<string, number>()
  let enemySlots = 0
  for (const p of a.enemy) {
    enemySlots += p.battles
    if (p.clan) clans.set(p.clan, (clans.get(p.clan) ?? 0) + p.battles)
  }
  const [topClan, topSlots = 0] = [...clans].sort((x, y) => y[1] - x[1])[0] ?? []
  const enemyClan = s.mode === 'scrim' && topClan && topSlots * 2 >= enemySlots ? topClan : null
  const times = s.battles.map((b) => b.timestamp).filter((t) => t > 0)
  return {
    id,
    v: SUMMARY_VERSION,
    title: s.title.trim(),
    mode: s.mode,
    savedAt,
    from: times.length ? Math.min(...times) : 0,
    to: times.length ? Math.max(...times) : 0,
    battles: s.battles.length,
    record: a.record,
    ourAvgBpr: a.ourAvgBpr,
    enemyClan,
    mvp: mvp(a)?.nick ?? null,
  }
}

export const newArchiveId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)

// ---------- operations ----------

/**
 * Save a session over its archive entry (it must already carry an archiveId, assigned by the
 * caller before the first await so repeated clicks update one entry). Returns the summary.
 */
export async function saveToArchive(s: Session & { archiveId: string }): Promise<ArchiveMeta> {
  const meta = summarize(s.archiveId, s)
  await commit([{ put: entryKey(meta.id), value: { battles: s.battles, roster: s.roster } }], (index) => [...index.filter((m) => m.id !== meta.id), meta])
  return meta
}

export async function loadArchived(id: string): Promise<ArchivedSession | null> {
  const meta = (await readIndex()).find((m) => m.id === id)
  const raw = await db.get<unknown>(entryKey(id)).catch(() => undefined)
  if (!meta || typeof raw !== 'object' || raw === null) return null
  const clean = sanitizeSession({ ...(raw as object), mode: meta.mode, title: meta.title })
  return { meta, battles: clean.battles, roster: clean.roster }
}

/** Remove an entry; the returned copy can be passed to restoreArchived() to undo. */
export async function deleteArchived(id: string): Promise<ArchivedSession | null> {
  const entry = await loadArchived(id)
  await commit([{ del: entryKey(id) }], (index) => index.filter((m) => m.id !== id))
  return entry
}

export async function restoreArchived(entry: ArchivedSession) {
  const { meta } = entry
  await commit([{ put: entryKey(meta.id), value: { battles: entry.battles, roster: entry.roster } }], (index) => [...index.filter((m) => m.id !== meta.id), meta])
}

/**
 * Housekeeping, run when the archive is opened: recompute summaries written by an older
 * version, and drop entry data that no index record points to (left by interrupted writes
 * of earlier versions). Orphans are found inside the transaction, against the index as it
 * is at that moment, so a session another tab is saving right now is never mistaken for one.
 */
export async function maintainArchive() {
  const refreshed: ArchiveMeta[] = []
  for (const m of (await readIndex()).filter((x) => x.v !== SUMMARY_VERSION)) {
    const entry = await loadArchived(m.id)
    if (entry) refreshed.push(summarize(m.id, { battles: entry.battles, roster: entry.roster, mode: m.mode, title: m.title }, m.savedAt))
  }
  const byId = new Map(refreshed.map((m) => [m.id, m]))
  const pruneOrphans: WriteOp = {
    run: (store) => {
      const idx = store.get(INDEX_KEY)
      idx.onsuccess = () => {
        const known = new Set([...referencedIds(idx.result)].map(entryKey))
        const keys = store.getAllKeys()
        keys.onsuccess = () => {
          for (const k of keys.result) if (typeof k === 'string' && k.startsWith('archive:') && k !== INDEX_KEY && !known.has(k)) store.delete(k)
        }
      }
    },
  }
  // The index update runs after the prune in the same transaction.
  await commit([pruneOrphans], (index) => index.map((m) => byId.get(m.id) ?? m))
}

export async function loadAll(): Promise<ArchivedSession[]> {
  const metas = await readIndex()
  const all = await Promise.all(metas.map((m) => loadArchived(m.id)))
  return all.filter((x): x is ArchivedSession => x !== null)
}

// ---------- backup ----------

export async function exportArchive(): Promise<Blob> {
  const sessions = await loadAll()
  const payload = { kind: EXPORT_KIND, version: EXPORT_VERSION, exportedAt: new Date().toISOString(), sessions }
  return new Blob([JSON.stringify(payload)], { type: 'application/json' })
}

export interface ImportResult {
  added: number
  skipped: number
  invalid: number
}

/**
 * Merge a backup file into the archive. Entries already present (same ID) are kept as
 * they are; every battle is re-validated, and summaries are rebuilt rather than trusted.
 */
export async function importArchive(text: string): Promise<ImportResult> {
  if (text.length > MAX_IMPORT_BYTES) throw new Error('not_backup')
  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    throw new Error('not_backup')
  }
  const p = payload as { kind?: unknown; sessions?: unknown }
  if (p?.kind !== EXPORT_KIND || !Array.isArray(p.sessions)) throw new Error('not_backup')

  const current = await readIndex()
  const known = new Set(current.map((m) => m.id))
  const added: ArchiveMeta[] = []
  const ops: WriteOp[] = []
  let skipped = 0
  let invalid = 0
  for (const raw of p.sessions) {
    const e = raw as { meta?: Partial<ArchiveMeta>; battles?: unknown; roster?: unknown }
    const id = typeof e?.meta?.id === 'string' && /^[\w-]{1,64}$/.test(e.meta.id) ? e.meta.id : null
    const clean = sanitizeSession({ battles: e?.battles, roster: e?.roster, mode: e?.meta?.mode, title: typeof e?.meta?.title === 'string' ? e.meta.title.slice(0, 80) : '' })
    if (!id || !clean.battles.length) {
      invalid++
      continue
    }
    if (known.has(id)) {
      skipped++
      continue
    }
    known.add(id)
    added.push(summarize(id, clean, isNum(e.meta?.savedAt) ? e.meta.savedAt : Date.now()))
    ops.push({ put: entryKey(id), value: { battles: clean.battles, roster: clean.roster } })
  }
  if (added.length) {
    const ids = new Set(added.map((m) => m.id))
    await commit(ops, (index) => [...index.filter((m) => !ids.has(m.id)), ...added])
  }
  return { added: added.length, skipped, invalid }
}
