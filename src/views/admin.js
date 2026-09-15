// L'administration : qui fait partie de l'equipe, et ce qui est parti.
//
// Elle ne montre que ce que le serveur sait - les envois, et les ouvertures de
// l'app avec du reseau. Les brouillons restent sur le telephone de chacun :
// elle dit ce qui a ete remis aux clients, pas ce qui est en cours de saisie.
//
// Plusieurs administrateurs : le titulaire du code principal donne l'acces a qui
// il veut. Les autres gerent l'equipe comme lui, mais les comptes des
// administrateurs restent a lui seul (voir api/admin.js).
//
// Chaque rubrique se dessine seule (equipeHTML, validationsHTML,
// rapportsEquipeHTML, journalHTML) : le Bureau en fait chacune une page, avec
// son propre titre.

import { esc } from '../ui/dom.js'
import { ICONS, sectionIcon } from '../ui/icons.js'
import { ilYA } from './envois.js'
import { decalerMois, libelleMois } from '../agenda-outils.js'

const TYPES = { detection: 'Détection', immeuble: 'Immeuble', hotel: 'Hôtel' }

const jourLong = (ts) => new Date(ts).toLocaleDateString('fr-CH', { day: 'numeric', month: 'long' })
// Valeur d'un champ date : AAAA-MM-JJ, au jour local.
const isoJour = (ts) => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const AIDE_BASE = `
  <p class="muted small">Le journal a besoin d'une petite base de données, gratuite à cette échelle.
  Dans Vercel : <b>Storage</b> → <b>Create Database</b> → <b>Upstash for Redis</b> → région
  <b>Europe (Frankfurt)</b> → la relier au projet <b>atout-flair-rapports</b>, puis redéployer.</p>`

function entete(copie) {
  return `
    <header class="top editor-top">
      <button class="icon-btn back" data-act="home" aria-label="Retour">${ICONS.retour}</button>
      <div class="top-title">
        <h1>Administration</h1>
        <p class="muted">Équipe et envois${copie ? ` · base copiée ${esc(ilYA(copie))}` : ''}</p>
      </div>
    </header>`
}

// Le code n'est montre qu'une fois, a la creation : le serveur n'en garde que
// l'empreinte et ne pourrait plus le redonner.
export function codeRevele(c) {
  if (!c) return ''
  return `
    <div class="card admin-code">
      <p class="muted small">Code de <b>${esc(c.nom)}</b> - notez-le maintenant, il ne sera plus affiché :</p>
      <strong>${esc(c.code)}</strong>
      ${c.fin ? `<p class="muted small">Accès invité jusqu'au ${esc(jourLong(c.fin))}, puis il s'arrête tout seul.</p>` : ''}
      <p class="muted small">À taper à l'ouverture de l'application, sur son téléphone. Majuscules indifférentes.</p>
      <button class="btn ghost wide" data-act="admin-masquer-code">C'est noté</button>
    </div>`
}

function ligneAdmin(a) {
  const vu = a?.vu ? `vu ${ilYA(a.vu)}` : 'pas encore vu'
  const n = a?.envois ?? 0
  return `
    <li class="envoi-row">
      <div class="envoi-main">
        <strong>Administrateur</strong>
        <span class="muted">${esc(vu)} · ${n} envoi${n > 1 ? 's' : ''}</span>
      </div>
    </li>`
}

/**
 * Une personne de l'equipe. `titulaire` : l'ecran est ouvert avec le code
 * principal - lui seul donne l'acces administrateur et touche au compte d'un
 * administrateur.
 */
function ligneEmploye(e, titulaire) {
  const vu = e.vu ? `vu ${ilYA(e.vu)}` : 'jamais connecté'
  const bloque = !e.actif || e.expire
  const pastille = !e.actif
    ? ' <span class="pill off">Révoqué</span>'
    : e.expire
      ? ' <span class="pill off">Expiré</span>'
      : e.invite
        ? ' <span class="pill invite">Invité</span>'
        : e.admin
          ? ' <span class="pill admin">Admin</span>'
          : ''
  const echeance = e.invite && e.fin ? (e.expire ? `terminé le ${jourLong(e.fin)}` : `jusqu'au ${jourLong(e.fin)}`) : ''
  const detail = [echeance, vu, `${e.envois} envoi${e.envois > 1 ? 's' : ''}`].filter(Boolean).join(' · ')
  const gestes =
    e.admin && !titulaire
      ? ''
      : `
      <div class="row-actions">
        <button class="btn ghost btn-mini" data-act="admin-action" data-action="nouveau-code" data-id="${e.id}">Nouveau code</button>
        <button class="btn ghost btn-mini" data-act="admin-action" data-action="${e.actif ? 'revoquer' : 'reactiver'}" data-id="${e.id}">${e.actif ? 'Révoquer' : 'Réactiver'}</button>
        <button class="btn ghost btn-mini" data-act="admin-action" data-action="supprimer" data-id="${e.id}">Supprimer</button>
        ${
          titulaire && !e.invite
            ? `<button class="btn ghost btn-mini" data-act="admin-action" data-action="administrateur" data-oui="${e.admin ? '0' : '1'}" data-id="${e.id}">${e.admin ? 'Retirer l’admin' : 'Rendre admin'}</button>`
            : ''
        }
      </div>`
  return `
    <li class="envoi-row admin-emp${bloque ? ' echec' : ''}">
      <div class="envoi-main">
        <strong>${esc(e.nom)}${pastille}</strong>
        <span class="muted">${esc(detail)}</span>
      </div>
      ${
        e.invite
          ? `<label class="admin-fin">Accès jusqu'au <input type="date" data-changer-fin="${e.id}" value="${e.fin ? isoJour(e.fin) : ''}" /></label>`
          : ''
      }
      ${gestes}
    </li>`
}

// Ce que dit une ligne du journal : parti, refuse par le serveur de mail, en
// attente de relecture, ou refuse par l'administrateur.
const ETATS_JOURNAL = {
  envoye: ['sent', 'Envoyé'],
  echec: ['off', 'Échec'],
  'a-valider': ['queued', 'À valider'],
  refuse: ['off', 'Refusé'],
}

function ligneJournal(j) {
  const [pastille, mot] = ETATS_JOURNAL[j.statut] ?? ETATS_JOURNAL.envoye
  const rouge = j.statut === 'echec' || j.statut === 'refuse'
  const quoi = [j.ref, TYPES[j.type] ?? j.type, j.adresse].filter(Boolean).join(' · ')
  const motif = j.statut === 'echec' ? j.erreur || 'Échec sans explication.' : j.statut === 'refuse' ? j.erreur : ''
  return `
    <li class="envoi-row${rouge ? ' echec' : ''}">
      <div class="envoi-main">
        <strong>${esc(j.qui || '?')}</strong>
        <span class="muted">${esc(quoi || j.fichier || 'Rapport')}</span>
        <span class="muted">→ ${esc(j.destinataire || '?')} · ${esc(ilYA(j.date))}${j.validePar ? ` · relu par ${esc(j.validePar)}` : ''}</span>
        ${motif ? `<span class="envoi-motif">${esc(motif)}</span>` : ''}
      </div>
      <div class="envoi-side"><span class="pill ${pastille}">${mot}</span></div>
    </li>`
}

// Le rapport d'un invite qui attend d'etre relu : son PDF, puis l'envoi au
// client ou le refus, dont l'invite lira le motif.
function ligneValidation(v) {
  const quoi = [v.meta?.ref, TYPES[v.meta?.type] ?? v.meta?.type, v.meta?.adresse].filter(Boolean).join(' · ')
  return `
    <li class="envoi-row admin-emp a-valider">
      <div class="envoi-main">
        <strong>${esc(v.par?.nom || 'Invité')} <span class="pill invite">Invité</span></strong>
        <span class="muted">${esc(quoi || v.filename || 'Rapport')}</span>
        <span class="muted">→ ${esc(v.to || '?')} · ${esc(ilYA(v.date))}</span>
      </div>
      <div class="row-actions">
        <button class="btn ghost btn-mini" data-act="valid-voir" data-id="${esc(v.id)}">Voir le PDF</button>
        <button class="btn ghost danger btn-mini" data-act="valid-refuser" data-id="${esc(v.id)}">Refuser</button>
        <button class="btn primary btn-mini" data-act="valid-envoyer" data-id="${esc(v.id)}">Envoyer</button>
      </div>
    </li>`
}

// --- les rapports de l'equipe ------------------------------------------------------
// Chaque rapport vit sur le telephone de celui qui l'a fait ; sa copie en ligne
// (la sauvegarde automatique) permet a l'administrateur de le relire. En
// lecture seule : il s'ouvre en PDF, et rien ne se pose sur l'appareil.

const ETATS_RAPPORT = {
  sent: ['sent', 'Envoyé'],
  done: ['done', 'Terminé'],
  queued: ['queued', 'En attente'],
  validation: ['queued', 'À valider'],
  draft: ['encours', 'En cours'],
}

function ligneRapportEquipe(s) {
  const [pastille, mot] = ETATS_RAPPORT[s.status] ?? ETATS_RAPPORT.draft
  const quoi = [s.ref, TYPES[s.type] ?? s.type, s.nPhotos ? `${s.nPhotos} photo${s.nPhotos > 1 ? 's' : ''}` : '']
    .filter(Boolean)
    .join(' · ')
  return `
    <li class="envoi-row rapport-equipe" data-act="equipe-rapport" data-id="${esc(s.id)}">
      <div class="envoi-main">
        <strong>${esc(s.titre || s.ref || 'Rapport')}</strong>
        <span class="muted">${esc(quoi)}</span>
        <span class="muted">${esc(s.par?.nom || '?')} · ${esc(ilYA(s.maj))}</span>
      </div>
      <div class="envoi-side"><span class="pill ${pastille}">${mot}</span>${ICONS.chevron}</div>
    </li>`
}

// Les plus recents d'abord ; au-dela, le filtre par personne suffit a retrouver.
const RAPPORTS_MONTRES = 40

export function rapportsEquipeHTML(view, { titre = true } = {}) {
  const e = view.adminRapports
  if (!e) return ''
  const tous = (e.liste ?? []).filter((s) => !s.parentId).sort((a, b) => (b.maj ?? 0) - (a.maj ?? 0))
  const tete = titre
    ? `
    <h2 class="section-title">
      <span class="section-title-main">${sectionIcon('folder', 'accent')}Rapports de l’équipe</span>
      ${tous.length ? `<span class="section-title-trailer"><span class="count-pill"><b>${tous.length}</b></span></span>` : ''}
    </h2>`
    : ''
  if (e.erreur) return `${tete}<p class="muted small">${esc(e.erreur)}</p>`

  const noms = [...new Set(tous.map((s) => s.par?.nom).filter(Boolean))]
  const actif = noms.includes(view.adminRapportsQui) ? view.adminRapportsQui : 'Tous'
  const montres = (actif === 'Tous' ? tous : tous.filter((s) => s.par?.nom === actif)).slice(0, RAPPORTS_MONTRES)
  const chips =
    noms.length > 1
      ? `<div class="quick-rooms admin-filtres">${['Tous', ...noms]
          .map(
            (n) =>
              `<button type="button" class="chip chip-sm${actif === n ? ' on' : ''}" data-act="equipe-filtre" data-val="${esc(n)}">${esc(n)}</button>`
          )
          .join('')}</div>`
      : ''
  return `${tete}${chips}
    <ul class="report-list">${
      montres.map(ligneRapportEquipe).join('') || `<li class="empty">Aucun rapport sauvegardé en ligne pour l’instant.</li>`
    }</ul>`
}

export function validationsHTML(validations, { titre = true } = {}) {
  if (!validations.length) return ''
  return `
    ${
      titre
        ? `<h2 class="section-title">
      <span class="section-title-main">${sectionIcon('note', 'amber')}À valider</span>
      <span class="section-title-trailer"><span class="count-pill"><b>${validations.length}</b></span></span>
    </h2>`
        : ''
    }
    <ul class="report-list">${validations.map(ligneValidation).join('')}</ul>`
}

// --- le journal des envois ------------------------------------------------------------

// Le journal arrive par pages de trois cents : une page pleine en annonce
// peut-etre une autre.
export const PAGE_JOURNAL = 300
const plusDEnvois = (a) => !(a.journalComplet ?? (a.journal?.length ?? 0) < PAGE_JOURNAL)

/**
 * L'export de facturation : un mois des douze derniers, en CSV. Pendant la
 * premiere semaine, le mois propose est celui qui vient de finir - c'est lui
 * qu'on facture ; ensuite, le mois en cours.
 */
function exportHTML(view) {
  const maintenant = new Date()
  const courant = `${maintenant.getFullYear()}-${String(maintenant.getMonth() + 1).padStart(2, '0')}`
  const mois = Array.from({ length: 12 }, (_, i) => decalerMois(courant, -i))
  const choisi = mois.includes(view.exportMois) ? view.exportMois : maintenant.getDate() <= 7 ? mois[1] : mois[0]
  return `
    <div class="admin-export">
      <select data-export-mois aria-label="Mois à exporter">
        ${mois.map((m) => `<option value="${m}"${m === choisi ? ' selected' : ''}>${esc(libelleMois(m))}</option>`).join('')}
      </select>
      <button class="btn ghost" data-act="exporter-envois">Exporter</button>
    </div>`
}

// Un filtre par personne presente dans le journal. Inutile tant qu'une seule
// personne a envoye quelque chose.
function filtres(journal, actif) {
  const noms = [...new Set(journal.map((j) => j.qui).filter(Boolean))]
  if (noms.length < 2) return ''
  return `<div class="quick-rooms admin-filtres">${['Tous', ...noms]
    .map(
      (n) =>
        `<button type="button" class="chip chip-sm${actif === n ? ' on' : ''}" data-act="admin-filtre" data-val="${esc(n)}">${esc(n)}</button>`
    )
    .join('')}</div>`
}

export function journalHTML(view, { titre = true } = {}) {
  const a = view.admin
  const filtre = view.adminFiltre ?? 'Tous'
  const journal = filtre === 'Tous' ? a.journal : a.journal.filter((j) => j.qui === filtre)
  return `
    ${
      titre
        ? `<h2 class="section-title" id="journal-envois"><span class="section-title-main">${sectionIcon('mail', 'neutral')}Journal des envois</span></h2>`
        : ''
    }
    ${exportHTML(view)}
    ${filtres(a.journal, filtre)}
    <ul class="report-list">
      ${journal.map(ligneJournal).join('') || `<li class="empty">Aucun envoi enregistré pour l'instant.</li>`}
    </ul>
    ${plusDEnvois(a) ? `<button class="btn ghost wide" data-act="journal-plus">Voir les envois plus anciens</button>` : ''}`
}

// --- l'equipe ------------------------------------------------------------------------

export function equipeHTML(view, { titre = true } = {}) {
  const a = view.admin
  return `
    ${titre ? `<h2 class="section-title"><span class="section-title-main">${sectionIcon('collab', 'accent')}Équipe</span></h2>` : ''}
    <div class="card admin-ajout">
      <input data-admin-nom type="text" placeholder="Nom de l'employé" autocomplete="off" />
      <button class="btn primary" data-act="admin-ajouter">Ajouter</button>
      <label class="admin-fin">Invité jusqu'au <input data-admin-fin type="date" /></label>
      <p class="muted small admin-aide">Date vide : employé permanent. Avec une date : invité (sous-traitant, intérimaire), dont l'accès s'arrête tout seul le soir de ce jour.</p>
    </div>
    <ul class="report-list">
      ${ligneAdmin(a.admin)}
      ${a.employes.map((e) => ligneEmploye(e, a.titulaire)).join('')}
    </ul>
    ${a.employes.length ? '' : `<p class="muted small">Aucun employé pour l'instant. Ajoutez-en un : un code personnel lui sera attribué.</p>`}`
}

/** L'onglet Administration de Terrain : toutes les rubriques, l'une sous l'autre. */
export function adminView(view) {
  const a = view.admin ?? { chargement: true }
  if (a.chargement) return `${entete()}<section class="pad"><p class="muted">Chargement…</p></section>`
  if (a.erreur) {
    return `${entete()}
      <section class="pad">
        <div class="card"><p>${esc(a.erreur)}</p>${a.base === false ? AIDE_BASE : ''}</div>
      </section>`
  }
  return `${entete(a.copie)}
    <section class="pad">
      ${codeRevele(view.adminCodeRevele)}
      ${validationsHTML(a.validations ?? [])}
      ${equipeHTML(view)}
      ${rapportsEquipeHTML(view)}
      ${journalHTML(view)}
    </section>`
}
