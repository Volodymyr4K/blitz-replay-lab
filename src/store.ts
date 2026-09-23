import { useSyncExternalStore } from 'react'
import type { StoredBattle } from './analysis/analyze'
import type { Mode } from './analysis/share'
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
  storageFull: boolean
}

export const SESSION_KEY = 'bra:session:v1'
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

function load(): Session {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return EMPTY
    const s: unknown = JSON.parse(raw)
    if (!isObj(s)) return EMPTY
    return {
      battles: Array.isArray(s.battles) ? s.battles.filter(isBattle) : [],
      errors: Array.isArray(s.errors) ? s.errors.filter((e): e is FileError => isObj(e) && isStr(e.file) && isStr(e.reason)) : [],
      mode: s.mode === 'individual' ? 'individual' : 'scrim',
      roster: Array.isArray(s.roster) ? s.roster.filter(isStr) : [],
      title: isStr(s.title) ? s.title : '',
    }
  } catch {
    return EMPTY
  }
}

let state: State = { session: load(), progress: null, storageFull: false }
const listeners = new Set<() => void>()

function emit(next: Partial<State>) {
  state = { ...state, ...next }
  listeners.forEach((l) => l())
}

function persist(session: Session) {
  try {
    if (!session.battles.length && !session.roster.length && !session.title) localStorage.removeItem(SESSION_KEY)
    else localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    if (state.storageFull) emit({ storageFull: false })
  } catch {
    emit({ storageFull: true })
  }
}

export function updateSession(patch: Partial<Session>) {
  const session = { ...state.session, ...patch }
  emit({ session })
  persist(session)
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
    const known = new Set(state.session.battles.map((b) => b.arenaId))
    const fresh: StoredBattle[] = []
    const errors: FileError[] = []
    let duplicates = 0
    emit({ progress: { done: 0, total: files.length } })

    worker.onmessage = (e: MessageEvent<WorkerOut>) => {
      const m = e.data
      if (m.type === 'progress') emit({ progress: { done: m.done, total: m.total } })
      else if (m.type === 'battle') {
        if (known.has(m.battle.arenaId)) duplicates++
        else {
          known.add(m.battle.arenaId)
          fresh.push(m.battle)
        }
      } else if (m.type === 'error') errors.push({ file: m.file, reason: m.reason })
      else if (m.type === 'done') {
        worker.terminate()
        const failedNames = new Set(errors.map((x) => x.file))
        updateSession({
          battles: [...state.session.battles, ...fresh],
          errors: [...state.session.errors.filter((x) => !failedNames.has(x.file)), ...errors],
        })
        emit({ progress: null })
        resolve({ added: fresh.length, duplicates, failed: errors.length })
      }
    }
    worker.onerror = (e) => {
      worker.terminate()
      emit({ progress: null })
      errors.push({ file: '—', reason: e.message })
      updateSession({ errors: [...state.session.errors, ...errors] })
      resolve({ added: 0, duplicates: 0, failed: files.length })
    }
    worker.postMessage({ files } satisfies WorkerIn)
  })
}
