// Les autres actions d'un rapport ouvert, a portee depuis n'importe quelle
// etape : le relire, l'envoyer, le declarer fini, le dupliquer.
//
// La barre du bas les porte a la cloture ; ce menu les rend accessibles avant,
// pour qui veut renvoyer un rapport deja remis ou jeter un oeil au PDF en cours
// de route.

import { openOverlay } from './ui/dialogs.js'
import { ICONS } from './ui/icons.js'
import { esc } from './ui/dom.js'

/**
 * @param {{fini: boolean, sousRapport: boolean}} etat
 * @returns {Promise<string|null>} l'action choisie (meme nom que les data-act de l'app)
 */
export function ouvrirMenuRapport({ fini, sousRapport, invite = false }) {
  // Un invite transmet a l'administrateur, qui envoie au client apres relecture.
  const envoi = invite
    ? { titre: 'Transmettre', sous: 'À l’administrateur, qui l’enverra au client' }
    : { titre: fini ? 'Renvoyer' : 'Envoyer', sous: 'Par mail, ou par la messagerie du téléphone' }
  const actions = [
    { act: 'preview', icone: ICONS.oeil, titre: 'Aperçu du PDF', sous: 'Le document tel qu’il partira' },
    { act: 'send', icone: ICONS.envoyer, ...envoi },
    !sousRapport && {
      act: fini ? 'rouvrir' : 'terminer',
      icone: ICONS.coche,
      titre: fini ? 'Rouvrir le rapport' : 'Marquer comme terminé',
      sous: fini ? 'Pour corriger, puis renvoyer' : 'Remis à la main, sans envoi',
    },
    !sousRapport && { act: 'dupliquer', icone: ICONS.copie, titre: 'Dupliquer', sous: 'Même lieu et mêmes pièces, constats à refaire' },
  ].filter(Boolean)

  const overlay = openOverlay(`
    <h2>Actions du rapport</h2>
    <ul class="menu-liste">
      ${actions
        .map(
          (a) => `<li><button type="button" class="menu-action" data-menu="${a.act}">
            ${a.icone}<span>${esc(a.titre)}<small>${esc(a.sous)}</small></span>${ICONS.chevron}
          </button></li>`
        )
        .join('')}
    </ul>
    <div class="dialog-actions">
      <button class="btn ghost" data-close>Fermer</button>
    </div>`)

  return new Promise((resolve) => {
    overlay.addEventListener('click', (ev) => {
      const choix = ev.target.closest('[data-menu]')?.dataset.menu
      if (!choix && ev.target !== overlay && !ev.target.closest('[data-close]')) return
      overlay.remove()
      resolve(choix ?? null)
    })
  })
}
