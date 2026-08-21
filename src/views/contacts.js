// Ecran "Carnet de contacts" : la liste. L'ajout et la modification passent
// par le formulaire de `src/contact-dialog.js`.

import { fullName } from '../state.js'
import { esc } from '../ui/dom.js'
import { sectionIcon } from '../ui/icons.js'
import { THEMES, themeChoice } from '../ui/theme.js'
import { currentCode } from '../mailer.js'
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
    : `<li class="empty">Aucun contact enregistré pour l'instant.</li>`

  return `
    <header class="top editor-top">
      <button class="icon-btn back" data-act="home">‹</button>
      <div class="top-title">
        <h1>Carnet et réglages</h1>
        <p class="muted">${contacts.length} contact${contacts.length > 1 ? 's' : ''}</p>
      </div>
    </header>
    <section class="pad">
      <h2 class="section-title"><span class="section-title-main">${sectionIcon('person', 'amber')}Contacts</span>
        <button class="link" data-act="add-contact">+ Ajouter</button>
      </h2>
      <ul class="report-list">${rows}</ul>

      <h2 class="section-title"><span class="section-title-main">${sectionIcon('sun', 'amber')}Réglages</span></h2>
      <div class="card">
        <span class="field-label">Apparence</span>
        <div class="seg" data-theme-choice>
          ${THEMES.map(
            (t) => `<button type="button" class="seg-btn${themeChoice() === t.key ? ' on' : ''}" data-val="${t.key}">${t.label}</button>`
          ).join('')}
        </div>
        <p class="muted small reglage-note">« Système » suit le réglage du téléphone : sombre le soir s'il l'est.</p>

        <span class="field-label reglage-titre">Code d'envoi</span>
        <input data-app-code type="text" autocapitalize="none" autocorrect="off" spellcheck="false"
               value="${esc(currentCode())}" placeholder="Non renseigné sur cet appareil" />
        <p class="muted small reglage-note">Il autorise l'envoi des rapports depuis la boîte de l'entreprise, et
        s'écrit avec ses majuscules. Chaque téléphone a le sien à saisir une fois.</p>
      </div>

      <h2 class="section-title"><span class="section-title-main">${sectionIcon('folder', 'neutral')}Sauvegarde</span></h2>
      <div class="card">
        <p class="muted small">Rapports, carnet et signature n'existent que dans cet appareil. Le fichier de
        sauvegarde les rassemble : envoyez-le-vous par mail, il vous rendra tout sur un téléphone neuf.</p>
        <div class="row-actions">
          <button class="btn ghost" data-act="export-backup">Exporter</button>
          <button class="btn ghost" data-act="import-backup">Restaurer</button>
        </div>
      </div>
    </section>`
}
