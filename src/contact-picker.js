// Choix d'un client du carnet depuis un rapport : une fenetre avec recherche,
// les clients les plus recemment servis en tete. Un tap remplit le mandant.

import * as S from './state.js'
import { openOverlay } from './ui/dialogs.js'
import { ICONS } from './ui/icons.js'
import { contactLigneHTML } from './views/contacts.js'

// Au-dela, la liste devient un annuaire a faire defiler : la recherche est la.
const MAX = 60

/**
 * @param {object[]} contacts le carnet
 * @param {object[]} reports les rapports, pour classer par derniere intervention
 * @returns {Promise<object|null>} le contact choisi, ou null si l'on renonce
 */
export function choisirContact(contacts, reports) {
  const index = S.activiteParNom(reports)
  const tries = [...contacts].sort(
    (a, b) => S.activiteDe(b, index).dernier - S.activiteDe(a, index).dernier || S.fullName(a).localeCompare(S.fullName(b))
  )

  // Pas de focus sur la recherche : sur un telephone, le clavier cacherait la
  // liste, et le client cherche est souvent deja dans les premiers.
  const overlay = openOverlay(`
    <h2>Choisir un client</h2>
    <div class="recherche">
      <span class="recherche-loupe">${ICONS.loupe}</span>
      <input data-picker-recherche type="search" enterkeyhint="search" autocapitalize="none" autocorrect="off"
             spellcheck="false" placeholder="Nom, rue, localité, téléphone" />
    </div>
    <ul class="report-list picker-liste"></ul>
    <div class="dialog-actions">
      <button class="btn ghost" data-close>Annuler</button>
    </div>`)

  const liste = overlay.querySelector('.picker-liste')
  const champ = overlay.querySelector('[data-picker-recherche]')
  const dessiner = () => {
    const vus = tries.filter((c) => S.matchContact(c, champ.value))
    liste.innerHTML = vus.length
      ? vus
          .slice(0, MAX)
          .map((c) => contactLigneHTML(c, S.activiteDe(c, index), { attr: 'data-pick' }))
          .join('')
      : '<li class="empty">Aucun client ne correspond.</li>'
  }
  dessiner()
  champ.addEventListener('input', dessiner)

  return new Promise((resolve) => {
    overlay.addEventListener('click', (ev) => {
      const id = ev.target.closest('[data-pick]')?.dataset.pick
      if (!id && ev.target !== overlay && !ev.target.closest('[data-close]')) return
      overlay.remove()
      resolve(id ? (contacts.find((c) => c.id === id) ?? null) : null)
    })
  })
}
