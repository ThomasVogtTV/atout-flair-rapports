// Stockage des fichiers de la sauvegarde en ligne : Vercel Blob, en acces
// prive (aucun fichier n'est lisible par un lien public). Le jeton
// BLOB_READ_WRITE_TOKEN est pose par Vercel quand le stockage est branche au
// projet.
//
// Enveloppe mince autour de @vercel/blob : les tests la remplacent par une
// imitation en memoire, comme la base Redis (voir _brancherBase).

import { put, get, del, list } from '@vercel/blob'

let impl = { put, get, del, list }

/** Remplace le stockage par une imitation. Tests uniquement. */
export const _brancherStockage = (fausse) => {
  impl = fausse
}

export const stockageConfigure = () => !!process.env.BLOB_READ_WRITE_TOKEN

export async function ecrireFichier(chemin, contenu, type) {
  await impl.put(chemin, contenu, { access: 'private', allowOverwrite: true, addRandomSuffix: false, contentType: type })
}

/** @returns {Promise<{contenu: Buffer, type: string} | null>} */
export async function lireFichier(chemin) {
  const r = await impl.get(chemin, { access: 'private' })
  if (!r?.stream) return null
  return {
    contenu: Buffer.from(await new Response(r.stream).arrayBuffer()),
    type: r.blob?.contentType || 'application/octet-stream',
  }
}

export async function supprimerFichiers(chemins) {
  if (chemins.length) await impl.del(chemins)
}

/** Les chemins de tous les fichiers ranges sous un prefixe, page apres page. */
export async function listerFichiers(prefixe) {
  const chemins = []
  let cursor
  do {
    const page = await impl.list({ prefix: prefixe, cursor, limit: 1000 })
    chemins.push(...(page?.blobs ?? []).map((b) => b.pathname))
    cursor = page?.hasMore ? page.cursor : undefined
  } while (cursor)
  return chemins
}
