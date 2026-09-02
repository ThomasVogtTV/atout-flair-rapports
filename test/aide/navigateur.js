// Doublures des objets de navigateur dont l'app a besoin pour tourner sous Node.
//
// Rien de generique : uniquement ce que src/db.js, src/state.js et src/pdf.js
// appellent reellement. Une doublure qui en ferait plus mentirait sur ce que
// l'app exige vraiment de son navigateur.
//
// Ce module s'installe a l'import. Il doit donc etre importe AVANT tout module
// de src/ - l'ordre des imports d'un fichier est l'ordre de leur evaluation.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const pose = (nom, valeur) =>
  Object.defineProperty(globalThis, nom, { value: valeur, configurable: true, writable: true })

// --- localStorage ----------------------------------------------------------

const memoire = new Map()

pose('localStorage', {
  getItem: (cle) => (memoire.has(cle) ? memoire.get(cle) : null),
  setItem: (cle, valeur) => void memoire.set(cle, String(valeur)),
  removeItem: (cle) => void memoire.delete(cle),
  clear: () => memoire.clear(),
  get length() {
    return memoire.size
  },
})

/** Efface le seul localStorage, en laissant la base intacte. */
export const videLeLocalStorage = () => memoire.clear()

// --- IndexedDB -------------------------------------------------------------

// Une base = des magasins, un magasin = une Map id -> valeur clonee. Le clonage
// n'est pas un detail : c'est lui qui distingue une valeur enregistrable d'un
// objet que la vraie base refuserait (une fonction, un noeud DOM...).

const bases = new Map()

// Quand il est pose, toute ecriture est refusee comme sur un appareil plein.
let refusEcriture = null

/**
 * Fait refuser les prochaines ecritures, pour eprouver ce que l'app en dit.
 * @param {'plein'|'autre'|null} motif
 */
export function refuseLesEcritures(motif = 'plein') {
  refusEcriture = motif
}

class Requete {
  constructor(result) {
    this.result = result
    this.error = null
    this.onsuccess = null
    this.onerror = null
  }
}

class Magasin {
  #donnees
  #transaction

  constructor(donnees, transaction) {
    this.#donnees = donnees
    this.#transaction = transaction
  }

  #avantEcriture() {
    if (this.#transaction.mode !== 'readwrite') {
      throw new DOMException('The transaction is read-only.', 'ReadOnlyError')
    }
    if (refusEcriture === 'plein') {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
    }
    if (refusEcriture) {
      throw new DOMException('Unknown transaction error.', 'UnknownError')
    }
  }

  // Une vraie base refuse tout de suite ce qui ne se clone pas : l'erreur part
  // de l'appel, pas d'un evenement plus tard.
  put(valeur) {
    this.#avantEcriture()
    const copie = structuredClone(valeur)
    this.#donnees.set(copie.id, copie)
    return new Requete(copie.id)
  }

  get(id) {
    const v = this.#donnees.get(id)
    return new Requete(v === undefined ? undefined : structuredClone(v))
  }

  delete(id) {
    this.#avantEcriture()
    this.#donnees.delete(id)
    return new Requete(undefined)
  }

  getAll() {
    return new Requete([...this.#donnees.values()].map((v) => structuredClone(v)))
  }
}

class Transaction {
  #magasin

  constructor(base, nomMagasin, mode) {
    this.mode = mode
    this.error = null
    this.oncomplete = null
    this.onerror = null
    this.onabort = null
    if (!base.magasins.has(nomMagasin)) {
      throw new DOMException(`No object store named ${nomMagasin}.`, 'NotFoundError')
    }
    this.#magasin = new Magasin(base.magasins.get(nomMagasin), this)
    // Une transaction se conclut au tour de boucle suivant : l'appelant a alors
    // pose ses requetes ET branche son `oncomplete`, exactement comme le fait
    // src/db.js.
    setTimeout(() => this.oncomplete?.({ target: this }), 0)
  }

  objectStore() {
    return this.#magasin
  }
}

pose('indexedDB', {
  open(nom, version) {
    const req = { result: null, error: null, onupgradeneeded: null, onsuccess: null, onerror: null }
    setTimeout(() => {
      let base = bases.get(nom)
      if (!base) {
        base = { nom, version: 0, magasins: new Map() }
        bases.set(nom, base)
      }
      const enveloppe = {
        name: nom,
        get version() {
          return base.version
        },
        objectStoreNames: { contains: (n) => base.magasins.has(n) },
        createObjectStore: (n) => {
          base.magasins.set(n, new Map())
          return {}
        },
        transaction: (n, mode = 'readonly') => new Transaction(base, n, mode),
      }
      req.result = enveloppe
      if (version > base.version) {
        const ancienne = base.version
        base.version = version
        req.onupgradeneeded?.({ target: req, oldVersion: ancienne, newVersion: version })
      }
      req.onsuccess?.({ target: req })
    }, 0)
    return req
  },
})

/**
 * Remet l'appareil a neuf entre deux tests : magasins vides, localStorage vide,
 * ecritures a nouveau acceptees.
 *
 * Les magasins sont vides sur place plutot que recrees : src/db.js garde son
 * enveloppe de base en cache pour toute la duree du processus.
 */
export function remetAneuf() {
  for (const base of bases.values()) for (const magasin of base.magasins.values()) magasin.clear()
  memoire.clear()
  refusEcriture = null
}

/** Ce que la base contient reellement, sans passer par src/db.js. */
export function contenu(magasin, nomBase = 'atout-flair') {
  const m = bases.get(nomBase)?.magasins.get(magasin)
  return m ? [...m.values()].map((v) => structuredClone(v)) : []
}

// --- navigator.storage -----------------------------------------------------

let placeSimulee = { usage: 7_000_000, quota: 110_000_000_000 }

/** Regle ce que `navigator.storage.estimate()` repondra. `null` : rien. */
export function poseLaPlace(place) {
  placeSimulee = place
}

pose('navigator', {
  onLine: true,
  storage: {
    estimate: async () => {
      if (!placeSimulee) throw new Error('estimate indisponible')
      return { ...placeSimulee }
    },
    persist: async () => true,
    persisted: async () => true,
  },
})

// --- location et fetch, pour le logo du PDF --------------------------------

pose('location', { href: 'https://atout-flair-rapports.vercel.app/', protocol: 'https:' })

const racine = new URL('../../', import.meta.url)

// Le seul appel reseau de l'app est le logo de l'en-tete. On sert le vrai
// fichier depuis public/ : un PDF teste avec un faux logo ne dirait rien de
// celui qu'on remet au client.
pose('fetch', async (entree) => {
  const url = new URL(entree)
  const chemin = fileURLToPath(new URL(`public${url.pathname}`, racine))
  const octets = readFileSync(chemin)
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.byteLength),
  }
})
