// Chef d'orchestre de l'app : l'etat de l'ecran courant, le rendu, les
// interactions (saisie, lignes, photos) et le demarrage.
// Le HTML des ecrans est dans src/views/, les briques d'affichage dans
// src/ui/, la sortie du rapport (PDF, envoi) dans src/send.js.

import { typeOf, accordE, rowLabelFor } from './templates.js'
import * as S from './state.js'
import { fileToPhoto, fileToLogo, openAnnotator } from './photo.js'
import { openSignaturePad } from './signature.js'
import { pendingCount, failedCount, flushQueue, listQueue, retryJob, deleteJob, setCode } from './mailer.js'
import { root, toast, pulse, showLoading, hideLoading, esc } from './ui/dom.js'
import { startRowDrag } from './ui/dragsort.js'
import { confirmLeave } from './ui/dialogs.js'
import { setTheme } from './ui/theme.js'
import { homeView } from './views/home.js'
import { contactsView } from './views/contacts.js'
import { envoisView } from './views/envois.js'
import { editorView, rowCardHTML, counterPills, applySameAddress, applySameName, LIEU_ADDR_KEYS } from './views/editor.js'
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
  queue: [],
  enAttente: 0,
  enEchec: 0,
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
  await majCompteurs()
  render()
}

async function openEnvois() {
  view = { ...view, screen: 'envois', report: null }
  view.queue = await listQueue()
  view.reports = (await S.listReports()).filter((r) => !r.parentId)
  await majCompteurs()
  render()
}

// Les deux nombres portes par l'icone de l'en-tete : ce qui attend, et ce qui
// a echoue. Ils sont relus a chaque retour a l'accueil, pas seulement au
// demarrage - un envoi peut avoir echoue entre-temps.
async function majCompteurs() {
  view.enAttente = await pendingCount()
  view.enEchec = await failedCount()
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
  // Un rapport qu'on rouvre a deja ses pieces statuees : elles s'affichent
  // repliees, une ligne chacune, pour qu'on voie la tournee entiere d'un coup
  // d'oeil au lieu de faire defiler trois ecrans de champs deja remplis.
  view.repliees = new Set(report.rows.filter((r) => r.contamine).map((r) => r.id))
  view.children = (await S.listReports()).filter((r) => r.parentId === report.id)
  view.contacts = await S.listContacts()
  view.partenaires = await S.listPartenaires()
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
  root.innerHTML =
    view.screen === 'home'
      ? homeView(view)
      : view.screen === 'contacts'
        ? contactsView(view)
        : view.screen === 'envois'
          ? envoisView(view)
          : editorView(view)
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

// Redessine la seule bande des propositions du carnet, sans toucher au reste
// de l'ecran : un render() complet pendant la frappe ferait perdre le curseur.
function rafraichirSuggestions() {
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

root.addEventListener('input', (ev) => {
  const el = ev.target
  if (el.dataset.appCode !== undefined) return setCode(el.value)
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
    // Les propositions du carnet suivent la frappe, sans redessiner tout
    // l'ecran : un re-rendu ferait perdre le curseur du champ en cours.
    if (el.dataset.path === 'mandant.nom') rafraichirSuggestions()
    scheduleSave()
  } else if (el.dataset.rowField) {
    const row = rowOf(el)
    if (!row) return
    const champ = el.dataset.rowField
    row[champ] = el.value
    // Le compteur suit tout champ qui fait qu'une ligne compte : le nom d'une
    // piece, mais aussi le numero d'appartement ou de chambre.
    if (S.champsQuiComptent(view.report).includes(champ)) refreshCounters()
    // Les puces de noms de piece ont fait leur travail des que le champ porte
    // quelque chose : elles laissent la place au reste de la carte.
    if (champ === 'nom' && el.value) el.closest('.row-card')?.querySelector('.quick-rooms')?.remove()
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

  // Le nom du partenaire est presque toujours tape apres avoir depose son logo :
  // sans cette reprise, la puce gardee sur l'appareil restait anonyme, et il
  // fallait retaper le nom a chaque rapport.
  if (el.dataset.path === 'partenaire.nom') {
    await S.rememberPartenaire(view.report.partenaire)
    view.partenaires = await S.listPartenaires()
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

// Les compteurs sont redessines entierement, et non juste le chiffre : sinon le
// pluriel restait celui du rendu precedent ("2 pièce", "2 contaminée"). La
// pulsation ne se declenche que sur un compteur qui a vraiment change, pour
// qu'elle continue de vouloir dire quelque chose.
function refreshCounters() {
  const zone = root.querySelector('.counter-pills')
  if (!zone) return
  const avant = { total: zone.querySelector('#cnt-total')?.textContent, cont: zone.querySelector('#cnt-cont')?.textContent }
  zone.innerHTML = counterPills(view.report, typeOf(view.report))
  for (const [cle, id] of [['total', 'cnt-total'], ['cont', 'cnt-cont']]) {
    const el = zone.querySelector(`#${id}`)
    if (el && el.textContent !== avant[cle]) pulse(el)
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

  // --- une proposition du carnet remplit tout le bloc mandant
  const fillId = el.closest('[data-fill-contact]')?.dataset.fillContact
  if (fillId) {
    const c = view.contacts.find((x) => x.id === fillId)
    if (c) {
      view.report.mandant = {
        type: c.type ?? '',
        nom: c.nom ?? '',
        prenom: c.prenom ?? '',
        adresse: c.adresse ?? '',
        npaLieu: c.npaLieu ?? '',
        email: c.email ?? '',
        tel: c.tel ?? '',
      }
      if (view.report.lieu.sameAsMandant) applySameAddress(view.report)
      if (view.report.lieu.sameNameAsMandant) applySameName(view.report)
      await S.saveReport(view.report)
      toast('Mandant repris du carnet')
      render()
    }
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

  // --- choix du theme, dans les reglages
  const themeBtn = el.closest('[data-theme-choice] .seg-btn')
  if (themeBtn) {
    setTheme(themeBtn.dataset.val)
    return render()
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
      // "Non" clot la piece : rien a decrire, rien a photographier, on passe a
      // la suivante - la carte se replie d'elle-meme et la suivante remonte
      // sous le pouce. "Contaminée" et "?" laissent la carte ouverte : il reste
      // justement quelque chose a y ecrire.
      if (row.contamine === 'non' && !row.info && !row.infos && !view.report.photos.some((p) => p.rowId === row.id)) {
        view.repliees.add(row.id)
        scheduleSave()
        return render()
      }
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

  // Replier / deplier une piece. Teste apres la suppression : la croix est
  // posee dans l'en-tete repliee, qui porte elle-meme le geste de depliage.
  // Le badge est exclu : c'est la poignee de glissement, et le clic qui suit
  // un deplacement aurait replie la carte qu'on vient de ranger.
  const foldId = el.closest('[data-grip]') ? null : el.closest('[data-fold]')?.dataset.fold
  if (foldId) {
    if (!view.repliees.delete(foldId)) view.repliees.add(foldId)
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

  // --- logo du partenaire : la case s'ouvre au tap, une puce reprend un
  // partenaire deja utilise sans avoir a rechercher son fichier.
  if (el.closest('[data-depose-logo]')) return poserLogoPartenaire(await pickFile())

  const partId = el.closest('[data-partenaire]')?.dataset.partenaire
  if (partId) {
    const p = (view.partenaires ?? []).find((x) => x.id === partId)
    if (!p) return
    view.report.partenaire = { nom: p.nom ?? '', logo: p.logo }
    await S.saveReport(view.report)
    await S.rememberPartenaire(view.report.partenaire)
    view.partenaires = await S.listPartenaires()
    return render()
  }

  const addChild = el.closest('[data-add-child]')?.dataset.addChild
  if (addChild) return createChild(addChild)

  const openChild = el.closest('[data-open-child]')?.dataset.openChild
  if (openChild) return openReport(openChild)

  // --- ecran des envois
  const retryId = el.closest('[data-retry]')?.dataset.retry
  if (retryId) {
    showLoading('Nouvel essai…')
    const { ok, motif } = await retryJob(retryId)
    hideLoading()
    toast(ok ? 'Rapport envoyé.' : motif)
    return openEnvois()
  }

  if (el.closest('[data-retry-all]')) {
    showLoading('Envoi en cours…')
    // "Tout réessayer" relance aussi les echecs : c'est le geste qu'on fait
    // apres avoir corrige un mot de passe ou une adresse.
    for (const job of view.queue) await retryJob(job.id)
    hideLoading()
    return openEnvois()
  }

  const dropEnvoi = el.closest('[data-drop-envoi]')?.dataset.dropEnvoi
  if (dropEnvoi) {
    if (!confirm("Retirer cet envoi de la liste ? Le rapport, lui, reste dans « Mes rapports » et pourra être renvoyé.")) return
    await deleteJob(dropEnvoi)
    return openEnvois()
  }

  const act = el.closest('[data-act]')?.dataset.act
  if (!act) return
  if (act === 'copier-mandant') {
    const texte = S.mandantEnTexte(view.report.mandant)
    if (!texte) return toast('Aucune coordonnée à copier')
    try {
      await navigator.clipboard.writeText(texte)
      toast('Coordonnées copiées')
    } catch {
      // Le presse-papiers est refuse hors contexte securise, ou sans geste
      // reconnu : on retombe sur la vieille methode, qui marche partout.
      const zone = document.createElement('textarea')
      zone.value = texte
      zone.style.position = 'fixed'
      zone.style.opacity = '0'
      document.body.appendChild(zone)
      zone.select()
      document.execCommand('copy')
      zone.remove()
      toast('Coordonnées copiées')
    }
    return
  }
  if (act === 'drop-partenaire') {
    // Le partenaire quitte ce rapport, mais reste dans la liste de l'appareil :
    // on le retire d'une intervention, on ne le renie pas.
    view.report.partenaire = { nom: '', logo: null }
    await S.saveReport(view.report)
    return render()
  }
  if (act === 'open-contacts') return openContacts()
  if (act === 'open-envois') return openEnvois()
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
    // Le nom propose est celui du locataire ou du mandant, mais il reste
    // modifiable : c'est souvent quelqu'un d'autre qui ouvre la porte.
    view.report.signataire ??= { nom: '' }
    if (!view.report.signataire.nom) {
      view.report.signataire.nom = view.report.lieu?.locataire || S.fullName(view.report.mandant) || ''
    }
    const sig = await openSignaturePad(view.report.signature, { title: 'Signature sur place' })
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
  if (act === 'send') {
    // Le mandant rejoint le carnet au moment de l'envoi : c'est la qu'il est
    // complet et verifie. L'enregistrer a la frappe creerait un contact par
    // lettre tapee ; ne jamais l'enregistrer oblige a le ressaisir a chaque
    // intervention pour la meme regie.
    await S.rememberContact(view.report.mandant)
    view.contacts = await S.listContacts()
    return openSendDialog(view.report, view.children, goHome)
  }
})

// --- photos ----------------------------------------------------------------

// `capture` n'est pose que pour une prise de vue : sur un telephone, il ouvre
// l'appareil photo au lieu de la galerie. Un logo, lui, se choisit dans les
// fichiers - il n'a jamais ete photographie.
function pickFile({ capture = null } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    if (capture) input.capture = capture
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.click()
  })
}

async function capture(rowId) {
  const file = await pickFile({ capture: 'environment' })
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

// --- logo du partenaire ----------------------------------------------------

// Pose le logo depose ou choisi sur le rapport ouvert, et le retient pour les
// suivants. Le fichier est reduit et re-encode avant d'etre stocke : un logo
// tire d'un site web pese souvent plus que toutes les photos du rapport.
async function poserLogoPartenaire(file) {
  if (!file?.type?.startsWith('image/')) return toast('Ce fichier n’est pas une image.')
  showLoading('Préparation du logo…')
  try {
    const logo = await fileToLogo(file)
    view.report.partenaire = { ...(view.report.partenaire ?? {}), logo }
    await S.saveReport(view.report)
    await S.rememberPartenaire(view.report.partenaire)
    view.partenaires = await S.listPartenaires()
    hideLoading()
    render()
  } catch (err) {
    hideLoading()
    console.error('Logo illisible', err)
    toast('Impossible de lire ce logo. Essayez un PNG ou un JPEG.')
  }
}

// Glisser-deposer sur la case, pour l'ordinateur. Le tap, lui, passe par le
// selecteur de fichiers (voir le gestionnaire de clic).
root.addEventListener('dragover', (ev) => {
  const zone = ev.target.closest?.('[data-depose-logo]')
  if (!zone) return
  ev.preventDefault()
  zone.classList.add('survol')
})

root.addEventListener('dragleave', (ev) => {
  ev.target.closest?.('[data-depose-logo]')?.classList.remove('survol')
})

root.addEventListener('drop', (ev) => {
  const zone = ev.target.closest?.('[data-depose-logo]')
  if (!zone) return
  ev.preventDefault()
  zone.classList.remove('survol')
  poserLogoPartenaire(ev.dataTransfer?.files?.[0])
})

async function createChild(rowId) {
  const parent = view.report
  const row = parent.rows.find((r) => r.id === rowId)
  const child = S.newReport('detection')
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

// --- file d'attente et demarrage -------------------------------------------

// L'etat des envois se lit sur l'icone de l'en-tete, pas sur une banniere
// collee en bas de l'ecran : elle recouvrait la barre d'actions du rapport
// ouvert, et ne disait ni ce qui attendait, ni pourquoi.
async function updatePendingBadge() {
  await majCompteurs()
  const pastille = document.querySelector('.envois-toggle')
  if (!pastille) return
  pastille.dataset.compte = view.enEchec || view.enAttente || ''
  pastille.classList.toggle('en-echec', view.enEchec > 0)
}

window.addEventListener('online', async () => {
  const { envoyes, echecs } = await flushQueue()
  if (!envoyes && !echecs) return
  if (envoyes) toast(`${envoyes} rapport${envoyes > 1 ? "s" : ""} envoyé${envoyes > 1 ? "s" : ""}.`)
  else toast("Un envoi a été refusé. Voyez « Envois » pour le motif.")
  if (view.screen === 'home') goHome()
  else if (view.screen === 'envois') openEnvois()
  else updatePendingBadge()
})

export async function boot() {
  await goHome()
  // L'accueil est affiche : on va chercher le moteur PDF en tache de fond, pour
  // qu'il soit en cache (et donc disponible hors ligne) avant le premier rapport.
  loadPdfEngine().catch(() => {})
  if (navigator.onLine) flushQueue().then(() => updatePendingBadge())
}
