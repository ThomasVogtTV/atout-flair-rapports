// Vignettes des photos : de petites images tirees une fois par photo, et
// gardees en memoire le temps qu'on reste dans le rapport.
//
// Les bandes de photos portaient chaque cliche en entier - 1280 px, en texte
// base64 - dans le HTML de l'ecran. Chaque tap (un statut, une piece repliee)
// redessinait l'ecran, recopiait ces megaoctets et redecodait les images pour
// des carres de 82 px ; et chaque vignette gardait en memoire une image pleine
// taille. Sur un rapport de trente photos, le telephone ramait.

// Assez pour un carre de 82 px net sur un ecran a trois pixels par point.
const COTE = 256
const VIDE = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

const cache = new Map() // cle de la photo -> adresse de la vignette
const enCours = new Map() // cle -> fabrication en cours

// Une photo annotee a nouveau change d'image sans changer d'identifiant : la
// cle suit donc aussi son contenu (longueur et fin du texte, sans le relire).
const cleDe = (p) => `${p.id}:${p.dataUrl.length}:${p.dataUrl.slice(-32)}`

/** L'image a poser tout de suite : la vignette si elle est prete, sinon un vide. */
export const srcVignette = (p) => (p?.dataUrl && cache.get(cleDe(p))) || VIDE

function fabriquer(dataUrl) {
  return new Promise((ok, ko) => {
    const img = new Image()
    img.onload = () => {
      // Recadrage "cover" : le petit cote fait COTE pixels.
      const s = Math.min(1, COTE / Math.min(img.naturalWidth, img.naturalHeight))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(img.naturalWidth * s))
      canvas.height = Math.max(1, Math.round(img.naturalHeight * s))
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((b) => (b ? ok(URL.createObjectURL(b)) : ko(new Error('Vignette impossible'))), 'image/jpeg', 0.8)
    }
    img.onerror = () => ko(new Error('Photo illisible'))
    img.src = dataUrl
  })
}

/**
 * Fabrique les vignettes qui manquent, une photo apres l'autre, et les pose
 * dans l'ecran des qu'elles sont pretes. Les suivantes s'affichent alors
 * directement, sans rien refabriquer.
 */
export async function chargerVignettes(photos, racine) {
  for (const p of photos ?? []) {
    if (!p?.dataUrl) continue
    const cle = cleDe(p)
    if (!cache.has(cle)) {
      if (!enCours.has(cle)) {
        enCours.set(
          cle,
          fabriquer(p.dataUrl)
            .catch(() => p.dataUrl) // au pire, l'image entiere, comme avant
            .then((url) => {
              cache.set(cle, url)
              enCours.delete(cle)
            })
        )
      }
      await enCours.get(cle)
    }
    // L'ecran a pu etre redessine pendant la fabrication : l'image se cherche
    // au dernier moment.
    const url = cache.get(cle)
    for (const img of racine.querySelectorAll(`img[data-vignette="${p.id}"]`)) {
      if (img.getAttribute('src') !== url) img.src = url
    }
  }
}

/** Libere les vignettes du rapport qu'on quitte. */
export function viderVignettes() {
  for (const url of cache.values()) if (url.startsWith('blob:')) URL.revokeObjectURL(url)
  cache.clear()
}
