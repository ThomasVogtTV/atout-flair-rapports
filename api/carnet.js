// Carnet commun de l'equipe. Chaque telephone y envoie ce qu'il a cree,
// modifie ou supprime, et recoit en retour le carnet complet.
//
// Ouvert a l'administrateur et aux employes. Les invites (sous-traitants,
// interimaires) recoivent un 403 : ils n'ont pas a emporter la liste des
// clients de l'entreprise.

import { identifier, baseConfiguree, lireCarnet, ecrireCarnet } from './_lib/equipe.js'
import { fusionnerCarnet, contactsVivants } from './_lib/carnet.js'

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Méthode non autorisée' })
  }

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
  if (ident.role === 'invite') return res.status(403).json({ error: 'Le carnet n’est pas partagé avec les invités.' })
  if (!baseConfiguree()) return res.status(503).json({ error: 'Base de données non configurée', base: false })

  try {
    const carnet = await lireCarnet()
    if (req.method === 'POST') {
      const { contacts, supprimes } = req.body ?? {}
      // Seul l'administrateur retire un client du carnet de l'equipe : un employe
      // ajoute et corrige, mais ne fait pas disparaitre une fiche pour tous. Sa
      // suppression est ignoree, et la fiche lui revient au passage suivant.
      await ecrireCarnet(fusionnerCarnet(carnet, contacts, ident.role === 'admin' ? supprimes : [], Date.now()))
    }
    return res.status(200).json({ contacts: contactsVivants(carnet) })
  } catch (err) {
    console.error('Carnet', err)
    return res.status(500).json({ error: 'Erreur de la base de données' })
  }
}
