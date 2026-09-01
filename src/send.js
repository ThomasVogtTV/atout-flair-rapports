// Generation du PDF et sortie du rapport : apercu, envoi par mail, ou passage
// a la messagerie du telephone quand l'envoi automatique ne peut pas aboutir.

import * as S from './state.js'
import { recompress } from './photo.js'
import { sendReport } from './mailer.js'
import { esc, toast, showLoading, hideLoading } from './ui/dom.js'
import { openOverlay, confirmRemise } from './ui/dialogs.js'

// Boite mail de l'entreprise : copie par defaut proposee dans le dialogue.
const COPY_DEFAULT = 'info@atout-flair.ch'

// Une fonction serveur Vercel refuse une requete de plus de 4,5 Mo, et le PDF
// voyage encode en base64 (+33 %). On vise donc 3 Mo de PDF au maximum : si le
// rapport depasse, les photos sont re-encodees plus petites, palier par palier.
const PDF_MAX = 3_000_000
const SHRINK_STEPS = [
  { maxDim: 1200, quality: 0.68 },
  { maxDim: 900, quality: 0.55 },
]

// pdf-lib pese a lui seul plus que tout le reste de l'app. Il est charge a part,
// des l'affichage du premier ecran (voir boot), pour que l'app s'ouvre tout de
// suite sur le terrain ; au moment de generer le PDF il est deja la.
let pdfModule = null
export function loadPdfEngine() {
  pdfModule ??= import('./pdf.js').catch((err) => {
    pdfModule = null // reseau coupe pendant le chargement : on reessaiera plus tard
    throw err
  })
  return pdfModule
}

async function buildWith(report, children) {
  const used = children.filter((c) => report.rows.some((r) => r.sousRapportId === c.id))
  const { buildCombinedPdf } = await loadPdfEngine()
  return new Blob([await buildCombinedPdf(report, used)], { type: 'application/pdf' })
}

async function shrunkReport(report, { maxDim, quality }) {
  const photos = await Promise.all(
    report.photos.map(async (p) => ({ ...p, dataUrl: await recompress(p.dataUrl, maxDim, quality) }))
  )
  return { ...report, photos }
}

/** @returns {Promise<{blob: Blob, oversized: boolean}>} */
async function currentPdf(report, children) {
  let blob = await buildWith(report, children)
  for (const step of SHRINK_STEPS) {
    if (blob.size <= PDF_MAX) break
    showLoading('Rapport volumineux : optimisation des photos…')
    blob = await buildWith(await shrunkReport(report, step), children)
  }
  return { blob, oversized: blob.size > PDF_MAX }
}

export async function previewPdf(report, children) {
  showLoading('Génération du PDF…')
  try {
    const { blob } = await currentPdf(report, children)
    const url = URL.createObjectURL(blob)
    // En app installée (iOS notamment) l'ouverture d'onglet est parfois bloquée :
    // on retombe alors sur un téléchargement, que le téléphone ouvre tout seul.
    const win = window.open(url, '_blank')
    if (!win) {
      const a = document.createElement('a')
      a.href = url
      a.download = S.reportFilename(report)
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
export async function shareOrDownload(blob, filename) {
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
 * Sortie du rapport a la main : le PDF part par la messagerie du telephone.
 *
 * C'est le seul instant ou l'on sait que le rapport a quitte l'app, donc le
 * seul bon moment pour lui demander s'il est fini. Sans cela son etat ne
 * changeait jamais - il ne quittait 'draft' qu'en partant par l'envoi
 * automatique - et "En cours" accumulait la tournee entiere.
 */
async function remisALaMain(report, blob, filename, onSent) {
  await shareOrDownload(blob, filename)
  if (!S.enCours(report)) return
  if (!(await confirmRemise())) return
  await S.terminerReport(report)
  toast('Rapport terminé. Il reste dans « Mes rapports ».')
  onSent()
}

/**
 * Dialogue d'envoi du rapport.
 * @param {object} report rapport ouvert (son statut est mis a jour apres envoi)
 * @param {object[]} children sous-rapports du rapport ouvert
 * @param {() => void} onSent appele une fois le rapport envoye ou mis en file
 */
export function openSendDialog(report, children, onSent) {
  const filename = S.reportFilename(report)
  const overlay = openOverlay(`
    <h2>Envoyer le rapport</h2>
    <label>Destinataire<input id="send-to" type="email" value="${esc(report.mandant.email)}" /></label>
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
    </div>`)

  overlay.addEventListener('click', async (ev) => {
    if (ev.target.hasAttribute?.('data-close') || ev.target === overlay) return overlay.remove()

    // Un rapport volumineux (photos, plusieurs sous-rapports) peut faire
    // echouer la generation du PDF (memoire, canvas...) sur un telephone
    // moins puissant : sans ce filet, l'ecran de chargement restait bloque
    // indefiniment puisque hideLoading() n'etait jamais atteint.
    try {
      if (ev.target.hasAttribute?.('data-share')) {
        showLoading('Génération du PDF…')
        const { blob } = await currentPdf(report, children)
        hideLoading()
        // Le dialogue s'efface avant le partage : sans cela la question qui
        // suit s'empilait par-dessus lui.
        overlay.remove()
        await remisALaMain(report, blob, filename, onSent)
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
      const { blob, oversized } = await currentPdf(report, children)
      if (oversized) {
        // Au-dela de la limite du serveur, l'envoi automatique echouerait sans
        // qu'on puisse rien y faire : on passe la main a l'application mail.
        hideLoading()
        toast('Rapport trop lourd pour l’envoi automatique : je le passe à votre messagerie.')
        await remisALaMain(report, blob, filename, onSent)
        return
      }

      showLoading('Envoi en cours…')
      const { etat, motif } = await sendReport(report, payload, blob)
      hideLoading()
      if (etat === 'non-configure') {
        // La boite mail n'est pas branchee cote serveur. Mettre le rapport en
        // attente donnerait l'illusion d'un envoi a venir.
        toast('Envoi automatique pas encore activé : je passe le PDF à votre messagerie.')
        await remisALaMain(report, blob, filename, onSent)
        return
      }

      // Un refus du serveur laisse le rapport dans l'etat ou il etait : le
      // marquer "envoye" alors qu'il n'est jamais parti est exactement le piege
      // qu'on veut eviter, et rouvrir d'office un rapport deja declare terminé
      // en serait un autre - c'est l'envoi qui a echoue, pas le travail. Il
      // reste modifiable, et l'ecran Envois porte le motif.
      report.status = etat === 'envoye' ? 'sent' : etat === 'attente' ? 'queued' : report.status
      report.sentAt = etat === 'envoye' ? Date.now() : null
      await S.saveReport(report)
      toast(
        etat === 'envoye'
          ? 'Rapport envoyé.'
          : etat === 'attente'
            ? 'Pas de réseau : envoi mis en attente, il partira tout seul.'
            : `Envoi refusé : ${motif}`
      )
      onSent()
    } catch (err) {
      console.error('Génération/envoi du rapport impossible', err)
      toast('Une erreur est survenue. Réessayez.')
    } finally {
      hideLoading()
    }
  })
}
