// Service worker : l'app doit demarrer sans reseau (cave, sous-sol, hotel sans wifi).
// Strategie : network-first pour la navigation (pour recuperer les mises a jour),
// cache-first pour les assets.

const CACHE = 'atout-flair-v8'
const SHELL = ['/', '/index.html', '/logo.jpg', '/logo-complet.png', '/hero-dog.webp', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

// Les fichiers d'assets sont hashes par Vite (nouveau nom de fichier a chaque
// build). Sans nettoyage, chaque mise a jour de l'app empile une version de
// plus dans le cache pour toujours - on ne garde que ceux references par le
// index.html actuel.
async function pruneStaleAssets() {
  try {
    const res = await fetch('/index.html', { cache: 'no-store' })
    const html = await res.text()
    const current = new Set(Array.from(html.matchAll(/\/assets\/[\w.-]+/g), (m) => m[0]))
    // Le moteur PDF est charge a la demande : son nom de fichier n'apparait pas
    // dans index.html mais dans un import() du script principal, en chemin
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

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== location.origin) return
  if (url.pathname.startsWith('/api/')) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          caches.open(CACHE).then((c) => c.put('/index.html', res.clone()))
          return res
        })
        .catch(() => caches.match('/index.html'))
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
