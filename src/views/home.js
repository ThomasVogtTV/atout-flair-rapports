// Ecran d'accueil : creation d'un rapport, puis les rapports existants
// ranges par type, plus un dossier transversal des rapports envoyes.

import { TYPE_LIST, typeOf } from '../templates.js'
import { esc } from '../ui/dom.js'
import { ICONS, sectionIcon } from '../ui/icons.js'
import { currentTheme } from '../ui/theme.js'

function reportRowHTML(r, { showType = false } = {}) {
  const who = r.lieu?.locataire || r.mandant?.nom || 'Sans nom'
  const where = r.lieu?.adresseIntervention || r.lieu?.adresse || ''
  const type = showType ? typeOf(r).label : ''
  const state =
    r.status === 'sent'
      ? `<span class="pill sent">Envoyé</span>`
      : r.status === 'queued'
        ? `<span class="pill queued">En attente de réseau</span>`
        : `<span class="pill draft">Brouillon</span>`
  return `
    <li class="report-row" data-open="${r.id}">
      <div class="report-main">
        <strong>${esc(who)}</strong>
        <span class="muted">${esc([type, r.ref, where].filter(Boolean).join(' · '))}</span>
      </div>
      <div class="report-side">${state}
        <button class="icon-btn" data-del="${r.id}" title="Supprimer">✕</button>
      </div>
    </li>`
}

function typeFolderHTML(t, reports, open) {
  const draft = reports.filter((r) => r.status === 'draft').length
  const queued = reports.filter((r) => r.status === 'queued').length
  const sent = reports.filter((r) => r.status === 'sent').length
  const summary = reports.length
    ? [
        draft && `${draft} brouillon${draft > 1 ? 's' : ''}`,
        queued && `${queued} en attente`,
        sent && `${sent} envoyé${sent > 1 ? 's' : ''}`,
      ]
        .filter(Boolean)
        .join(' · ')
    : 'Vide'

  const items = reports.length
    ? reports.map((r) => reportRowHTML(r)).join('')
    : `<li class="empty">Aucun rapport de ce type pour l'instant.</li>`

  return `
    <div class="folder card-${t.id}${open ? ' open' : ''}">
      <button class="folder-head" data-toggle-folder="${t.id}">
        <span class="type-icon icon-${t.id}">${ICONS[t.id] ?? ''}</span>
        <span class="folder-body">
          <span class="folder-name">${esc(t.label)}</span>
          <span class="folder-summary">${esc(summary)}</span>
        </span>
        <span class="folder-count">${reports.length}</span>
        <span class="folder-chevron">${ICONS.chevron}</span>
      </button>
      ${open ? `<ul class="report-list folder-list">${items}</ul>` : ''}
    </div>`
}

// Dossier transversal : tous les rapports envoyes, tous types confondus -
// pour les retrouver sans savoir dans quel type ils ont ete crees.
function sentFolderHTML(reports, open) {
  const items = reports.length
    ? reports.map((r) => reportRowHTML(r, { showType: true })).join('')
    : `<li class="empty">Aucun rapport envoyé pour l'instant.</li>`
  return `
    <div class="folder card-sent${open ? ' open' : ''}">
      <button class="folder-head" data-toggle-folder="sent">
        <span class="type-icon icon-sent">${ICONS.sent}</span>
        <span class="folder-body">
          <span class="folder-name">Rapports envoyés</span>
          <span class="folder-summary">${reports.length ? `${reports.length} envoyé${reports.length > 1 ? 's' : ''}` : 'Vide'}</span>
        </span>
        <span class="folder-count">${reports.length}</span>
        <span class="folder-chevron">${ICONS.chevron}</span>
      </button>
      ${open ? `<ul class="report-list folder-list">${items}</ul>` : ''}
    </div>`
}

export function homeView(view) {
  const cards = TYPE_LIST.map(
    (t) => `
    <button class="type-card card-${t.id}" data-new="${t.id}">
      <span class="type-icon icon-${t.id}">${ICONS[t.id] ?? ''}</span>
      <span class="type-body">
        <span class="type-name">${esc(t.label)}</span>
        <span class="type-hint">${esc(t.hint)}</span>
      </span>
      <span class="type-chevron">${ICONS.chevron}</span>
    </button>`
  ).join('')

  const folders = TYPE_LIST.map((t) =>
    typeFolderHTML(t, view.reports.filter((r) => r.type === t.id), view.openFolder === t.id)
  ).join('')

  const sentFolder = sentFolderHTML(view.reports.filter((r) => r.status === 'sent'), view.openFolder === 'sent')

  return `
    <header class="top">
      <img src="/logo.jpg" alt="Atout Flair" class="logo" />
      <div class="top-title">
        <h1>Atout Flair</h1>
      </div>
      <button class="icon-btn contacts-toggle" data-act="open-contacts" title="Carnet de contacts">${ICONS.contacts}</button>
      <button class="icon-btn theme-toggle" data-act="toggle-theme" title="Changer de theme">${ICONS[currentTheme() === 'dark' ? 'sun' : 'moon']}</button>
    </header>
    <div class="hero-bg">
      <img src="/hero-dog.webp" alt="" />
      <div class="hero-caption">
        <span class="hero-kicker">Détection canine professionnelle</span>
        <h2>Rapports de détection</h2>
        <p>Saisie, photos, signature et envoi sur place</p>
      </div>
    </div>
    <section class="content-sheet">
      <h2 class="section-title">Nouveau rapport</h2>
      <div class="type-grid">${cards}</div>

      <h2 class="section-title"><span class="section-title-main">${sectionIcon('folder', 'neutral')}Mes rapports</span></h2>
      <div class="folders">${folders}${sentFolder}</div>
    </section>`
}
