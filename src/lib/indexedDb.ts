/**
 * GreenVest Native IndexedDB Deep Storage Engine
 * Provides resilient, long-term offline storage that survives browser cache clearing.
 */

const DB_NAME = 'greenvest_db'
const DB_VERSION = 1

export interface OutboxOrder {
  id: string
  payload: any
  createdAt: string
  attempts: number
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null)
  }

  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION)

      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains('key_val')) {
          db.createObjectStore('key_val', { keyPath: 'key' })
        }
        if (!db.objectStoreNames.contains('offline_outbox')) {
          db.createObjectStore('offline_outbox', { keyPath: 'id' })
        }
      }

      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

/** Store a key-value pair in IndexedDB */
export async function idbSet<T>(key: string, value: T): Promise<boolean> {
  try {
    const db = await openDb()
    if (!db) return false

    return new Promise((resolve) => {
      const tx = db.transaction('key_val', 'readwrite')
      const store = tx.objectStore('key_val')
      const req = store.put({ key, value, updatedAt: new Date().toISOString() })
      req.onsuccess = () => resolve(true)
      req.onerror = () => resolve(false)
    })
  } catch {
    return false
  }
}

/** Retrieve a key-value pair from IndexedDB */
export async function idbGet<T>(key: string, fallback: T): Promise<T> {
  try {
    const db = await openDb()
    if (!db) return fallback

    return new Promise((resolve) => {
      const tx = db.transaction('key_val', 'readonly')
      const store = tx.objectStore('key_val')
      const req = store.get(key)
      req.onsuccess = () => {
        if (req.result && req.result.value !== undefined) {
          resolve(req.result.value as T)
        } else {
          resolve(fallback)
        }
      }
      req.onerror = () => resolve(fallback)
    })
  } catch {
    return fallback
  }
}

/** Delete a key from IndexedDB */
export async function idbDelete(key: string): Promise<boolean> {
  try {
    const db = await openDb()
    if (!db) return false

    return new Promise((resolve) => {
      const tx = db.transaction('key_val', 'readwrite')
      const store = tx.objectStore('key_val')
      const req = store.delete(key)
      req.onsuccess = () => resolve(true)
      req.onerror = () => resolve(false)
    })
  } catch {
    return false
  }
}

/** Enqueue an offline order into the outbox */
export async function idbEnqueueOutbox(id: string, payload: any): Promise<boolean> {
  try {
    const db = await openDb()
    if (!db) return false

    return new Promise((resolve) => {
      const tx = db.transaction('offline_outbox', 'readwrite')
      const store = tx.objectStore('offline_outbox')
      const entry: OutboxOrder = {
        id,
        payload,
        createdAt: new Date().toISOString(),
        attempts: 0,
      }
      const req = store.put(entry)
      req.onsuccess = () => resolve(true)
      req.onerror = () => resolve(false)
    })
  } catch {
    return false
  }
}

/** Retrieve all pending offline orders */
export async function idbGetPendingOutbox(): Promise<OutboxOrder[]> {
  try {
    const db = await openDb()
    if (!db) return []

    return new Promise((resolve) => {
      const tx = db.transaction('offline_outbox', 'readonly')
      const store = tx.objectStore('offline_outbox')
      const req = store.getAll()
      req.onsuccess = () => resolve(req.result || [])
      req.onerror = () => resolve([])
    })
  } catch {
    return []
  }
}

/** Remove a successfully synced order from outbox */
export async function idbRemoveOutbox(id: string): Promise<boolean> {
  try {
    const db = await openDb()
    if (!db) return false

    return new Promise((resolve) => {
      const tx = db.transaction('offline_outbox', 'readwrite')
      const store = tx.objectStore('offline_outbox')
      const req = store.delete(id)
      req.onsuccess = () => resolve(true)
      req.onerror = () => resolve(false)
    })
  } catch {
    return false
  }
}
