// Ecran d'accueil : creation d'un rapport, puis un seul bloc "Mes rapports"
// qui s'ouvre d'un clic sur la liste complete, filtrable par type.

import { TYPE_LIST, typeOf } from '../templates.js'
import { fullName } from '../state.js'
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
  const who = r.lieu?.locataire || fullName(r.mandant) || 'Sans nom'
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

// Bloc "Nouveau rapport" : meme volet repliable que "Mes rapports", avec les
// trois types cote a cote. Ouvert par defaut - creer un rapport est le geste
// le plus frequent de l'app, il ne doit pas couter un clic de plus.
function newReportHTML(view) {
  const open = view.newOpen
  const choices = TYPE_LIST.map(
    (t) => `
    <button type="button" class="type-chip card-${t.id}" data-new="${t.id}">
      <span class="type-chip-icon icon-${t.id}">${ICONS[t.id] ?? ''}</span>
      <span class="type-chip-name">${esc(shortLabel(t))}</span>
      <span class="type-chip-hint">${esc(t.hint)}</span>
    </button>`
  ).join('')

  return `
    <div class="folder card-new${open ? ' open' : ''}">
      <button class="folder-head" data-toggle-new>
        <span class="type-icon icon-new">${ICONS.plus}</span>
        <span class="folder-body">
          <span class="folder-name">Nouveau rapport</span>
          <span class="folder-summary">Détection, immeuble ou hôtel</span>
        </span>
        <span class="folder-chevron">${ICONS.chevron}</span>
      </button>
      ${open ? `<div class="folder-panel"><div class="type-chips">${choices}</div></div>` : ''}
    </div>`
}

// Le rapport le plus recemment touche, s'il est encore en brouillon. L'app
// rouvre toujours sur l'accueil : sans ce rappel, reprendre une saisie
// interrompue demandait d'ouvrir le volet, puis de retrouver la bonne ligne.
function resumeHTML(reports) {
  const dernier = reports[0]
  if (!dernier || dernier.status !== 'draft') return ''
  const qui = dernier.lieu?.locataire || fullName(dernier.mandant) || 'Sans nom'
  const ou = dernier.lieu?.adresseIntervention || dernier.lieu?.adresse || ''
  return `
    <button type="button" class="resume-card" data-open="${dernier.id}">
      <span class="resume-body">
        <span class="resume-kicker">Rapport en cours</span>
        <span class="resume-name">${esc(qui)}</span>
        ${ou ? `<span class="resume-where">${esc(ou)}</span>` : ''}
      </span>
      <span class="resume-go">Reprendre ${ICONS.chevron}</span>
    </button>`
}

export function homeView(view) {
  return `
    <header class="top">
      <img src="/logo.jpg" alt="Atout Flair" class="logo" />
      <div class="top-title">
        <h1>Atout Flair</h1>
      </div>
      <button class="icon-btn contacts-toggle" data-act="open-contacts" title="Carnet de contacts">${ICONS.contacts}</button>
      <button class="icon-btn theme-toggle" data-act="toggle-theme" title="Changer de theme">${ICONS[currentTheme() === 'dark' ? 'sun' : 'moon']}</button>
    </header>
    <div class="hero-caption">
      <span class="hero-kicker">Détection canine professionnelle</span>
      <h2>Rapports de détection</h2>
      <p>Saisie, photos, signature et envoi sur place</p>
    </div>
    <section class="content-sheet">
      ${resumeHTML(view.reports)}
      ${newReportHTML(view)}
      <div class="my-reports">${myReportsHTML(view)}</div>
    </section>`
}
