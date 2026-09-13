// "Nouveau rapport", depuis n'importe quel ecran : la feuille qui monte du bas
// quand on touche le bouton dore du dock.
//
// Les trois lieux, en grand, comme sur l'accueil. Et, pour qui le veut, le
// client d'abord : le rapport nait alors deja rempli a son nom - le meme geste
// que "Nouveau rapport pour ce client" sur sa fiche.

import { openOverlay } from './ui/dialogs.js'
import { ICONS } from './ui/icons.js'
import { esc } from './ui/dom.js'
import { fullName } from './state.js'
import { tuilesTypesHTML } from './views/home.js'

/**
 * @param {{contacts: object[], choisirClient: () => Promise<object|null>}} ctx
 * @returns {Promise<{type: string, contact: object|null}|null>}
 */
export function ouvrirNouveauRapport({ contacts, choisirClient }) {
  let contact = null
  const overlay = openOverlay(`
    <h2>Nouveau rapport</h2>
    ${
      contacts.length
        ? `<button type="button" class="nouveau-client" data-client>
             ${ICONS.contacts}
             <span><b>Pour un client du carnet</b><small></small></span>
             ${ICONS.chevron}
           </button>`
        : ''
    }
    <div class="types-pleins">${tuilesTypesHTML({ attr: 'data-type' })}</div>
    <div class="dialog-actions">
      <button class="btn ghost" data-close>Annuler</button>
    </div>`)
  overlay.querySelector('.dialog-box').classList.add('nouveau-feuille')

  return new Promise((resolve) => {
    const fermer = (valeur) => {
      overlay.remove()
      resolve(valeur)
    }
    overlay.addEventListener('click', async (ev) => {
      if (ev.target === overlay || ev.target.closest('[data-close]')) return fermer(null)

      if (ev.target.closest('[data-client]')) {
        const c = await choisirClient()
        if (!c) return
        contact = c
        const bouton = overlay.querySelector('[data-client]')
        bouton.classList.add('choisi')
        bouton.querySelector('b').textContent = `Pour ${fullName(c) || 'ce client'}`
        bouton.querySelector('small').innerHTML = `${esc([c.adresse, c.npaLieu].filter(Boolean).join(', ') || 'Coordonnées reprises du carnet')}`
        return
      }

      const type = ev.target.closest('[data-type]')?.dataset.type
      if (type) fermer({ type, contact })
    })
  })
}
