import { TYPES, TYPE_LIST, typeOf, rowLabelFor } from './templates.js'
import * as S from './state.js'
import { fileToPhoto, openAnnotator, recompress } from './photo.js'
import { openSignaturePad } from './signature.js'
import { buildCombinedPdf } from './pdf.js'
import { sendReport, pendingCount, flushQueue } from './mailer.js'

// Boite mail de l'entreprise : expediteur cote serveur, copie par defaut cote app.
const COPY_DEFAULT = 'info@atout-flair.ch'

// Icones de l'accueil (traits fins, 1.6px, coherentes avec le style epure).
const ICON_STROKE = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"'
const ICONS = {
  detection: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9"/><path d="M10 20v-5a2 2 0 0 1 4 0v5"/></svg>`,
  immeuble: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><rect x="5" y="3.5" width="14" height="17" rx="1.2"/><path d="M8.5 7.5h1M14.5 7.5h1M8.5 11.5h1M14.5 11.5h1M8.5 15.5h1M14.5 15.5h1"/><path d="M10 20.5v-3.2a2 2 0 0 1 4 0v3.2"/></svg>`,
  hotel: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><path d="M3.5 19v-9"/><path d="M3.5 14.5h17V19"/><path d="M3.5 14.5v-3a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3"/><path d="M13.5 11h5a2 2 0 0 1 2 2v1.5"/></svg>`,
  chevron: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><path d="m9 5 7 7-7 7"/></svg>`,
}

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
  root.innerHTML = view.screen === 'home' ? homeView() : editorView()
  root.scrollTop = 0
  if (navigated) {
    root.classList.remove('view-enter')
    void root.offsetWidth // force le reflow pour redemarrer l'animation
    root.classList.add('view-enter')
  }
  updatePendingBadge()
}

function homeView() {
  const cards = TYPE_LIST.map(
    (t) => `
    <button class="type-card" data-new="${t.id}">
      <span class="type-icon">${ICONS[t.id] ?? ''}</span>
      <span class="type-body">
        <span class="type-name">${esc(t.label)}</span>
        <span class="type-hint">${esc(t.hint)}</span>
      </span>
      <span class="type-chevron">${ICONS.chevron}</span>
    </button>`
  ).join('')

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
      ? reports
          .map((r) => {
            const who = r.lieu?.locataire || r.mandant?.nom || 'Sans nom'
            const where = r.lieu?.adresseIntervention || r.lieu?.adresse || ''
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
                  <span class="muted">${esc(r.ref ?? '')}${where ? ` · ${esc(where)}` : ''}</span>
                </div>
                <div class="report-side">${state}
                  <button class="icon-btn" data-del="${r.id}" title="Supprimer">✕</button>
                </div>
              </li>`
          })
          .join('')
      : `<li class="empty">Aucun rapport de ce type pour l'instant.</li>`

    return `
      <div class="folder${open ? ' open' : ''}">
        <button class="folder-head" data-toggle-folder="${t.id}">
          <span class="type-icon muted">${ICONS[t.id] ?? ''}</span>
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

  return `
    <header class="top">
      <img src="/logo.jpg" alt="Atout Flair" class="logo" />
      <div class="top-title">
        <h1>Rapports de détection</h1>
        <p class="muted">Saisie, photos, signature et envoi sur place</p>
      </div>
    </header>
    <div class="hero-bg"><img src="/hero-dog.jpg" alt="" /></div>
    <section class="content-sheet">
      <h2 class="section-title">Nouveau rapport</h2>
      <div class="type-grid">${cards}</div>
      <h2 class="section-title">Mes rapports</h2>
      <div class="folders">${folders}</div>
    </section>`
}

function fieldInput(f, value) {
  const id = `lieu.${f.key}`
  if (f.type === 'ouinon') {
    return `<div class="seg" data-seg="${id}">
      ${['Oui', 'Non']
        .map((v) => `<button type="button" class="seg-btn${value === v ? ' on' : ''}" data-val="${v}">${v}</button>`)
        .join('')}
    </div>`
  }
  const type = f.type === 'date' ? 'date' : f.type === 'time' ? 'time' : 'text'
  return `<input type="${type}" data-path="${id}" value="${esc(value ?? '')}" />`
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
      <h2 class="section-title">Mandant
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

      <h2 class="section-title">Lieu d'intervention</h2>
      <div class="card grid2">
        ${lieuFields
          .filter((f) => !f.derived)
          .map(
            (f) => `<label class="${f.key === 'adresseIntervention' || f.key === 'adresse' ? 'full' : ''}">
              ${esc(f.label)}${fieldInput(f, r.lieu[f.key])}
            </label>`
          )
          .join('')}
      </div>

      ${t.layout === 'pieces' ? piecesSection(r, t) : lignesSection(r, t)}

      <h2 class="section-title">Photos libres</h2>
      <div class="card">
        <p class="muted small">Photos non rattachées à une ligne (façade, cave, hall…).</p>
        ${photoStrip(r.photos.filter((p) => !p.rowId))}
        <button class="btn ghost wide" data-photo="">+ Ajouter une photo</button>
      </div>

      <h2 class="section-title">Remarques et recommandations</h2>
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

function piecesSection(r, t) {
  const rows = r.rows
    .map((row, i) => {
      const photos = r.photos.filter((p) => p.rowId === row.id)
      return `
      <div class="row-card" data-row="${row.id}">
        <div class="row-head">
          <input class="row-name" data-row-field="nom" list="pieces-list" value="${esc(row.nom)}" placeholder="Nom de la pièce" />
          <button class="icon-btn" data-del-row="${row.id}" title="Supprimer">✕</button>
        </div>
        <div class="seg tri" data-seg-row="${row.id}">
          <button type="button" class="seg-btn oui${row.contamine === 'oui' ? ' on' : ''}" data-val="oui">Contaminée</button>
          <button type="button" class="seg-btn non${row.contamine === 'non' ? ' on' : ''}" data-val="non">Non</button>
          <button type="button" class="seg-btn inconnu${row.contamine === 'inconnu' ? ' on' : ''}" data-val="inconnu">?</button>
        </div>
        <input class="row-info" data-row-field="info" value="${esc(row.info)}" placeholder="Informations (marquage, punaises visibles…)" />
        ${photoStrip(photos)}
        <button class="btn ghost wide" data-photo="${row.id}">+ Photo de cette pièce</button>
      </div>`
    })
    .join('')

  return `
    <h2 class="section-title">Pièces
      <span class="counter"><b id="cnt-total">${S.filledRows(r).length}</b> pièces · <b id="cnt-cont">${S.contaminatedCount(r)}</b> contaminée(s)</span>
    </h2>
    <datalist id="pieces-list">${t.suggestions.map((s) => `<option value="${esc(s)}"></option>`).join('')}</datalist>
    <div class="rows">${rows}</div>
    <button class="btn ghost wide" data-act="add-row">+ Ajouter une pièce</button>`
}

function lignesSection(r, t) {
  const isHotel = t.id === 'hotel'
  const rows = r.rows
    .map((row) => {
      const photos = r.photos.filter((p) => p.rowId === row.id)
      const child = view.children.find((c) => c.id === row.sousRapportId)
      return `
      <div class="row-card" data-row="${row.id}">
        <div class="row-head">
          <input class="row-name small-input" data-row-field="numero" value="${esc(row.numero)}" placeholder="${isHotel ? 'N° chambre' : 'N° appart.'}" />
          <input class="row-name small-input" data-row-field="etage" list="etages-list" value="${esc(row.etage)}" placeholder="Étage" />
          <input type="date" class="small-input" data-row-field="date" value="${esc(row.date)}" />
          <button class="icon-btn" data-del-row="${row.id}" title="Supprimer">✕</button>
        </div>
        <input data-row-field="resident" value="${esc(row.resident)}" placeholder="${isHotel ? 'Informations (ex. appartement, occupé…)' : 'Résident'}" />
        <div class="seg" data-seg-row="${row.id}">
          <button type="button" class="seg-btn oui${row.contamine === 'oui' ? ' on' : ''}" data-val="oui">Contaminé</button>
          <button type="button" class="seg-btn non${row.contamine === 'non' ? ' on' : ''}" data-val="non">Non</button>
        </div>
        <input data-row-field="infos" value="${esc(row.infos)}" placeholder="Infos (téléphone, chien sur place, conseil…)" />
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
    })
    .join('')

  return `
    <h2 class="section-title">${esc(t.rowLabelPlural[0].toUpperCase() + t.rowLabelPlural.slice(1))}
      <span class="counter"><b>${S.filledRows(r).length}</b> ligne(s) · <b>${S.contaminatedCount(r)}</b> contaminée(s)</span>
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
    <h2 class="section-title">Signature</h2>
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
    scheduleSave()
  } else if (el.dataset.rowField) {
    const row = rowOf(el)
    if (!row) return
    row[el.dataset.rowField] = el.value
    if (el.dataset.rowField === 'nom') refreshCounters()
    scheduleSave()
  }
})

// Le carnet remplit le reste des coordonnees des que le nom correspond.
root.addEventListener('change', async (ev) => {
  const el = ev.target
  if (el.dataset.path !== 'mandant.nom') return
  const match = view.contacts.find((c) => (c.nom || '').toLowerCase() === el.value.trim().toLowerCase())
  if (!match) return
  view.report.mandant = { nom: match.nom, adresse: match.adresse, npaLieu: match.npaLieu, email: match.email, tel: match.tel }
  await S.saveReport(view.report)
  render()
})

function refreshCounters() {
  const total = document.getElementById('cnt-total')
  const cont = document.getElementById('cnt-cont')
  if (total) total.textContent = S.filledRows(view.report).length
  if (cont) cont.textContent = S.contaminatedCount(view.report)
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
  if (delRow) {
    view.report.rows = view.report.rows.filter((r) => r.id !== delRow)
    view.report.photos = view.report.photos.filter((p) => p.rowId !== delRow)
    await S.saveReport(view.report)
    return render()
  }

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
  if (act === 'home') return view.report?.parentId ? openReport(view.report.parentId) : goHome()
  if (act === 'add-row') {
    view.report.rows.push(S.newRow(view.report.type))
    await S.saveReport(view.report)
    return render()
  }
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
  hideLoading()
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

export async function boot() {
  await goHome()
  if (navigator.onLine) flushQueue().then((n) => n && updatePendingBadge())
}
