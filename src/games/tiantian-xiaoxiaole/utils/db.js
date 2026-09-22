// ============ IndexedDB 轻封装（表情持久化存储） ============
const DB_NAME = 'tiantian-xiaoxiaole'
const DB_VERSION = 1
const STORE = 'expressions'

let dbPromise = null

function openDB() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function reqAsPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function dbGetAll() {
  const db = await openDB()
  return reqAsPromise(db.transaction(STORE).objectStore(STORE).getAll())
}

export async function dbPut(item) {
  const db = await openDB()
  return reqAsPromise(db.transaction(STORE, 'readwrite').objectStore(STORE).put(item))
}

export async function dbDelete(id) {
  const db = await openDB()
  return reqAsPromise(db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id))
}
