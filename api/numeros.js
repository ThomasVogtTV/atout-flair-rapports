// Numeros de rapport : un lot de numeros reserve pour le telephone qui le
// demande. Ouvert a tous ceux qui ont un code valable - un invite fait aussi
// des rapports, et ses numeros doivent aussi etre uniques.

import { identifierRequete, TropDEssais, baseConfiguree, reserverNumeros } from './_lib/equipe.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Méthode non autorisée' })
  }

  let ident = null
  try {
    ident = await identifierRequete(req)
  } catch (err) {
    if (err instanceof TropDEssais) return res.status(429).json({ error: err.message })
    console.error('Identification impossible', err)
    return res.status(503).json({ error: 'Base de données injoignable' })
  }
  if (!ident) {
    await new Promise((r) => setTimeout(r, 500))
    return res.status(401).json({ error: "Code d'accès invalide" })
  }
  if (!baseConfiguree()) return res.status(503).json({ error: 'Base de données non configurée', base: false })

  try {
    return res.status(200).json(await reserverNumeros(req.body?.plusHaut))
  } catch (err) {
    console.error('Numeros', err)
    return res.status(500).json({ error: 'Erreur de la base de données' })
  }
}
