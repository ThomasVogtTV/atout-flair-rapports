// Le suivi, sur le telephone d'un invite, des rapports qu'il a transmis a
// l'administrateur (voir api/send.js) : envoye au client une fois relu, ou
// refuse - et le rapport revient alors en cours de saisie, avec le motif.
//
// Le telephone demande ; rien ne le previent. D'ou un passage a l'ouverture, au
// retour du reseau et en revenant a l'accueil.

import * as db from './db.js'
import * as S from './state.js'

// Le code d'acces, lu la ou mailer.js le range (voir sauvegarde.js).
const currentCode = () => localStorage.getItem('af-code') ?? ''

/**
 * Applique aux rapports du telephone les decisions de l'administrateur.
 * @returns {Promise<{ref: string, statut: 'envoye'|'refuse', motif: string}[]>} ce qui a change
 */
export async function suivreValidations() {
  if (!navigator.onLine || !currentCode()) return []
  const res = await fetch('/api/send', { headers: { 'x-app-code': currentCode() } })
  if (!res.ok) return []
  const { validations = [] } = await res.json().catch(() => ({}))

  const changes = []
  for (const v of validations) {
    if (v.statut !== 'envoye' && v.statut !== 'refuse') continue
    const r = await db.get('reports', v.rapportId)
    // Deja applique, ou retransmis depuis : la reponse a une ancienne demande
    // ne doit pas defaire la nouvelle.
    if (!r || r.status !== 'validation' || r.validationId !== v.id) continue
    if (v.statut === 'envoye') {
      r.status = 'sent'
      r.sentAt = v.traite ?? Date.now()
    } else {
      r.status = 'draft'
      r.sentAt = null
      r.refus = { motif: v.motif ?? '', date: v.traite ?? Date.now() }
    }
    delete r.validationId
    await S.ecrireRapport(r)
    changes.push({ ref: r.ref ?? '', statut: v.statut, motif: v.motif ?? '' })
  }
  return changes
}
