// Terrain : aller d'un ecran a l'autre - l'accueil, les envois, le carnet, la
// fiche d'un client, les reglages - et la navigation du bas.

import { listQueue } from '../mailer.js'
import { toast } from '../ui/dom.js'
import { choisirContact } from '../contact-picker.js'
import { estInvite } from '../lock.js'
import { agendaEnCache } from '../agenda.js'
import { viderVignettes } from '../ui/vignettes.js'
import { ouvrirNouveauRapport } from '../nouveau-dialog.js'
import { verifierMiseAJour } from '../mise-a-jour.js'
import * as S from '../state.js'
import { view, changerVue } from './etat.js'
import { majCompteurs, render } from './rendu.js'
import { suivreMesValidations, rafraichirEquipe } from './session.js'
import { flushSave, createReport } from './rapport.js'
import { openAgenda, rafraichirAgenda } from './agenda.js'
import { contactsVisibles, syncCarnet } from './carnet.js'
import { planifierSauvegarde } from './sauvegardes.js'

export async function goHome() {
  await flushSave()
  viderVignettes()
  // Les rendez-vous du jour s'affichent tout de suite, depuis la derniere
  // version gardee ; la version en ligne suit (voir rafraichirAgenda).
  view.agenda ??= agendaEnCache()
  // La recherche ne survit pas a la sortie de l'accueil : revenir sur une liste
  // filtree par des mots tapes une heure plus tot donne un carnet a moitie vide
  // sans qu'on comprenne pourquoi.
  changerVue({ screen: 'home', report: null, children: [], recherche: '', retour: null })
  view.reports = (await S.listReports()).filter((r) => !r.parentId)
  view.stockage = await S.stockage()
  await majCompteurs()
  render()
  // Retour a l'accueil : le rapport qu'on vient de quitter part en ligne.
  planifierSauvegarde()
  rafraichirEquipe()
  suivreMesValidations()
  miseAJour()
}

// Une nouvelle version en ligne (voir src/mise-a-jour.js) : au retour dans
// l'app, a l'accueil et sans rien d'ouvert, elle s'installe d'elle-meme ;
// ailleurs, le bandeau attend qu'on la demande.
export function miseAJour({ auRetour = false } = {}) {
  verifierMiseAJour({
    force: auRetour,
    peutRecharger: () =>
      auRetour && view.screen === 'home' && !document.querySelector('.overlay') && !document.body.classList.contains('verrouille'),
    avantRecharge: flushSave,
  })
}

export async function openEnvois() {
  changerVue({ screen: 'envois', report: null })
  view.queue = await listQueue()
  view.reports = (await S.listReports()).filter((r) => !r.parentId)
  await majCompteurs()
  render()
}

export async function openContacts() {
  if (estInvite()) return toast('Le carnet n’est pas disponible en session invité.')
  changerVue({ screen: 'contacts', report: null, fiche: null, retour: null })
  view.contacts = await contactsVisibles()
  // Le carnet compte les rapports de chaque client : il lui faut la liste.
  view.reports = (await S.listReports()).filter((r) => !r.parentId)
  render()
  // Le carnet local s'affiche tout de suite ; celui de l'equipe suit.
  syncCarnet()
}

// Fiche d'un client : ses coordonnees, ses rapports, et de quoi en commencer un.
export async function openFiche(id) {
  view.contacts = await contactsVisibles()
  const fiche = view.contacts.find((c) => c.id === id)
  if (!fiche) return openContacts()
  changerVue({ screen: 'fiche', report: null, fiche, retour: null })
  view.reports = (await S.listReports()).filter((r) => !r.parentId)
  render()
}

export async function openReglages() {
  changerVue({ screen: 'reglages', report: null })
  view.stockage = await S.stockage()
  render()
}

// --- navigation du bas -------------------------------------------------------

// "Nouveau rapport" depuis n'importe quel ecran du dock : les trois lieux, et
// au besoin le client d'abord.
async function nouveauRapport() {
  const contacts = await contactsVisibles()
  const choix = await ouvrirNouveauRapport({
    contacts,
    choisirClient: () => choisirContact(contacts, view.reports ?? []),
  })
  if (choix) createReport(choix.type, choix.contact)
}

export function naviguer(ou) {
  if (ou === 'nouveau') return nouveauRapport()
  if (ou === 'agenda') return view.screen === 'agenda' ? undefined : openAgenda()
  if (ou === 'contacts') return view.screen === 'contacts' ? undefined : openContacts()
  if (ou === 'envois') return openEnvois()
  if (view.screen === 'home') return window.scrollTo({ top: 0, behavior: 'smooth' })
  return goHome()
}
