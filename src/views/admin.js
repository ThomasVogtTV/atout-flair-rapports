// Onglet Administration : qui fait partie de l'equipe, et ce qui est parti.
//
// Il ne montre que ce que le serveur sait - les envois, et les ouvertures de
// l'app avec du reseau. Les brouillons restent sur le telephone de chacun :
// l'onglet dit ce qui a ete remis aux clients, pas ce qui est en cours de saisie.

import { esc } from '../ui/dom.js'
import { sectionIcon } from '../ui/icons.js'
import { ilYA } from './envois.js'

const TYPES = { detection: 'Détection', immeuble: 'Immeuble', hotel: 'Hôtel' }

const jourLong = (ts) => new Date(ts).toLocaleDateString('fr-CH', { day: 'numeric', month: 'long' })
// Valeur d'un champ date : AAAA-MM-JJ, au jour local.
const isoJour = (ts) => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const AIDE_BASE = `
  <p class="muted small">Le journal a besoin d'une petite base de données, gratuite à cette échelle.
  Dans Vercel : <b>Storage</b> → <b>Create Database</b> → <b>Upstash for Redis</b> → région
  <b>Europe (Frankfurt)</b> → la relier au projet <b>atout-flair-rapports</b>, puis redéployer.</p>`

function entete() {
  return `
    <header class="top editor-top">
      <button class="icon-btn back" data-act="home">‹</button>
      <div class="top-title">
        <h1>Administration</h1>
        <p class="muted">Équipe et envois</p>
      </div>
    </header>`
}

// Le code n'est montre qu'une fois, a la creation : le serveur n'en garde que
// l'empreinte et ne pourrait plus le redonner.
function codeRevele(c) {
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

function ligneEmploye(e) {
  const vu = e.vu ? `vu ${ilYA(e.vu)}` : 'jamais connecté'
  const bloque = !e.actif || e.expire
  const pastille = !e.actif
    ? ' <span class="pill off">Révoqué</span>'
    : e.expire
      ? ' <span class="pill off">Expiré</span>'
      : e.invite
        ? ' <span class="pill invite">Invité</span>'
        : ''
  const echeance = e.invite && e.fin ? (e.expire ? `terminé le ${jourLong(e.fin)}` : `jusqu'au ${jourLong(e.fin)}`) : ''
  const detail = [echeance, vu, `${e.envois} envoi${e.envois > 1 ? 's' : ''}`].filter(Boolean).join(' · ')
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
      <div class="row-actions">
        <button class="btn ghost btn-mini" data-act="admin-action" data-action="nouveau-code" data-id="${e.id}">Nouveau code</button>
        <button class="btn ghost btn-mini" data-act="admin-action" data-action="${e.actif ? 'revoquer' : 'reactiver'}" data-id="${e.id}">${e.actif ? 'Révoquer' : 'Réactiver'}</button>
        <button class="btn ghost btn-mini" data-act="admin-action" data-action="supprimer" data-id="${e.id}">Supprimer</button>
      </div>
    </li>`
}

function ligneJournal(j) {
  const echec = j.statut === 'echec'
  const quoi = [j.ref, TYPES[j.type] ?? j.type, j.adresse].filter(Boolean).join(' · ')
  return `
    <li class="envoi-row${echec ? ' echec' : ''}">
      <div class="envoi-main">
        <strong>${esc(j.qui || '?')}</strong>
        <span class="muted">${esc(quoi || j.fichier || 'Rapport')}</span>
        <span class="muted">→ ${esc(j.destinataire || '?')} · ${esc(ilYA(j.date))}</span>
        ${echec ? `<span class="envoi-motif">${esc(j.erreur || 'Échec sans explication.')}</span>` : ''}
      </div>
      <div class="envoi-side"><span class="pill ${echec ? 'off' : 'sent'}">${echec ? 'Échec' : 'Envoyé'}</span></div>
    </li>`
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

export function adminView(view) {
  const a = view.admin ?? { chargement: true }
  if (a.chargement) return `${entete()}<section class="pad"><p class="muted">Chargement…</p></section>`
  if (a.erreur) {
    return `${entete()}
      <section class="pad">
        <div class="card"><p>${esc(a.erreur)}</p>${a.base === false ? AIDE_BASE : ''}</div>
      </section>`
  }

  const filtre = view.adminFiltre ?? 'Tous'
  const journal = filtre === 'Tous' ? a.journal : a.journal.filter((j) => j.qui === filtre)

  return `${entete()}
    <section class="pad">
      ${codeRevele(view.adminCodeRevele)}

      <h2 class="section-title"><span class="section-title-main">${sectionIcon('collab', 'accent')}Équipe</span></h2>
      <div class="card admin-ajout">
        <input data-admin-nom type="text" placeholder="Nom de l'employé" autocomplete="off" />
        <button class="btn primary" data-act="admin-ajouter">Ajouter</button>
        <label class="admin-fin">Invité jusqu'au <input data-admin-fin type="date" /></label>
        <p class="muted small admin-aide">Date vide : employé permanent. Avec une date : invité (sous-traitant, intérimaire), dont l'accès s'arrête tout seul le soir de ce jour.</p>
      </div>
      <ul class="report-list">
        ${ligneAdmin(a.admin)}
        ${a.employes.map(ligneEmploye).join('')}
      </ul>
      ${a.employes.length ? '' : `<p class="muted small">Aucun employé pour l'instant. Ajoutez-en un : un code personnel lui sera attribué.</p>`}

      <h2 class="section-title"><span class="section-title-main">${sectionIcon('mail', 'neutral')}Journal des envois</span></h2>
      ${filtres(a.journal, filtre)}
      <ul class="report-list">
        ${journal.map(ligneJournal).join('') || `<li class="empty">Aucun envoi enregistré pour l'instant.</li>`}
      </ul>
    </section>`
}
