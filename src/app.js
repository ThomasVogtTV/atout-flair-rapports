// Chef d'orchestre de l'app : l'etat de l'ecran courant, le rendu, les
// interactions (saisie, lignes, photos) et le demarrage.
// Le HTML des ecrans est dans src/views/, les briques d'affichage dans
// src/ui/, la sortie du rapport (PDF, envoi) dans src/send.js.

import { typeOf, accordE, rowLabelFor } from './templates.js'
import * as S from './state.js'
import { fileToPhoto, fileToLogo, openAnnotator } from './photo.js'
import { openSignaturePad } from './signature.js'
import { pendingCount, failedCount, flushQueue, listQueue, retryJob, deleteJob, setCode, currentCode } from './mailer.js'
import { root, toast, pulse, showLoading, hideLoading, esc } from './ui/dom.js'
import { startRowDrag } from './ui/dragsort.js'
import { confirmLeave, alerteStockage } from './ui/dialogs.js'
import { setTheme } from './ui/theme.js'
import { homeView, listeRapportsHTML } from './views/home.js'
import { contactsView, ficheContactView, listeContactsHTML } from './views/contacts.js'
import { reglagesView } from './views/reglages.js'
import { envoisView } from './views/envois.js'
import { adminView } from './views/admin.js'
import { editorView, rowCardHTML, counterPills, applySameAddress, applySameName, LIEU_ADDR_KEYS, etapesNavHTML, verdictsHTML } from './views/editor.js'
import { openContactDialog } from './contact-dialog.js'
import { choisirContact } from './contact-picker.js'
import { loadPdfEngine, previewPdf, openSendDialog, shareOrDownload } from './send.js'
import { installerVerrou, seDeconnecter, estInvite, estAdmin } from './lock.js'
import { agendaView, rdvAccueilHTML } from './views/agenda.js'
import { tableauAdminHTML } from './views/tableau.js'
import { agendaEnCache, chargerAgenda, enregistrerRdv, supprimerRdv, marquerCommence, marquerStatut, ajouterAuCalendrier } from './agenda.js'
import { formulaireRdv, ouvrirRdv } from './rdv-dialog.js'
import { nomClient, decalerMois, lundiDe, decalerSemaine, conflitsDe, plusJours, libelleJour } from './agenda-outils.js'
import { chargerVignettes, viderVignettes } from './ui/vignettes.js'
import { synchroniserCarnet } from './carnet-sync.js'
import { reserverNumeros } from './numeros.js'
import { sauvegarder, listerSauvegardes, restaurer } from './sauvegarde.js'
import { choisirRestauration } from './restauration.js'
import { etapesDuRapport, etapeDeReprise, ETAPES } from './etapes.js'
import { installerDock, majDock } from './ui/dock.js'
import { ouvrirNouveauRapport } from './nouveau-dialog.js'
import { ouvrirMenuRapport } from './rapport-menu.js'
import { montrerSceau } from './ui/sceau.js'

// reportsOpen / filter : etat de la liste de l'accueil (repliee sur les trois
// derniers rapports, ou deroulee et filtrable). Il survit aux allers-retours
// vers un rapport (goHome recopie la vue), de sorte qu'on retrouve la liste
// dans l'etat ou on l'a laissee.
let view = {
  screen: 'home',
  report: null,
  children: [],
  reports: [],
  contacts: [],
  reportsOpen: false,
  filter: 'tous',
  queue: [],
  enAttente: 0,
  enEchec: 0,
}
let saveTimer = null
let aEnregistrer = null

// Le rapport a enregistrer est retenu au moment de la frappe. Le delai lisait
// `view.report` a son echeance : quitter l'ecran juste apres avoir tape, et il
// n'y avait plus de rapport - la derniere saisie ne s'enregistrait pas.
function scheduleSave() {
  aEnregistrer = view.report
  clearTimeout(saveTimer)
  saveTimer = setTimeout(flushSave, 600)
  etatSauvegarde(true)
}

// Enregistre tout de suite ce qui attend : avant de changer d'ecran, et quand
// l'app passe en arriere-plan (appel entrant, ecran verrouille).
function flushSave() {
  clearTimeout(saveTimer)
  const r = aEnregistrer
  aEnregistrer = null
  const fait = r ? S.saveReport(r) : Promise.resolve(true)
  fait.then((ok) => ok !== false && etatSauvegarde(false))
  return fait
}

// L'etat de l'enregistrement, dans l'en-tete du rapport : ce qu'on tape est
// garde a mesure, et on le voit sans avoir a y penser.
function etatSauvegarde(enCours) {
  const el = root.querySelector('[data-save-etat]')
  if (!el) return
  el.classList.toggle('en-cours', enCours)
  el.querySelector('span').textContent = enCours ? 'Enregistrement…' : 'Enregistré'
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) flushSave()
})
window.addEventListener('pagehide', () => flushSave())

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

function get(path) {
  return path.split('.').reduce((o, k) => o?.[k], view.report)
}
function set(path, value) {
  const keys = path.split('.')
  const last = keys.pop()
  keys.reduce((o, k) => (o[k] ??= {}), view.report)[last] = value
}

// --- navigation ------------------------------------------------------------

async function goHome() {
  await flushSave()
  viderVignettes()
  // Les rendez-vous du jour s'affichent tout de suite, depuis la derniere
  // version gardee ; la version en ligne suit (voir rafraichirAgenda).
  view.agenda ??= agendaEnCache()
  // La recherche ne survit pas a la sortie de l'accueil : revenir sur une liste
  // filtree par des mots tapes une heure plus tot donne un carnet a moitie vide
  // sans qu'on comprenne pourquoi.
  view = { ...view, screen: 'home', report: null, children: [], recherche: '', retour: null }
  view.reports = (await S.listReports()).filter((r) => !r.parentId)
  view.stockage = await S.stockage()
  await majCompteurs()
  render()
  // Retour a l'accueil : le rapport qu'on vient de quitter part en ligne.
  planifierSauvegarde()
  rafraichirTableau()
}

async function openEnvois() {
  view = { ...view, screen: 'envois', report: null }
  view.queue = await listQueue()
  view.reports = (await S.listReports()).filter((r) => !r.parentId)
  await majCompteurs()
  render()
}

// Les deux nombres portes par l'icone de l'en-tete : ce qui attend, et ce qui
// a echoue. Ils sont relus a chaque retour a l'accueil, pas seulement au
// demarrage - un envoi peut avoir echoue entre-temps.
async function majCompteurs() {
  view.enAttente = await pendingCount()
  view.enEchec = await failedCount()
}

async function openContacts() {
  if (estInvite()) return toast('Le carnet n’est pas disponible en session invité.')
  view = { ...view, screen: 'contacts', report: null, fiche: null, retour: null }
  view.contacts = await contactsVisibles()
  // Le carnet compte les rapports de chaque client : il lui faut la liste.
  view.reports = (await S.listReports()).filter((r) => !r.parentId)
  render()
  // Le carnet local s'affiche tout de suite ; celui de l'equipe suit.
  syncCarnet()
}

// Fiche d'un client : ses coordonnees, ses rapports, et de quoi en commencer un.
async function openFiche(id) {
  view.contacts = await contactsVisibles()
  const fiche = view.contacts.find((c) => c.id === id)
  if (!fiche) return openContacts()
  view = { ...view, screen: 'fiche', report: null, fiche, retour: null }
  view.reports = (await S.listReports()).filter((r) => !r.parentId)
  render()
}

async function openReglages() {
  view = { ...view, screen: 'reglages', report: null }
  view.stockage = await S.stockage()
  render()
}

// --- administration -------------------------------------------------------

async function adminAppel(methode, corps) {
  const res = await fetch('/api/admin', {
    method: methode,
    headers: { 'x-app-code': currentCode(), ...(corps ? { 'Content-Type': 'application/json' } : {}) },
    body: corps ? JSON.stringify(corps) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data.error || `Erreur ${res.status}`), { base: data.base })
  return data
}

// Le code revele a la creation d'un employe ne survit pas a une sortie de
// l'onglet : il ne doit s'afficher qu'une fois.
async function openAdmin() {
  view = { ...view, screen: 'admin', report: null, admin: { chargement: true }, adminCodeRevele: null }
  render()
  await rechargerAdmin()
}

async function rechargerAdmin() {
  if (!navigator.onLine) {
    view.admin = { erreur: "Hors ligne : l'administration a besoin du réseau." }
  } else {
    try {
      view.admin = await adminAppel('GET')
    } catch (err) {
      view.admin = { erreur: err.message, base: err.base }
    }
  }
  if (view.screen === 'admin') render()
}

// Le tableau de l'accueil lit au meme endroit que l'onglet Administration, et
// garde sa reponse dans le meme cache : deux lectures de la meme chose a une
// seconde d'intervalle ne diraient rien de plus.
const TABLEAU_FRAIS_MS = 60_000
let tableauLu = 0

async function rafraichirTableau({ force = false } = {}) {
  if (!estAdmin() || !navigator.onLine) return
  if (!force && Date.now() - tableauLu < TABLEAU_FRAIS_MS) return
  try {
    view.admin = await adminAppel('GET')
    tableauLu = Date.now()
  } catch (err) {
    // Le tableau dit pourquoi il est vide ; le reste de l'accueil continue.
    view.admin = { erreur: err.message, base: err.base }
  }
  majTableau()
}

// Rendu chirurgical, comme pour les rendez-vous : un rendu complet ferait
// perdre son curseur a une recherche en cours.
let tableauRendu = ''

function majTableau() {
  if (view.screen !== 'home') return
  const zone = root.querySelector('.tableau-zone')
  if (!zone) return
  const neuf = tableauAdminHTML(view)
  // Rien n'a change depuis le dernier rendu : ne pas reecrire. Refaire le HTML
  // detruit l'iframe de la carte, que Google recharge alors entierement pour
  // redessiner exactement la meme - a chaque retour a l'accueil.
  if (neuf === tableauRendu) return
  // Le tableau se relit pendant qu'on le parcourt : refaire son contenu le
  // ramenait en haut, et la ligne qu'on etait en train de lire disparaissait
  // sous les yeux.
  const ou = zone.querySelector('.tableau-defile')?.scrollTop ?? 0
  zone.innerHTML = neuf
  tableauRendu = neuf
  const defile = zone.querySelector('.tableau-defile')
  if (defile) defile.scrollTop = ou
}

const CONFIRMATIONS = {
  revoquer: 'Révoquer cet employé ? Son code cessera de fonctionner à sa prochaine ouverture avec du réseau.',
  supprimer: 'Supprimer cet employé ? Son code cessera de fonctionner. Ses envois restent dans le journal.',
  'nouveau-code': "Donner un nouveau code à cet employé ? L'ancien cessera de fonctionner.",
}

async function adminAction(action, id) {
  if (CONFIRMATIONS[action] && !confirm(CONFIRMATIONS[action])) return
  try {
    const r = await adminAppel('POST', { action, id })
    if (r.code) {
      const e = view.admin?.employes?.find((x) => x.id === id)
      view.adminCodeRevele = { nom: e?.nom ?? '', code: r.code }
    }
    await rechargerAdmin()
  } catch (err) {
    toast(err.message)
  }
}

// Une date de fin choisie au calendrier vaut jusqu'au soir de ce jour-la.
const finDeJournee = (jour) => {
  const [a, m, j] = jour.split('-').map(Number)
  return new Date(a, m - 1, j, 23, 59, 59, 999).getTime()
}

async function adminAjouter() {
  const nom = root.querySelector('[data-admin-nom]')?.value.trim()
  if (!nom) return toast("Indiquez le nom de l'employé")
  const jour = root.querySelector('[data-admin-fin]')?.value
  try {
    const r = await adminAppel('POST', { action: 'creer', nom, fin: jour ? finDeJournee(jour) : undefined })
    view.adminCodeRevele = { nom: r.nom, code: r.code, fin: r.fin }
    await rechargerAdmin()
  } catch (err) {
    toast(err.message)
  }
}

async function openReport(id) {
  await flushSave()
  if (view.report?.id !== id) viderVignettes()
  const report = await S.loadReport(id)
  if (!report) return goHome()
  // Rapport cree avant l'arrivee de la rubrique "Le technicien" : il reprend le
  // technicien par defaut a l'ouverture, comme un rapport neuf.
  if (!report.technicien) report.technicien = await S.loadTechnicien()
  view.report = report
  // Toutes les pieces s'ouvrent repliees : la liste se lit alors comme la
  // feuille de route de l'intervention - une ligne par piece, son etat en
  // regard - et l'on ouvre celle qu'on traite. Une piece ajoutee en cours de
  // route, elle, s'ouvre deja depliee (voir insertNewRow) : on vient de la
  // creer pour la remplir.
  view.repliees = new Set(report.rows.map((r) => r.id))
  view.sectionsRepliees = sectionsParDefaut(report)
  // Le rapport s'ouvre a l'etape ou il en est : un neuf sur le client, un
  // brouillon repris sur ce qui reste a faire, un rapport remis sur son bilan.
  view.etape = etapeDeReprise(report)
  view.etapeSens = null
  etapesFaites = null
  view.children = await S.enfantsDe(report.id)
  view.contacts = await contactsVisibles()
  view.partenaires = await S.listPartenaires()
  view.screen = 'editor'
  render()
}

/**
 * Rubriques repliees a l'ouverture d'un rapport.
 *
 * Deux familles :
 *   - celles qu'on ne visite qu'au besoin (photos libres, technicien deja
 *     rempli, partenaire souvent absent) : repliees d'office ;
 *   - celles qu'on vient remplir (mandant, lieu, remarques) : repliees
 *     seulement si elles portent deja quelque chose. Un rapport neuf s'ouvre
 *     donc sur ce qu'il faut saisir, un rapport repris sur son sommaire.
 */
function sectionsParDefaut(report) {
  const repliees = new Set(['photos', 'technicien', 'partenaire'])
  const rempli = (v) => !!(v ?? '').trim()
  if (rempli(report.mandant?.nom)) repliees.add('mandant')
  if (rempli(report.lieu?.adresseIntervention) || rempli(report.lieu?.adresse)) repliees.add('lieu')
  if (rempli(report.remarques)) repliees.add('remarques')
  return repliees
}

async function createReport(type, contact = null) {
  const report = S.newReport(type)
  report.technicien = await S.loadTechnicien()
  if (contact) {
    report.mandant = S.contactVersMandant(contact)
    // Un particulier ou un locataire fait venir le chien chez lui : le lieu
    // est son adresse, et c'est lui qu'on trouve sur place. Les deux cases
    // restent decochables dans le rapport.
    if (typeOf(report).layout === 'pieces' && ['particulier', 'locataire'].includes(contact.type) && contact.adresse) {
      report.lieu.sameAsMandant = true
      report.lieu.sameNameAsMandant = true
      applySameAddress(report)
      applySameName(report)
    }
  }
  await S.saveReport(report)
  // Un numero vient d'etre pris : le lot se recharge s'il s'amenuise.
  reserverNumeros()
  openReport(report.id)
}

// Le carnet n'est pas montre aux invites : sous-traitants et interimaires
// n'ont pas a emporter la liste des clients. Pour eux, ni liste, ni choix,
// ni propositions pendant la frappe.
const contactsVisibles = async () => (estInvite() ? [] : S.listContacts())

// Apres une synchronisation : l'ecran ouvert se remet a jour sans perdre ce
// qu'on est en train de faire.
async function carnetSynchronise() {
  view.contacts = await contactsVisibles()
  if (view.screen === 'contacts') {
    const zone = root.querySelector('.carnet-liste')
    // Recherche en cours : seule la liste change, le champ garde son curseur.
    if (zone && document.activeElement?.matches?.('[data-recherche-contact]')) zone.outerHTML = listeContactsHTML(view)
    else render()
  } else if (view.screen === 'fiche' && view.fiche) {
    const fiche = view.contacts.find((c) => c.id === view.fiche.id)
    if (fiche) {
      view.fiche = fiche
      render()
    }
  }
}

const syncCarnet = () => synchroniserCarnet().then((ok) => ok && carnetSynchronise())

// Une rafale d'ecritures (residents d'un immeuble, restauration) ne fait
// qu'un seul envoi.
let syncTimer = null
function planifierSyncCarnet() {
  clearTimeout(syncTimer)
  syncTimer = setTimeout(syncCarnet, 1500)
}

// Sauvegarde en ligne : quelques secondes apres le dernier geste, pour ne pas
// disputer le reseau et le processeur a l'ecran qui s'affiche.
let sauvegardeTimer = null
function planifierSauvegarde() {
  clearTimeout(sauvegardeTimer)
  sauvegardeTimer = setTimeout(async () => {
    const r = await sauvegarder()
    if (r === true && view.screen === 'reglages') render()
  }, 4000)
}

async function refreshContacts() {
  view.contacts = await contactsVisibles()
  render()
}

// --- agenda de l'equipe ----------------------------------------------------

const VUE_AGENDA = 'af-agenda-vue'

async function openAgenda() {
  await flushSave()
  view = { ...view, screen: 'agenda', report: null, retour: null }
  view.agenda ??= agendaEnCache()
  // Le calendrier s'ouvre sur aujourd'hui, dans la vue choisie la derniere fois.
  view.agendaJour = S.todayISO()
  view.agendaMois = view.agendaJour.slice(0, 7)
  view.agendaSemaine = lundiDe(view.agendaJour)
  view.agendaVue = localStorage.getItem(VUE_AGENDA) === 'semaine' ? 'semaine' : 'mois'
  render()
  rafraichirAgenda()
}

// Relit l'agenda en ligne et remet a jour ce qui l'affiche - sur l'accueil,
// la seule rubrique des rendez-vous : un rendu complet ferait perdre son
// curseur a une recherche en cours.
async function rafraichirAgenda() {
  const data = await chargerAgenda()
  if (!data) return
  view.agenda = data
  if (view.screen === 'home') {
    const zone = root.querySelector('.rdv-accueil-zone')
    if (zone) zone.innerHTML = rdvAccueilHTML(view)
    // La tournee du tableau se lit dans le meme agenda.
    majTableau()
  } else if (view.screen === 'agenda') {
    render()
  }
}

// L'administrateur attribue un rendez-vous a un membre de l'equipe : il lui
// faut la liste. Sans elle, il ne peut l'attribuer qu'a lui-meme.
async function equipePourAgenda() {
  try {
    const data = await adminAppel('GET')
    return (data.employes ?? []).filter((e) => e.actif && !e.expire)
  } catch {
    return []
  }
}

// Qui est deja pris a cette heure-la ? Un rendez-vous sans "pour" est le mien :
// c'est le serveur qui me l'attribuera.
function conflitsPour(saisi) {
  const pour = saisi.pour ?? view.agenda?.moi ?? null
  return conflitsDe({ ...saisi, pour }, view.agenda?.rdvs ?? [])
}

async function editerRdv(rdv = null, creneau = {}) {
  if (!navigator.onLine) return toast("Pas de réseau : l'agenda de l'équipe se modifie avec du réseau.")
  const admin = estAdmin()
  const [contacts, equipe] = await Promise.all([contactsVisibles(), admin ? equipePourAgenda() : null])
  const date = creneau.date ?? (view.screen === 'agenda' ? view.agendaJour : undefined)
  const saisi = await formulaireRdv(rdv, {
    contacts,
    reports: view.reports ?? [],
    equipe,
    admin,
    choisirContact,
    date,
    heure: creneau.heure,
    modele: creneau.modele,
    conflits: conflitsPour,
  })
  if (!saisi) return
  try {
    await enregistrerRdv(saisi)
    toast(rdv ? 'Rendez-vous modifié' : 'Rendez-vous ajouté')
    // Le calendrier se place sur le jour du rendez-vous, pour le montrer.
    view.agendaJour = saisi.date
    view.agendaMois = saisi.date.slice(0, 7)
    view.agendaSemaine = lundiDe(saisi.date)
  } catch (err) {
    return toast(err.message)
  }
  await rafraichirAgenda()
}

// Le rapport d'un rendez-vous nait deja rempli : client, lieu, date et heure.
// Deja commence sur ce telephone, il se rouvre au lieu d'en creer un second.
async function commencerRdv(rdv) {
  if (rdv.rapportId && (await S.loadReport(rdv.rapportId))) return openReport(rdv.rapportId)
  const report = S.newReport(rdv.type)
  report.technicien = await S.loadTechnicien()
  report.mandant = S.contactVersMandant(rdv.client)
  const { adresse = '', npaLieu = '' } = rdv.lieu ?? {}
  if (typeOf(report).layout === 'pieces') {
    if (adresse || npaLieu) report.lieu.adresseIntervention = [adresse, npaLieu].filter(Boolean).join(', ')
    if (rdv.date) report.lieu.dateIntervention = rdv.date
    if (rdv.heure) report.lieu.heureIntervention = rdv.heure
  } else {
    report.lieu.adresse = adresse
    report.lieu.npaLieu = npaLieu
  }
  await S.saveReport(report)
  reserverNumeros()
  marquerCommence(rdv.id, report.id).then(rafraichirAgenda)
  openReport(report.id)
}

// Le controle de suivi : une detection positive appelle un second passage,
// deux semaines plus tard. L'app le propose une fois, au moment ou le rapport
// est remis - c'est la que la question se pose reellement, sur place, et c'est
// la seule fois ou l'on est sur de ne pas l'oublier.
const JOURS_CONTROLE = 14

async function proposerControle(rapport) {
  if (!rapport || rapport.controleFait || estInvite() || !navigator.onLine) return
  // Un envoi refuse laisse le rapport en chantier : rien a programmer encore.
  if (!S.estTermine(rapport) && rapport.status !== 'queued') return
  if (S.contaminatedCount(rapport) === 0) return

  const depart = rapport.lieu?.dateIntervention || S.todayISO()
  const date = plusJours(depart, JOURS_CONTROLE)
  const nom = S.fullName(rapport.mandant) || 'ce client'
  const veut = confirm(
    `Détection positive chez ${nom}.

Programmer le contrôle de suivi ?
${libelleJour(date, S.todayISO())}, dans ${JOURS_CONTROLE} jours.`
  )
  // Posee une fois, la question ne revient pas : on ne harcele pas quelqu'un
  // qui a deja dit non, et il peut toujours ajouter le rendez-vous a la main.
  rapport.controleFait = true
  await S.saveReport(rapport)
  if (!veut) return

  const l = rapport.lieu ?? {}
  const lieu =
    typeOf(rapport).layout === 'pieces'
      ? { adresse: l.adresseIntervention || '', npaLieu: '' }
      : { adresse: l.adresse || '', npaLieu: l.npaLieu || '' }
  await editerRdv(null, {
    modele: {
      date,
      heure: l.heureIntervention || '',
      type: rapport.type,
      client: S.contactVersMandant(rapport.mandant ?? {}),
      lieu,
      note: `Contrôle de suivi${rapport.ref ? ` - rapport ${rapport.ref}` : ''}`,
      suiteDe: rapport.id,
    },
  })
}

async function montrerRdv(rdv) {
  const a = view.agenda
  const moi = a?.moi?.id
  const modifiable = a?.role === 'admin' || (a?.role === 'employe' && (rdv.pour?.id === moi || rdv.par?.id === moi))
  const choix = await ouvrirRdv(rdv, { modifiable })
  if (choix?.startsWith('statut:')) return changerStatutRdv(rdv, choix.slice(7))
  if (choix === 'commencer') return commencerRdv(rdv)
  if (choix === 'agenda') return ajouterAuCalendrier(rdv)
  if (choix === 'modifier') return editerRdv(rdv)
  if (choix === 'supprimer') {
    if (!confirm(`Supprimer le rendez-vous avec ${nomClient(rdv.client) || 'ce client'} ?`)) return
    try {
      await supprimerRdv(rdv.id)
      toast('Rendez-vous supprimé')
    } catch (err) {
      return toast(err.message)
    }
    await rafraichirAgenda()
  }
}

const MOT_STATUT = { prevu: 'Rendez-vous à nouveau prévu', fait: 'Rendez-vous fait', annule: 'Rendez-vous annulé' }

async function changerStatutRdv(rdv, statut) {
  if (statut === (rdv.statut || 'prevu')) return
  try {
    await marquerStatut(rdv.id, statut)
    toast(MOT_STATUT[statut] ?? 'État changé')
  } catch (err) {
    return toast(err.message)
  }
  await rafraichirAgenda()
}

// --- rendu -----------------------------------------------------------------

// Sert a ne rejouer l'animation d'entree que lors d'une vraie navigation
// (accueil <-> rapport, ou changement de rapport ouvert), pas a chaque
// re-rendu local (ajout d'une ligne, d'une photo, etc.).
let lastViewKey = null
let entreeTimer = null
// Les etapes deja faites du rapport ouvert, pour cocher avec un rebond celle qui
// vient de se completer. Un verdict "Rien trouve" replie la piece et redessine
// l'ecran juste apres avoir coche l'etape : les coches recentes survivent donc
// a ce rendu, sans quoi le rebond disparaitrait avant d'avoir ete vu.
let etapesFaites = null
let finiesRecentes = { ids: [], t: 0 }

function render() {
  const key = `${view.screen}:${view.report?.id ?? ''}`
  const navigated = key !== lastViewKey
  lastViewKey = key
  // L'ecran courant, pour le CSS : le dock ne vit que sur les ecrans de premier
  // niveau, la barre d'actions que dans un rapport.
  document.body.dataset.screen = view.screen
  if (view.screen === 'editor' && view.report) {
    const faites = etapesDuRapport(view.report).filter((e) => e.fait).map((e) => e.id)
    const nouvelles = !navigated && etapesFaites ? faites.filter((id) => !etapesFaites.includes(id)) : []
    const recentes = !navigated && Date.now() - finiesRecentes.t < 700 ? finiesRecentes.ids.filter((id) => faites.includes(id)) : []
    view.vientDeFinir = [...new Set([...nouvelles, ...recentes])]
    etapesFaites = faites
  }
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
            : view.screen === 'admin'
              ? adminView(view)
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

// --- interactions ----------------------------------------------------------

function rowOf(el) {
  const id = el.closest('[data-row]')?.dataset.row
  return view.report.rows.find((r) => r.id === id)
}

// Recopie dans les champs affiches les valeurs du lieu recalculees a partir du
// mandant (cases "meme adresse" / "meme nom").
function mirrorLieuFields(keys) {
  keys.forEach((key) => {
    const target = root.querySelector(`[data-path="lieu.${key}"]`)
    if (target) target.value = view.report.lieu[key] ?? ''
  })
}

// Redessine la seule bande des propositions du carnet, sans toucher au reste
// de l'ecran : un render() complet pendant la frappe ferait perdre le curseur.
function rafraichirSuggestions() {
  const props = S.matchContacts(view.report.mandant.nom, view.contacts ?? [])
  const zone = root.querySelector('.suggestions-carnet')
  if (!zone) return
  zone.innerHTML = props
    .map(
      (c) =>
        `<button type="button" class="chip chip-sm" data-fill-contact="${c.id}">${esc(S.fullName(c))}${
          c.npaLieu ? `<span class="chip-count">${esc(c.npaLieu)}</span>` : ''
        }</button>`
    )
    .join('')
  zone.hidden = !props.length
}

// La liste des rapports se redessine seule pendant la frappe : un render()
// complet remplacerait le champ de recherche et le curseur avec lui.
function rafraichirListeRapports() {
  const zone = root.querySelector('.report-list')
  if (!zone) return
  // Le bouton "Voir les N autres" suit la liste : il reste sinon affiche sous
  // une recherche qui montre deja tout ce qui correspond.
  zone.nextElementSibling?.matches('[data-toggle-reports]') && zone.nextElementSibling.remove()
  zone.outerHTML = listeRapportsHTML(view)
}

root.addEventListener('input', (ev) => {
  const el = ev.target
  if (el.dataset.appCode !== undefined) return setCode(el.value)
  if (el.dataset.recherche !== undefined) {
    view.recherche = el.value
    return rafraichirListeRapports()
  }
  // Recherche du carnet : seule la liste se redessine, le champ garde le curseur.
  if (el.dataset.rechercheContact !== undefined) {
    view.carnetRecherche = el.value
    const zone = root.querySelector('.carnet-liste')
    if (zone) zone.outerHTML = listeContactsHTML(view)
    return
  }
  if (el.dataset.path) {
    set(el.dataset.path, el.value)
    // Cases "meme adresse / meme nom que le mandant" cochees : les champs du
    // lieu restent en phase pendant la saisie, sans re-rendu complet pour
    // ne pas faire perdre le focus/curseur du champ mandant en cours.
    if (view.report.lieu.sameAsMandant && (el.dataset.path === 'mandant.adresse' || el.dataset.path === 'mandant.npaLieu')) {
      applySameAddress(view.report)
      mirrorLieuFields(LIEU_ADDR_KEYS)
    }
    if (view.report.lieu.sameNameAsMandant && (el.dataset.path === 'mandant.nom' || el.dataset.path === 'mandant.prenom')) {
      applySameName(view.report)
      mirrorLieuFields(['locataire'])
    }
    // Les propositions du carnet suivent la frappe, sans redessiner tout
    // l'ecran : un re-rendu ferait perdre le curseur du champ en cours.
    if (el.dataset.path === 'mandant.nom') rafraichirSuggestions()
    scheduleSave()
    planifierEtapes()
  } else if (el.dataset.rowField) {
    const row = rowOf(el)
    if (!row) return
    const champ = el.dataset.rowField
    row[champ] = el.value
    // Plus besoin de rafraichir le compteur a la frappe : toutes les lignes du
    // rapport comptent, remplies ou non, et leur nombre ne change qu'a l'ajout
    // ou a la suppression d'une ligne.
    // Les puces de noms de piece ont fait leur travail des que le champ porte
    // quelque chose : elles laissent la place au reste de la carte.
    if (champ === 'nom' && el.value) el.closest('.row-card')?.querySelector('.quick-rooms')?.remove()
    scheduleSave()
    planifierEtapes()
  }
})

root.addEventListener('change', async (ev) => {
  const el = ev.target

  // Date de fin d'un invite, changee directement dans la liste de l'equipe.
  if (el.dataset.changerFin) {
    if (!el.value) return
    try {
      await adminAppel('POST', { action: 'changer-fin', id: el.dataset.changerFin, fin: finDeJournee(el.value) })
      toast('Date de fin enregistrée.')
    } catch (err) {
      toast(err.message)
    }
    return rechargerAdmin()
  }

  if (el.dataset.sameAddr !== undefined) {
    view.report.lieu.sameAsMandant = el.checked
    if (el.checked) applySameAddress(view.report)
    await S.saveReport(view.report)
    render()
    return
  }

  if (el.dataset.sameName !== undefined) {
    view.report.lieu.sameNameAsMandant = el.checked
    if (el.checked) applySameName(view.report)
    await S.saveReport(view.report)
    render()
    return
  }

  // Le nom du partenaire est presque toujours tape apres avoir depose son logo :
  // sans cette reprise, la puce gardee sur l'appareil restait anonyme, et il
  // fallait retaper le nom a chaque rapport.
  if (el.dataset.path === 'partenaire.nom') {
    await S.rememberPartenaire(view.report.partenaire)
    view.partenaires = await S.listPartenaires()
    return
  }

  // Le carnet remplit le reste des coordonnees des que le nom correspond -
  // le nom saisi seul, ou le nom complet propose par la liste du carnet.
  if (el.dataset.path !== 'mandant.nom') return
  const typed = el.value.trim().toLowerCase()
  const match = view.contacts.find(
    (c) => S.fullName(c).toLowerCase() === typed || (c.nom || '').trim().toLowerCase() === typed
  )
  if (!match) return
  view.report.mandant = {
    type: match.type ?? '',
    nom: match.nom,
    prenom: match.prenom ?? '',
    adresse: match.adresse,
    npaLieu: match.npaLieu,
    email: match.email,
    tel: match.tel,
  }
  if (view.report.lieu.sameAsMandant) applySameAddress(view.report)
  if (view.report.lieu.sameNameAsMandant) applySameName(view.report)
  await S.saveReport(view.report)
  render()
})

// Les compteurs sont redessines entierement, et non juste le chiffre : sinon le
// pluriel restait celui du rendu precedent ("2 pièce", "2 contaminée"). La
// pulsation ne se declenche que sur un compteur qui a vraiment change, pour
// qu'elle continue de vouloir dire quelque chose.
function refreshCounters() {
  const zone = root.querySelector('.counter-pills')
  if (!zone) return rafraichirEtapes()
  const avant = { total: zone.querySelector('#cnt-total')?.textContent, cont: zone.querySelector('#cnt-cont')?.textContent }
  zone.innerHTML = counterPills(view.report, typeOf(view.report))
  for (const [cle, id] of [['total', 'cnt-total'], ['cont', 'cnt-cont']]) {
    const el = zone.querySelector(`#${id}`)
    if (el && el.textContent !== avant[cle]) pulse(el)
  }
  rafraichirEtapes()
}

// --- les etapes du rapport -------------------------------------------------

// La frise des etapes et la barre des verdicts suivent la saisie sans redessiner
// l'ecran : un rendu complet ferait perdre le curseur du champ en cours.
function rafraichirEtapes() {
  if (view.screen !== 'editor' || !view.report) return
  const faites = etapesDuRapport(view.report).filter((e) => e.fait).map((e) => e.id)
  const nouvelles = etapesFaites ? faites.filter((id) => !etapesFaites.includes(id)) : []
  etapesFaites = faites
  if (nouvelles.length) finiesRecentes = { ids: nouvelles, t: Date.now() }
  const nav = root.querySelector('[data-etapes]')
  if (nav) nav.innerHTML = etapesNavHTML(view, { vientDeFinir: nouvelles })
  const verdicts = root.querySelector('[data-verdicts]')
  if (verdicts) verdicts.outerHTML = verdictsHTML(view.report, typeOf(view.report))
}

let etapesTimer = null
function planifierEtapes() {
  clearTimeout(etapesTimer)
  etapesTimer = setTimeout(rafraichirEtapes, 250)
}

// Passer d'une etape a l'autre : tout est deja enregistre, on ne perd rien en
// revenant en arriere. Le contenu glisse dans le sens du mouvement.
function allerEtape(k) {
  const cible = Math.max(0, Math.min(ETAPES.length - 1, k))
  if (cible === (view.etape ?? 0)) return
  flushSave()
  view.etapeSens = cible > (view.etape ?? 0) ? 'avant' : 'arriere'
  view.etape = cible
  render()
  view.etapeSens = null
  window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
}

// Une action choisie hors de l'ecran (le menu du rapport) emprunte le meme
// chemin qu'un bouton de l'ecran : un bouton ephemere, clique puis retire.
function declencher(act) {
  const bouton = document.createElement('button')
  bouton.type = 'button'
  bouton.dataset.act = act
  bouton.hidden = true
  root.appendChild(bouton)
  bouton.click()
  bouton.remove()
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

function naviguer(ou) {
  if (ou === 'nouveau') return nouveauRapport()
  if (ou === 'agenda') return view.screen === 'agenda' ? undefined : openAgenda()
  if (ou === 'contacts') return view.screen === 'contacts' ? undefined : openContacts()
  if (ou === 'envois') return openEnvois()
  if (view.screen === 'home') return window.scrollTo({ top: 0, behavior: 'smooth' })
  return goHome()
}

// Ajoute une ligne directement dans le DOM (pas de render() complet) pour
// pouvoir l'amener a l'ecran et y placer le focus dans le meme geste que le
// tap sur "+ Ajouter" — indispensable pour que le clavier s'ouvre tout seul
// sur iOS, qui exige que .focus() soit appele sans await intercale.
function insertNewRow() {
  const row = S.newRow(view.report.type)
  view.report.rows.push(row)
  const list = root.querySelector('.rows')
  list.insertAdjacentHTML('beforeend', rowCardHTML(view, row, view.report.rows.length - 1))
  const card = list.lastElementChild
  card.classList.add('row-enter')
  card.addEventListener('animationend', () => card.classList.remove('row-enter'), { once: true })
  card.scrollIntoView({ block: 'center', behavior: 'smooth' })
  card.querySelector('.row-name')?.focus({ preventScroll: true })
  refreshCounters()
  S.saveReport(view.report)
}

// Fin d'un glissement : la carte a ete deposee a un nouveau rang, le modele
// suit. Pas de scrollIntoView ici - la carte est deja sous les yeux, c'est le
// doigt qui l'y a mise.
async function dropRow(from, to) {
  const rows = view.report.rows
  const [row] = rows.splice(from, 1)
  rows.splice(to, 0, row)
  await S.saveReport(view.report)
  render()
}

// Une piece declaree contaminee contredit le constat par defaut ("aucune
// trace visible") : on le retire tant qu'il n'a pas ete touche, pour qu'un
// rapport ne puisse pas partir en affirmant l'inverse de son tableau.
function clearDefaultRemarques() {
  if (!S.contaminatedCount(view.report)) return
  if (view.report.remarques !== S.DEFAULT_REMARQUES) return
  view.report.remarques = ''
  const ta = root.querySelector('[data-path="remarques"]')
  if (ta) ta.value = ''
  // On demande de completer les remarques : la rubrique s'ouvre, sinon le
  // message renvoie vers une porte fermee.
  view.sectionsRepliees.delete('remarques')
  // Le mot suit le type de rapport : un immeuble n'a pas de pieces contaminees,
  // il a des appartements.
  const t = typeOf(view.report)
  toast(`Remarques à compléter : un${accordE(t) ? 'e' : ''} ${t.rowLabel} est contaminé${accordE(t)}.`)
}

// Supprime une ligne avec une petite animation de sortie, et demande
// confirmation si elle contient deja quelque chose a perdre. Le nom d'une
// piece ne compte pas : les rapports demarrent avec des pieces standard
// pre-remplies (Salon, Chambre N°1...) que le technicien supprime sans
// friction si elles ne s'appliquent pas - seuls infos/statut/photos
// reellement saisis meritent une confirmation.
async function removeRowAnimated(rowId) {
  const row = view.report.rows.find((r) => r.id === rowId)
  const hasContent =
    row && (row.info || row.contamine || row.numero || row.resident || row.infos || view.report.photos.some((p) => p.rowId === rowId))
  if (hasContent && !confirm('Supprimer cette pièce et ses photos ?')) return

  const card = root.querySelector(`[data-row="${rowId}"]`)
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  let done = false
  const commit = async () => {
    if (done) return
    done = true
    view.report.rows = view.report.rows.filter((r) => r.id !== rowId)
    view.report.photos = view.report.photos.filter((p) => p.rowId !== rowId)
    await S.saveReport(view.report)
    render()
  }
  if (!card || reduced) return commit()
  card.style.maxHeight = `${card.scrollHeight}px`
  requestAnimationFrame(() => card.classList.add('row-exit'))
  card.addEventListener('transitionend', commit, { once: true })
  setTimeout(commit, 320) // filet de securite si transitionend ne part pas
}

// Glissement d'une carte par son badge numerote. Sur une poignee dediee plutot
// que sur la carte entiere : ailleurs, le meme geste doit continuer a faire
// defiler la page et a saisir dans les champs.
root.addEventListener('pointerdown', (ev) => {
  const grip = ev.target.closest?.('[data-grip]')
  if (!grip || ev.button > 0) return
  ev.preventDefault()
  startRowDrag(ev, grip, dropRow)
})

root.addEventListener('click', async (ev) => {
  const el = ev.target

  const newType = el.closest('[data-new]')?.dataset.new
  if (newType) return createReport(newType)

  // Les etapes du rapport : une pastille de la frise, un manque du bilan, ou
  // les boutons Precedent / Suivant de la barre du bas.
  const etapeCible = el.closest('[data-etape]')?.dataset.etape
  if (etapeCible !== undefined && view.screen === 'editor') return allerEtape(Number(etapeCible))
  const pasEtape = el.closest('[data-etape-pas]')?.dataset.etapePas
  if (pasEtape && view.screen === 'editor') return allerEtape((view.etape ?? 0) + Number(pasEtape))

  if (el.closest('[data-toggle-reports]')) {
    view.reportsOpen = !view.reportsOpen
    return render()
  }

  const filter = el.closest('[data-filter]')?.dataset.filter
  if (filter) {
    view.filter = filter
    return render()
  }

  const delId = el.closest('[data-del]')?.dataset.del
  if (delId) {
    ev.stopPropagation()
    // Un immeuble emporte ses rapports de detection : on le dit avant, pas
    // apres. Le compte vient de la vue, deja chargee.
    const enfants = (view.reports ?? []).find((r) => r.id === delId)
      ? (await S.listReports()).filter((r) => r.parentId === delId).length
      : 0
    const question = enfants
      ? `Supprimer ce rapport et ${enfants === 1 ? 'le rapport de détection qui en dépend' : `les ${enfants} rapports de détection qui en dépendent`} ?`
      : 'Supprimer ce rapport ?'
    if (confirm(question)) {
      await S.deleteReport(delId)
      goHome()
    }
    return
  }

  const openId = el.closest('[data-open]')?.dataset.open
  if (openId) {
    // Un rapport ouvert depuis la fiche d'un client y ramene au retour.
    if (view.screen === 'fiche') view.retour = view.fiche.id
    return openReport(openId)
  }

  // Le calendrier : un jour touche (il peut etre du mois voisin, le calendrier
  // suit), ou les fleches d'un mois a l'autre.
  const jourAgenda = el.closest('[data-agenda-jour]')?.dataset.agendaJour
  if (jourAgenda) {
    view.agendaJour = jourAgenda
    view.agendaMois = jourAgenda.slice(0, 7)
    view.agendaSemaine = lundiDe(jourAgenda)
    return render()
  }
  const pasMois = el.closest('[data-agenda-mois]')?.dataset.agendaMois
  if (pasMois) {
    view.agendaMois = decalerMois(view.agendaMois ?? S.todayISO().slice(0, 7), Number(pasMois))
    return render()
  }
  const pasSemaine = el.closest('[data-agenda-semaine]')?.dataset.agendaSemaine
  if (pasSemaine) {
    view.agendaSemaine = decalerSemaine(view.agendaSemaine ?? lundiDe(view.agendaJour ?? S.todayISO()), Number(pasSemaine))
    return render()
  }
  // Mois ou semaine : le choix se retient d'une ouverture a l'autre.
  const vueAgenda = el.closest('[data-agenda-vue]')?.dataset.agendaVue
  if (vueAgenda) {
    view.agendaVue = vueAgenda
    view.agendaSemaine = lundiDe(view.agendaJour ?? S.todayISO())
    try {
      localStorage.setItem(VUE_AGENDA, vueAgenda)
    } catch {
      // Pas de place : la vue repartira du mois a la prochaine ouverture.
    }
    return render()
  }
  // Le filtre "qui" : "Tout le monde" porte une valeur vide, d'ou le test sur
  // le bouton lui-meme plutot que sur sa valeur.
  const btnQui = el.closest('[data-agenda-qui]')
  if (btnQui) {
    view.agendaQui = btnQui.dataset.agendaQui
    return render()
  }
  // La tournee montree par le tableau de l'accueil : seul le tableau change,
  // pour ne pas redessiner l'accueil entier a chaque bascule.
  const btnTournee = el.closest('[data-tableau-qui]')
  if (btnTournee) {
    view.tableauQui = btnTournee.dataset.tableauQui
    return majTableau()
  }

  // Un rendez-vous de l'agenda (ou de l'accueil) : sa fiche.
  const rdvId = el.closest('[data-rdv]')?.dataset.rdv
  if (rdvId) {
    const rdv = view.agenda?.rdvs?.find((r) => r.id === rdvId)
    if (rdv) montrerRdv(rdv)
    return
  }

  // Une case vide du semainier : on y pose un rendez-vous a cette heure-la.
  const creneau = el.closest('[data-agenda-creneau]')?.dataset.agendaCreneau
  if (creneau) {
    const [date, heure] = creneau.split('|')
    view.agendaJour = date
    view.agendaSemaine = lundiDe(date)
    return editerRdv(null, { date, heure })
  }

  // L'etoile d'une ligne du carnet : marque un client habituel sans ouvrir sa
  // fiche. Teste avant la ligne, qui la contient.
  const favoriId = el.closest('[data-favori]')?.dataset.favori
  if (favoriId) {
    const c = await S.basculerFavori(favoriId)
    view.contacts = await contactsVisibles()
    if (c) toast(c.favori ? 'Ajouté aux favoris' : 'Retiré des favoris')
    return render()
  }

  const ficheId = el.closest('[data-fiche]')?.dataset.fiche
  if (ficheId) return openFiche(ficheId)

  const carnetFiltre = el.closest('[data-carnet-filtre]')?.dataset.carnetFiltre
  if (carnetFiltre) {
    view.carnetFiltre = carnetFiltre
    return render()
  }

  const nouveauPour = el.closest('[data-new-pour]')?.dataset.newPour
  if (nouveauPour && view.fiche) {
    view.retour = view.fiche.id
    return createReport(nouveauPour, view.fiche)
  }

  const chip = el.closest('.chip')
  if (chip && chip.closest('[data-mandant-type]')) {
    const value = chip.dataset.val
    view.report.mandant.type = view.report.mandant.type === value ? '' : value
    // Une gerance n'a pas de prenom : le nom repris pour le locataire change.
    if (view.report.lieu.sameNameAsMandant) applySameName(view.report)
    scheduleSave()
    return render()
  }

  // --- puce de nom de piece rapide (remplit sans ouvrir le clavier)
  const quickRoom = el.closest('[data-quick-room]')?.dataset.quickRoom
  if (quickRoom) {
    const card = el.closest('.row-card')
    const row = rowOf(el)
    row.nom = quickRoom
    card.querySelector('.row-name').value = quickRoom
    card.querySelector('.quick-rooms')?.remove()
    refreshCounters()
    scheduleSave()
    return
  }

  // --- une proposition du carnet remplit tout le bloc mandant
  const fillId = el.closest('[data-fill-contact]')?.dataset.fillContact
  if (fillId) {
    const c = view.contacts.find((x) => x.id === fillId)
    if (c) await remplirMandant(c)
    return
  }

  // --- puce de constat : s'ajoute a ce qui est deja ecrit, les puces restant
  // affichees. Un constat en appelle souvent un second ("marquage franc, puis
  // punaises visibles") ; la minuscule apres la virgule fait une phrase et non
  // deux morceaux colles.
  const quickInfo = el.closest('[data-quick-info]')?.dataset.quickInfo
  if (quickInfo) {
    const card = el.closest('.row-card')
    const row = rowOf(el)
    const champ = typeOf(view.report).layout === 'pieces' ? 'info' : 'infos'
    const actuel = (row[champ] ?? '').trim()
    if (!actuel.toLowerCase().includes(quickInfo.toLowerCase())) {
      row[champ] = actuel ? `${actuel}, ${quickInfo[0].toLowerCase()}${quickInfo.slice(1)}` : quickInfo
      card.querySelector(`[data-row-field="${champ}"]`).value = row[champ]
      scheduleSave()
    }
    return
  }

  // --- puce de recommandation : s'ajoute a la suite des remarques, une par
  // ligne. Les puces restent affichees, on en empile plusieurs ; un texte deja
  // present n'est pas redonne, pour qu'un double appui ne fasse pas de doublon.
  const quickNote = el.closest('[data-quick-note]')?.dataset.quickNote
  if (quickNote) {
    const ta = root.querySelector('[data-path="remarques"]')
    const actuel = ta.value.trim()
    if (!actuel.includes(quickNote)) {
      ta.value = actuel ? `${actuel}\n${quickNote}` : quickNote
      set('remarques', ta.value)
      scheduleSave()
      planifierEtapes()
    }
    return
  }

  // --- choix du theme, dans les reglages
  const themeBtn = el.closest('[data-theme-choice] .seg-btn')
  if (themeBtn) {
    setTheme(themeBtn.dataset.val)
    return render()
  }

  // --- segments Oui / Non / ?
  const segBtn = el.closest('.seg-btn')
  if (segBtn) {
    const segRow = segBtn.closest('[data-seg-row]')
    const segPath = segBtn.closest('[data-seg]')
    const value = segBtn.dataset.val
    if (segRow) {
      const row = view.report.rows.find((r) => r.id === segRow.dataset.segRow)
      row.contamine = row.contamine === value ? '' : value
      segRow.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('on', b.dataset.val === row.contamine))
      segRow.closest('.row-card').dataset.status = row.contamine || ''
      refreshCounters()
      clearDefaultRemarques()
      rafraichirEtapes()
      // "Non" clot la piece : rien a decrire, rien a photographier, on passe a
      // la suivante - la carte se replie d'elle-meme et la suivante remonte
      // sous le pouce. "Contaminée" et "?" laissent la carte ouverte : il reste
      // justement quelque chose a y ecrire.
      if (row.contamine === 'non' && !row.info && !row.infos && !view.report.photos.some((p) => p.rowId === row.id)) {
        view.repliees.add(row.id)
        scheduleSave()
        return render()
      }
    } else if (segPath) {
      const current = get(segPath.dataset.seg)
      const next = current === value ? '' : value
      set(segPath.dataset.seg, next)
      segPath.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('on', b.dataset.val === next))
    }
    scheduleSave()
    return
  }

  const delRow = el.closest('[data-del-row]')?.dataset.delRow
  if (delRow) return removeRowAnimated(delRow)

  // Replier / deplier une piece. Teste apres la suppression : la croix est
  // posee dans l'en-tete repliee, qui porte elle-meme le geste de depliage.
  // Le badge est exclu : c'est la poignee de glissement, et le clic qui suit
  // un deplacement aurait replie la carte qu'on vient de ranger.
  const foldId = el.closest('[data-grip]') ? null : el.closest('[data-fold]')?.dataset.fold
  if (foldId) {
    if (!view.repliees.delete(foldId)) view.repliees.add(foldId)
    return render()
  }

  const foldSection = el.closest('[data-fold-section]')?.dataset.foldSection
  if (foldSection) {
    if (!view.sectionsRepliees.delete(foldSection)) view.sectionsRepliees.add(foldSection)
    return render()
  }

  const delPhoto = el.closest('[data-del-photo]')?.dataset.delPhoto
  if (delPhoto) {
    view.report.photos = view.report.photos.filter((p) => p.id !== delPhoto)
    await S.saveReport(view.report)
    return render()
  }

  const move = el.closest('[data-move-photo]')
  if (move) return movePhoto(move.dataset.movePhoto, Number(move.dataset.dir))

  const thumb = el.closest('[data-photo-id]')
  if (thumb && !el.closest('[data-del-photo]')) {
    const photo = view.report.photos.find((p) => p.id === thumb.dataset.photoId)
    const result = await openAnnotator(photo.original ?? photo.dataUrl, { shapes: photo.shapes })
    if (result) {
      photo.dataUrl = result.dataUrl
      photo.shapes = result.shapes
      await S.saveReport(view.report)
      render()
    }
    return
  }

  const photoBtn = el.closest('[data-photo]')
  if (photoBtn) return capture(photoBtn.dataset.photo)

  // --- logo du partenaire : la case s'ouvre au tap, une puce reprend un
  // partenaire deja utilise sans avoir a rechercher son fichier.
  if (el.closest('[data-depose-logo]')) return poserLogoPartenaire(await pickFile())

  const partId = el.closest('[data-partenaire]')?.dataset.partenaire
  if (partId) {
    const p = (view.partenaires ?? []).find((x) => x.id === partId)
    if (!p) return
    view.report.partenaire = { nom: p.nom ?? '', logo: p.logo }
    await S.saveReport(view.report)
    await S.rememberPartenaire(view.report.partenaire)
    view.partenaires = await S.listPartenaires()
    return render()
  }

  const addChild = el.closest('[data-add-child]')?.dataset.addChild
  if (addChild) return createChild(addChild)

  const openChild = el.closest('[data-open-child]')?.dataset.openChild
  if (openChild) return openReport(openChild)

  // --- ecran des envois
  const retryId = el.closest('[data-retry]')?.dataset.retry
  if (retryId) {
    showLoading('Nouvel essai…')
    const { ok, motif } = await retryJob(retryId)
    hideLoading()
    toast(ok ? 'Rapport envoyé.' : motif)
    return openEnvois()
  }

  if (el.closest('[data-retry-all]')) {
    showLoading('Envoi en cours…')
    // "Tout réessayer" relance aussi les echecs : c'est le geste qu'on fait
    // apres avoir corrige un mot de passe ou une adresse.
    for (const job of view.queue) await retryJob(job.id)
    hideLoading()
    return openEnvois()
  }

  const dropEnvoi = el.closest('[data-drop-envoi]')?.dataset.dropEnvoi
  if (dropEnvoi) {
    if (!confirm("Retirer cet envoi de la liste ? Le rapport, lui, reste dans « Mes rapports » et pourra être renvoyé.")) return
    await deleteJob(dropEnvoi)
    return openEnvois()
  }

  const act = el.closest('[data-act]')?.dataset.act
  if (!act) return
  if (act === 'copier-mandant' || act === 'copier-contact') {
    const texte = S.mandantEnTexte((act === 'copier-mandant' ? view.report?.mandant : view.fiche) ?? {})
    if (!texte) return toast('Aucune coordonnée à copier')
    return copier(texte)
  }
  if (act === 'modifier-contact') {
    const id = view.fiche?.id
    return openContactDialog(view.fiche, () => openFiche(id))
  }
  if (act === 'favori-fiche') {
    const c = await S.basculerFavori(view.fiche?.id)
    if (!c) return
    view.fiche = c
    view.contacts = await contactsVisibles()
    toast(c.favori ? 'Ajouté aux favoris' : 'Retiré des favoris')
    return render()
  }
  if (act === 'supprimer-contact') {
    const c = view.fiche
    if (!c) return
    const nom = S.fullName(c) || 'ce contact'
    if (!confirm(`Supprimer « ${nom} » du carnet ?\nIl disparaîtra aussi du carnet de l’équipe. Ses rapports, eux, restent.`)) return
    await S.deleteContact(c.id)
    toast('Contact supprimé')
    return openContacts()
  }
  if (act === 'choisir-contact') {
    const c = await choisirContact(view.contacts ?? [], view.reports ?? [])
    if (c) await remplirMandant(c)
    return
  }
  if (act === 'drop-partenaire') {
    // Le partenaire quitte ce rapport, mais reste dans la liste de l'appareil :
    // on le retire d'une intervention, on ne le renie pas.
    view.report.partenaire = { nom: '', logo: null }
    await S.saveReport(view.report)
    return render()
  }
  if (act === 'dupliquer') {
    const copie = S.duplicateReport(view.report)
    await S.saveReport(copie)
    reserverNumeros()
    toast('Rapport dupliqué : le lieu et les pièces sont repris, les constats sont à refaire.')
    return openReport(copie.id)
  }
  if (act === 'terminer') {
    // Un rapport remis a la main fait entrer son client au carnet, comme un
    // rapport parti par mail.
    const rapport = view.report
    if (!estInvite()) await S.rememberContact(rapport.mandant)
    await S.terminerReport(rapport)
    montrerSceau({ titre: 'Rapport terminé', ref: rapport.ref })
    // Le cachet a le temps de se poser avant la question du controle de suivi.
    if (S.contaminatedCount(rapport)) await new Promise((r) => setTimeout(r, 900))
    await proposerControle(rapport)
    return goHome()
  }
  if (act === 'rouvrir') {
    // On ne quitte pas l'ecran : on rouvre justement pour corriger quelque
    // chose, et repartir a l'accueil obligerait a revenir aussitot.
    await S.rouvrirReport(view.report)
    toast('Rapport rouvert.')
    return render()
  }
  if (act === 'menu-rapport') {
    const choix = await ouvrirMenuRapport({ fini: !S.enCours(view.report), sousRapport: !!view.report?.parentId })
    if (choix) declencher(choix)
    return
  }
  if (act === 'open-contacts') return openContacts()
  if (act === 'open-agenda') return openAgenda()
  if (act === 'ajouter-rdv') return editerRdv()
  if (act === 'open-reglages') return openReglages()
  if (act === 'open-admin') return openAdmin()
  if (act === 'deconnexion') {
    if (!confirm('Se déconnecter ? Le code sera redemandé tout de suite, et à chaque ouverture tant que « Se souvenir de moi » ne sera pas coché.')) return
    return seDeconnecter()
  }
  if (act === 'admin-ajouter') return adminAjouter()
  if (act === 'admin-action') {
    const b = el.closest('[data-act]')
    return adminAction(b.dataset.action, b.dataset.id)
  }
  if (act === 'admin-filtre') {
    view.adminFiltre = el.closest('[data-act]').dataset.val
    return render()
  }
  if (act === 'admin-masquer-code') {
    view.adminCodeRevele = null
    return render()
  }
  if (act === 'open-envois') return openEnvois()
  if (act === 'add-contact') return openContactDialog(undefined, refreshContacts)
  if (act === 'home') {
    // Un rapport deja envoye/en file n'a plus rien a "annuler" : on ne
    // demande que pour un brouillon, qu'il vienne d'etre cree ou repris.
    // Le carnet de contacts n'a pas de rapport ouvert, rien a confirmer.
    if (view.screen === 'editor' && S.enCours(view.report)) {
      const choice = await confirmLeave()
      if (choice === 'cancel') return
      if (choice === 'delete') await S.deleteReport(view.report.id)
    }
    if (view.screen === 'editor' && view.report?.parentId) return openReport(view.report.parentId)
    if (view.screen === 'editor' && view.retour) return openFiche(view.retour)
    return goHome()
  }
  if (act === 'add-row') return insertNewRow()
  if (act === 'residents-carnet') return residentsAuCarnet()
  if (act === 'save-contact') {
    if (estInvite()) return
    await S.rememberContact(view.report.mandant)
    view.contacts = await contactsVisibles()
    toast('Mandant ajouté au carnet')
    return
  }
  if (act === 'sign') {
    // Le nom propose est celui du locataire ou du mandant, mais il reste
    // modifiable : c'est souvent quelqu'un d'autre qui ouvre la porte.
    view.report.signataire ??= { nom: '' }
    if (!view.report.signataire.nom) {
      view.report.signataire.nom = view.report.lieu?.locataire || S.fullName(view.report.mandant) || ''
    }
    const sig = await openSignaturePad(view.report.signature, { title: 'Signature sur place' })
    if (sig !== undefined) {
      view.report.signature = sig
      await S.saveReport(view.report)
      render()
    }
    return
  }
  if (act === 'sign-tech') {
    const tech = (view.report.technicien ??= { nom: S.TECHNICIEN_NOM_DEFAUT, signature: null })
    const sig = await openSignaturePad(tech.signature, { title: 'Signature du technicien' })
    if (sig !== undefined) {
      tech.signature = sig
      await S.saveReport(view.report)
      // Premiere signature de technicien enregistree sur l'appareil : elle
      // devient le defaut sans rien demander, c'est le geste attendu. Une
      // modification ulterieure reste locale au rapport (collegue de passage)
      // et ne se generalise que par "Enregistrer par defaut".
      const current = await S.loadTechnicien()
      if (sig && !current.signature) {
        await S.saveTechnicien(tech)
        toast('Signature enregistrée par défaut')
      }
      render()
    }
    return
  }
  if (act === 'tech-default') {
    await S.saveTechnicien(view.report.technicien ?? {})
    toast('Technicien enregistré par défaut')
    return
  }
  if (act === 'sauvegarder-en-ligne') {
    showLoading('Sauvegarde en ligne…')
    const r = await sauvegarder()
    hideLoading()
    toast(r === true ? 'Sauvegarde en ligne à jour.' : r)
    return render()
  }
  if (act === 'restaurer-en-ligne') {
    if (!navigator.onLine) return toast('Il faut du réseau pour récupérer la sauvegarde.')
    showLoading('Recherche des sauvegardes…')
    let liste
    try {
      liste = await listerSauvegardes()
    } catch (err) {
      hideLoading()
      return toast(err.message)
    }
    hideLoading()
    if (!liste.length) return toast('Rien à récupérer : tout ce qui est sauvegardé est déjà sur ce téléphone.')
    const ids = await choisirRestauration(liste)
    if (!ids?.length) return
    showLoading('Récupération des rapports et des photos…')
    try {
      const n = await restaurer(ids)
      hideLoading()
      toast(`${n} rapport${n > 1 ? 's' : ''} récupéré${n > 1 ? 's' : ''}.`)
    } catch (err) {
      hideLoading()
      toast(`Récupération interrompue : ${err.message}`)
    }
    return goHome()
  }
  if (act === 'export-backup') {
    showLoading('Préparation de la sauvegarde…')
    try {
      const data = await S.exportBackup()
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
      hideLoading()
      await shareOrDownload(blob, S.backupFilename())
      S.markBackup()
      toast(`${data.reports.length} rapport(s) et ${data.contacts.length} contact(s) sauvegardés.`)
      if (view.screen === 'reglages') render()
    } catch (err) {
      hideLoading()
      console.error('Sauvegarde impossible', err)
      toast('Sauvegarde impossible.')
    }
    return
  }
  if (act === 'import-backup') {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      try {
        const data = JSON.parse(await file.text())
        const n = (data.reports ?? []).length
        if (!confirm(`Restaurer cette sauvegarde ?\n${n} rapport(s) et ${(data.contacts ?? []).length} contact(s) seront ajoutés à ceux déjà présents. Rien ne sera effacé.`)) return
        showLoading('Restauration…')
        const bilan = await S.importBackup(data)
        hideLoading()
        toast(`${bilan.reports} rapport(s) et ${bilan.contacts} contact(s) restaurés.`)
        await refreshContacts()
      } catch (err) {
        hideLoading()
        console.error('Restauration impossible', err)
        toast(err?.message === 'Fichier de sauvegarde non reconnu' ? err.message : 'Fichier illisible.')
      }
    }
    input.click()
    return
  }
  if (act === 'preview') return previewPdf(view.report, view.children)
  if (act === 'send') {
    // Le mandant rejoint le carnet au moment de l'envoi : c'est la qu'il est
    // complet et verifie. L'enregistrer a la frappe creerait un contact par
    // lettre tapee ; ne jamais l'enregistrer oblige a le ressaisir a chaque
    // intervention pour la meme regie.
    if (!estInvite()) await S.rememberContact(view.report.mandant)
    view.contacts = await contactsVisibles()
    const rapport = view.report
    return openSendDialog(rapport, view.children, () => proposerControle(rapport).then(goHome))
  }
})

// Un client du carnet remplit tout le bloc mandant d'un coup.
async function remplirMandant(c) {
  view.report.mandant = S.contactVersMandant(c)
  if (view.report.lieu.sameAsMandant) applySameAddress(view.report)
  if (view.report.lieu.sameNameAsMandant) applySameName(view.report)
  await S.saveReport(view.report)
  toast('Mandant repris du carnet')
  render()
}

async function copier(texte) {
  try {
    await navigator.clipboard.writeText(texte)
  } catch {
    // Le presse-papiers est refuse hors contexte securise, ou sans geste
    // reconnu : on retombe sur la vieille methode, qui marche partout.
    const zone = document.createElement('textarea')
    zone.value = texte
    zone.style.position = 'fixed'
    zone.style.opacity = '0'
    document.body.appendChild(zone)
    zone.select()
    document.execCommand('copy')
    zone.remove()
  }
  toast('Coordonnées copiées')
}

// --- photos ----------------------------------------------------------------

// `capture` n'est pose que pour une prise de vue : sur un telephone, il ouvre
// l'appareil photo au lieu de la galerie. Un logo, lui, se choisit dans les
// fichiers - il n'a jamais ete photographie.
function pickFile({ capture = null } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    if (capture) input.capture = capture
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.click()
  })
}

async function capture(rowId) {
  if (!(await placePourUnePhoto())) return
  const file = await pickFile({ capture: 'environment' })
  if (!file) return
  toast('Traitement de la photo…')
  const photo = await fileToPhoto(file)
  const row = view.report.rows.find((r) => r.id === rowId)
  const label = row ? rowLabelFor(view.report, row) : ''
  const result = await openAnnotator(photo.dataUrl, { label })
  if (!result) return
  view.report.photos.push({
    id: S.uid(),
    rowId: rowId || null,
    original: photo.dataUrl,
    dataUrl: result.dataUrl,
    shapes: result.shapes,
  })
  await S.saveReport(view.report)
  render()
}

// --- logo du partenaire ----------------------------------------------------

// Pose le logo depose ou choisi sur le rapport ouvert, et le retient pour les
// suivants. Le fichier est reduit et re-encode avant d'etre stocke : un logo
// tire d'un site web pese souvent plus que toutes les photos du rapport.
async function poserLogoPartenaire(file) {
  if (!file?.type?.startsWith('image/')) return toast('Ce fichier n’est pas une image.')
  showLoading('Préparation du logo…')
  try {
    const logo = await fileToLogo(file)
    view.report.partenaire = { ...(view.report.partenaire ?? {}), logo }
    await S.saveReport(view.report)
    await S.rememberPartenaire(view.report.partenaire)
    view.partenaires = await S.listPartenaires()
    hideLoading()
    render()
  } catch (err) {
    hideLoading()
    console.error('Logo illisible', err)
    toast('Impossible de lire ce logo. Essayez un PNG ou un JPEG.')
  }
}

// Glisser-deposer sur la case, pour l'ordinateur. Le tap, lui, passe par le
// selecteur de fichiers (voir le gestionnaire de clic).
root.addEventListener('dragover', (ev) => {
  const zone = ev.target.closest?.('[data-depose-logo]')
  if (!zone) return
  ev.preventDefault()
  zone.classList.add('survol')
})

root.addEventListener('dragleave', (ev) => {
  ev.target.closest?.('[data-depose-logo]')?.classList.remove('survol')
})

root.addEventListener('drop', (ev) => {
  const zone = ev.target.closest?.('[data-depose-logo]')
  if (!zone) return
  ev.preventDefault()
  zone.classList.remove('survol')
  poserLogoPartenaire(ev.dataTransfer?.files?.[0])
})

/**
 * Deplace une photo d'un cran dans son propre groupe - les photos d'une piece,
 * ou les photos libres. L'echange se fait dans le tableau general du rapport,
 * celui que suit l'annexe du PDF : ce qu'on voit dans la bande est l'ordre qui
 * sera imprime.
 */
async function movePhoto(id, dir) {
  const photos = view.report.photos
  const photo = photos.find((p) => p.id === id)
  if (!photo) return
  const groupe = photos.filter((p) => (p.rowId ?? null) === (photo.rowId ?? null))
  const cible = groupe.indexOf(photo) + dir
  if (cible < 0 || cible >= groupe.length) return
  const a = photos.indexOf(photo)
  const b = photos.indexOf(groupe[cible])
  ;[photos[a], photos[b]] = [photos[b], photos[a]]
  await S.saveReport(view.report)
  render()
}

/**
 * Verse les residents d'un immeuble dans le carnet : chaque ligne nommee
 * devient un contact, a l'adresse de l'immeuble et avec son numero
 * d'appartement. Sans cela il faudrait les ressaisir un par un a la prochaine
 * intervention dans le meme batiment.
 */
async function residentsAuCarnet() {
  if (estInvite()) return toast('Le carnet n’est pas disponible en session invité.')
  const r = view.report
  const nouveaux = r.rows
    .filter((row) => (row.resident || '').trim())
    .map((row) => ({
      type: 'locataire',
      nom: row.resident.trim(),
      prenom: '',
      adresse: [r.lieu.adresse, row.numero && `app. ${row.numero}`].filter(Boolean).join(', '),
      npaLieu: r.lieu.npaLieu ?? '',
      email: '',
      tel: '',
    }))
  const { ajoutes, connus } = await S.ajouterContacts(nouveaux)
  view.contacts = await contactsVisibles()
  toast(
    ajoutes
      ? `${ajoutes} résident${ajoutes > 1 ? 's' : ''} ajouté${ajoutes > 1 ? 's' : ''} au carnet${connus ? `, ${connus} déjà connu${connus > 1 ? 's' : ''}` : ''}`
      : 'Tous ces résidents sont déjà dans le carnet'
  )
}

async function createChild(rowId) {
  const parent = view.report
  const row = parent.rows.find((r) => r.id === rowId)
  const child = S.newReport('detection')
  reserverNumeros()
  child.parentId = parent.id
  // mandant copie tel quel : la Regie du sous-rapport en derive automatiquement (voir templates.js)
  child.mandant = { ...parent.mandant }
  // Meme intervention, meme partenaire : les pages du rapport fusionne doivent
  // toutes porter les memes deux logos, pas seulement la premiere.
  child.partenaire = { ...(parent.partenaire ?? { nom: '', logo: null }) }
  child.lieu.adresseIntervention = [parent.lieu.adresse, parent.lieu.npaLieu].filter(Boolean).join(', ')
  child.lieu.etagePorte = [row.etage, row.numero].filter(Boolean).join(' - ')
  child.lieu.locataire = row.resident ?? ''
  child.lieu.bon = parent.lieu.bon ?? ''
  child.lieu.dateIntervention = row.date || S.todayISO()
  await S.saveReport(child)
  row.sousRapportId = child.id
  await S.saveReport(parent)
  openReport(child.id)
}

// --- file d'attente et demarrage -------------------------------------------

// L'etat des envois se lit sur l'icone de l'en-tete, pas sur une banniere
// collee en bas de l'ecran : elle recouvrait la barre d'actions du rapport
// ouvert, et ne disait ni ce qui attendait, ni pourquoi.
async function updatePendingBadge() {
  await majCompteurs()
  majDock({ ecran: view.screen, invite: estInvite(), enAttente: view.enAttente, enEchec: view.enEchec })
}

// --- reseau ----------------------------------------------------------------

// L'app fonctionne hors ligne par construction : le bandeau ne previent pas
// d'une panne, il rassure. Dans une cave, on ne savait pas si l'app travaillait
// ou si le reseau ramait - on ne l'apprenait qu'apres coup, dans Envois.
function majReseau() {
  document.body.dataset.reseau = navigator.onLine ? 'en-ligne' : 'hors-ligne'
}
window.addEventListener('offline', majReseau)
window.addEventListener('online', majReseau)

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

// --- place restante --------------------------------------------------------

// L'ecriture peut echouer plusieurs fois par seconde (l'enregistrement
// automatique repasse toutes les 400 ms) : sans ce delai, l'ecran se couvrirait
// de la meme alerte. Une minute suffit a la rendre lisible sans la noyer.
const REPOS_ALERTE = 60_000
let derniereAlerte = 0

async function signalerStockage(motif) {
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
async function placePourUnePhoto() {
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

export async function boot() {
  // Le verrou se pose avant tout affichage : l'accueil se dessine dessous, sans
  // qu'une liste de rapports ne transparaisse une fraction de seconde avant le code.
  installerVerrou()
  // La navigation du bas, posee une fois : elle traverse les ecrans.
  installerDock(naviguer)
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
    rafraichirTableau({ force: true })
  })
  // Premiere ouverture : le code n'est connu qu'une fois l'ecran de code passe.
  window.addEventListener('af-deverrouille', () => {
    reserverNumeros()
    rafraichirAgenda()
    rafraichirTableau({ force: true })
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
