// Terrain : une session a la fois, et ce que chacune suit en ligne - les
// alertes de l'administrateur, les decisions sur les rapports d'un invite.

import { root, toast } from '../ui/dom.js'
import { alertesHTML } from '../views/home.js'
import { suivreValidations } from '../validations.js'
import { estInvite, estAdmin, identite } from '../lock.js'
import { adminAppel } from '../admin-api.js'
import * as S from '../state.js'
import { view } from './etat.js'
import { render } from './rendu.js'

// --- une session a la fois -------------------------------------------------------
//
// Une session qui se ferme ne laisse rien a la suivante. Ce que l'administrateur
// avait en memoire - les alertes de l'equipe, l'agenda - ne doit pas reapparaitre
// sous le code d'un employe ou d'un invite qui prend le telephone.

const cleSession = () => {
  const i = identite()
  return i ? `${i.role}:${i.id ?? ''}` : ''
}
// La session dont l'ecran montre les donnees.
let sessionAffichee = ''

export function oublierSession() {
  view.admin = null
  view.agenda = null
  equipeLue = 0
  validationsLues = 0
  try {
    // Le cache de l'agenda (voir src/agenda.js) : celui d'une autre session.
    localStorage.removeItem('af-agenda')
  } catch {
    // Stockage indisponible : il n'y a rien a oublier.
  }
}

// Le telephone d'un invite : les decisions de l'administrateur sur ses rapports
// transmis. Relu au plus une fois par minute - on revient souvent a l'accueil.
let validationsLues = 0

export async function suivreMesValidations({ force = false } = {}) {
  if (!estInvite() || !navigator.onLine) return
  if (!force && Date.now() - validationsLues < 60_000) return
  validationsLues = Date.now()
  const changes = await suivreValidations().catch(() => [])
  if (!changes.length) return
  const refus = changes.find((c) => c.statut === 'refuse')
  toast(
    refus
      ? `Rapport ${refus.ref} refusé par l’administrateur${refus.motif ? ` : ${refus.motif}` : ''}`
      : changes.length > 1
        ? `${changes.length} rapports envoyés au client.`
        : `Rapport ${changes[0].ref} envoyé au client.`
  )
  if (view.screen === 'home' || view.screen === 'envois') {
    view.reports = (await S.listReports()).filter((r) => !r.parentId)
    render()
  }
}

// L'accueil de l'administrateur n'a besoin que de ses alertes - les rapports a
// valider, les envois rates : il ne demande que ce resume, relu au plus une fois
// par minute. L'equipe entiere et le journal se lisent dans le Bureau.
const EQUIPE_FRAIS_MS = 60_000
let equipeLue = 0

export async function rafraichirEquipe({ force = false } = {}) {
  if (!estAdmin() || !navigator.onLine) return
  if (!force && Date.now() - equipeLue < EQUIPE_FRAIS_MS) return
  try {
    // Lue d'abord, rangee ensuite : `view.admin = await ...` rangerait la reponse
    // dans la vue d'avant l'attente, que l'accueil a pu remplacer entre-temps -
    // au deverrouillage, les alertes restaient vides.
    const equipe = await adminAppel('GET', null, { resume: '1' })
    view.admin = equipe
    equipeLue = Date.now()
  } catch (err) {
    // Pas d'alerte, faute de lecture : l'onglet Administration dira pourquoi.
    view.admin = { erreur: err.message, base: err.base }
  }
  majAlertes()
}

// Les alertes du poste. Comparees a ce qui est affiche plutot qu'au dernier
// rendu : l'accueil entier a pu etre redessine entre-temps.
function majAlertes() {
  if (view.screen !== 'home') return
  const zone = root.querySelector('.alertes-zone')
  if (!zone) return
  const neuf = alertesHTML(view)
  if (zone.innerHTML !== neuf) zone.innerHTML = neuf
}

/** Retient la session dont l'ecran montre maintenant les donnees. */
export function retenirSession() {
  sessionAffichee = cleSession()
}

/** Vrai si quelqu'un d'autre a pris le telephone depuis. */
export function autreSession() {
  return cleSession() !== sessionAffichee
}
