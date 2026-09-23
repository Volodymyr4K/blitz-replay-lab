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
import { db } from './lib/db'
import { sanitizeSession, type Session } from './store'

export interface ArchiveMeta {
  id: string
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
  /** Most frequent clan tag on the enemy side, weighted by battles. */
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
  const raw = await db.get<unknown>(INDEX_KEY).catch(() => undefined)
  return Array.isArray(raw) ? raw.filter(isMeta) : []
}

async function writeIndex(next: ArchiveMeta[]) {
  await db.set(INDEX_KEY, next)
  emit(next)
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
  const clans = new Map<string, number>()
  for (const p of a.enemy) if (p.clan) clans.set(p.clan, (clans.get(p.clan) ?? 0) + p.battles)
  const enemyClan = [...clans].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null
  const times = s.battles.map((b) => b.timestamp).filter((t) => t > 0)
  return {
    id,
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

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)

// ---------- operations ----------

/** Save a session (new, or over the entry it was opened from). Returns its index record. */
export async function saveToArchive(s: Session): Promise<ArchiveMeta> {
  const id = s.archiveId ?? newId()
  const meta = summarize(id, s)
  await db.set(entryKey(id), { battles: s.battles, roster: s.roster })
  const current = await readIndex()
  await writeIndex([...current.filter((m) => m.id !== id), meta])
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
  await db.del(entryKey(id))
  await writeIndex((await readIndex()).filter((m) => m.id !== id))
  return entry
}

export async function restoreArchived(entry: ArchivedSession) {
  await db.set(entryKey(entry.meta.id), { battles: entry.battles, roster: entry.roster })
  await writeIndex([...(await readIndex()).filter((m) => m.id !== entry.meta.id), entry.meta])
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
    const meta = summarize(id, clean, isNum(e.meta?.savedAt) ? e.meta.savedAt : Date.now())
    await db.set(entryKey(id), { battles: clean.battles, roster: clean.roster })
    added.push(meta)
  }
  if (added.length) await writeIndex([...current, ...added])
  return { added: added.length, skipped, invalid }
}
