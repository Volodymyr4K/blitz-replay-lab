/// <reference lib="webworker" />
import { parseReplay } from './parser/replay'
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
      const battle = parseReplay(new Uint8Array(await file.arrayBuffer()))
      post({ type: 'battle', battle: { ...battle, fileName: file.name } })
    } catch (err) {
      post({ type: 'error', file: file.name, reason: err instanceof Error ? err.message : String(err) })
    }
    done++
    if (done % 5 === 0 || done === files.length) post({ type: 'progress', done, total: files.length })
  }
  post({ type: 'done' })
}
