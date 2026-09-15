// Terrain : le geste retour du telephone, qui suit le bouton retour de l'ecran.

import { root } from '../ui/dom.js'
import { view } from './etat.js'

// --- le geste retour du telephone ----------------------------------------------
//
// L'app tient en une page : sans rien faire, le geste retour du telephone (la
// fleche d'Android, le glissement depuis le bord) la quitterait d'un coup. Tant
// qu'on n'est pas sur l'accueil, ou qu'une fenetre est ouverte, l'app garde donc
// une etape d'avance dans l'historique du navigateur. Le geste la consomme, et
// l'app fait ce que ferait le retour a l'ecran : fermer la fenetre du dessus,
// sinon toucher le bouton retour de l'ecran. Sur l'accueil nu, le geste garde
// son sens habituel ; derriere l'ecran du code, il ne touche a rien.

// Une etape d'avance est en train d'etre retiree : le retour qui arrive n'est
// pas un geste.
let gardeEnRetrait = false

const besoinDeGarde = () =>
  !document.body.classList.contains('verrouille') && (view.screen !== 'home' || !!document.querySelector('.overlay'))

export function ajusterGarde() {
  if (gardeEnRetrait) return
  const garde = history.state?.afRetour === true
  if (besoinDeGarde() && !garde) {
    history.pushState({ afRetour: true }, '')
  } else if (!besoinDeGarde() && garde) {
    // Revenu a l'accueil par un bouton : l'etape d'avance ne sert plus.
    gardeEnRetrait = true
    history.back()
  }
}

function retourGeste() {
  const fenetres = document.querySelectorAll('.overlay')
  const dessus = fenetres[fenetres.length - 1]
  if (dessus) {
    // Le bouton Annuler / Fermer de la fenetre, sinon un tap sur le voile -
    // que chaque fenetre comprend comme "renoncer".
    const fermer = dessus.querySelector('[data-close], [data-act="cancel"]')
    if (fermer) fermer.click()
    else dessus.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return
  }
  if (view.screen !== 'home') root.querySelector('.top .back')?.click()
}

export function installerRetourGeste() {
  window.addEventListener('popstate', () => {
    if (gardeEnRetrait) {
      gardeEnRetrait = false
      return ajusterGarde()
    }
    retourGeste()
    // L'ecran n'a pas forcement change - un brouillon qu'on reprend, une
    // fenetre qui demande confirmation : l'etape d'avance revient si elle sert.
    setTimeout(ajusterGarde, 0)
  })
  // Une fenetre qui s'ouvre ou se ferme, ou que ce soit dans l'app.
  new MutationObserver(ajusterGarde).observe(document.body, { childList: true })
}
