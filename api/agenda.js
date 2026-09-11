// Agenda de l'equipe : les rendez-vous, gardes en ligne pour que chacun voie
// les siens et ceux des collegues. Voir _lib/agenda.js pour qui voit quoi.
//
//   GET                                  -> { moi, role, rdvs }
//   POST { action: 'enregistrer', rdv }  -> cree ou modifie
//   POST { action: 'commencer', id, rapportId } -> le rapport est lance
//   POST { action: 'supprimer', id }

import { identifier, baseConfiguree, lireAgenda, ecrireAgenda, retirerDeAgenda } from './_lib/equipe.js'
import { nettoyerRdv, visiblesPour, peutModifier, personne, jourSuisse, trierParDate, idValable } from './_lib/agenda.js'

// Au-dela, un rendez-vous passe n'a plus rien a dire sur un telephone.
const PASSES_GARDES = 60 * 86_400_000

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
  if (!baseConfiguree()) return res.status(503).json({ error: 'Base de données non configurée', base: false })

  try {
    const agenda = await lireAgenda()

    if (req.method === 'POST') {
      const { action, rdv: brut, id, rapportId } = req.body ?? {}

      if (action === 'enregistrer') {
        if (ident.role === 'invite') return res.status(403).json({ error: 'Un invité ne peut pas modifier l’agenda.' })
        const rdv = nettoyerRdv(brut, Date.now())
        if (!rdv) return res.status(400).json({ error: 'Rendez-vous incomplet : il faut une date et un client.' })
        const existant = agenda.get(rdv.id)
        if (existant && !peutModifier(ident, existant)) {
          return res.status(403).json({ error: 'Ce rendez-vous est celui d’un collègue.' })
        }
        // Seul l'administrateur attribue un rendez-vous a quelqu'un d'autre.
        if (ident.role !== 'admin' || !rdv.pour) rdv.pour = personne(ident)
        rdv.par = existant?.par ?? personne(ident)
        rdv.cree = existant?.cree ?? Date.now()
        rdv.rapportId = rdv.rapportId ?? existant?.rapportId ?? null
        await ecrireAgenda([rdv])
        return res.status(200).json({ rdv })
      }

      if (action === 'commencer') {
        const rdv = agenda.get(String(id ?? ''))
        if (!rdv || !visiblesPour(ident, [rdv]).length) return res.status(404).json({ error: 'Rendez-vous introuvable' })
        if (!idValable(rapportId)) return res.status(400).json({ error: 'Rapport invalide' })
        rdv.rapportId = rapportId
        rdv.maj = Date.now()
        await ecrireAgenda([rdv])
        return res.status(200).json({ rdv })
      }

      if (action === 'supprimer') {
        const rdv = agenda.get(String(id ?? ''))
        if (!rdv) return res.status(200).json({ ok: true })
        if (!peutModifier(ident, rdv)) return res.status(403).json({ error: 'Ce rendez-vous est celui d’un collègue.' })
        await retirerDeAgenda(rdv.id)
        return res.status(200).json({ ok: true })
      }

      return res.status(400).json({ error: 'Action inconnue' })
    }

    const depuis = jourSuisse(Date.now() - PASSES_GARDES)
    const rdvs = trierParDate(visiblesPour(ident, [...agenda.values()]).filter((r) => r.date >= depuis))
    return res.status(200).json({ moi: personne(ident), role: ident.role, rdvs })
  } catch (err) {
    console.error('Agenda', err)
    return res.status(500).json({ error: 'Erreur de la base de données' })
  }
}
