// Les incidents techniques, vus de l'appareil : une erreur que personne n'a
// prevue part au serveur, pour que l'administrateur la voie dans le Bureau sans
// attendre qu'on la lui raconte (voir api/_lib/incidents.js).
//
// Ne partent pas :
//   - ce que le reseau explique (hors ligne, requete coupee) ;
//   - ce qu'ajoutent le navigateur ou une extension (un fichier d'une autre
//     adresse, "Script error." sans detail) ;
//   - une meme erreur plus d'une fois par ouverture, ni plus de dix en tout.
// Hors ligne, l'incident attend sur l'appareil et part au retour du reseau.
//
// Aucune dependance : state.js s'en sert, et les tests le chargent sous Node.

const EN_ATTENTE = 'af-incidents-attente'
const PAR_OUVERTURE = 10
const ATTENTE_MAX = 10

const BRUIT = /Failed to fetch|NetworkError|Load failed|ResizeObserver loop|^Script error\.?$|AbortError|aborted/i

let app = 'terrain'
let codeActuel = () => ''
const deja = new Set()
let envoyes = 0

const dansNavigateur = () => typeof window !== 'undefined' && typeof navigator !== 'undefined'

// Le script d'entree qui tourne : la version de l'app, telle que Vite l'a nommee.
const version = () =>
  document.querySelector('script[type="module"][src^="/assets/"]')?.getAttribute('src')?.replace('/assets/', '') ?? 'dev'

function decrire(err, source = '') {
  const texte = String(err?.message ?? err ?? '').trim()
  const nom = err?.name && err.name !== 'Error' && !texte.startsWith(err.name) ? `${err.name} : ` : ''
  return {
    app,
    message: `${nom}${texte}`.slice(0, 300),
    source,
    pile: String(err?.stack ?? '').slice(0, 2000),
    version: version(),
    ecran: document.body?.dataset.screen ?? '',
    appareil: navigator.userAgent.slice(0, 160),
  }
}

const estBruit = (i, err) => !i.message || BRUIT.test(i.message) || (!navigator.onLine && err instanceof TypeError)

function garder(i) {
  try {
    const liste = JSON.parse(localStorage.getItem(EN_ATTENTE) || '[]')
    liste.push(i)
    localStorage.setItem(EN_ATTENTE, JSON.stringify(liste.slice(-ATTENTE_MAX)))
  } catch {
    // Stockage indisponible : l'incident est perdu, l'app continue.
  }
}

async function poster(i) {
  try {
    const code = codeActuel()
    const res = await fetch('/api/incidents', {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', ...(code ? { 'x-app-code': code } : {}) },
      body: JSON.stringify(i),
    })
    // Serveur en panne : l'incident reessaiera. Refuse ou freine : il s'arrete la.
    if (res.status >= 500 && res.status !== 503) garder(i)
  } catch {
    garder(i)
  }
}

function envoyer(i) {
  const cle = `${i.message}|${i.pile.split('\n')[1] ?? ''}`
  if (deja.has(cle) || envoyes >= PAR_OUVERTURE) return
  deja.add(cle)
  envoyes++
  if (!navigator.onLine) return garder(i)
  poster(i)
}

async function relancer() {
  let liste = []
  try {
    liste = JSON.parse(localStorage.getItem(EN_ATTENTE) || '[]')
    localStorage.removeItem(EN_ATTENTE)
  } catch {
    return
  }
  for (const i of liste) await poster(i)
}

/**
 * Une erreur attrapee, mais anormale : le geste a echoue pour une raison que
 * l'app ne sait pas expliquer. `contexte` dit ce qu'on etait en train de faire.
 */
export function signaler(err, contexte = '') {
  if (!dansNavigateur()) return
  try {
    const i = decrire(err)
    if (estBruit(i, err)) return
    if (contexte) i.message = `${contexte} : ${i.message}`.slice(0, 300)
    envoyer(i)
  } catch {
    // Signaler ne doit jamais casser ce qui signale.
  }
}

/**
 * A poser une fois, au demarrage de l'app.
 * @param {'terrain'|'bureau'} nom
 * @param {{code: () => string}} o le code d'acces de l'appareil, quand il y en a un
 */
export function installerIncidents(nom, { code } = {}) {
  app = nom
  if (code) codeActuel = code
  window.addEventListener('error', (ev) => {
    // Une image ou un script qui ne charge pas : pas une erreur du code.
    if (!ev.error && !ev.message) return
    // Le code d'une extension ou d'une autre adresse : pas le notre.
    if (ev.filename && !ev.filename.startsWith(location.origin)) return
    const err = ev.error ?? { message: ev.message }
    const source = ev.filename ? `${ev.filename.replace(location.origin, '')}:${ev.lineno}:${ev.colno}` : ''
    const i = decrire(err, source)
    if (!estBruit(i, err)) envoyer(i)
  })
  window.addEventListener('unhandledrejection', (ev) => {
    const i = decrire(ev.reason)
    if (!estBruit(i, ev.reason)) envoyer(i)
  })
  window.addEventListener('online', relancer)
  if (navigator.onLine) setTimeout(relancer, 5000)
}

/** Les incidents de l'equipe, pour le Bureau. */
export async function appelIncidents(methode, corps) {
  const res = await fetch('/api/incidents', {
    method: methode,
    headers: { 'x-app-code': codeActuel(), ...(corps ? { 'Content-Type': 'application/json' } : {}) },
    body: corps ? JSON.stringify(corps) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`)
  return data
}
