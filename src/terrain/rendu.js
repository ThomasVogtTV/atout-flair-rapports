// Terrain : le rendu de l'ecran courant et son animation d'entree, le dock et
// ses compteurs, le filet sous l'en-tete, l'etat du reseau.

import { pendingCount, failedCount } from '../mailer.js'
import { root } from '../ui/dom.js'
import { homeView } from '../views/home.js'
import { contactsView, ficheContactView } from '../views/contacts.js'
import { reglagesView } from '../views/reglages.js'
import { envoisView } from '../views/envois.js'
import { editorView } from '../views/editor.js'
import { estInvite, identite } from '../lock.js'
import { agendaView } from '../views/agenda.js'
import { chargerVignettes } from '../ui/vignettes.js'
import { majDock } from '../ui/dock.js'
import { view } from './etat.js'
import { ajusterGarde } from './retour.js'
import { suivreEtapesAuRendu } from './rapport.js'

// Un filet se pose sous l'en-tete des qu'on a quitte le haut de page.
let defile = false
window.addEventListener(
  'scroll',
  () => {
    const bas = window.scrollY > 6
    if (bas === defile) return
    defile = bas
    document.body.classList.toggle('defile', bas)
  },
  { passive: true }
)

// Les deux nombres portes par l'icone de l'en-tete : ce qui attend, et ce qui
// a echoue. Ils sont relus a chaque retour a l'accueil, pas seulement au
// demarrage - un envoi peut avoir echoue entre-temps.
export async function majCompteurs() {
  view.enAttente = await pendingCount()
  view.enEchec = await failedCount()
}

// --- rendu -----------------------------------------------------------------

// Sert a ne rejouer l'animation d'entree que lors d'une vraie navigation
// (accueil <-> rapport, ou changement de rapport ouvert), pas a chaque
// re-rendu local (ajout d'une ligne, d'une photo, etc.).
let lastViewKey = null
let entreeTimer = null

export function render() {
  const key = `${view.screen}:${view.report?.id ?? ''}`
  const navigated = key !== lastViewKey
  lastViewKey = key
  // L'ecran courant, pour le CSS : le dock ne vit que sur les ecrans de premier
  // niveau, la barre d'actions que dans un rapport.
  document.body.dataset.screen = view.screen
  // Le role de la session, pour le filet de couleur en haut de l'ecran.
  document.body.dataset.role = identite()?.role ?? ''
  ajusterGarde()

  suivreEtapesAuRendu(navigated)

  root.innerHTML =
    view.screen === 'home'
      ? homeView(view)
      : view.screen === 'contacts'
        ? contactsView(view)
        : view.screen === 'fiche'
          ? ficheContactView(view)
        : view.screen === 'agenda'
          ? agendaView(view)
        : view.screen === 'reglages'
          ? reglagesView(view)
          : view.screen === 'envois'
            ? envoisView(view)
            : editorView(view)
  if (navigated) {
    document.scrollingElement.scrollTop = 0
    root.classList.remove('view-enter')
    void root.offsetWidth // force le reflow pour redemarrer l'animation
    root.classList.add('view-enter')
    // Les blocs de l'accueil entrent l'un apres l'autre, a l'arrivee
    // seulement : un re-rendu (un filtre, une recherche) ne les rejoue pas.
    root.classList.add('entree')
    clearTimeout(entreeTimer)
    // Assez long pour laisser passer le reflet de la carte de l'accueil.
    entreeTimer = setTimeout(() => root.classList.remove('entree'), 1500)
  }
  majDock({ ecran: view.screen, invite: estInvite(), enAttente: view.enAttente, enEchec: view.enEchec })
  updatePendingBadge()
  if (view.screen === 'editor' && view.report) chargerVignettes(view.report.photos, root)
}

// --- file d'attente et demarrage -------------------------------------------

// L'etat des envois se lit sur l'icone de l'en-tete, pas sur une banniere
// collee en bas de l'ecran : elle recouvrait la barre d'actions du rapport
// ouvert, et ne disait ni ce qui attendait, ni pourquoi.
export async function updatePendingBadge() {
  await majCompteurs()
  majDock({ ecran: view.screen, invite: estInvite(), enAttente: view.enAttente, enEchec: view.enEchec })
}

// --- reseau ----------------------------------------------------------------

// L'app fonctionne hors ligne par construction : le bandeau ne previent pas
// d'une panne, il rassure. Dans une cave, on ne savait pas si l'app travaillait
// ou si le reseau ramait - on ne l'apprenait qu'apres coup, dans Envois.
export function majReseau() {
  document.body.dataset.reseau = navigator.onLine ? 'en-ligne' : 'hors-ligne'
}
window.addEventListener('offline', majReseau)
window.addEventListener('online', majReseau)
