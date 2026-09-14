// Fonction serveur (Vercel) : dit si un code d'acces est valable, et a qui il
// appartient, sans rien envoyer. Sert au verrou de l'app : a la premiere
// ouverture sur un appareil, puis a chaque ouverture avec du reseau, pour qu'un
// code revoque cesse de fonctionner (voir src/lock.js). Chaque appel note
// l'activite de la personne dans l'onglet Administration.

import { identifierRequete, TropDEssais, noterActivite, pourquoiRefuse } from './_lib/equipe.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Méthode non autorisée' })
  }
  if (!process.env.APP_CODE) {
    return res.status(503).json({ error: "Code d'accès non configuré" })
  }
  let ident = null
  try {
    ident = await identifierRequete(req)
  } catch (err) {
    if (err instanceof TropDEssais) return res.status(429).json({ error: err.message })
    // Base injoignable : ce n'est pas un mauvais code, on ne le traite pas comme tel.
    console.error('Identification impossible', err)
    return res.status(503).json({ error: 'Vérification impossible pour le moment' })
  }
  if (!ident) {
    // Une demi-seconde par essai rate : sans effet sur quelqu'un qui se trompe
    // une fois, mais un essai en boucle de noms et de dates devient tres lent.
    await new Promise((r) => setTimeout(r, 500))
    const motif = await pourquoiRefuse(req.headers['x-app-code']).catch(() => null)
    return res.status(401).json({ error: motif || "Code d'accès invalide" })
  }
  await noterActivite(ident).catch((err) => console.error('Activité non notée', err))
  return res.status(200).json({ role: ident.role, nom: ident.nom, ...(ident.id ? { id: ident.id } : {}), ...(ident.fin ? { fin: ident.fin } : {}) })
}
