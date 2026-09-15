// Carnet commun de l'equipe. Chaque telephone y envoie ce qu'il a cree,
// modifie ou supprime, et recoit en retour le carnet complet - sauf s'il n'a
// rien envoye et connait deja la derniere version : il n'a alors rien a
// recevoir, et la plupart des passages s'arretent la.
//
//   GET  [?v=<version connue>]
//   POST { contacts, supprimes, version }
//   -> { contacts, version }, ou { inchange, version } si le telephone est a jour
//
// Ouvert a l'administrateur et aux employes. Les invites (sous-traitants,
// interimaires) recoivent un 403 : ils n'ont pas a emporter la liste des
// clients de l'entreprise.

import { identifierRequete, TropDEssais, baseConfiguree, lireCarnet, ecrireCarnet, versionCarnet } from './_lib/equipe.js'
import { fusionnerCarnet, contactsVivants } from './_lib/carnet.js'
import { signalerServeur } from './_lib/incidents.js'

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
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
  if (ident.role === 'invite') return res.status(403).json({ error: 'Le carnet n’est pas partagé avec les invités.' })
  if (!baseConfiguree()) return res.status(503).json({ error: 'Base de données non configurée', base: false })

  try {
    const { contacts, supprimes, version: connue } = req.method === 'POST' ? (req.body ?? {}) : { version: req.query?.v }
    const envoie = (Array.isArray(contacts) && contacts.length > 0) || (Array.isArray(supprimes) && supprimes.length > 0)

    // La version se lit avant le carnet : une ecriture qui passerait entre les
    // deux donnerait au pire un carnet plus neuf que sa version, que le
    // telephone relira la fois suivante - jamais l'inverse. Pour la meme raison,
    // apres une ecriture, c'est la version d'avant qui repart.
    const version = await versionCarnet()
    if (!envoie && Number(connue) === version) return res.status(200).json({ inchange: true, version })

    const carnet = await lireCarnet()
    if (req.method === 'POST') {
      // Seul l'administrateur retire un client du carnet de l'equipe : un employe
      // ajoute et corrige, mais ne fait pas disparaitre une fiche pour tous. Sa
      // suppression est ignoree, et la fiche lui revient au passage suivant.
      await ecrireCarnet(fusionnerCarnet(carnet, contacts, ident.role === 'admin' ? supprimes : [], Date.now()))
    }
    return res.status(200).json({ contacts: contactsVivants(carnet), version })
  } catch (err) {
    console.error('Carnet', err)
    await signalerServeur('carnet', err)
    return res.status(500).json({ error: 'Erreur de la base de données' })
  }
}
