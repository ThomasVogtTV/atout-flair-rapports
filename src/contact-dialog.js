// Formulaire d'ajout/modification d'un contact du carnet. `contact` absent
// = creation ; fourni = edition (bouton Supprimer visible, mise a jour par
// id pour pouvoir renommer sans dupliquer l'entree).

import * as S from './state.js'
import { esc, toast } from './ui/dom.js'
import { openOverlay } from './ui/dialogs.js'
import { mandantPicker } from './ui/chips.js'

const IDS = {
  nom: '#ct-nom',
  prenom: '#ct-prenom',
  adresse: '#ct-adresse',
  npaLieu: '#ct-npa',
  email: '#ct-email',
  tel: '#ct-tel',
}

/**
 * @param {object} [contact] contact a modifier, absent pour une creation
 * @param {() => void|Promise<void>} onChanged appele apres enregistrement ou suppression
 */
export function openContactDialog(contact, onChanged) {
  const c = contact ?? { type: '', nom: '', prenom: '', adresse: '', npaLieu: '', tel: '', email: '' }
  let type = c.type || ''

  // Valeurs en cours de saisie : elles doivent survivre au redessin des champs
  // quand le type change (le prenom disparait pour une gerance).
  let v = { nom: c.nom ?? '', prenom: c.prenom ?? '', adresse: c.adresse ?? '', npaLieu: c.npaLieu ?? '', email: c.email ?? '', tel: c.tel ?? '' }

  const readFields = () => {
    for (const [key, id] of Object.entries(IDS)) {
      const el = overlay.querySelector(id)
      if (el) v[key] = el.value
    }
  }

  // Memes paires que le bloc "Mandant" du rapport : le carnet enregistre
  // exactement les memes informations, il doit se remplir de la meme facon.
  const fieldsHTML = () => {
    const societe = type === 'gerance'
    return `
      <label class="${societe ? 'full' : ''}">Nom<input id="ct-nom" value="${esc(v.nom)}" /></label>
      ${societe ? '' : `<label>Prénom<input id="ct-prenom" value="${esc(v.prenom)}" /></label>`}
      <label>Adresse<input id="ct-adresse" value="${esc(v.adresse)}" /></label>
      <label>NPA/Lieu<input id="ct-npa" value="${esc(v.npaLieu)}" /></label>
      <label>Email<input id="ct-email" value="${esc(v.email)}" inputmode="email" /></label>
      <label>Téléphone<input id="ct-tel" value="${esc(v.tel)}" inputmode="tel" /></label>`
  }

  const overlay = openOverlay(`
    <h2>${contact ? 'Modifier le contact' : 'Nouveau contact'}</h2>
    <div data-picker-slot>${mandantPicker(type, { attr: 'data-contact-type' })}</div>
    <div class="grid2" data-fields></div>
    <div class="dialog-actions">
      ${contact ? `<button class="btn ghost danger" data-del>Supprimer</button>` : ''}
      <button class="btn ghost" data-close>Annuler</button>
      <button class="btn primary" data-save>Enregistrer</button>
    </div>`)

  const redraw = () => {
    overlay.querySelector('[data-picker-slot]').innerHTML = mandantPicker(type, { attr: 'data-contact-type' })
    overlay.querySelector('[data-fields]').innerHTML = fieldsHTML()
  }

  redraw()
  overlay.querySelector('#ct-nom').focus()

  overlay.addEventListener('click', async (ev) => {
    if (ev.target === overlay || ev.target.hasAttribute?.('data-close')) {
      overlay.remove()
      return
    }

    const chip = ev.target.closest('[data-contact-type] .chip')
    if (chip) {
      readFields()
      type = type === chip.dataset.val ? '' : chip.dataset.val
      redraw()
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
      readFields()
      const nom = v.nom.trim()
      if (!nom) return toast('Indiquez un nom')
      await S.saveContact({
        id: c.id,
        type,
        nom,
        // Le prenom saisi avant un passage en "Gerance" reste enregistre : il
        // n'est pas affiche, et repasser en particulier le retrouve.
        prenom: v.prenom.trim(),
        adresse: v.adresse,
        npaLieu: v.npaLieu,
        tel: v.tel,
        email: v.email,
      })
      overlay.remove()
      await onChanged()
    }
  })
}
