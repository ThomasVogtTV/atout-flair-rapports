// Carnet commun : la copie du telephone se synchronise avec le carnet de
// l'equipe, garde en ligne (voir api/carnet.js).
//
// Hors ligne, on travaille sur la copie locale comme avant. Chaque fiche creee
// ou modifiee porte `aEnvoyer`, chaque suppression attend dans une petite liste
// (voir state.js) ; tout part au prochain passage avec du reseau, et le
// telephone reprend alors le carnet complet de l'equipe.
//
// Les invites ne synchronisent jamais : le serveur les refuse de toute facon.

import * as db from './db.js'
import * as S from './state.js'
import { currentCode } from './mailer.js'
import { identite } from './lock.js'

export const carnetPartage = () => ['admin', 'employe'].includes(identite()?.role)

let enCours = null
let encore = false

/** @returns {Promise<boolean>} vrai si le carnet local vient d'etre remis a jour */
export function synchroniserCarnet() {
  if (!navigator.onLine || !currentCode() || !carnetPartage()) return Promise.resolve(false)
  // Un changement arrive pendant l'aller-retour : un second passage suivra.
  if (enCours) {
    encore = true
    return enCours
  }
  enCours = passe()
    .catch((err) => {
      console.error('Synchronisation du carnet impossible', err)
      return false
    })
    .finally(() => {
      enCours = null
      if (encore) {
        encore = false
        synchroniserCarnet()
      }
    })
  return enCours
}

async function passe() {
  const debut = Date.now()
  // Une fiche sans date vient d'avant le carnet commun : elle n'a jamais ete
  // envoyee, et doit partir - sinon elle disparaitrait du telephone.
  const aEnvoyer = (c) => c.aEnvoyer || !c.maj
  const contacts = (await db.all('contacts')).filter(aEnvoyer).map(({ aEnvoyer: _, ...c }) => c)
  const supprimes = S.suppressionsEnAttente()

  const res = await fetch('/api/carnet', {
    method: 'POST',
    headers: { 'x-app-code': currentCode(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ contacts, supprimes }),
  })
  if (!res.ok) return false
  const { contacts: equipe } = await res.json()
  if (!Array.isArray(equipe)) return false

  // Ce qui a change sur le telephone pendant l'aller-retour n'est pas ecrase :
  // il partira au passage suivant.
  const apres = await db.all('contacts')
  const touches = new Set(apres.filter((c) => c.aEnvoyer && (c.maj ?? 0) >= debut).map((c) => c.id))
  const supprApres = S.suppressionsEnAttente().filter((id) => !supprimes.includes(id))
  const ids = new Set(equipe.map((c) => c.id))

  for (const c of apres) if (!ids.has(c.id) && !touches.has(c.id)) await db.del('contacts', c.id)
  for (const c of equipe) if (!touches.has(c.id) && !supprApres.includes(c.id)) await db.put('contacts', c)
  S.ecrireSuppressions(supprApres)
  return true
}
