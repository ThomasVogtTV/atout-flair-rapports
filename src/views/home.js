// Ecran d'accueil : creation d'un rapport, puis un seul bloc "Mes rapports"
// qui s'ouvre d'un clic sur la liste complete, filtrable par type.

import { TYPE_LIST, typeOf } from '../templates.js'
import { esc } from '../ui/dom.js'
import { ICONS } from '../ui/icons.js'
import { currentTheme } from '../ui/theme.js'

// Les filtres de la liste : les trois types, plus l'etat "envoye" - c'est
// ainsi qu'on cherche un rapport ("le rapport d'immeuble de mardi", "celui
// que j'ai deja envoye"), pas en se souvenant d'un dossier ou il serait range.
// "Rapport de détection" -> "Détection" : le mot "rapport" est deja dans le
// titre du bloc, seule la nature du rapport distingue les filtres.
const shortLabel = (t) => {
  const s = t.label.replace(/^Rapport (de |d'|d’)/i, '')
  return s[0].toUpperCase() + s.slice(1)
}

const FILTERS = [
  { key: 'tous', label: 'Tous', match: () => true },
  ...TYPE_LIST.map((t) => ({ key: t.id, label: shortLabel(t), match: (r) => r.type === t.id })),
  { key: 'envoyes', label: 'Envoyés', match: (r) => r.status === 'sent' },
]

function reportRowHTML(r, { showType = false } = {}) {
  const who = r.lieu?.locataire || r.mandant?.nom || 'Sans nom'
  const where = r.lieu?.adresseIntervention || r.lieu?.adresse || ''
  // Sur la largeur d'un telephone, la deuxieme ligne ne tient qu'un repere en
  // plus de l'adresse : le type quand la liste les melange, le numero quand
  // elle est deja filtree sur un type. L'adresse, elle, reste toujours - c'est
  // par elle qu'on reconnait un rapport.
  const tag = showType ? shortLabel(typeOf(r)) : r.ref
  const state =
    r.status === 'sent'
      ? `<span class="pill sent">Envoyé</span>`
      : r.status === 'queued'
        ? `<span class="pill queued">En attente</span>`
        : `<span class="pill draft">Brouillon</span>`
  return `
    <li class="report-row" data-open="${r.id}">
      <div class="report-main">
        <strong>${esc(who)}</strong>
        <span class="muted">${esc([tag, where].filter(Boolean).join(' · '))}</span>
      </div>
      <div class="report-side">${state}
        <button class="icon-btn" data-del="${r.id}" title="Supprimer">✕</button>
      </div>
    </li>`
}

// "2 brouillons · 1 envoye", ou l'invitation a commencer quand il n'y a rien.
function summaryOf(reports) {
  if (!reports.length) return 'Aucun rapport pour l’instant'
  const n = (status) => reports.filter((r) => r.status === status).length
  const [draft, queued, sent] = [n('draft'), n('queued'), n('sent')]
  return [
    draft && `${draft} brouillon${draft > 1 ? 's' : ''}`,
    queued && `${queued} en attente`,
    sent && `${sent} envoyé${sent > 1 ? 's' : ''}`,
  ]
    .filter(Boolean)
    .join(' · ')
}

// Un filtre ne s'affiche que s'il a de quoi montrer ; et la barre entiere
// disparait quand il ne resterait qu'un seul choix a cote de "Tous".
function filterBarHTML(reports, active) {
  const shown = FILTERS.filter((f) => f.key === 'tous' || reports.some(f.match))
  if (shown.length < 3) return ''
  return `<div class="report-filters">${shown
    .map(
      (f) => `<button type="button" class="chip chip-sm${f.key === active ? ' on' : ''}" data-filter="${f.key}">
        ${esc(f.label)}<span class="chip-count">${reports.filter(f.match).length}</span>
      </button>`
    )
    .join('')}</div>`
}

function myReportsHTML(view) {
  const reports = view.reports
  const open = view.reportsOpen
  // Le filtre actif peut avoir perdu son dernier rapport (suppression, envoi) :
  // on retombe alors sur "Tous" plutot que d'afficher une liste vide inexplicable.
  const filter = FILTERS.find((f) => f.key === view.filter && (f.key === 'tous' || reports.some(f.match))) ?? FILTERS[0]
  const listed = reports.filter(filter.match)

  const items = listed.length
    ? listed.map((r) => reportRowHTML(r, { showType: filter.key === 'tous' || filter.key === 'envoyes' })).join('')
    : `<li class="empty">${reports.length ? 'Aucun rapport dans cette sélection.' : 'Créez un rapport ci-dessus, il apparaîtra ici.'}</li>`

  return `
    <div class="folder card-all${open ? ' open' : ''}">
      <button class="folder-head" data-toggle-reports>
        <span class="type-icon icon-all">${ICONS.folder}</span>
        <span class="folder-body">
          <span class="folder-name">Mes rapports</span>
          <span class="folder-summary">${esc(summaryOf(reports))}</span>
        </span>
        <span class="folder-count">${reports.length}</span>
        <span class="folder-chevron">${ICONS.chevron}</span>
      </button>
      ${
        open
          ? `<div class="folder-panel">
              ${filterBarHTML(reports, filter.key)}
              <ul class="report-list">${items}</ul>
            </div>`
          : ''
      }
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

      <div class="my-reports">${myReportsHTML(view)}</div>
    </section>`
}
