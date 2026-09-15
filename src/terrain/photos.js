// Terrain : les photos d'un rapport et le logo du partenaire.

import { rowLabelFor } from '../templates.js'
import { fileToPhoto, fileToLogo, openAnnotator } from '../photo.js'
import { root, toast, showLoading, hideLoading } from '../ui/dom.js'
import * as S from '../state.js'
import { view } from './etat.js'
import { render } from './rendu.js'
import { placePourUnePhoto } from './sauvegardes.js'

// --- photos ----------------------------------------------------------------

// `capture` n'est pose que pour une prise de vue : sur un telephone, il ouvre
// l'appareil photo au lieu de la galerie. Un logo, lui, se choisit dans les
// fichiers - il n'a jamais ete photographie.
export function pickFile({ capture = null } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    if (capture) input.capture = capture
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.click()
  })
}

export async function capture(rowId) {
  if (!(await placePourUnePhoto())) return
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
export async function poserLogoPartenaire(file) {
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

/**
 * Deplace une photo d'un cran dans son propre groupe - les photos d'une piece,
 * ou les photos libres. L'echange se fait dans le tableau general du rapport,
 * celui que suit l'annexe du PDF : ce qu'on voit dans la bande est l'ordre qui
 * sera imprime.
 */
export async function movePhoto(id, dir) {
  const photos = view.report.photos
  const photo = photos.find((p) => p.id === id)
  if (!photo) return
  const groupe = photos.filter((p) => (p.rowId ?? null) === (photo.rowId ?? null))
  const cible = groupe.indexOf(photo) + dir
  if (cible < 0 || cible >= groupe.length) return
  const a = photos.indexOf(photo)
  const b = photos.indexOf(groupe[cible])
  ;[photos[a], photos[b]] = [photos[b], photos[a]]
  await S.saveReport(view.report)
  render()
}
