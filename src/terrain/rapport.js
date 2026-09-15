// Terrain : le rapport ouvert - l'ouvrir, le creer, l'enregistrer a mesure de
// la saisie, ses etapes, ses pieces et ses sous-rapports.

import { typeOf, accordE } from '../templates.js'
import { root, toast, pulse, esc } from '../ui/dom.js'
import { startRowDrag } from '../ui/dragsort.js'
import { rowCardHTML, counterPills, applySameAddress, applySameName, etapesNavHTML, verdictsHTML } from '../views/editor.js'
import { viderVignettes } from '../ui/vignettes.js'
import { reserverNumeros } from '../numeros.js'
import { etapesDuRapport, etapeDeReprise, ETAPES } from '../etapes.js'
import * as S from '../state.js'
import { view } from './etat.js'
import { render } from './rendu.js'
import { goHome, miseAJour } from './navigation.js'
import { contactsVisibles } from './carnet.js'

let saveTimer = null
let aEnregistrer = null

// Le rapport a enregistrer est retenu au moment de la frappe. Le delai lisait
// `view.report` a son echeance : quitter l'ecran juste apres avoir tape, et il
// n'y avait plus de rapport - la derniere saisie ne s'enregistrait pas.
export function scheduleSave() {
  aEnregistrer = view.report
  clearTimeout(saveTimer)
  saveTimer = setTimeout(flushSave, 600)
  etatSauvegarde(true)
}

// Enregistre tout de suite ce qui attend : avant de changer d'ecran, et quand
// l'app passe en arriere-plan (appel entrant, ecran verrouille).
export function flushSave() {
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
  if (document.hidden) return flushSave()
  miseAJour({ auRetour: true })
})
window.addEventListener('pagehide', () => flushSave())

export function get(path) {
  return path.split('.').reduce((o, k) => o?.[k], view.report)
}
export function set(path, value) {
  const keys = path.split('.')
  const last = keys.pop()
  keys.reduce((o, k) => (o[k] ??= {}), view.report)[last] = value
}

export async function openReport(id) {
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
  // D'ou l'on vient : c'est la que ramene le retour. Un sous-rapport garde
  // l'origine du rapport qui l'a ouvert.
  if (view.screen !== 'editor') view.depuis = view.screen
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

export async function createReport(type, contact = null) {
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

// Les etapes deja faites du rapport ouvert, pour cocher avec un rebond celle qui
// vient de se completer. Un verdict "Rien trouve" replie la piece et redessine
// l'ecran juste apres avoir coche l'etape : les coches recentes survivent donc
// a ce rendu, sans quoi le rebond disparaitrait avant d'avoir ete vu.
let etapesFaites = null
let finiesRecentes = { ids: [], t: 0 }

// Au rendu d'un rapport : les etapes qui viennent de se completer, pour cocher
// d'un rebond celle qu'on vient de finir.
export function suivreEtapesAuRendu(navigated) {
  if (view.screen !== 'editor' || !view.report) return
  const faites = etapesDuRapport(view.report).filter((e) => e.fait).map((e) => e.id)
  const nouvelles = !navigated && etapesFaites ? faites.filter((id) => !etapesFaites.includes(id)) : []
  const recentes = !navigated && Date.now() - finiesRecentes.t < 700 ? finiesRecentes.ids.filter((id) => faites.includes(id)) : []
  view.vientDeFinir = [...new Set([...nouvelles, ...recentes])]
  etapesFaites = faites
}

// --- interactions ----------------------------------------------------------

export function rowOf(el) {
  const id = el.closest('[data-row]')?.dataset.row
  return view.report.rows.find((r) => r.id === id)
}

// Recopie dans les champs affiches les valeurs du lieu recalculees a partir du
// mandant (cases "meme adresse" / "meme nom").
export function mirrorLieuFields(keys) {
  keys.forEach((key) => {
    const target = root.querySelector(`[data-path="lieu.${key}"]`)
    if (target) target.value = view.report.lieu[key] ?? ''
  })
}

// Redessine la seule bande des propositions du carnet, sans toucher au reste
// de l'ecran : un render() complet pendant la frappe ferait perdre le curseur.
export function rafraichirSuggestions() {
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

// Les compteurs sont redessines entierement, et non juste le chiffre : sinon le
// pluriel restait celui du rendu precedent ("2 pièce", "2 contaminée"). La
// pulsation ne se declenche que sur un compteur qui a vraiment change, pour
// qu'elle continue de vouloir dire quelque chose.
export function refreshCounters() {
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
export function rafraichirEtapes() {
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
export function planifierEtapes() {
  clearTimeout(etapesTimer)
  etapesTimer = setTimeout(rafraichirEtapes, 250)
}

// Passer d'une etape a l'autre : tout est deja enregistre, on ne perd rien en
// revenant en arriere. Le contenu glisse dans le sens du mouvement.
export function allerEtape(k) {
  const cible = Math.max(0, Math.min(ETAPES.length - 1, k))
  if (cible === (view.etape ?? 0)) return
  flushSave()
  view.etapeSens = cible > (view.etape ?? 0) ? 'avant' : 'arriere'
  view.etape = cible
  render()
  view.etapeSens = null
  window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
}

// Ajoute une ligne directement dans le DOM (pas de render() complet) pour
// pouvoir l'amener a l'ecran et y placer le focus dans le meme geste que le
// tap sur "+ Ajouter" — indispensable pour que le clavier s'ouvre tout seul
// sur iOS, qui exige que .focus() soit appele sans await intercale.
export function insertNewRow() {
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
export function clearDefaultRemarques() {
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
export async function removeRowAnimated(rowId) {
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

// Un client du carnet remplit tout le bloc mandant d'un coup.
export async function remplirMandant(c) {
  view.report.mandant = S.contactVersMandant(c)
  if (view.report.lieu.sameAsMandant) applySameAddress(view.report)
  if (view.report.lieu.sameNameAsMandant) applySameName(view.report)
  await S.saveReport(view.report)
  toast('Mandant repris du carnet')
  render()
}

export async function createChild(rowId) {
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
