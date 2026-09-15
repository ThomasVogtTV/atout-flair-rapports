// Bureau : l'ecran ouvert, les donnees de l'equipe, et les gestes du planning et
// de l'administration.
//
// Terrain (src/app.js) fait les rapports sur le telephone ; le Bureau organise.
// Les deux vivent a la meme adresse : le code d'acces, retenu une fois, vaut pour
// les deux, et les donnees sont les memes. Seul un administrateur entre ici - un
// employe y trouve le chemin de Terrain.

import * as S from '../state.js'
import { root, toast, showLoading, hideLoading } from '../ui/dom.js'
import { installerVerrou, seDeconnecter, estAdmin, identite } from '../lock.js'
import { adminAppel, finDeJournee } from '../admin-api.js'
import { agendaEnCache, chargerAgenda, enregistrerRdv, supprimerRdv, marquerStatut, ajouterAuCalendrier } from '../agenda.js'
import { formulaireRdv, ouvrirRdv } from '../rdv-dialog.js'
import { nomClient, decalerMois, lundiDe, decalerSemaine, conflitsDe } from '../agenda-outils.js'
import { choisirContact } from '../contact-picker.js'
import { synchroniserCarnet } from '../carnet-sync.js'
import { sauvegardesEnLigne, rapportEnLigne } from '../sauvegarde.js'
import { previewPdf, ouvrirPdf, shareOrDownload } from '../send.js'
import { marquerJournalVu, incidentsVus, marquerIncidentsVus } from '../equipe-alertes.js'
import { verifierMiseAJour } from '../mise-a-jour.js'
import { appelIncidents } from '../incidents.js'
import { PAGE_JOURNAL } from '../views/admin.js'
import { ECRANS, bureauView } from './vues.js'

// Au bureau, la semaine est la vue de travail : c'est elle qui s'ouvre, tant
// qu'on n'a pas choisi le mois.
const VUE_KEY = 'af-bureau-vue'
// Revenu sur l'onglet apres une minute, le bureau relit l'equipe et l'agenda.
const FRAIS_MS = 60_000

let view = { ecran: 'planning', admin: null, agenda: null, adminRapports: null }
let luA = 0

// La page affichee, pour ne rejouer l'entree des blocs qu'en arrivant sur une
// page - pas a chaque re-rendu (un jour choisi, un filtre).
let pageAffichee = null
let entreeTimer = null

function render() {
  document.body.dataset.screen = view.ecran
  document.body.dataset.role = identite()?.role ?? ''
  root.innerHTML = bureauView(view)
  const page = `${identite()?.role ?? ''}:${view.ecran}`
  if (page === pageAffichee) return
  pageAffichee = page
  root.classList.remove('entree')
  void root.offsetWidth // relance l'animation
  root.classList.add('entree')
  clearTimeout(entreeTimer)
  entreeTimer = setTimeout(() => root.classList.remove('entree'), 1200)
}

// --- les pages ----------------------------------------------------------------

function aller(ecran) {
  if (!ECRANS.includes(ecran)) return
  view.ecran = ecran
  // Ce qui etait deja vu en arrivant : les nouveaux incidents restent marques
  // tant qu'on est sur la page, meme une fois comptes comme vus.
  if (ecran === 'incidents') view.incidentsVuAvant = incidentsVus()
  // L'adresse garde la page : un rechargement ou un favori y ramene.
  history.replaceState(null, '', `#${ecran}`)
  render()
  document.scrollingElement.scrollTop = 0
  if (ecran === 'rapports' && !view.adminRapports) chargerRapports()
  if (ecran === 'envois' && view.admin?.journal) marquerJournalVu(view.admin.journal)
  if (ecran === 'incidents') chargerIncidents()
  if (ecran === 'donnees') chargerConservation()
}

// --- les donnees ----------------------------------------------------------------

/** L'equipe et l'agenda, relus ensemble. */
async function recharger({ force = false } = {}) {
  if (!estAdmin()) return render()
  if (!force && Date.now() - luA < FRAIS_MS) return
  luA = Date.now()
  if (!navigator.onLine) {
    view.admin ??= { erreur: 'Hors ligne : le bureau a besoin du réseau.' }
    view.agenda ??= agendaEnCache()
    return render()
  }
  const [admin, agenda] = await Promise.all([
    adminAppel('GET').catch((err) => ({ erreur: err.message, base: err.base })),
    chargerAgenda(),
  ])
  view.admin = admin
  if (agenda) view.agenda = agenda
  // Le journal est sous les yeux : l'alerte des envois rates, dans Terrain, se tait.
  if (view.ecran === 'envois' && admin.journal) marquerJournalVu(admin.journal)
  // Arrive directement sur une page qui a ses propres donnees (favori, rechargement).
  if (view.ecran === 'rapports' && !view.adminRapports?.liste) chargerRapports()
  if (view.ecran === 'incidents') chargerIncidents()
  if (view.ecran === 'donnees') chargerConservation()
  render()
}

async function rechargerEquipe() {
  const admin = await adminAppel('GET').catch((err) => ({ erreur: err.message, base: err.base }))
  view.admin = admin
  render()
}

async function chargerRapports() {
  view.adminRapports = { chargement: true }
  render()
  const rapports = await sauvegardesEnLigne()
    .then((liste) => ({ liste }))
    .catch((err) => ({ erreur: err.message }))
  view.adminRapports = rapports
  if (view.ecran === 'rapports') render()
}

// --- les incidents techniques ----------------------------------------------------

async function chargerIncidents() {
  if (!view.incidents?.liste) {
    view.incidents = { chargement: true }
    render()
  }
  const incidents = await appelIncidents('GET')
    .then((d) => ({ liste: d.incidents ?? [] }))
    .catch((err) => ({ erreur: err.message }))
  view.incidents = incidents
  // Sous les yeux : l'alerte de Terrain et la pastille de la navigation se taisent.
  if (incidents.liste) marquerIncidentsVus(incidents.liste)
  if (view.ecran === 'incidents') render()
}

// --- les donnees personnelles ------------------------------------------------------

async function chargerConservation() {
  if (!view.conservation?.categories) {
    view.conservation = { chargement: true }
    render()
  }
  const conservation = await adminAppel('GET', null, { conservation: '1' }).catch((err) => ({ erreur: err.message }))
  view.conservation = conservation
  if (view.ecran === 'donnees') render()
}

async function reglerIncidents(corps) {
  try {
    await appelIncidents('POST', corps)
  } catch (err) {
    return toast(err.message)
  }
  if (view.admin?.incidents) view.admin.incidents = corps.sig ? view.admin.incidents.filter((i) => i.sig !== corps.sig) : []
  await chargerIncidents()
}

// --- le planning ------------------------------------------------------------------

const equipeActive = () => (view.admin?.employes ?? []).filter((e) => e.actif && !e.expire)

async function rafraichirAgenda() {
  const agenda = await chargerAgenda()
  if (!agenda) return
  view.agenda = agenda
  render()
}

// Qui est deja pris a cette heure-la ? Un rendez-vous sans "pour" est le mien.
function conflitsPour(saisi) {
  const pour = saisi.pour ?? view.agenda?.moi ?? null
  return conflitsDe({ ...saisi, pour }, view.agenda?.rdvs ?? [])
}

async function editerRdv(rdv = null, creneau = {}) {
  if (!navigator.onLine) return toast("Pas de réseau : l'agenda de l'équipe se modifie avec du réseau.")
  const saisi = await formulaireRdv(rdv, {
    contacts: await S.listContacts(),
    reports: [],
    equipe: equipeActive(),
    admin: true,
    moi: view.agenda?.moi,
    choisirContact,
    date: creneau.date ?? view.agendaJour,
    heure: creneau.heure,
    conflits: conflitsPour,
  })
  if (!saisi) return
  try {
    await enregistrerRdv(saisi)
    toast(rdv ? 'Rendez-vous modifié' : 'Rendez-vous ajouté')
    view.agendaJour = saisi.date
    view.agendaMois = saisi.date.slice(0, 7)
    view.agendaSemaine = lundiDe(saisi.date)
  } catch (err) {
    return toast(err.message)
  }
  await rafraichirAgenda()
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

// La fiche d'un rendez-vous, sans le bouton du rapport : les rapports se font
// dans Terrain.
async function montrerRdv(rdv) {
  const choix = await ouvrirRdv(rdv, { modifiable: true, commencer: false })
  if (choix?.startsWith('statut:')) return changerStatutRdv(rdv, choix.slice(7))
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

// --- l'equipe --------------------------------------------------------------------

const CONFIRMATIONS = {
  revoquer: 'Révoquer cet employé ? Son code cessera de fonctionner à sa prochaine ouverture avec du réseau.',
  supprimer: 'Supprimer cet employé ? Son code cessera de fonctionner. Ses envois restent dans le journal.',
  'nouveau-code': "Donner un nouveau code à cet employé ? L'ancien cessera de fonctionner.",
  'administrateur:oui':
    "Donner l'accès administrateur ? Cette personne pourra gérer l'équipe et ses codes, valider les rapports des invités et exporter les envois.",
  'administrateur:non': "Retirer l'accès administrateur ? Cette personne redevient employée à sa prochaine ouverture avec du réseau.",
}

async function adminAction(action, id, oui) {
  const question = CONFIRMATIONS[action === 'administrateur' ? `administrateur:${oui ? 'oui' : 'non'}` : action]
  if (question && !confirm(question)) return
  try {
    const r = await adminAppel('POST', { action, id, ...(action === 'administrateur' ? { oui } : {}) })
    if (r.code) {
      const e = view.admin?.employes?.find((x) => x.id === id)
      view.adminCodeRevele = { nom: e?.nom ?? '', code: r.code }
    }
    await rechargerEquipe()
  } catch (err) {
    toast(err.message)
  }
}

async function adminAjouter() {
  const nom = root.querySelector('[data-admin-nom]')?.value.trim()
  if (!nom) return toast("Indiquez le nom de l'employé")
  const jour = root.querySelector('[data-admin-fin]')?.value
  try {
    const r = await adminAppel('POST', { action: 'creer', nom, fin: jour ? finDeJournee(jour) : undefined })
    view.adminCodeRevele = { nom: r.nom, code: r.code, fin: r.fin }
    await rechargerEquipe()
  } catch (err) {
    toast(err.message)
  }
}

// --- les rapports d'invites et de l'equipe --------------------------------------------

async function voirPdfValidation(id) {
  const v = view.admin?.validations?.find((x) => x.id === id)
  showLoading('Ouverture du PDF…')
  try {
    const { pdfBase64 } = await adminAppel('GET', null, { pdf: id })
    const octets = Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0))
    ouvrirPdf(new Blob([octets], { type: 'application/pdf' }), v?.filename || 'rapport.pdf')
  } catch (err) {
    toast(err.message)
  } finally {
    hideLoading()
  }
}

// Envoyer au client, ou refuser avec un motif que l'invite lira sur son telephone.
async function traiterValidation(act, id) {
  const v = view.admin?.validations?.find((x) => x.id === id)
  if (!v) return
  const quoi = [`le rapport${v.meta?.ref ? ` ${v.meta.ref}` : ''}`, `de ${v.par?.nom || 'l’invité'}`].join(' ')
  let corps
  if (act === 'valid-envoyer') {
    if (!confirm(`Envoyer ${quoi} à ${v.to} ?`)) return
    corps = { action: 'valider', id }
  } else {
    const motif = prompt(`Refuser ${quoi} ?\nMotif, que l’invité lira :`)
    if (motif === null) return
    corps = { action: 'refuser', id, motif }
  }
  showLoading(act === 'valid-envoyer' ? 'Envoi au client…' : 'Refus en cours…')
  try {
    await adminAppel('POST', corps)
    toast(act === 'valid-envoyer' ? 'Rapport envoyé au client.' : 'Rapport refusé : l’invité verra le motif.')
  } catch (err) {
    toast(err.message)
  } finally {
    hideLoading()
  }
  await rechargerEquipe()
}

// Un rapport de l'equipe, tel qu'il est sauvegarde en ligne : son PDF, en lecture
// seule.
async function voirRapportEquipe(id) {
  const liste = view.adminRapports?.liste ?? []
  showLoading('Chargement du rapport…')
  try {
    const { rapport } = await rapportEnLigne(id)
    // Les rapports d'appartement d'un immeuble font partie de son PDF.
    const enfants = await Promise.all(liste.filter((s) => s.parentId === id).map(async (s) => (await rapportEnLigne(s.id)).rapport))
    hideLoading()
    await previewPdf(rapport, enfants)
  } catch (err) {
    hideLoading()
    toast(err.message || 'Rapport illisible.')
  }
}

// --- le journal des envois ----------------------------------------------------------

async function journalPlus() {
  const a = view.admin
  if (!a?.journal) return
  try {
    const { journal = [] } = await adminAppel('GET', null, { journal: String(a.journal.length) })
    a.journal = [...a.journal, ...journal]
    a.journalComplet = journal.length < PAGE_JOURNAL
  } catch (err) {
    toast(err.message || 'Journal illisible.')
  }
  render()
}

// L'export de facturation d'un mois (voir api/_lib/export.js) : un fichier CSV
// pour le tableur de la comptabilite.
async function exporterEnvois() {
  const mois = root.querySelector('[data-export-mois]')?.value
  if (!mois) return
  view.exportMois = mois
  showLoading('Préparation de l’export…')
  try {
    const { csv, nom, nombre } = await adminAppel('GET', null, { export: mois })
    hideLoading()
    if (!nombre) return toast('Aucun envoi ce mois-là.')
    await shareOrDownload(new Blob([csv], { type: 'text/csv;charset=utf-8' }), nom)
    toast(`${nombre} envoi${nombre > 1 ? 's' : ''} exporté${nombre > 1 ? 's' : ''}.`)
  } catch (err) {
    hideLoading()
    toast(err.message || 'Export impossible.')
  }
}

// --- les gestes -------------------------------------------------------------------

root.addEventListener('click', async (ev) => {
  const el = ev.target

  const ecran = el.closest('[data-bureau-ecran]')?.dataset.bureauEcran
  if (ecran) return aller(ecran)

  // Le calendrier et le semainier.
  const jour = el.closest('[data-agenda-jour]')?.dataset.agendaJour
  if (jour) {
    view.agendaJour = jour
    view.agendaMois = jour.slice(0, 7)
    view.agendaSemaine = lundiDe(jour)
    return render()
  }
  const pasMois = el.closest('[data-agenda-mois]')?.dataset.agendaMois
  if (pasMois) {
    view.agendaMois = decalerMois(view.agendaMois, Number(pasMois))
    return render()
  }
  const pasSemaine = el.closest('[data-agenda-semaine]')?.dataset.agendaSemaine
  if (pasSemaine) {
    view.agendaSemaine = decalerSemaine(view.agendaSemaine, Number(pasSemaine))
    return render()
  }
  const vue = el.closest('[data-agenda-vue]')?.dataset.agendaVue
  if (vue) {
    view.agendaVue = vue
    view.agendaSemaine = lundiDe(view.agendaJour)
    try {
      localStorage.setItem(VUE_KEY, vue)
    } catch {
      // Pas de place : la semaine revient a la prochaine ouverture.
    }
    return render()
  }
  // "Toute l'equipe" porte une valeur vide : on teste le bouton, pas sa valeur.
  const qui = el.closest('[data-agenda-qui]')
  if (qui) {
    view.agendaQui = qui.dataset.agendaQui
    return render()
  }
  const tournee = el.closest('[data-tableau-qui]')
  if (tournee) {
    view.tableauQui = tournee.dataset.tableauQui
    return render()
  }
  if (el.closest('[data-tableau-carte]')) {
    view.tableauCarte = !view.tableauCarte
    return render()
  }
  const rdvId = el.closest('[data-rdv]')?.dataset.rdv
  if (rdvId) {
    const rdv = view.agenda?.rdvs?.find((r) => r.id === rdvId)
    if (rdv) montrerRdv(rdv)
    return
  }
  const creneau = el.closest('[data-agenda-creneau]')?.dataset.agendaCreneau
  if (creneau) {
    const [date, heure] = creneau.split('|')
    view.agendaJour = date
    view.agendaSemaine = lundiDe(date)
    return editerRdv(null, { date, heure })
  }

  const cible = el.closest('[data-act]')
  const act = cible?.dataset.act
  if (!act) return
  if (act === 'ajouter-rdv') return editerRdv()
  if (act === 'admin-ajouter') return adminAjouter()
  if (act === 'admin-action') return adminAction(cible.dataset.action, cible.dataset.id, cible.dataset.oui === '1')
  if (act === 'admin-masquer-code') {
    view.adminCodeRevele = null
    return render()
  }
  if (act === 'valid-voir') return voirPdfValidation(cible.dataset.id)
  if (act === 'valid-envoyer' || act === 'valid-refuser') return traiterValidation(act, cible.dataset.id)
  if (act === 'equipe-rapport') return voirRapportEquipe(cible.dataset.id)
  if (act === 'equipe-filtre') {
    view.adminRapportsQui = cible.dataset.val
    return render()
  }
  if (act === 'admin-filtre') {
    view.adminFiltre = cible.dataset.val
    return render()
  }
  if (act === 'journal-plus') return journalPlus()
  if (act === 'incident-regler') return reglerIncidents({ action: 'regler', sig: cible.dataset.sig })
  if (act === 'incidents-tout-regler') {
    if (!confirm('Marquer tous les incidents comme réglés ? Ceux qui reviennent réapparaîtront.')) return
    return reglerIncidents({ action: 'tout-regler' })
  }
  if (act === 'exporter-envois') return exporterEnvois()
  if (act === 'deconnexion') {
    if (!confirm('Se déconnecter ? Le code sera redemandé, ici comme dans Terrain.')) return
    oublier()
    seDeconnecter()
    return render()
  }
})

root.addEventListener('change', async (ev) => {
  const el = ev.target
  // Le mois choisi pour l'export survit aux rendus de la page.
  if (el.matches('[data-export-mois]')) {
    view.exportMois = el.value
    return
  }
  // La date de fin d'un invite, changee directement dans la liste de l'equipe.
  if (el.dataset.changerFin) {
    if (!el.value) return
    try {
      await adminAppel('POST', { action: 'changer-fin', id: el.dataset.changerFin, fin: finDeJournee(el.value) })
      toast('Date de fin enregistrée.')
    } catch (err) {
      toast(err.message)
    }
    return rechargerEquipe()
  }
})

// --- la session, le reseau, les mises a jour ------------------------------------------

const cleSession = () => {
  const i = identite()
  return i ? `${i.role}:${i.id ?? ''}` : ''
}
let sessionAffichee = ''

// Une autre session prend l'ordinateur : rien de la precedente ne reste.
function oublier() {
  view = { ecran: view.ecran, agendaJour: view.agendaJour, agendaMois: view.agendaMois, agendaSemaine: view.agendaSemaine, agendaVue: view.agendaVue }
  view.admin = null
  view.agenda = null
  view.adminRapports = null
  luA = 0
  try {
    localStorage.removeItem('af-agenda')
  } catch {
    // Stockage indisponible : il n'y a rien a oublier.
  }
}

function majReseau() {
  document.body.dataset.reseau = navigator.onLine ? 'en-ligne' : 'hors-ligne'
}

function miseAJour({ auRetour = false } = {}) {
  verifierMiseAJour({
    page: '/bureau/index.html',
    force: auRetour,
    peutRecharger: () => auRetour && !document.querySelector('.overlay') && !document.body.classList.contains('verrouille'),
  })
}

export function demarrer() {
  installerVerrou()
  sessionAffichee = cleSession()
  const demande = location.hash.slice(1)
  if (ECRANS.includes(demande)) view.ecran = demande
  view.incidentsVuAvant = incidentsVus()
  const aujourdhui = S.todayISO()
  view.agendaJour = aujourdhui
  view.agendaMois = aujourdhui.slice(0, 7)
  view.agendaSemaine = lundiDe(aujourdhui)
  try {
    view.agendaVue = localStorage.getItem(VUE_KEY) === 'mois' ? 'mois' : 'semaine'
  } catch {
    view.agendaVue = 'semaine'
  }
  view.agenda = agendaEnCache()
  majReseau()
  render()
  recharger({ force: true })
  // Le formulaire d'un rendez-vous propose les clients du carnet commun.
  synchroniserCarnet().catch(() => {})

  window.addEventListener('af-deverrouille', () => {
    if (cleSession() !== sessionAffichee) {
      sessionAffichee = cleSession()
      oublier()
    }
    recharger({ force: true })
    synchroniserCarnet().catch(() => {})
  })
  window.addEventListener('online', () => {
    majReseau()
    recharger({ force: true })
    miseAJour()
  })
  window.addEventListener('offline', majReseau)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return
    recharger()
    miseAJour({ auRetour: true })
  })
  window.addEventListener('hashchange', () => {
    const e = location.hash.slice(1)
    if (e !== view.ecran) aller(e)
  })
  miseAJour()
}
