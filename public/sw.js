// Service worker : l'app doit demarrer sans reseau (cave, sous-sol, hotel sans wifi).
// Strategie : network-first pour la navigation (pour recuperer les mises a jour),
// cache-first pour les assets.

const CACHE = 'atout-flair-v4'
const SHELL = ['/', '/index.html', '/logo.jpg', '/hero-dog.jpg', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png']

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
