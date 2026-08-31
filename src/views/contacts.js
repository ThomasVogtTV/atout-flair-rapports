// Ecran "Carnet" : les mandants deja rencontres - regies, proprietaires,
// locataires. L'ajout et la modification passent par le formulaire de
// `src/contact-dialog.js`.
//
// Les reglages de l'appareil vivaient au bas de cet ecran ; ils ont maintenant
// le leur (voir views/reglages.js).

import { fullName } from '../state.js'
import { esc } from '../ui/dom.js'
import { mandantTypeLabel } from '../ui/chips.js'

export function contactsView(view) {
  const contacts = view.contacts ?? []
  const rows = contacts.length
    ? contacts
        .map(
          (c) => `
          <li class="report-row" data-edit-contact="${c.id}">
            <div class="report-main">
              <strong>${esc(fullName(c) || 'Sans nom')}</strong>
              <span class="muted">${esc([mandantTypeLabel(c.type), c.adresse, c.npaLieu].filter(Boolean).join(' · ')) || 'Adresse non renseignée'}</span>
            </div>
            <div class="report-side">
              <button class="icon-btn" data-del-contact="${c.id}" title="Supprimer">✕</button>
            </div>
          </li>`
        )
        .join('')
    : `<li class="empty">Aucun contact enregistré pour l'instant. Un mandant rejoint le carnet
         tout seul à l'envoi de son premier rapport.</li>`

  return `
    <header class="top editor-top">
      <button class="icon-btn back" data-act="home">‹</button>
      <div class="top-title">
        <h1>Carnet</h1>
        <p class="muted">${contacts.length} contact${contacts.length > 1 ? 's' : ''}</p>
      </div>
      <span class="top-actions">
        <button class="btn ghost btn-mini" data-act="add-contact">+ Ajouter</button>
      </span>
    </header>
    <section class="pad">
      <ul class="report-list">${rows}</ul>
    </section>`
}
