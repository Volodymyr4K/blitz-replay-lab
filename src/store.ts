import { useSyncExternalStore } from 'react'
import type { StoredBattle } from './analysis/analyze'
import type { Mode } from './analysis/share'
import { db } from './lib/db'
import type { WorkerIn, WorkerOut } from './parse.worker'

export interface FileError {
  file: string
  reason: string
}

export interface Session {
  battles: StoredBattle[]
  errors: FileError[]
  mode: Mode
  roster: string[]
  title: string
}

export interface Progress {
  done: number
  total: number
}

interface State {
  session: Session
  progress: Progress | null
  /** False until the saved session has been read from IndexedDB. */
  loaded: boolean
  saveFailed: boolean
}

/** Pre-IndexedDB versions kept the session here; it is migrated once and removed. */
const LEGACY_KEY = 'bra:session:v1'
const DB_KEY = 'session'
const MAX_ERRORS = 200
const EMPTY: Session = { battles: [], errors: [], mode: 'scrim', roster: [], title: '' }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v)
const isStr = (v: unknown) => typeof v === 'string'

const RESULT_NUMS = [
  'accountId',
  'tankId',
  'damageDealt',
  'damageAssisted',
  'damageBlocked',
  'shots',
  'hits',
  'penetrations',
  'enemiesDamaged',
  'enemiesDestroyed',
  'victoryPointsEarned',
  'victoryPointsSeized',
  'baseXp',
]

/**
 * Stored data outlives code versions and can be damaged, so every battle is checked
 * before the UI sees it; a bad one is dropped instead of breaking the page on every load.
 */
function isBattle(b: unknown): b is StoredBattle {
  if (!isObj(b) || !isStr(b.arenaId) || !isStr(b.fileName) || !isObj(b.meta)) return false
  if (![b.timestamp, b.mapId, b.roomType, b.authorId, b.authorTeam].every(isNum)) return false
  if (b.winnerTeam !== null && !isNum(b.winnerTeam)) return false
  if (!Array.isArray(b.players) || !Array.isArray(b.results)) return false
  const playersOk = b.players.every((p) => isObj(p) && isNum(p.accountId) && isStr(p.nickname) && isNum(p.team) && (p.clanTag === null || isStr(p.clanTag)))
  return playersOk && b.results.every((r) => isObj(r) && RESULT_NUMS.every((k) => isNum(r[k])))
}

/** Accept whatever storage returned only in the shape the app expects. */
export function sanitizeSession(s: unknown): Session {
  if (!isObj(s)) return EMPTY
  return {
    battles: Array.isArray(s.battles) ? s.battles.filter(isBattle) : [],
    errors: Array.isArray(s.errors) ? s.errors.filter((e): e is FileError => isObj(e) && isStr(e.file) && isStr(e.reason)).slice(-MAX_ERRORS) : [],
    mode: s.mode === 'individual' ? 'individual' : 'scrim',
    roster: Array.isArray(s.roster) ? s.roster.filter(isStr) : [],
    title: isStr(s.title) ? s.title : '',
  }
}

let state: State = { session: EMPTY, progress: null, loaded: false, saveFailed: false }
const listeners = new Set<() => void>()

function emit(next: Partial<State>) {
  state = { ...state, ...next }
  listeners.forEach((l) => l())
}

const isEmpty = (s: Session) => !s.battles.length && !s.roster.length && !s.title && !s.errors.length

function readLegacy(): unknown {
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    return raw ? JSON.parse(raw) : undefined
  } catch {
    return undefined
  }
}

async function hydrate() {
  let raw: unknown
  try {
    raw = await db.get(DB_KEY)
  } catch {
    raw = undefined
  }
  const legacy = raw === undefined ? readLegacy() : undefined
  emit({ session: sanitizeSession(raw ?? legacy), loaded: true })
  if (legacy !== undefined) {
    try {
      await db.set(DB_KEY, state.session)
      localStorage.removeItem(LEGACY_KEY)
    } catch {
      /* keep the legacy copy until a later save succeeds */
    }
  }
}

// Other tabs announce saves here so no tab keeps working on a stale copy and overwrites
// battles another tab added.
const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('blitz-replay-lab')

let pending: Session | null = null
let timer: ReturnType<typeof setTimeout> | undefined

async function flush() {
  clearTimeout(timer)
  const session = pending
  pending = null
  if (!session) return
  try {
    if (isEmpty(session)) await db.del(DB_KEY)
    else await db.set(DB_KEY, session)
    channel?.postMessage('saved')
    if (state.saveFailed) emit({ saveFailed: false })
  } catch {
    emit({ saveFailed: true })
  }
}

/** Coalesce rapid edits (typing a title) into one write. */
function persist(session: Session) {
  pending = session
  clearTimeout(timer)
  timer = setTimeout(flush, 250)
}

if (channel) {
  channel.onmessage = async () => {
    // Our own unsaved edits win; they are written (and announced) right after.
    if (pending) return
    try {
      emit({ session: sanitizeSession(await db.get(DB_KEY)) })
    } catch {
      /* keep what we have */
    }
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => void flush())
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && void flush())
  void hydrate()
}

export function updateSession(patch: Partial<Session>) {
  const session = { ...state.session, ...patch }
  emit({ session })
  persist(session)
}

/** Wipe everything this app stored — the escape hatch when saved data breaks the page. */
export async function resetStorage() {
  pending = null
  clearTimeout(timer)
  try {
    localStorage.removeItem(LEGACY_KEY)
  } catch {
    /* storage unavailable */
  }
  await db.del(DB_KEY).catch(() => undefined)
}

export function useStore(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

/** Clear loaded battles; returns what was there so the caller can offer an undo. */
export function clearSession(): Session {
  const previous = state.session
  updateSession({ battles: [], errors: [], title: '' })
  return previous
}

export function restoreSession(previous: Session) {
  updateSession(previous)
}

export function removeBattle(id: string) {
  updateSession({ battles: state.session.battles.filter((b) => b.arenaId !== id) })
}

export interface ImportResult {
  added: number
  duplicates: number
  failed: number
}

/** Parse files in a worker and merge them into the session (deduplicated by arena ID). */
export function importReplays(files: File[]): Promise<ImportResult> {
  return new Promise((resolve) => {
    const worker = new Worker(new URL('./parse.worker.ts', import.meta.url), { type: 'module' })
    const seen = new Set<string>()
    const parsed: StoredBattle[] = []
    const errors: FileError[] = []
    let duplicates = 0
    emit({ progress: { done: 0, total: files.length } })

    worker.onmessage = (e: MessageEvent<WorkerOut>) => {
      const m = e.data
      if (m.type === 'progress') emit({ progress: { done: m.done, total: m.total } })
      else if (m.type === 'battle') {
        if (seen.has(m.battle.arenaId)) duplicates++
        else {
          seen.add(m.battle.arenaId)
          parsed.push(m.battle)
        }
      } else if (m.type === 'error') errors.push({ file: m.file, reason: m.reason })
      else if (m.type === 'done') {
        worker.terminate()
        // Dedupe against the session as it is now: another import or tab may have added battles meanwhile.
        const known = new Set(state.session.battles.map((b) => b.arenaId))
        const fresh = parsed.filter((b) => !known.has(b.arenaId))
        duplicates += parsed.length - fresh.length
        const failedNames = new Set(errors.map((x) => x.file))
        updateSession({
          battles: [...state.session.battles, ...fresh],
          errors: [...state.session.errors.filter((x) => !failedNames.has(x.file)), ...errors].slice(-MAX_ERRORS),
        })
        emit({ progress: null })
        resolve({ added: fresh.length, duplicates, failed: errors.length })
      }
    }
    worker.onerror = (e) => {
      worker.terminate()
      emit({ progress: null })
      errors.push({ file: '—', reason: e.message })
      updateSession({ errors: [...state.session.errors, ...errors].slice(-MAX_ERRORS) })
      resolve({ added: 0, duplicates: 0, failed: files.length })
    }
    worker.postMessage({ files } satisfies WorkerIn)
  })
}
