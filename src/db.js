// Petit wrapper IndexedDB (aucune dependance). Trois magasins :
//   reports  : les rapports, brouillons compris
//   contacts : carnet d'adresses des mandants / regies
//   queue    : envois en attente de reseau

const DB_NAME = 'atout-flair'
const DB_VERSION = 1
const STORES = ['reports', 'contacts', 'queue']

let dbPromise = null

function open() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function tx(store, mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(store, mode)
        const req = fn(t.objectStore(store))
        t.oncomplete = () => resolve(req?.result)
        t.onerror = () => reject(t.error)
        t.onabort = () => reject(t.error)
      })
  )
}

export const put = (store, value) => tx(store, 'readwrite', (s) => s.put(value))
export const get = (store, id) => tx(store, 'readonly', (s) => s.get(id))
export const del = (store, id) => tx(store, 'readwrite', (s) => s.delete(id))
export const all = (store) => tx(store, 'readonly', (s) => s.getAll())
