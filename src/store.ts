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

const KEY = 'bra:session:v1'
const EMPTY: Session = { battles: [], errors: [], mode: 'scrim', roster: [], title: '' }

function load(): Session {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return EMPTY
    const s = JSON.parse(raw) as Partial<Session>
    return { ...EMPTY, ...s, battles: Array.isArray(s.battles) ? s.battles : [] }
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
    if (!session.battles.length && !session.roster.length && !session.title) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, JSON.stringify(session))
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

export function clearSession() {
  updateSession({ battles: [], errors: [], title: '' })
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
