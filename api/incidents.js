// Les incidents techniques (voir api/_lib/incidents.js).
//
// POST {message, source, pile, app, version, ecran, appareil}
//      depuis n'importe quel appareil : une erreur peut survenir avant meme le
//      code d'acces. Freine par adresse de reseau ; le code, s'il est la, dit
//      seulement qui l'a eue.
// GET                               la liste, pour l'administrateur
// POST {action: 'regler', sig}      l'incident est traite, il s'efface
// POST {action: 'tout-regler'}

import { identifier, identifierRequete, TropDEssais, baseConfiguree } from './_lib/equipe.js'
import {
  noterIncident,
  lireIncidents,
  reglerIncident,
  reglerTousIncidents,
  freinerSignalements,
  TropDeSignalements,
} from './_lib/incidents.js'

const SIG_OK = /^[0-9a-f]{16}$/

export default async function handler(req, res) {
  if (!baseConfiguree()) return res.status(503).json({ error: 'Base de données non configurée', base: false })
  const { action, sig } = req.body ?? {}
  try {
    if (req.method === 'POST' && !action) return await signaler(req, res)

    let ident = null
    try {
      ident = await identifierRequete(req)
    } catch (err) {
      if (err instanceof TropDEssais) return res.status(429).json({ error: err.message })
      return res.status(503).json({ error: 'Base de données injoignable' })
    }
    if (!ident) {
      await new Promise((ok) => setTimeout(ok, 500))
      return res.status(401).json({ error: "Code d'accès invalide" })
    }
    if (ident.role !== 'admin') return res.status(403).json({ error: 'Réservé à l’administrateur' })

    if (req.method === 'GET') return res.status(200).json({ incidents: await lireIncidents() })
    if (req.method === 'POST') {
      if (action === 'regler') {
        if (!SIG_OK.test(String(sig ?? ''))) return res.status(400).json({ error: 'Incident invalide' })
        await reglerIncident(String(sig))
        return res.status(200).json({ ok: true })
      }
      if (action === 'tout-regler') {
        await reglerTousIncidents()
        return res.status(200).json({ ok: true })
      }
      return res.status(400).json({ error: 'Action inconnue' })
    }
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Méthode non autorisée' })
  } catch (err) {
    console.error('Incidents', err)
    return res.status(500).json({ error: 'Erreur de la base de données' })
  }
}

async function signaler(req, res) {
  try {
    await freinerSignalements(req)
  } catch (err) {
    if (err instanceof TropDeSignalements) return res.status(429).json({ error: 'Trop de signalements depuis ce réseau' })
    throw err
  }
  // Le code n'est pas exige, et la reponse ne change pas selon qu'il est bon ou
  // non : cette adresse ne peut pas servir a essayer des codes.
  const ident = await identifier(req.headers?.['x-app-code']).catch(() => null)
  const note = await noterIncident(req.body, { qui: ident?.nom ?? null })
  return note ? res.status(200).json({ ok: true }) : res.status(400).json({ error: 'Incident vide' })
}
