// Terrain : la sauvegarde en ligne, et la place qui reste sur l'appareil.

import { alerteStockage } from '../ui/dialogs.js'
import { sauvegarder } from '../sauvegarde.js'
import * as S from '../state.js'
import { view } from './etat.js'
import { render } from './rendu.js'
import { openReglages } from './navigation.js'

// Sauvegarde en ligne : quelques secondes apres le dernier geste, pour ne pas
// disputer le reseau et le processeur a l'ecran qui s'affiche.
let sauvegardeTimer = null
export function planifierSauvegarde() {
  clearTimeout(sauvegardeTimer)
  sauvegardeTimer = setTimeout(async () => {
    const r = await sauvegarder()
    if (r === true && view.screen === 'reglages') render()
  }, 4000)
}

// --- place restante --------------------------------------------------------

// L'ecriture peut echouer plusieurs fois par seconde (l'enregistrement
// automatique repasse toutes les 400 ms) : sans ce delai, l'ecran se couvrirait
// de la meme alerte. Une minute suffit a la rendre lisible sans la noyer.
const REPOS_ALERTE = 60_000
let derniereAlerte = 0

export async function signalerStockage(motif) {
  if (Date.now() - derniereAlerte < REPOS_ALERTE) return
  derniereAlerte = Date.now()
  if ((await alerteStockage(motif)) === 'reglages') openReglages()
}

/**
 * Avant une photo : la seule ecriture assez lourde pour faire basculer un
 * appareil deja plein. Prevenir avant la prise vaut mieux que de perdre le
 * cliche apres, quand on a range le telephone et quitte l'appartement.
 *
 * @returns {Promise<boolean>} faux si l'on renonce a la photo
 */
export async function placePourUnePhoto() {
  const place = await S.stockage()
  view.stockage = place
  if (!place || place.part <= S.STOCKAGE_ALERTE) return true
  derniereAlerte = Date.now()
  if ((await alerteStockage('bientot')) === 'reglages') {
    openReglages()
    return false
  }
  return true
}
