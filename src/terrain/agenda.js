// Terrain : l'agenda de celui qui tient le telephone - l'ouvrir, poser ou
// modifier un rendez-vous, en commencer le rapport, proposer le controle de suivi.

import { typeOf } from '../templates.js'
import { root, toast } from '../ui/dom.js'
import { prochainHTML } from '../views/home.js'
import { choisirContact } from '../contact-picker.js'
import { estInvite } from '../lock.js'
import { rdvAccueilHTML } from '../views/agenda.js'
import { agendaEnCache, chargerAgenda, enregistrerRdv, supprimerRdv, marquerCommence, marquerStatut, ajouterAuCalendrier } from '../agenda.js'
import { formulaireRdv, ouvrirRdv } from '../rdv-dialog.js'
import { nomClient, lundiDe, conflitsDe, plusJours, libelleJour } from '../agenda-outils.js'
import { reserverNumeros } from '../numeros.js'
import * as S from '../state.js'
import { view, changerVue } from './etat.js'
import { render } from './rendu.js'
import { flushSave, openReport } from './rapport.js'
import { contactsVisibles } from './carnet.js'

// --- agenda de l'equipe ----------------------------------------------------

export const VUE_AGENDA = 'af-agenda-vue'

export async function openAgenda() {
  await flushSave()
  changerVue({ screen: 'agenda', report: null, retour: null })
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
export async function rafraichirAgenda() {
  const data = await chargerAgenda()
  if (!data) return
  view.agenda = data
  if (view.screen === 'home') {
    const zone = root.querySelector('.rdv-accueil-zone')
    if (zone) zone.innerHTML = rdvAccueilHTML(view)
    // Le prochain rendez-vous du poste se lit dans le meme agenda.
    const prochain = root.querySelector('.prochain-zone')
    if (prochain) prochain.innerHTML = prochainHTML(view)
  } else if (view.screen === 'agenda') {
    render()
  }
}

// Qui est deja pris a cette heure-la ? Un rendez-vous sans "pour" est le mien :
// c'est le serveur qui me l'attribuera.
function conflitsPour(saisi) {
  const pour = saisi.pour ?? view.agenda?.moi ?? null
  return conflitsDe({ ...saisi, pour }, view.agenda?.rdvs ?? [])
}

export async function editerRdv(rdv = null, creneau = {}) {
  if (!navigator.onLine) return toast("Pas de réseau : l'agenda de l'équipe se modifie avec du réseau.")
  // Dans Terrain, chacun note les siens : attribuer un rendez-vous a un collegue
  // se fait dans le planning du Bureau.
  const contacts = await contactsVisibles()
  const date = creneau.date ?? (view.screen === 'agenda' ? view.agendaJour : undefined)
  const saisi = await formulaireRdv(rdv, {
    contacts,
    reports: view.reports ?? [],
    equipe: null,
    admin: false,
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
export async function commencerRdv(rdv) {
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

export async function proposerControle(rapport) {
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

export async function montrerRdv(rdv) {
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
