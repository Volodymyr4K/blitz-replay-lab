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

export const db = {
  get: <T>(key: string) => run<T | undefined>('readonly', (s) => s.get(key)),
  set: (key: string, value: unknown) => run('readwrite', (s) => s.put(value, key)).then(() => undefined),
  del: (key: string) => run('readwrite', (s) => s.delete(key)).then(() => undefined),
}
