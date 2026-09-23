/**
 * Minimal promise wrapper over one IndexedDB object store used as a key-value map.
 * IndexedDB instead of localStorage: sessions of hundreds of battles outgrow the
 * ~5 MB localStorage quota, while IndexedDB gets a share of free disk space.
 */
const DB_NAME = 'blitz-replay-lab'
const STORE = 'kv'

let opening: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => {
      const conn = req.result
      // Let another tab upgrade or delete the database instead of blocking it forever;
      // the next call here simply reopens.
      conn.onversionchange = () => {
        conn.close()
        opening = null
      }
      resolve(conn)
    }
    req.onerror = () => reject(req.error)
    req.onblocked = () => reject(new Error('indexedDB blocked'))
  })
  // A failed open (private mode quirks, disabled storage) may succeed later.
  opening.catch(() => (opening = null))
  return opening
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode)
        const req = fn(tx.objectStore(STORE))
        tx.oncomplete = () => resolve(req.result)
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error ?? new Error('transaction aborted'))
      }),
  )
}

export type WriteOp =
  | { put: string; value: unknown }
  | { del: string }
  | { update: string; fn: (current: unknown) => unknown }
  /** Runs inside the transaction; may only issue requests synchronously or from their callbacks. */
  | { run: (store: IDBObjectStore) => void }

/**
 * Apply several writes in one readwrite transaction: all or nothing, and IndexedDB never
 * interleaves it with another tab's readwrite transaction on the same store. `update`
 * reads and rewrites a key inside that transaction (e.g. an index list), so concurrent
 * savers cannot lose each other's changes.
 */
function write(ops: WriteOp[]): Promise<void> {
  return open().then(
    (conn) =>
      new Promise<void>((resolve, reject) => {
        const tx = conn.transaction(STORE, 'readwrite')
        const store = tx.objectStore(STORE)
        for (const op of ops) {
          if ('put' in op) store.put(op.value, op.put)
          else if ('del' in op) store.delete(op.del)
          else if ('run' in op) op.run(store)
          else {
            const req = store.get(op.update)
            req.onsuccess = () => store.put(op.fn(req.result), op.update)
          }
        }
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error ?? new Error('transaction aborted'))
      }),
  )
}

export const db = {
  get: <T>(key: string) => run<T | undefined>('readonly', (s) => s.get(key)),
  keys: () => run('readonly', (s) => s.getAllKeys()).then((keys) => keys.filter((k): k is string => typeof k === 'string')),
  set: (key: string, value: unknown) => run('readwrite', (s) => s.put(value, key)).then(() => undefined),
  del: (key: string) => run('readwrite', (s) => s.delete(key)).then(() => undefined),
  write,
}
