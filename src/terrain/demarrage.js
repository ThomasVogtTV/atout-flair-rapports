// Terrain : le demarrage de l'app, et ce qu'elle reprend au retour du reseau.

import { flushQueue } from '../mailer.js'
import { toast } from '../ui/dom.js'
import { loadPdfEngine } from '../send.js'
import { installerVerrou } from '../lock.js'
import { reserverNumeros } from '../numeros.js'
import { installerDock } from '../ui/dock.js'
import * as S from '../state.js'
import { view } from './etat.js'
import { updatePendingBadge, majReseau } from './rendu.js'
import { installerRetourGeste } from './retour.js'
import { goHome, miseAJour, openEnvois, naviguer } from './navigation.js'
import { oublierSession, suivreMesValidations, rafraichirEquipe, retenirSession, autreSession } from './session.js'
import { rafraichirAgenda } from './agenda.js'
import { syncCarnet, planifierSyncCarnet } from './carnet.js'
import { planifierSauvegarde, signalerStockage } from './sauvegardes.js'
import './gestes.js'

window.addEventListener('online', async () => {
  // Les fiches creees hors ligne rejoignent le carnet de l'equipe, et le lot
  // de numeros se recharge s'il a ete entame sans reseau.
  syncCarnet()
  reserverNumeros()
  planifierSauvegarde()
  const { envoyes, echecs } = await flushQueue()
  if (!envoyes && !echecs) return
  if (envoyes) toast(`${envoyes} rapport${envoyes > 1 ? "s" : ""} envoyé${envoyes > 1 ? "s" : ""}.`)
  else toast("Un envoi a été refusé. Voyez « Envois » pour le motif.")
  if (view.screen === 'home') goHome()
  else if (view.screen === 'envois') openEnvois()
  else updatePendingBadge()
})

export async function boot() {
  // Le verrou se pose avant tout affichage : l'accueil se dessine dessous, sans
  // qu'une liste de rapports ne transparaisse une fraction de seconde avant le code.
  installerVerrou()
  retenirSession()
  // La navigation du bas, posee une fois : elle traverse les ecrans.
  installerDock(naviguer)
  // Le geste retour du telephone suit le bouton retour de l'ecran.
  installerRetourGeste()
  // Une ecriture refusee ne doit pas passer inapercue : c'est le seul incident
  // de l'app qui fait disparaitre du travail deja saisi.
  S.onEcritureRefusee((plein) => {
    if (plein) return signalerStockage('refus')
    toast("Enregistrement impossible sur cet appareil. Exportez une sauvegarde avant de fermer l'app.")
  })
  // Avant qu'un seul rapport ne puisse etre cree : le compteur de numeros vit
  // dans localStorage, les rapports dans IndexedDB, et le navigateur peut vider
  // le premier sans toucher au second.
  await S.repriseCompteur()
  // Une fois par appareil : les clients des rapports deja faits entrent au carnet.
  await S.reprendreClients().catch((err) => console.error('Reprise du carnet impossible', err))
  majReseau()
  await goHome()
  // Carnet commun : chaque changement local part au carnet de l'equipe, et
  // le telephone reprend a l'ouverture ce que les collegues ont ajoute.
  S.onCarnetModifie(planifierSyncCarnet)
  syncCarnet()
  // Numeros de rapport uniques dans l'equipe : un lot d'avance, des maintenant.
  reserverNumeros()
  // L'agenda de l'equipe : a l'ouverture, au deverrouillage, au retour du reseau.
  rafraichirAgenda()
  window.addEventListener('online', () => {
    rafraichirAgenda()
    rafraichirEquipe({ force: true })
    suivreMesValidations({ force: true })
    miseAJour()
  })
  // Premiere ouverture : le code n'est connu qu'une fois l'ecran de code passe.
  window.addEventListener('af-deverrouille', () => {
    // Quelqu'un d'autre a pris le telephone : rien de la session precedente ne
    // reste a l'ecran. Le meme qui revient apres le delai de grace, lui,
    // retrouve son rapport la ou il l'avait laisse.
    if (autreSession()) {
      retenirSession()
      oublierSession()
      goHome()
    }
    reserverNumeros()
    rafraichirAgenda()
    rafraichirEquipe({ force: true })
    suivreMesValidations({ force: true })
    syncCarnet()
    planifierSauvegarde()
  })
  // L'accueil est affiche : on va chercher le moteur PDF en tache de fond, pour
  // qu'il soit en cache (et donc disponible hors ligne) avant le premier rapport.
  // Une fois l'app au repos seulement : lire 450 Ko de moteur PDF des le
  // demarrage disputait le processeur a l'affichage de l'accueil.
  const auRepos = window.requestIdleCallback ?? ((fn) => setTimeout(fn, 2500))
  auRepos(() => loadPdfEngine().catch(() => {}), { timeout: 8000 })
  if (navigator.onLine) flushQueue().then(() => updatePendingBadge())
}
