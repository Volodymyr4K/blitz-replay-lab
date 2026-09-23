/// <reference lib="webworker" />
import { MAX_REPLAY_BYTES, ReplayError, parseReplay } from './parser/replay'
import type { StoredBattle } from './analysis/analyze'

export type WorkerIn = { files: File[] }
export type WorkerOut =
  | { type: 'progress'; done: number; total: number }
  | { type: 'battle'; battle: StoredBattle }
  | { type: 'error'; file: string; reason: string }
  | { type: 'done' }

const post = (m: WorkerOut) => (self as DedicatedWorkerGlobalScope).postMessage(m)

self.onmessage = async (e: MessageEvent<WorkerIn>) => {
  const { files } = e.data
  let done = 0
  for (const file of files) {
    try {
      if (file.size > MAX_REPLAY_BYTES) throw new ReplayError('too_large')
      const battle = parseReplay(new Uint8Array(await file.arrayBuffer()))
      post({ type: 'battle', battle: { ...battle, fileName: file.name } })
    } catch (err) {
      // Known failures travel as a code the UI translates; anything else as raw text.
      post({ type: 'error', file: file.name, reason: err instanceof ReplayError ? err.code : err instanceof Error ? err.message : String(err) })
    }
    done++
    if (done % 5 === 0 || done === files.length) post({ type: 'progress', done, total: files.length })
  }
  post({ type: 'done' })
}
