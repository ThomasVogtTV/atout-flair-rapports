// Onglet Administration : l'equipe et le journal des envois. Reserve au code
// administrateur (APP_CODE) - un employe recoit un 403, meme avec un code valide.

import {
  identifier,
  baseConfiguree,
  listerEmployes,
  lireJournal,
  creerEmploye,
  nouveauCode,
  changerStatut,
  supprimerEmploye,
  Erreur400,
} from './_lib/equipe.js'

export default async function handler(req, res) {
  let ident = null
  try {
    ident = await identifier(req.headers['x-app-code'])
  } catch (err) {
    console.error('Identification impossible', err)
    return res.status(503).json({ error: 'Base de données injoignable' })
  }
  if (!ident) {
    await new Promise((r) => setTimeout(r, 500))
    return res.status(401).json({ error: "Code d'accès invalide" })
  }
  if (ident.role !== 'admin') return res.status(403).json({ error: 'Réservé à l’administrateur' })
  if (!baseConfiguree()) return res.status(503).json({ error: 'Base de données non configurée', base: false })

  try {
    if (req.method === 'GET') {
      const [equipe, journal] = await Promise.all([listerEmployes(), lireJournal(300)])
      return res.status(200).json({ base: true, ...equipe, journal })
    }
    if (req.method === 'POST') {
      const { action, id, nom } = req.body ?? {}
      if (action === 'creer') return res.status(200).json(await creerEmploye(nom))
      if (action === 'nouveau-code') return res.status(200).json(await nouveauCode(id))
      if (action === 'revoquer' || action === 'reactiver') {
        await changerStatut(id, action === 'reactiver')
        return res.status(200).json({ ok: true })
      }
      if (action === 'supprimer') {
        await supprimerEmploye(id)
        return res.status(200).json({ ok: true })
      }
      return res.status(400).json({ error: 'Action inconnue' })
    }
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Méthode non autorisée' })
  } catch (err) {
    if (err instanceof Erreur400) return res.status(400).json({ error: err.message })
    console.error('Administration', err)
    return res.status(500).json({ error: 'Erreur de la base de données' })
  }
}
