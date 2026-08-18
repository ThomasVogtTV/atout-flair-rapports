// Ecran d'accueil. Il repond, dans cet ordre, aux trois questions qu'on se pose
// en rouvrant l'app sur le terrain : je continue ? je commence ? je cherche ?
//
// Il parle la meme langue que l'ecran de saisie : des rubriques (petite icone,
// intitule en capitales, filet qui file jusqu'au bord) plutot que des volets
// repliables qui n'existaient qu'ici. Une seule grammaire pour toute l'app.

import { TYPE_LIST, typeOf } from '../templates.js'
import { fullName } from '../state.js'
import { esc } from '../ui/dom.js'
import { ICONS, sectionIcon } from '../ui/icons.js'

// Nombre de rapports montres tant qu'on n'a pas demande a tout voir : de quoi
// retrouver ce qu'on vient de faire sans derouler des mois d'archives.
const APERCU = 3

// "Rapport de détection" -> "Détection" : le mot "rapport" est deja dans le
// titre de la rubrique, seule la nature du rapport distingue les filtres.
const shortLabel = (t) => {
  const s = t.label.replace(/^Rapport (de |d'|d’)/i, '')
  return s[0].toUpperCase() + s.slice(1)
}

// Les filtres : les trois types, plus l'etat "envoye" - c'est ainsi qu'on
// cherche un rapport ("le rapport d'immeuble de mardi", "celui que j'ai deja
// envoye"), pas en se souvenant d'un dossier ou il serait range.
const FILTERS = [
  { key: 'tous', label: 'Tous', match: () => true },
  ...TYPE_LIST.map((t) => ({ key: t.id, label: shortLabel(t), match: (r) => r.type === t.id })),
  { key: 'envoyes', label: 'Envoyés', match: (r) => r.status === 'sent' },
]

const etatPill = (r) =>
  r.status === 'sent'
    ? `<span class="pill sent">Envoyé</span>`
    : r.status === 'queued'
      ? `<span class="pill queued">En attente</span>`
      : `<span class="pill draft">Brouillon</span>`

function reportRowHTML(r, { showType = false } = {}) {
  const who = r.lieu?.locataire || fullName(r.mandant) || 'Sans nom'
  const where = r.lieu?.adresseIntervention || r.lieu?.adresse || ''
  // Sur la largeur d'un telephone, la deuxieme ligne ne tient qu'un repere en
  // plus de l'adresse : le type quand la liste les melange, le numero quand
  // elle est deja filtree sur un type. L'adresse, elle, reste toujours - c'est
  // par elle qu'on reconnait un rapport.
  const tag = showType ? shortLabel(typeOf(r)) : r.ref
  return `
    <li class="report-row" data-open="${r.id}">
      <div class="report-main">
        <strong>${esc(who)}</strong>
        <span class="muted">${esc([tag, where].filter(Boolean).join(' · '))}</span>
      </div>
      <div class="report-side">${etatPill(r)}
        <button class="icon-btn" data-del="${r.id}" title="Supprimer">✕</button>
      </div>
    </li>`
}

// --- je continue ? ---------------------------------------------------------

// Le rapport le plus recemment touche, s'il est encore en brouillon. Il porte
// son nom et son adresse : on reprend en sachant ce qu'on reprend, la ou une
// pastille seule obligeait a l'ouvrir pour le decouvrir.
function enCoursHTML(reports) {
  const r = reports.find((x) => x.status === 'draft')
  if (!r) return ''
  const qui = r.lieu?.locataire || fullName(r.mandant) || 'Sans nom'
  const ou = r.lieu?.adresseIntervention || r.lieu?.adresse || ''
  return `
    <h2 class="section-title"><span class="section-title-main">${sectionIcon('note', 'accent')}En cours</span></h2>
    <button type="button" class="lead-row" data-open="${r.id}">
      <span class="type-chip-icon icon-resume">${ICONS.pen}</span>
      <span class="lead-body">
        <span class="lead-name">${esc(qui)}</span>
        <span class="lead-where">${esc([r.ref, ou].filter(Boolean).join(' · '))}</span>
      </span>
      <span class="lead-go">${ICONS.chevron}</span>
    </button>`
}

// --- je commence ? ---------------------------------------------------------

function nouveauHTML() {
  const choices = TYPE_LIST.map(
    (t) => `
    <button type="button" class="type-chip card-${t.id}" data-new="${t.id}">
      <span class="type-chip-icon icon-${t.id}">${ICONS[t.id] ?? ''}</span>
      <span class="type-chip-name">${esc(shortLabel(t))}</span>
      <span class="type-chip-hint">${esc(t.hint)}</span>
    </button>`
  ).join('')

  return `
    <h2 class="section-title"><span class="section-title-main">${sectionIcon('plus', 'accent')}Nouveau rapport</span></h2>
    <div class="type-chips">${choices}</div>`
}

// --- je cherche ? ----------------------------------------------------------

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

function mesRapportsHTML(view) {
  const reports = view.reports
  const tout = view.reportsOpen
  // Le filtre actif peut avoir perdu son dernier rapport (suppression, envoi) :
  // on retombe alors sur "Tous" plutot que d'afficher une liste vide inexplicable.
  const filter = FILTERS.find((f) => f.key === view.filter && (f.key === 'tous' || reports.some(f.match))) ?? FILTERS[0]
  const listed = tout ? reports.filter(filter.match) : reports.slice(0, APERCU)
  const reste = reports.length - listed.length

  const items = listed.length
    ? listed.map((r) => reportRowHTML(r, { showType: !tout || filter.key === 'tous' || filter.key === 'envoyes' })).join('')
    : `<li class="empty">${reports.length ? 'Aucun rapport dans cette sélection.' : 'Créez un rapport ci-dessus, il apparaîtra ici.'}</li>`

  return `
    <h2 class="section-title"><span class="section-title-main">${sectionIcon('folder', 'neutral')}Mes rapports</span>
      <span class="section-title-trailer">
        <span class="count-pill"><b>${reports.length}</b> gardé${reports.length > 1 ? 's' : ''}</span>
        ${reports.length > APERCU ? `<button class="link" data-toggle-reports>${tout ? 'Réduire' : 'Tout voir'}</button>` : ''}
      </span>
    </h2>
    ${tout ? filterBarHTML(reports, filter.key) : ''}
    <ul class="report-list">${items}</ul>
    ${!tout && reste > 0 ? `<button class="btn ghost wide" data-toggle-reports>Voir les ${reste} autres</button>` : ''}`
}

export function homeView(view) {
  return `
    <header class="top">
      <img src="/logo.jpg" alt="Atout Flair" class="logo" />
      <span class="top-actions">
        <button class="icon-btn contacts-toggle" data-act="open-contacts" title="Carnet et réglages">${ICONS.contacts}</button>
      </span>
    </header>
    <div class="hero-caption">
      <img src="/logo-complet.png" class="hero-logo"
           alt="Atout Flair, détection canine en Suisse romande" />
      <p>Saisie, photos, signature et envoi sur place</p>
    </div>
    <section class="content-sheet">
      ${enCoursHTML(view.reports)}
      ${nouveauHTML()}
      ${mesRapportsHTML(view)}
    </section>`
}
