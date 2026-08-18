// Chef d'orchestre de l'app : l'etat de l'ecran courant, le rendu, les
// interactions (saisie, lignes, photos) et le demarrage.
// Le HTML des ecrans est dans src/views/, les briques d'affichage dans
// src/ui/, la sortie du rapport (PDF, envoi) dans src/send.js.

import { typeOf, rowLabelFor } from './templates.js'
import * as S from './state.js'
import { fileToPhoto, openAnnotator } from './photo.js'
import { openSignaturePad } from './signature.js'
import { pendingCount, flushQueue } from './mailer.js'
import { root, toast, pulse, showLoading, hideLoading } from './ui/dom.js'
import { startRowDrag } from './ui/dragsort.js'
import { confirmLeave } from './ui/dialogs.js'
import { toggleTheme } from './ui/theme.js'
import { homeView } from './views/home.js'
import { contactsView } from './views/contacts.js'
import { editorView, rowCardHTML, applySameAddress, applySameName, LIEU_ADDR_KEYS } from './views/editor.js'
import { openContactDialog } from './contact-dialog.js'
import { loadPdfEngine, previewPdf, openSendDialog, shareOrDownload } from './send.js'

// reportsOpen / filter : etat de la liste de l'accueil (repliee sur les trois
// derniers rapports, ou deroulee et filtrable). Il survit aux allers-retours
// vers un rapport (goHome recopie la vue), de sorte qu'on retrouve la liste
// dans l'etat ou on l'a laissee.
let view = {
  screen: 'home',
  report: null,
  children: [],
  reports: [],
  contacts: [],
  reportsOpen: false,
  filter: 'tous',
}
let saveTimer = null

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

async function goHome() {
  view = { ...view, screen: 'home', report: null, children: [] }
  view.reports = (await S.listReports()).filter((r) => !r.parentId)
  render()
}

async function openContacts() {
  view = { ...view, screen: 'contacts', report: null }
  view.contacts = await S.listContacts()
  render()
}

async function openReport(id) {
  const report = await S.loadReport(id)
  if (!report) return goHome()
  // Rapport cree avant l'arrivee de la rubrique "Le technicien" : il reprend le
  // technicien par defaut a l'ouverture, comme un rapport neuf.
  if (!report.technicien) report.technicien = await S.loadTechnicien()
  view.report = report
  view.children = (await S.listReports()).filter((r) => r.parentId === report.id)
  view.contacts = await S.listContacts()
  view.screen = 'editor'
  render()
}

async function createReport(type) {
  const report = S.newReport(type)
  report.technicien = await S.loadTechnicien()
  await S.saveReport(report)
  openReport(report.id)
}

async function refreshContacts() {
  view.contacts = await S.listContacts()
  render()
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
  // La photo de fond n'apparait que sur l'accueil : derriere un formulaire,
  // elle nuirait a la lecture des champs (voir .app-bg dans style.css).
  document.body.dataset.screen = view.screen
  root.innerHTML = view.screen === 'home' ? homeView(view) : view.screen === 'contacts' ? contactsView(view) : editorView(view)
  if (navigated) {
    document.scrollingElement.scrollTop = 0
    root.classList.remove('view-enter')
    void root.offsetWidth // force le reflow pour redemarrer l'animation
    root.classList.add('view-enter')
  }
  updatePendingBadge()
}

// --- interactions ----------------------------------------------------------

function rowOf(el) {
  const id = el.closest('[data-row]')?.dataset.row
  return view.report.rows.find((r) => r.id === id)
}

// Recopie dans les champs affiches les valeurs du lieu recalculees a partir du
// mandant (cases "meme adresse" / "meme nom").
function mirrorLieuFields(keys) {
  keys.forEach((key) => {
    const target = root.querySelector(`[data-path="lieu.${key}"]`)
    if (target) target.value = view.report.lieu[key] ?? ''
  })
}

root.addEventListener('input', (ev) => {
  const el = ev.target
  if (el.dataset.path) {
    set(el.dataset.path, el.value)
    // Cases "meme adresse / meme nom que le mandant" cochees : les champs du
    // lieu restent en phase pendant la saisie, sans re-rendu complet pour
    // ne pas faire perdre le focus/curseur du champ mandant en cours.
    if (view.report.lieu.sameAsMandant && (el.dataset.path === 'mandant.adresse' || el.dataset.path === 'mandant.npaLieu')) {
      applySameAddress(view.report)
      mirrorLieuFields(LIEU_ADDR_KEYS)
    }
    if (view.report.lieu.sameNameAsMandant && (el.dataset.path === 'mandant.nom' || el.dataset.path === 'mandant.prenom')) {
      applySameName(view.report)
      mirrorLieuFields(['locataire'])
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

  if (el.dataset.sameName !== undefined) {
    view.report.lieu.sameNameAsMandant = el.checked
    if (el.checked) applySameName(view.report)
    await S.saveReport(view.report)
    render()
    return
  }

  // Le carnet remplit le reste des coordonnees des que le nom correspond -
  // le nom saisi seul, ou le nom complet propose par la liste du carnet.
  if (el.dataset.path !== 'mandant.nom') return
  const typed = el.value.trim().toLowerCase()
  const match = view.contacts.find(
    (c) => S.fullName(c).toLowerCase() === typed || (c.nom || '').trim().toLowerCase() === typed
  )
  if (!match) return
  view.report.mandant = {
    type: match.type ?? '',
    nom: match.nom,
    prenom: match.prenom ?? '',
    adresse: match.adresse,
    npaLieu: match.npaLieu,
    email: match.email,
    tel: match.tel,
  }
  if (view.report.lieu.sameAsMandant) applySameAddress(view.report)
  if (view.report.lieu.sameNameAsMandant) applySameName(view.report)
  await S.saveReport(view.report)
  render()
})

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
function clearDefaultRemarques() {
  if (!S.contaminatedCount(view.report)) return
  if (view.report.remarques !== S.DEFAULT_REMARQUES) return
  view.report.remarques = ''
  const ta = root.querySelector('[data-path="remarques"]')
  if (ta) ta.value = ''
  toast('Remarques à compléter : une pièce est contaminée.')
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

// Glissement d'une carte par son badge numerote. Sur une poignee dediee plutot
// que sur la carte entiere : ailleurs, le meme geste doit continuer a faire
// defiler la page et a saisir dans les champs.
root.addEventListener('pointerdown', (ev) => {
  const grip = ev.target.closest?.('[data-grip]')
  if (!grip || ev.button > 0) return
  ev.preventDefault()
  startRowDrag(ev, grip, dropRow)
})

root.addEventListener('click', async (ev) => {
  const el = ev.target

  const newType = el.closest('[data-new]')?.dataset.new
  if (newType) return createReport(newType)

  if (el.closest('[data-toggle-reports]')) {
    view.reportsOpen = !view.reportsOpen
    return render()
  }

  const filter = el.closest('[data-filter]')?.dataset.filter
  if (filter) {
    view.filter = filter
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
      await refreshContacts()
    }
    return
  }

  const editContactId = el.closest('[data-edit-contact]')?.dataset.editContact
  if (editContactId) {
    const c = view.contacts.find((x) => x.id === editContactId)
    if (c) openContactDialog(c, refreshContacts)
    return
  }

  const chip = el.closest('.chip')
  if (chip && chip.closest('[data-mandant-type]')) {
    const value = chip.dataset.val
    view.report.mandant.type = view.report.mandant.type === value ? '' : value
    // Une gerance n'a pas de prenom : le nom repris pour le locataire change.
    if (view.report.lieu.sameNameAsMandant) applySameName(view.report)
    scheduleSave()
    return render()
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

  // --- puce de constat : s'ajoute a ce qui est deja ecrit, les puces restant
  // affichees. Un constat en appelle souvent un second ("marquage franc, puis
  // punaises visibles") ; la minuscule apres la virgule fait une phrase et non
  // deux morceaux colles.
  const quickInfo = el.closest('[data-quick-info]')?.dataset.quickInfo
  if (quickInfo) {
    const card = el.closest('.row-card')
    const row = rowOf(el)
    const champ = typeOf(view.report).layout === 'pieces' ? 'info' : 'infos'
    const actuel = (row[champ] ?? '').trim()
    if (!actuel.toLowerCase().includes(quickInfo.toLowerCase())) {
      row[champ] = actuel ? `${actuel}, ${quickInfo[0].toLowerCase()}${quickInfo.slice(1)}` : quickInfo
      card.querySelector(`[data-row-field="${champ}"]`).value = row[champ]
      scheduleSave()
    }
    return
  }

  // --- puce de recommandation : s'ajoute a la suite des remarques, une par
  // ligne. Les puces restent affichees, on en empile plusieurs ; un texte deja
  // present n'est pas redonne, pour qu'un double appui ne fasse pas de doublon.
  const quickNote = el.closest('[data-quick-note]')?.dataset.quickNote
  if (quickNote) {
    const ta = root.querySelector('[data-path="remarques"]')
    const actuel = ta.value.trim()
    if (!actuel.includes(quickNote)) {
      ta.value = actuel ? `${actuel}\n${quickNote}` : quickNote
      set('remarques', ta.value)
      scheduleSave()
    }
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
      clearDefaultRemarques()
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
  if (act === 'toggle-theme') {
    toggleTheme()
    return render()
  }
  if (act === 'open-contacts') return openContacts()
  if (act === 'add-contact') return openContactDialog(undefined, refreshContacts)
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
    const sig = await openSignaturePad(view.report.signature, { title: 'Signature du locataire' })
    if (sig !== undefined) {
      view.report.signature = sig
      await S.saveReport(view.report)
      render()
    }
    return
  }
  if (act === 'sign-tech') {
    const tech = (view.report.technicien ??= { nom: S.TECHNICIEN_NOM_DEFAUT, signature: null })
    const sig = await openSignaturePad(tech.signature, { title: 'Signature du technicien' })
    if (sig !== undefined) {
      tech.signature = sig
      await S.saveReport(view.report)
      // Premiere signature de technicien enregistree sur l'appareil : elle
      // devient le defaut sans rien demander, c'est le geste attendu. Une
      // modification ulterieure reste locale au rapport (collegue de passage)
      // et ne se generalise que par "Enregistrer par defaut".
      const current = await S.loadTechnicien()
      if (sig && !current.signature) {
        await S.saveTechnicien(tech)
        toast('Signature enregistrée par défaut')
      }
      render()
    }
    return
  }
  if (act === 'tech-default') {
    await S.saveTechnicien(view.report.technicien ?? {})
    toast('Technicien enregistré par défaut')
    return
  }
  if (act === 'export-backup') {
    showLoading('Préparation de la sauvegarde…')
    try {
      const data = await S.exportBackup()
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
      hideLoading()
      await shareOrDownload(blob, S.backupFilename())
      toast(`${data.reports.length} rapport(s) et ${data.contacts.length} contact(s) sauvegardés.`)
    } catch (err) {
      hideLoading()
      console.error('Sauvegarde impossible', err)
      toast('Sauvegarde impossible.')
    }
    return
  }
  if (act === 'import-backup') {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      try {
        const data = JSON.parse(await file.text())
        const n = (data.reports ?? []).length
        if (!confirm(`Restaurer cette sauvegarde ?\n${n} rapport(s) et ${(data.contacts ?? []).length} contact(s) seront ajoutés à ceux déjà présents. Rien ne sera effacé.`)) return
        showLoading('Restauration…')
        const bilan = await S.importBackup(data)
        hideLoading()
        toast(`${bilan.reports} rapport(s) et ${bilan.contacts} contact(s) restaurés.`)
        await refreshContacts()
      } catch (err) {
        hideLoading()
        console.error('Restauration impossible', err)
        toast(err?.message === 'Fichier de sauvegarde non reconnu' ? err.message : 'Fichier illisible.')
      }
    }
    input.click()
    return
  }
  if (act === 'preview') return previewPdf(view.report, view.children)
  if (act === 'send') return openSendDialog(view.report, view.children, goHome)
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

// --- file d'attente et demarrage -------------------------------------------

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
  // L'accueil est affiche : on va chercher le moteur PDF en tache de fond, pour
  // qu'il soit en cache (et donc disponible hors ligne) avant le premier rapport.
  loadPdfEngine().catch(() => {})
  if (navigator.onLine) flushQueue().then((n) => n && updatePendingBadge())
}
