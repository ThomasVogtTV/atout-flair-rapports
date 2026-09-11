// Reserve des numeros de rapport aupres du serveur, par lots, tant qu'il y a du
// reseau : le telephone en garde toujours quelques-uns d'avance pour la cave
// ou le sous-sol. Voir api/numeros.js.

import * as S from './state.js'
import { currentCode } from './mailer.js'

// En dessous, on redemande un lot : de quoi tenir une demi-journee sans reseau.
const SEUIL = 4

let enCours = null

/** @returns {Promise<boolean>} vrai si un lot vient d'etre ajoute */
export function reserverNumeros() {
  if (enCours) return enCours
  if (!navigator.onLine || !currentCode() || S.numerosRestants() >= SEUIL) return Promise.resolve(false)
  enCours = (async () => {
    try {
      const res = await fetch('/api/numeros', {
        method: 'POST',
        headers: { 'x-app-code': currentCode(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ plusHaut: S.numeroLocalMax() }),
      })
      if (!res.ok) return false
      const { debut, fin } = await res.json()
      if (!Number.isInteger(debut) || !Number.isInteger(fin) || fin < debut) return false
      S.ajouterNumeros(debut, fin)
      return true
    } catch {
      return false
    }
  })().finally(() => {
    enCours = null
  })
  return enCours
}
