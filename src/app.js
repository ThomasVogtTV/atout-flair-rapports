import { TYPES, TYPE_LIST, typeOf, rowLabelFor } from './templates.js'
import * as S from './state.js'
import { fileToPhoto, openAnnotator, recompress } from './photo.js'
import { openSignaturePad } from './signature.js'
import { buildCombinedPdf } from './pdf.js'
import { sendReport, pendingCount, flushQueue } from './mailer.js'

// Boite mail de l'entreprise : expediteur cote serveur, copie par defaut cote app.
const COPY_DEFAULT = 'info@atout-flair.ch'

// Code d'acces a l'app (pas l'APP_CODE serveur, qui protege uniquement l'envoi
// de mail) : verifie uniquement cote client, l'app devant demarrer hors
// ligne. Barrage simple contre un lien transfere par erreur, pas une
// securite forte. Pour le changer : modifier cette ligne puis publier -
// les appareils deja verifies restent connectes, seuls les nouveaux
// (ou apres un "effacer les donnees du site") redemanderont le code.
const ACCESS_CODE = 'stessy'

// Icones de l'accueil (traits fins, 1.6px, coherentes avec le style epure).
const ICON_STROKE = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"'
const ICON_FILL = 'fill="currentColor" fill-opacity="0.16" stroke="none"'
const ICONS = {
  detection: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><path ${ICON_FILL} d="M10 20v-5a2 2 0 0 1 4 0v5z"/><path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9"/><path d="M10 20v-5a2 2 0 0 1 4 0v5"/></svg>`,
  immeuble: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><rect ${ICON_FILL} x="5" y="3.5" width="14" height="17" rx="1.2"/><rect x="5" y="3.5" width="14" height="17" rx="1.2"/><path d="M8.5 7.5h1M14.5 7.5h1M8.5 11.5h1M14.5 11.5h1M8.5 15.5h1M14.5 15.5h1"/><path d="M10 20.5v-3.2a2 2 0 0 1 4 0v3.2"/></svg>`,
  hotel: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><path ${ICON_FILL} d="M3.5 14.5v-3a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3z"/><path d="M3.5 19v-9"/><path d="M3.5 14.5h17V19"/><path d="M3.5 14.5v-3a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3"/><path d="M13.5 11h5a2 2 0 0 1 2 2v1.5"/></svg>`,
  chevron: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><path d="m9 5 7 7-7 7"/></svg>`,
  person: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><circle ${ICON_FILL} cx="12" cy="8.2" r="3.4"/><circle cx="12" cy="8.2" r="3.4"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/></svg>`,
  pin: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><path ${ICON_FILL} d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21Z"/><path d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.2"/></svg>`,
  room: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><rect ${ICON_FILL} x="6" y="3.5" width="12" height="17" rx="1"/><rect x="6" y="3.5" width="12" height="17" rx="1"/><circle cx="14.3" cy="12" r="0.9" fill="currentColor" stroke="none"/></svg>`,
  camera: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><path ${ICON_FILL} d="M4 8.5a1.5 1.5 0 0 1 1.5-1.5h2l1-2h7l1 2h2A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5v-9Z"/><path d="M4 8.5a1.5 1.5 0 0 1 1.5-1.5h2l1-2h7l1 2h2A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5v-9Z"/><circle cx="12" cy="12.6" r="3.3"/></svg>`,
  note: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><path ${ICON_FILL} d="M6 3.5h9l3 3v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1Z"/><path d="M6 3.5h9l3 3v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1Z"/><path d="M8.5 12h7M8.5 15.5h4.5"/></svg>`,
  pen: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><path ${ICON_FILL} d="m14 5.5 4.5 4.5-9 9L5 20l1-4.5z"/><path d="m14 5.5 4.5 4.5-9 9L5 20l1-4.5z"/><path d="m13 6.5 4 4"/></svg>`,
  sun: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><circle cx="12" cy="12" r="4.2"/><path d="M12 3v2.2M12 18.8V21M4.4 12H2.6M21.4 12h-1.8M5.8 5.8l1.3 1.3M16.9 16.9l1.3 1.3M18.2 5.8l-1.3 1.3M7.1 16.9l-1.3 1.3"/></svg>`,
  moon: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><path ${ICON_FILL} d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z"/><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z"/></svg>`,
  folder: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><path ${ICON_FILL} d="M4 7a1.2 1.2 0 0 1 1.2-1.2h4.3l1.8 2H18.8A1.2 1.2 0 0 1 20 9v8.2a1.2 1.2 0 0 1-1.2 1.2H5.2A1.2 1.2 0 0 1 4 17.2Z"/><path d="M4 7a1.2 1.2 0 0 1 1.2-1.2h4.3l1.8 2H18.8A1.2 1.2 0 0 1 20 9v8.2a1.2 1.2 0 0 1-1.2 1.2H5.2A1.2 1.2 0 0 1 4 17.2Z"/></svg>`,
  contacts: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><rect ${ICON_FILL} x="4" y="3.5" width="16" height="17" rx="2.2"/><rect x="4" y="3.5" width="16" height="17" rx="2.2"/><circle cx="12" cy="10" r="2.4"/><path d="M7.7 16.3a4.3 4.3 0 0 1 8.6 0"/></svg>`,
  sent: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><path ${ICON_FILL} d="M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Z"/><path d="M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Z"/><path d="m8.3 12.2 2.4 2.4 5-5.2"/></svg>`,
}

// Theme clair/sombre : localStorage retient un choix explicite ; sans choix,
// le mode systeme (@media prefers-color-scheme) s'applique via le CSS seul.
function currentTheme() {
  return (
    document.documentElement.dataset.theme ??
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  )
}
function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark'
  document.documentElement.dataset.theme = next
  localStorage.setItem('af-theme', next)
  render()
}

function sectionIcon(key, tone) {
  return `<span class="section-icon icon-${tone}">${ICONS[key]}</span>`
}

// Meme code couleur que les cartes/dossiers de l'accueil (rouge/bleu/violet
// selon le type), pour que l'icone "Pieces/Appartements/Chambres" du
// rapport ouvert reprenne la teinte de son type plutot que d'etre toujours
// rouge.
const TYPE_TONE = { detection: 'red', immeuble: 'blue', hotel: 'plum' }

const root = document.getElementById('app')
let view = { screen: 'home', report: null, children: [], reports: [], contacts: [], openFolder: null }
let saveTimer = null

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

function scheduleSave() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => S.saveReport(view.report), 400)
}

function get(path) {
  return path.split('.').reduce((o, k) => o?.[k], view.report)
}
function set(path, value) {
  const keys = path.split('.')
  const last = keys.pop()
  keys.reduce((o, k) => (o[k] ??= {}), view.report)[last] = value
}

// --- navigation ------------------------------------------------------------

export async function goHome() {
  view = { ...view, screen: 'home', report: null, children: [] }
  view.reports = (await S.listReports()).filter((r) => !r.parentId)
  render()
}

export async function openContacts() {
  view = { ...view, screen: 'contacts', report: null }
  view.contacts = await S.listContacts()
  render()
}

export async function openReport(id) {
  const report = await S.loadReport(id)
  if (!report) return goHome()
  view.report = report
  view.children = (await S.listReports()).filter((r) => r.parentId === report.id)
  view.contacts = await S.listContacts()
  view.screen = 'editor'
  render()
}

async function createReport(type) {
  const report = S.newReport(type)
  await S.saveReport(report)
  openReport(report.id)
}

// --- rendu -----------------------------------------------------------------

// Sert a ne rejouer l'animation d'entree que lors d'une vraie navigation
// (accueil <-> rapport, ou changement de rapport ouvert), pas a chaque
// re-rendu local (ajout d'une ligne, d'une photo, etc.).
let lastViewKey = null

function render() {
  const key = `${view.screen}:${view.report?.id ?? ''}`
  const navigated = key !== lastViewKey
  lastViewKey = key
  root.innerHTML = view.screen === 'home' ? homeView() : view.screen === 'contacts' ? contactsView() : editorView()
  if (navigated) {
    document.scrollingElement.scrollTop = 0
    root.classList.remove('view-enter')
    void root.offsetWidth // force le reflow pour redemarrer l'animation
    root.classList.add('view-enter')
  }
  updatePendingBadge()
}

function homeView() {
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

  const reportRowHTML = (r, { showType = false } = {}) => {
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

  const folders = TYPE_LIST.map((t) => {
    const reports = view.reports.filter((r) => r.type === t.id)
    const open = view.openFolder === t.id
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
  }).join('')

  // Dossier transversal : tous les rapports envoyes, tous types confondus -
  // pour les retrouver sans savoir dans quel type ils ont ete crees.
  const sentReports = view.reports.filter((r) => r.status === 'sent')
  const sentOpen = view.openFolder === 'sent'
  const sentItems = sentReports.length
    ? sentReports.map((r) => reportRowHTML(r, { showType: true })).join('')
    : `<li class="empty">Aucun rapport envoyé pour l'instant.</li>`
  const sentFolder = `
    <div class="folder card-sent${sentOpen ? ' open' : ''}">
      <button class="folder-head" data-toggle-folder="sent">
        <span class="type-icon icon-sent">${ICONS.sent}</span>
        <span class="folder-body">
          <span class="folder-name">Rapports envoyés</span>
          <span class="folder-summary">${sentReports.length ? `${sentReports.length} envoyé${sentReports.length > 1 ? 's' : ''}` : 'Vide'}</span>
        </span>
        <span class="folder-count">${sentReports.length}</span>
        <span class="folder-chevron">${ICONS.chevron}</span>
      </button>
      ${sentOpen ? `<ul class="report-list folder-list">${sentItems}</ul>` : ''}
    </div>`

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
      <img src="/hero-dog.jpg" alt="" />
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

function contactsView() {
  const contacts = view.contacts ?? []
  const rows = contacts.length
    ? contacts
        .map(
          (c) => `
          <li class="report-row" data-edit-contact="${c.id}">
            <div class="report-main">
              <strong>${esc(c.nom || 'Sans nom')}</strong>
              <span class="muted">${esc([c.adresse, c.npaLieu].filter(Boolean).join(', ')) || 'Adresse non renseignée'}</span>
            </div>
            <div class="report-side">
              <button class="icon-btn" data-del-contact="${c.id}" title="Supprimer">✕</button>
            </div>
          </li>`
        )
        .join('')
    : `<li class="empty">Aucun contact enregistré pour l'instant.</li>`

  return `
    <header class="top editor-top">
      <button class="icon-btn back" data-act="home">‹</button>
      <div class="top-title">
        <h1>Carnet de contacts</h1>
        <p class="muted">${contacts.length} contact${contacts.length > 1 ? 's' : ''}</p>
      </div>
    </header>
    <section class="pad">
      <ul class="report-list">${rows}</ul>
      <button class="btn ghost wide" data-act="add-contact">+ Ajouter un contact</button>
    </section>`
}

function fieldInput(f, value, disabled) {
  const id = `lieu.${f.key}`
  if (f.type === 'ouinon') {
    return `<div class="seg" data-seg="${id}">
      ${['Oui', 'Non']
        .map((v) => `<button type="button" class="seg-btn${value === v ? ' on' : ''}" data-val="${v}">${v}</button>`)
        .join('')}
    </div>`
  }
  const type = f.type === 'date' ? 'date' : f.type === 'time' ? 'time' : 'text'
  return `<input type="${type}" data-path="${id}" value="${esc(value ?? '')}"${disabled ? ' disabled' : ''} />`
}

// Champs d'adresse du bloc "Lieu d'intervention" : un seul champ combine
// pour le rapport de detection, deux champs separes (comme le mandant)
// pour immeuble/hotel.
const LIEU_ADDR_KEYS = ['adresseIntervention', 'adresse', 'npaLieu']

function applySameAddress(report) {
  const t = typeOf(report)
  if (t.layout === 'pieces') {
    report.lieu.adresseIntervention = [report.mandant.adresse, report.mandant.npaLieu].filter(Boolean).join(', ')
  } else {
    report.lieu.adresse = report.mandant.adresse
    report.lieu.npaLieu = report.mandant.npaLieu
  }
}

const MANDANT_TYPES = [
  { key: 'particulier', label: 'Particulier' },
  { key: 'locataire', label: 'Locataire' },
  { key: 'proprietaire', label: 'Propriétaire' },
  { key: 'gerance', label: 'Gérance' },
]

function editorView() {
  const r = view.report
  const t = typeOf(r)
  const lieuFields = t.lieuFields.flat()

  const contactOptions = view.contacts
    .map((c) => `<option value="${esc(c.nom)}"></option>`)
    .join('')

  return `
    <header class="top editor-top">
      <button class="icon-btn back" data-act="home">‹</button>
      <div class="top-title">
        <h1>${esc(t.label)}</h1>
        <p class="muted">N° ${esc(r.ref)} · ${esc(r.lieu?.adresseIntervention || r.lieu?.adresse || 'Nouveau rapport')}</p>
      </div>
    </header>

    <section class="pad">
      <h2 class="section-title"><span class="section-title-main">${sectionIcon('person', 'amber')}Mandant</span>
        <button class="link" data-act="save-contact">Ajouter au carnet</button>
      </h2>
      <div class="card grid2">
        <div class="full chip-group" data-mandant-type>
          ${MANDANT_TYPES.map(
            (mt) =>
              `<button type="button" class="chip${r.mandant.type === mt.key ? ' on' : ''}" data-val="${mt.key}">${mt.label}</button>`
          ).join('')}
        </div>
        <label class="full">Nom
          <input data-path="mandant.nom" list="contacts" value="${esc(r.mandant.nom)}" autocomplete="off" />
          <datalist id="contacts">${contactOptions}</datalist>
        </label>
        <label class="full">Adresse<input data-path="mandant.adresse" value="${esc(r.mandant.adresse)}" /></label>
        <label>NPA/Lieu<input data-path="mandant.npaLieu" value="${esc(r.mandant.npaLieu)}" /></label>
        <label>N° tél<input data-path="mandant.tel" value="${esc(r.mandant.tel)}" inputmode="tel" /></label>
        <label class="full">Email<input data-path="mandant.email" value="${esc(r.mandant.email)}" inputmode="email" /></label>
      </div>

      <h2 class="section-title"><span class="section-title-main">${sectionIcon('pin', 'blue')}Lieu d'intervention</span></h2>
      <div class="card grid2">
        ${lieuFields
          .filter((f) => !f.derived)
          .map((f) => {
            const isAddrField = f.key === 'adresseIntervention' || f.key === 'adresse'
            const disabled = LIEU_ADDR_KEYS.includes(f.key) && r.lieu.sameAsMandant
            const field = `<label class="${isAddrField ? 'full' : ''}">
              ${esc(f.label)}${fieldInput(f, r.lieu[f.key], disabled)}
            </label>`
            if (!isAddrField) return field
            return `${field}
              <label class="full same-addr">
                <input type="checkbox" data-same-addr${r.lieu.sameAsMandant ? ' checked' : ''} />
                Même adresse que le mandant
              </label>`
          })
          .join('')}
      </div>

      ${t.layout === 'pieces' ? piecesSection(r, t) : lignesSection(r, t)}

      <h2 class="section-title"><span class="section-title-main">${sectionIcon('camera', 'plum')}Photos libres</span></h2>
      <div class="card">
        <p class="muted small">Photos non rattachées à une ligne (façade, cave, hall…).</p>
        ${photoStrip(r.photos.filter((p) => !p.rowId))}
        <button class="btn ghost wide" data-photo="">+ Ajouter une photo</button>
      </div>

      <h2 class="section-title"><span class="section-title-main">${sectionIcon('note', 'neutral')}Remarques et recommandations</span></h2>
      <div class="card">
        <textarea data-path="remarques" rows="4" placeholder="Aucun marquage du chien de recherche.">${esc(r.remarques)}</textarea>
      </div>

      ${t.hasSignature ? signatureSection(r) : ''}
    </section>

    <div class="bottom-bar">
      <button class="btn ghost" data-act="preview">Aperçu PDF</button>
      <button class="btn primary" data-act="send">Envoyer</button>
    </div>`
}

// Carte d'une piece : badge numerote colore par statut, labels persistants,
// puces de noms courants tant que le champ est vide (le champ texte reste
// disponible pour les cas hors-liste).
function pieceCardHTML(r, t, row, index) {
  const photos = r.photos.filter((p) => p.rowId === row.id)
  const status = row.contamine || ''
  return `
  <div class="row-card" data-row="${row.id}" data-status="${status}">
    <div class="row-head">
      <span class="piece-badge">${index + 1}</span>
      <label class="piece-name-wrap">
        <span class="field-label">Nom de la pièce</span>
        <input class="row-name piece-name" data-row-field="nom" value="${esc(row.nom)}" placeholder="Nom de la pièce" />
      </label>
      <button class="icon-btn" data-del-row="${row.id}" title="Supprimer">✕</button>
    </div>
    ${
      row.nom
        ? ''
        : `<div class="quick-rooms">${t.suggestions
            .map((s) => `<button type="button" class="chip chip-sm" data-quick-room="${esc(s)}">${esc(s)}</button>`)
            .join('')}</div>`
    }
    <div class="seg tri" data-seg-row="${row.id}">
      <button type="button" class="seg-btn oui${status === 'oui' ? ' on' : ''}" data-val="oui">Contaminée</button>
      <button type="button" class="seg-btn non${status === 'non' ? ' on' : ''}" data-val="non">Non</button>
      <button type="button" class="seg-btn inconnu${status === 'inconnu' ? ' on' : ''}" data-val="inconnu">?</button>
    </div>
    <label class="field-info"><span class="field-label">Informations</span>
      <input data-row-field="info" value="${esc(row.info)}" placeholder="Marquage, punaises visibles…" />
    </label>
    ${photoStrip(photos)}
    <button class="btn ghost wide" data-photo="${row.id}">+ Photo de cette pièce</button>
  </div>`
}

function piecesSection(r, t) {
  const rows = r.rows.map((row, i) => pieceCardHTML(r, t, row, i)).join('')
  const total = S.filledRows(r).length
  const cont = S.contaminatedCount(r)

  return `
    <h2 class="section-title"><span class="section-title-main">${sectionIcon('room', TYPE_TONE[t.id])}Pièces</span>
      <span class="section-title-trailer">
        <span class="counter-pills">
          <span class="count-pill"><b id="cnt-total">${total}</b> pièce${total > 1 ? 's' : ''}</span>
          <span class="count-pill${cont ? ' cont' : ''}"><b id="cnt-cont">${cont}</b> contaminée${cont > 1 ? 's' : ''}</span>
        </span>
        <button class="link" data-act="add-row">+ Ajouter</button>
      </span>
    </h2>
    <div class="rows">${rows}</div>
    <button class="btn ghost wide" data-act="add-row">+ Ajouter une pièce</button>`
}

function lineCardHTML(r, t, row, index) {
  const isHotel = t.id === 'hotel'
  const photos = r.photos.filter((p) => p.rowId === row.id)
  const child = view.children.find((c) => c.id === row.sousRapportId)
  const status = row.contamine || ''
  return `
  <div class="row-card" data-row="${row.id}" data-status="${status}">
    <div class="row-head">
      <span class="piece-badge">${index + 1}</span>
      <input class="row-name small-input" data-row-field="numero" value="${esc(row.numero)}" placeholder="${isHotel ? 'N° chambre' : 'N° appart.'}" />
      <input class="row-name small-input" data-row-field="etage" list="etages-list" value="${esc(row.etage)}" placeholder="Étage" />
      <input type="date" class="small-input" data-row-field="date" value="${esc(row.date)}" />
      <button class="icon-btn" data-del-row="${row.id}" title="Supprimer">✕</button>
    </div>
    <label class="field-info"><span class="field-label">${isHotel ? 'Informations' : 'Résident'}</span>
      <input data-row-field="resident" value="${esc(row.resident)}" placeholder="${isHotel ? 'ex. appartement, occupé…' : 'Nom du résident'}" />
    </label>
    <div class="seg" data-seg-row="${row.id}">
      <button type="button" class="seg-btn oui${status === 'oui' ? ' on' : ''}" data-val="oui">Contaminé</button>
      <button type="button" class="seg-btn non${status === 'non' ? ' on' : ''}" data-val="non">Non</button>
    </div>
    <label class="field-info"><span class="field-label">Infos</span>
      <input data-row-field="infos" value="${esc(row.infos)}" placeholder="Téléphone, chien sur place, conseil…" />
    </label>
    ${photoStrip(photos)}
    <div class="row-actions">
      <button class="btn ghost" data-photo="${row.id}">+ Photo</button>
      ${
        isHotel
          ? ''
          : child
            ? `<button class="btn ghost" data-open-child="${child.id}">Rapport de détection ✓</button>`
            : `<button class="btn ghost" data-add-child="${row.id}">+ Rapport de détection</button>`
      }
    </div>
  </div>`
}

function lignesSection(r, t) {
  const rows = r.rows.map((row, i) => lineCardHTML(r, t, row, i)).join('')
  const total = S.filledRows(r).length
  const cont = S.contaminatedCount(r)

  return `
    <h2 class="section-title"><span class="section-title-main">${sectionIcon('room', TYPE_TONE[t.id])}${esc(t.rowLabelPlural[0].toUpperCase() + t.rowLabelPlural.slice(1))}</span>
      <span class="section-title-trailer">
        <span class="counter-pills">
          <span class="count-pill"><b id="cnt-total">${total}</b> ligne${total > 1 ? 's' : ''}</span>
          <span class="count-pill${cont ? ' cont' : ''}"><b id="cnt-cont">${cont}</b> contaminée${cont > 1 ? 's' : ''}</span>
        </span>
        <button class="link" data-act="add-row">+ Ajouter</button>
      </span>
    </h2>
    <datalist id="etages-list">${(t.columns.find((c) => c.key === 'etage')?.suggestions ?? [])
      .map((s) => `<option value="${esc(s)}"></option>`)
      .join('')}</datalist>
    <div class="rows">${rows}</div>
    <button class="btn ghost wide" data-act="add-row">+ Ajouter une ligne</button>`
}

function photoStrip(photos) {
  if (!photos.length) return ''
  return `<div class="photos">${photos
    .map(
      (p) => `<div class="thumb" data-photo-id="${p.id}">
        <img src="${p.dataUrl}" alt="" />
        <button class="thumb-del" data-del-photo="${p.id}">✕</button>
      </div>`
    )
    .join('')}</div>`
}

function signatureSection(r) {
  return `
    <h2 class="section-title"><span class="section-title-main">${sectionIcon('pen', 'green')}Signature</span></h2>
    <div class="card sig-card">
      ${r.signature ? `<img class="sig-preview" src="${r.signature}" alt="Signature" />` : `<p class="muted small">Non signé</p>`}
      <button class="btn ghost wide" data-act="sign">${r.signature ? 'Refaire la signature' : 'Faire signer'}</button>
    </div>`
}

// --- interactions ----------------------------------------------------------

function rowOf(el) {
  const id = el.closest('[data-row]')?.dataset.row
  return view.report.rows.find((r) => r.id === id)
}

root.addEventListener('input', (ev) => {
  const el = ev.target
  if (el.dataset.path) {
    set(el.dataset.path, el.value)
    // Case "meme adresse que le mandant" cochee : les champs adresse du
    // lieu restent en phase pendant la saisie, sans re-rendu complet pour
    // ne pas faire perdre le focus/curseur du champ mandant en cours.
    if (view.report.lieu.sameAsMandant && (el.dataset.path === 'mandant.adresse' || el.dataset.path === 'mandant.npaLieu')) {
      applySameAddress(view.report)
      LIEU_ADDR_KEYS.forEach((key) => {
        const target = root.querySelector(`[data-path="lieu.${key}"]`)
        if (target) target.value = view.report.lieu[key] ?? ''
      })
    }
    scheduleSave()
  } else if (el.dataset.rowField) {
    const row = rowOf(el)
    if (!row) return
    row[el.dataset.rowField] = el.value
    if (el.dataset.rowField === 'nom') {
      refreshCounters()
      if (el.value) el.closest('.row-card')?.querySelector('.quick-rooms')?.remove()
    }
    scheduleSave()
  }
})

root.addEventListener('change', async (ev) => {
  const el = ev.target

  if (el.dataset.sameAddr !== undefined) {
    view.report.lieu.sameAsMandant = el.checked
    if (el.checked) applySameAddress(view.report)
    await S.saveReport(view.report)
    render()
    return
  }

  // Le carnet remplit le reste des coordonnees des que le nom correspond.
  if (el.dataset.path !== 'mandant.nom') return
  const match = view.contacts.find((c) => (c.nom || '').toLowerCase() === el.value.trim().toLowerCase())
  if (!match) return
  view.report.mandant = { nom: match.nom, adresse: match.adresse, npaLieu: match.npaLieu, email: match.email, tel: match.tel }
  if (view.report.lieu.sameAsMandant) applySameAddress(view.report)
  await S.saveReport(view.report)
  render()
})

function pulse(el) {
  el.classList.remove('pulse')
  void el.offsetWidth // force le reflow pour rejouer l'animation
  el.classList.add('pulse')
}

function refreshCounters() {
  const totalEl = document.getElementById('cnt-total')
  const contEl = document.getElementById('cnt-cont')
  const total = S.filledRows(view.report).length
  const contVal = S.contaminatedCount(view.report)
  if (totalEl) {
    totalEl.textContent = total
    pulse(totalEl)
  }
  if (contEl) {
    contEl.textContent = contVal
    contEl.closest('.count-pill')?.classList.toggle('cont', contVal > 0)
    pulse(contEl)
  }
}

// Ajoute une ligne directement dans le DOM (pas de render() complet) pour
// pouvoir l'amener a l'ecran et y placer le focus dans le meme geste que le
// tap sur "+ Ajouter" — indispensable pour que le clavier s'ouvre tout seul
// sur iOS, qui exige que .focus() soit appele sans await intercale.
function insertNewRow() {
  const t = typeOf(view.report)
  const row = S.newRow(view.report.type)
  view.report.rows.push(row)
  const index = view.report.rows.length - 1
  const html = t.layout === 'pieces' ? pieceCardHTML(view.report, t, row, index) : lineCardHTML(view.report, t, row, index)
  const list = root.querySelector('.rows')
  list.insertAdjacentHTML('beforeend', html)
  const card = list.lastElementChild
  card.classList.add('row-enter')
  card.addEventListener('animationend', () => card.classList.remove('row-enter'), { once: true })
  card.scrollIntoView({ block: 'center', behavior: 'smooth' })
  card.querySelector('.row-name')?.focus({ preventScroll: true })
  refreshCounters()
  S.saveReport(view.report)
}

// Supprime une ligne avec une petite animation de sortie, et demande
// confirmation si elle contient deja quelque chose a perdre. Le nom d'une
// piece ne compte pas : les rapports demarrent avec des pieces standard
// pre-remplies (Salon, Chambre N°1...) que le technicien supprime sans
// friction si elles ne s'appliquent pas - seuls infos/statut/photos
// reellement saisis meritent une confirmation.
async function removeRowAnimated(rowId) {
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

root.addEventListener('click', async (ev) => {
  const el = ev.target

  const newType = el.closest('[data-new]')?.dataset.new
  if (newType) return createReport(newType)

  const folderType = el.closest('[data-toggle-folder]')?.dataset.toggleFolder
  if (folderType) {
    view.openFolder = view.openFolder === folderType ? null : folderType
    return render()
  }

  const delId = el.closest('[data-del]')?.dataset.del
  if (delId) {
    ev.stopPropagation()
    if (confirm('Supprimer ce rapport ?')) {
      await S.deleteReport(delId)
      goHome()
    }
    return
  }

  const openId = el.closest('[data-open]')?.dataset.open
  if (openId) return openReport(openId)

  const delContactId = el.closest('[data-del-contact]')?.dataset.delContact
  if (delContactId) {
    ev.stopPropagation()
    if (confirm('Supprimer ce contact ?')) {
      await S.deleteContact(delContactId)
      view.contacts = await S.listContacts()
      render()
    }
    return
  }

  const editContactId = el.closest('[data-edit-contact]')?.dataset.editContact
  if (editContactId) {
    const c = view.contacts.find((x) => x.id === editContactId)
    if (c) openContactDialog(c)
    return
  }

  // --- type de mandant (choix unique)
  const chip = el.closest('.chip')
  if (chip && chip.closest('[data-mandant-type]')) {
    const group = chip.closest('[data-mandant-type]')
    const value = chip.dataset.val
    view.report.mandant.type = view.report.mandant.type === value ? '' : value
    group.querySelectorAll('.chip').forEach((b) => b.classList.toggle('on', b.dataset.val === view.report.mandant.type))
    scheduleSave()
    return
  }

  // --- puce de nom de piece rapide (remplit sans ouvrir le clavier)
  const quickRoom = el.closest('[data-quick-room]')?.dataset.quickRoom
  if (quickRoom) {
    const card = el.closest('.row-card')
    const row = rowOf(el)
    row.nom = quickRoom
    card.querySelector('.row-name').value = quickRoom
    card.querySelector('.quick-rooms')?.remove()
    refreshCounters()
    scheduleSave()
    return
  }

  // --- segments Oui / Non / ?
  const segBtn = el.closest('.seg-btn')
  if (segBtn) {
    const segRow = segBtn.closest('[data-seg-row]')
    const segPath = segBtn.closest('[data-seg]')
    const value = segBtn.dataset.val
    if (segRow) {
      const row = view.report.rows.find((r) => r.id === segRow.dataset.segRow)
      row.contamine = row.contamine === value ? '' : value
      segRow.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('on', b.dataset.val === row.contamine))
      segRow.closest('.row-card').dataset.status = row.contamine || ''
      refreshCounters()
    } else if (segPath) {
      const current = get(segPath.dataset.seg)
      const next = current === value ? '' : value
      set(segPath.dataset.seg, next)
      segPath.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('on', b.dataset.val === next))
    }
    scheduleSave()
    return
  }

  const delRow = el.closest('[data-del-row]')?.dataset.delRow
  if (delRow) return removeRowAnimated(delRow)

  const delPhoto = el.closest('[data-del-photo]')?.dataset.delPhoto
  if (delPhoto) {
    view.report.photos = view.report.photos.filter((p) => p.id !== delPhoto)
    await S.saveReport(view.report)
    return render()
  }

  const thumb = el.closest('[data-photo-id]')
  if (thumb && !el.closest('[data-del-photo]')) {
    const photo = view.report.photos.find((p) => p.id === thumb.dataset.photoId)
    const result = await openAnnotator(photo.original ?? photo.dataUrl, { shapes: photo.shapes })
    if (result) {
      photo.dataUrl = result.dataUrl
      photo.shapes = result.shapes
      await S.saveReport(view.report)
      render()
    }
    return
  }

  const photoBtn = el.closest('[data-photo]')
  if (photoBtn) return capture(photoBtn.dataset.photo)

  const addChild = el.closest('[data-add-child]')?.dataset.addChild
  if (addChild) return createChild(addChild)

  const openChild = el.closest('[data-open-child]')?.dataset.openChild
  if (openChild) return openReport(openChild)

  const act = el.closest('[data-act]')?.dataset.act
  if (!act) return
  if (act === 'toggle-theme') return toggleTheme()
  if (act === 'open-contacts') return openContacts()
  if (act === 'add-contact') return openContactDialog()
  if (act === 'home') {
    // Un rapport deja envoye/en file n'a plus rien a "annuler" : on ne
    // demande que pour un brouillon, qu'il vienne d'etre cree ou repris.
    // Le carnet de contacts n'a pas de rapport ouvert, rien a confirmer.
    if (view.screen === 'editor' && view.report.status === 'draft') {
      const choice = await confirmLeave()
      if (choice === 'cancel') return
      if (choice === 'delete') await S.deleteReport(view.report.id)
    }
    return view.screen === 'editor' && view.report?.parentId ? openReport(view.report.parentId) : goHome()
  }
  if (act === 'add-row') return insertNewRow()
  if (act === 'save-contact') {
    await S.rememberContact(view.report.mandant)
    view.contacts = await S.listContacts()
    toast('Mandant ajouté au carnet')
    return
  }
  if (act === 'sign') {
    const sig = await openSignaturePad(view.report.signature)
    if (sig !== undefined) {
      view.report.signature = sig
      await S.saveReport(view.report)
      render()
    }
    return
  }
  if (act === 'preview') return preview()
  if (act === 'send') return openSendDialog()
})

// --- photos ----------------------------------------------------------------

function pickFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.capture = 'environment'
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.click()
  })
}

async function capture(rowId) {
  const file = await pickFile()
  if (!file) return
  toast('Traitement de la photo…')
  const photo = await fileToPhoto(file)
  const row = view.report.rows.find((r) => r.id === rowId)
  const label = row ? rowLabelFor(view.report, row) : ''
  const result = await openAnnotator(photo.dataUrl, { label })
  if (!result) return
  view.report.photos.push({
    id: S.uid(),
    rowId: rowId || null,
    original: photo.dataUrl,
    dataUrl: result.dataUrl,
    shapes: result.shapes,
  })
  await S.saveReport(view.report)
  render()
}

async function createChild(rowId) {
  const parent = view.report
  const row = parent.rows.find((r) => r.id === rowId)
  const child = S.newReport('detection')
  child.parentId = parent.id
  // mandant copie tel quel : la Regie du sous-rapport en derive automatiquement (voir templates.js)
  child.mandant = { ...parent.mandant }
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

// --- PDF / envoi -----------------------------------------------------------

// Une fonction serveur Vercel refuse une requete de plus de 4,5 Mo, et le PDF
// voyage encode en base64 (+33 %). On vise donc 3 Mo de PDF au maximum : si le
// rapport depasse, les photos sont re-encodees plus petites, palier par palier.
const PDF_MAX = 3_000_000
const SHRINK_STEPS = [
  { maxDim: 1200, quality: 0.68 },
  { maxDim: 900, quality: 0.55 },
]

async function buildWith(report) {
  const children = view.children.filter((c) => report.rows.some((r) => r.sousRapportId === c.id))
  return new Blob([await buildCombinedPdf(report, children)], { type: 'application/pdf' })
}

async function shrunkReport(report, { maxDim, quality }) {
  const photos = await Promise.all(
    report.photos.map(async (p) => ({ ...p, dataUrl: await recompress(p.dataUrl, maxDim, quality) }))
  )
  return { ...report, photos }
}

/** @returns {Promise<{blob: Blob, oversized: boolean}>} */
async function currentPdf() {
  let blob = await buildWith(view.report)
  for (const step of SHRINK_STEPS) {
    if (blob.size <= PDF_MAX) break
    showLoading('Rapport volumineux : optimisation des photos…')
    blob = await buildWith(await shrunkReport(view.report, step))
  }
  return { blob, oversized: blob.size > PDF_MAX }
}

async function preview() {
  showLoading('Génération du PDF…')
  try {
    const { blob } = await currentPdf()
    const url = URL.createObjectURL(blob)
    // En app installée (iOS notamment) l'ouverture d'onglet est parfois bloquée :
    // on retombe alors sur un téléchargement, que le téléphone ouvre tout seul.
    const win = window.open(url, '_blank')
    if (!win) {
      const a = document.createElement('a')
      a.href = url
      a.download = S.reportFilename(view.report)
      a.click()
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  } catch (err) {
    console.error('Génération du PDF impossible', err)
    toast('Impossible de générer le PDF. Réessayez.')
  } finally {
    hideLoading()
  }
}

/**
 * Passe le PDF a l'application mail du telephone (feuille de partage), ou a
 * defaut le telecharge. Sert de sortie de secours a chaque fois que l'envoi
 * automatique ne peut pas aboutir.
 */
async function shareOrDownload(blob, filename) {
  const file = new File([blob], filename, { type: 'application/pdf' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename })
      return
    } catch (err) {
      if (err?.name === 'AbortError') return // partage annule par l'utilisateur
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}

/**
 * Demande quoi faire d'un brouillon quand on quitte via le bouton retour.
 * @returns {Promise<'cancel'|'keep'|'delete'>}
 */
function confirmLeave() {
  const overlay = document.createElement('div')
  overlay.className = 'overlay dialog'
  overlay.innerHTML = `
    <div class="dialog-box">
      <h2>Quitter ce rapport ?</h2>
      <p class="muted small">Vous pouvez le garder en brouillon pour le reprendre plus tard, ou le supprimer s'il ne doit pas être conservé.</p>
      <div class="dialog-actions">
        <button class="btn ghost" data-leave="cancel">Reprendre</button>
        <button class="btn ghost danger" data-leave="delete">Supprimer</button>
        <button class="btn primary" data-leave="keep">Garder en brouillon</button>
      </div>
    </div>`
  document.body.appendChild(overlay)
  return new Promise((resolve) => {
    overlay.addEventListener('click', (ev) => {
      const choice = ev.target === overlay ? 'cancel' : ev.target.closest('[data-leave]')?.dataset.leave
      if (!choice) return
      overlay.remove()
      resolve(choice)
    })
  })
}

function openSendDialog() {
  const r = view.report
  const filename = S.reportFilename(r)
  const overlay = document.createElement('div')
  overlay.className = 'overlay dialog'
  overlay.innerHTML = `
    <div class="dialog-box">
      <h2>Envoyer le rapport</h2>
      <label>Destinataire<input id="send-to" type="email" value="${esc(r.mandant.email)}" /></label>
      <label>Copie à<input id="send-cc" type="email" value="${esc(localStorage.getItem('af-copy') ?? COPY_DEFAULT)}" placeholder="votre adresse" /></label>
      <label>Objet<input id="send-subject" value="${esc(filename.replace(/\.pdf$/, ''))}" /></label>
      <label>Message<textarea id="send-body" rows="4">Bonjour,

Veuillez trouver ci-joint le rapport de détection canine.

Meilleures salutations,
Atout Flair</textarea></label>
      <p class="muted small">Pièce jointe : ${esc(filename)}</p>
      <div class="dialog-actions">
        <button class="btn ghost" data-close>Annuler</button>
        <button class="btn ghost" data-share>Partager / Enregistrer</button>
        <button class="btn primary" data-send>Envoyer</button>
      </div>
    </div>`
  document.body.appendChild(overlay)

  overlay.addEventListener('click', async (ev) => {
    if (ev.target.hasAttribute?.('data-close') || ev.target === overlay) return overlay.remove()

    // Un rapport volumineux (photos, plusieurs sous-rapports) peut faire
    // echouer la generation du PDF (memoire, canvas...) sur un telephone
    // moins puissant : sans ce filet, l'ecran de chargement restait bloque
    // indefiniment puisque hideLoading() n'etait jamais atteint.
    try {
      if (ev.target.hasAttribute?.('data-share')) {
        showLoading('Génération du PDF…')
        const { blob } = await currentPdf()
        hideLoading()
        await shareOrDownload(blob, filename)
        return
      }

      if (!ev.target.hasAttribute?.('data-send')) return
      const to = overlay.querySelector('#send-to').value.trim()
      if (!to) return toast('Indiquez un destinataire')
      const cc = overlay.querySelector('#send-cc').value.trim()
      localStorage.setItem('af-copy', cc)
      const payload = {
        to,
        cc,
        subject: overlay.querySelector('#send-subject').value,
        body: overlay.querySelector('#send-body').value,
        filename,
      }
      overlay.remove()
      showLoading('Génération du PDF…')
      const { blob, oversized } = await currentPdf()
      if (oversized) {
        // Au-dela de la limite du serveur, l'envoi automatique echouerait sans
        // qu'on puisse rien y faire : on passe la main a l'application mail.
        hideLoading()
        toast('Rapport trop lourd pour l’envoi automatique : je le passe à votre messagerie.')
        await shareOrDownload(blob, filename)
        return
      }

      showLoading('Envoi en cours…')
      const { queued, badCode, notConfigured } = await sendReport(view.report, payload, blob)
      hideLoading()
      if (notConfigured) {
        // Phase d'essai : la boite mail n'est pas encore branchee. Mettre le
        // rapport en attente donnerait l'illusion d'un envoi a venir.
        toast("Envoi automatique pas encore activé : je passe le PDF à votre messagerie.")
        await shareOrDownload(blob, filename)
        return
      }

      view.report.status = queued ? 'queued' : 'sent'
      view.report.sentAt = queued ? null : Date.now()
      await S.saveReport(view.report)
      toast(
        badCode
          ? "Code d'accès refusé : le rapport est en attente, il repartira au prochain essai."
          : queued
            ? 'Pas de réseau : envoi mis en file, il partira automatiquement.'
            : 'Rapport envoyé.'
      )
      goHome()
    } catch (err) {
      console.error('Génération/envoi du rapport impossible', err)
      toast('Une erreur est survenue. Réessayez.')
    } finally {
      hideLoading()
    }
  })
}

// Formulaire d'ajout/modification d'un contact du carnet. `contact` absent
// = creation ; fourni = edition (bouton Supprimer visible, mise a jour par
// id pour pouvoir renommer sans dupliquer l'entree).
function openContactDialog(contact) {
  const c = contact ?? { type: '', nom: '', adresse: '', npaLieu: '', tel: '', email: '' }
  let type = c.type || ''

  const overlay = document.createElement('div')
  overlay.className = 'overlay dialog'
  overlay.innerHTML = `
    <div class="dialog-box">
      <h2>${contact ? 'Modifier le contact' : 'Nouveau contact'}</h2>
      <div class="chip-group" data-contact-type>
        ${MANDANT_TYPES.map(
          (mt) => `<button type="button" class="chip${type === mt.key ? ' on' : ''}" data-val="${mt.key}">${mt.label}</button>`
        ).join('')}
      </div>
      <label>Nom<input id="ct-nom" value="${esc(c.nom)}" /></label>
      <label>Adresse<input id="ct-adresse" value="${esc(c.adresse)}" /></label>
      <label>NPA/Lieu<input id="ct-npa" value="${esc(c.npaLieu)}" /></label>
      <label>N° tél<input id="ct-tel" value="${esc(c.tel)}" inputmode="tel" /></label>
      <label>Email<input id="ct-email" value="${esc(c.email)}" inputmode="email" /></label>
      <div class="dialog-actions">
        ${contact ? `<button class="btn ghost danger" data-del>Supprimer</button>` : ''}
        <button class="btn ghost" data-close>Annuler</button>
        <button class="btn primary" data-save>Enregistrer</button>
      </div>
    </div>`
  document.body.appendChild(overlay)
  overlay.querySelector('#ct-nom').focus()

  overlay.addEventListener('click', async (ev) => {
    if (ev.target === overlay || ev.target.hasAttribute?.('data-close')) {
      overlay.remove()
      return
    }

    const chip = ev.target.closest('[data-contact-type] .chip')
    if (chip) {
      type = type === chip.dataset.val ? '' : chip.dataset.val
      overlay.querySelectorAll('[data-contact-type] .chip').forEach((b) => b.classList.toggle('on', b.dataset.val === type))
      return
    }

    if (ev.target.hasAttribute?.('data-del')) {
      if (!confirm('Supprimer ce contact ?')) return
      await S.deleteContact(c.id)
      overlay.remove()
      view.contacts = await S.listContacts()
      render()
      return
    }

    if (ev.target.hasAttribute?.('data-save')) {
      const nom = overlay.querySelector('#ct-nom').value.trim()
      if (!nom) return toast('Indiquez un nom')
      await S.saveContact({
        id: c.id,
        type,
        nom,
        adresse: overlay.querySelector('#ct-adresse').value,
        npaLieu: overlay.querySelector('#ct-npa').value,
        tel: overlay.querySelector('#ct-tel').value,
        email: overlay.querySelector('#ct-email').value,
      })
      overlay.remove()
      view.contacts = await S.listContacts()
      render()
    }
  })
}

// --- divers ----------------------------------------------------------------

let toastTimer = null
export function toast(message) {
  let el = document.querySelector('.toast')
  if (!el) {
    el = document.createElement('div')
    el.className = 'toast'
    document.body.appendChild(el)
  }
  el.textContent = message
  el.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200)
}

function showLoading(message) {
  let el = document.querySelector('.loading-overlay')
  if (!el) {
    el = document.createElement('div')
    el.className = 'loading-overlay'
    el.innerHTML = `<div class="loading-card"><span class="spinner"></span><span class="loading-text"></span></div>`
    document.body.appendChild(el)
  }
  el.querySelector('.loading-text').textContent = message
  requestAnimationFrame(() => el.classList.add('show'))
}

function hideLoading() {
  document.querySelector('.loading-overlay')?.classList.remove('show')
}

async function updatePendingBadge() {
  const n = await pendingCount()
  let el = document.querySelector('.pending-banner')
  if (!n) return el?.remove()
  if (!el) {
    el = document.createElement('div')
    el.className = 'pending-banner'
    document.body.appendChild(el)
  }
  el.textContent = `${n} envoi(s) en attente de réseau`
}

window.addEventListener('online', async () => {
  const sent = await flushQueue()
  if (sent) {
    toast(`${sent} rapport(s) envoyé(s).`)
    if (view.screen === 'home') goHome()
    else updatePendingBadge()
  }
})

function hasAccess() {
  return localStorage.getItem('af-access') === '1'
}

function renderLockScreen() {
  root.innerHTML = `
    <div class="lock-screen">
      <div class="lock-card">
        <img src="/logo.jpg" alt="Atout Flair" class="lock-logo" />
        <h1>Atout Flair</h1>
        <p class="muted small">Entrez le code d'accès pour continuer.</p>
        <form id="lock-form">
          <input id="lock-input" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Code d'accès" />
          <p class="lock-error" id="lock-error"></p>
          <button type="submit" class="btn primary wide">Continuer</button>
        </form>
      </div>
    </div>`
  const input = document.getElementById('lock-input')
  input.focus()
  document.getElementById('lock-form').addEventListener('submit', (ev) => {
    ev.preventDefault()
    if (input.value.trim().toLowerCase() === ACCESS_CODE.toLowerCase()) {
      localStorage.setItem('af-access', '1')
      boot()
      return
    }
    document.getElementById('lock-error').textContent = 'Code incorrect.'
    input.value = ''
    input.focus()
  })
}

export async function boot() {
  if (!hasAccess()) return renderLockScreen()
  await goHome()
  if (navigator.onLine) flushQueue().then((n) => n && updatePendingBadge())
}
