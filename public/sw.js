// Service worker : l'app doit demarrer sans reseau (cave, sous-sol, hotel sans wifi).
// Strategie : network-first pour la navigation (pour recuperer les mises a jour),
// cache-first pour les assets.
//
// Il sert les deux applis de la maison, a la meme adresse : Terrain (/) et le
// Bureau (/bureau/). Chacune garde sa propre page d'entree en cache - une
// navigation vers l'une ne doit jamais remplacer la page de l'autre.

const CACHE = 'atout-flair-v18'
const PAGES = ['/index.html', '/bureau/index.html']
const SHELL = [
  '/',
  '/bureau/',
  ...PAGES,
  '/logo.jpg',
  '/hero-dog.webp',
  '/manifest.webmanifest',
  '/bureau/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

// Les fichiers d'assets sont hashes par Vite (nouveau nom de fichier a chaque
// build). Sans nettoyage, chaque mise a jour de l'app empile une version de
// plus dans le cache pour toujours - on ne garde que ceux references par les
// pages d'entree actuelles.
async function pruneStaleAssets() {
  try {
    const current = new Set()
    for (const page of PAGES) {
      const res = await fetch(page, { cache: 'no-store' })
      // Une page illisible : on ne sait pas ce qu'elle reference, donc on ne
      // nettoie rien du tout plutot que de casser le hors ligne.
      if (!res.ok) return
      const html = await res.text()
      for (const m of html.matchAll(/\/assets\/[\w.-]+/g)) current.add(m[0])
    }
    // Le moteur PDF est charge a la demande : son nom de fichier n'apparait pas
    // dans les pages mais dans un import() du script principal, en chemin
    // relatif. Sans cette passe, il serait efface du cache a chaque activation,
    // et le PDF deviendrait impossible hors ligne.
    for (const path of Array.from(current).filter((p) => p.endsWith('.js'))) {
      try {
        const js = await (await fetch(path, { cache: 'no-store' })).text()
        const base = new URL(path, location.origin)
        for (const m of js.matchAll(/import\(\s*["']([^"']+\.js)["']\s*\)/g)) {
          current.add(new URL(m[1], base).pathname)
        }
      } catch {
        // Ce script n'a pas pu etre relu : on ne sait pas ce qu'il reference,
        // donc on ne nettoie rien du tout plutot que de casser le hors ligne.
        return
      }
    }
    // Les polices de la maison sont appelees par la feuille de style, pas par
    // les pages : sans cette passe, elles seraient effacees du cache a chaque
    // mise a jour, et l'app retomberait sur les polices du systeme hors ligne.
    for (const path of Array.from(current).filter((p) => p.endsWith('.css'))) {
      try {
        const css = await (await fetch(path, { cache: 'no-store' })).text()
        const base = new URL(path, location.origin)
        for (const m of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
          if (m[1].startsWith('data:')) continue
          current.add(new URL(m[1], base).pathname)
        }
      } catch {
        return
      }
    }
    const cache = await caches.open(CACHE)
    const reqs = await cache.keys()
    await Promise.all(
      reqs
        .filter((r) => new URL(r.url).pathname.startsWith('/assets/') && !current.has(new URL(r.url).pathname))
        .map((r) => cache.delete(r))
    )
  } catch {
    // Hors ligne au moment de l'activation : rien a nettoyer, le cache actuel reste valable.
  }
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(pruneStaleAssets)
      .then(() => self.clients.claim())
  )
})

// La page d'entree de l'app vers laquelle on navigue. La declaration de
// confidentialite n'est pas une appli : elle passe par le reseau, sans jamais
// prendre en cache la place de la page de Terrain.
const pageDe = (url) =>
  url.pathname === '/bureau' || url.pathname.startsWith('/bureau/')
    ? '/bureau/index.html'
    : url.pathname === '/confidentialite' || url.pathname.startsWith('/confidentialite/')
      ? null
      : '/index.html'

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== location.origin) return
  // L'app qui regarde si une nouvelle version est en ligne (src/mise-a-jour.js) :
  // la reponse doit venir du reseau, jamais du cache.
  if (url.pathname.startsWith('/api/') || url.searchParams.has('verif')) return

  if (request.mode === 'navigate') {
    const page = pageDe(url)
    if (!page) return
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copie = res.clone()
            caches.open(CACHE).then((c) => c.put(page, copie))
          }
          return res
        })
        .catch(() => caches.match(page))
    )
    return
  }

  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ??
        fetch(request).then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(request, copy))
          }
          return res
        })
    )
  )
})
