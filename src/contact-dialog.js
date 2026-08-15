// Formulaire d'ajout/modification d'un contact du carnet. `contact` absent
// = creation ; fourni = edition (bouton Supprimer visible, mise a jour par
// id pour pouvoir renommer sans dupliquer l'entree).

import * as S from './state.js'
import { esc, toast } from './ui/dom.js'
import { openOverlay } from './ui/dialogs.js'
import { mandantPicker } from './ui/chips.js'

/**
 * @param {object} [contact] contact a modifier, absent pour une creation
 * @param {() => void|Promise<void>} onChanged appele apres enregistrement ou suppression
 */
export function openContactDialog(contact, onChanged) {
  const c = contact ?? { type: '', nom: '', prenom: '', adresse: '', npaLieu: '', tel: '', email: '' }
  let type = c.type || ''
  let pickerOpen = false

  // Memes paires que le bloc "Mandant" du rapport : le carnet enregistre
  // exactement les memes informations, il doit se remplir de la meme facon.
  const overlay = openOverlay(`
    <h2>${contact ? 'Modifier le contact' : 'Nouveau contact'}</h2>
    <div data-picker-slot>${mandantPicker(type, { attr: 'data-contact-type', open: false })}</div>
    <div class="grid2">
      <label>Nom<input id="ct-nom" value="${esc(c.nom)}" /></label>
      <label>Prénom<input id="ct-prenom" value="${esc(c.prenom)}" /></label>
      <label>Adresse<input id="ct-adresse" value="${esc(c.adresse)}" /></label>
      <label>NPA/Lieu<input id="ct-npa" value="${esc(c.npaLieu)}" /></label>
      <label>Email<input id="ct-email" value="${esc(c.email)}" inputmode="email" /></label>
      <label>Téléphone<input id="ct-tel" value="${esc(c.tel)}" inputmode="tel" /></label>
    </div>
    <div class="dialog-actions">
      ${contact ? `<button class="btn ghost danger" data-del>Supprimer</button>` : ''}
      <button class="btn ghost" data-close>Annuler</button>
      <button class="btn primary" data-save>Enregistrer</button>
    </div>`)
  overlay.querySelector('#ct-nom').focus()

  const redrawPicker = () => {
    overlay.querySelector('[data-picker-slot]').innerHTML = mandantPicker(type, {
      attr: 'data-contact-type',
      open: pickerOpen,
    })
  }

  overlay.addEventListener('click', async (ev) => {
    if (ev.target === overlay || ev.target.hasAttribute?.('data-close')) {
      overlay.remove()
      return
    }

    if (ev.target.closest('[data-picker]')) {
      pickerOpen = !pickerOpen
      redrawPicker()
      return
    }

    const chip = ev.target.closest('[data-contact-type] .chip')
    if (chip) {
      // Un choix referme le selecteur : c'est le geste d'une liste deroulante.
      type = type === chip.dataset.val ? '' : chip.dataset.val
      pickerOpen = false
      redrawPicker()
      return
    }

    if (ev.target.hasAttribute?.('data-del')) {
      if (!confirm('Supprimer ce contact ?')) return
      await S.deleteContact(c.id)
      overlay.remove()
      await onChanged()
      return
    }

    if (ev.target.hasAttribute?.('data-save')) {
      const nom = overlay.querySelector('#ct-nom').value.trim()
      if (!nom) return toast('Indiquez un nom')
      await S.saveContact({
        id: c.id,
        type,
        nom,
        prenom: overlay.querySelector('#ct-prenom').value.trim(),
        adresse: overlay.querySelector('#ct-adresse').value,
        npaLieu: overlay.querySelector('#ct-npa').value,
        tel: overlay.querySelector('#ct-tel').value,
        email: overlay.querySelector('#ct-email').value,
      })
      overlay.remove()
      await onChanged()
    }
  })
}
