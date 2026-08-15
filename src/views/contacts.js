// Ecran "Carnet de contacts" : la liste. L'ajout et la modification passent
// par le formulaire de `src/contact-dialog.js`.

import { esc } from '../ui/dom.js'

export function contactsView(view) {
  const contacts = view.contacts ?? []
  const rows = contacts.length
    ? contacts
        .map(
          (c) => `
          <li class="report-row" data-edit-contact="${c.id}">
            <div class="report-main">
              <strong>${esc(c.nom || 'Sans nom')}</strong>
              <span class="muted">${esc([c.adresse, c.npaLieu].filter(Boolean).join(', ')) || 'Adresse non renseignée'}</span>
            </div>
            <div class="report-side">
              <button class="icon-btn" data-del-contact="${c.id}" title="Supprimer">✕</button>
            </div>
          </li>`
        )
        .join('')
    : `<li class="empty">Aucun contact enregistré pour l'instant.</li>`

  return `
    <header class="top editor-top">
      <button class="icon-btn back" data-act="home">‹</button>
      <div class="top-title">
        <h1>Carnet de contacts</h1>
        <p class="muted">${contacts.length} contact${contacts.length > 1 ? 's' : ''}</p>
      </div>
    </header>
    <section class="pad">
      <ul class="report-list">${rows}</ul>
      <button class="btn ghost wide" data-act="add-contact">+ Ajouter un contact</button>
    </section>`
}
