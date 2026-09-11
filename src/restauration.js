// Choix des rapports a recuperer depuis la sauvegarde en ligne : une liste a
// cocher, groupee par technicien quand l'administrateur voit ceux de toute
// l'equipe. Les rapports de detection d'un immeuble suivent leur immeuble.

import { TYPES } from './templates.js'
import { esc } from './ui/dom.js'
import { openOverlay } from './ui/dialogs.js'

const leJour = (ts) => new Date(ts).toLocaleDateString('fr-CH')

/**
 * @param {object[]} sauvegardes entrees de l'index absentes du telephone
 * @returns {Promise<string[]|null>} identifiants a recuperer, enfants compris
 */
export function choisirRestauration(sauvegardes) {
  const tete = sauvegardes.filter((s) => !s.parentId).sort((a, b) => (b.maj || 0) - (a.maj || 0))
  const enfants = (id) => sauvegardes.filter((s) => s.parentId === id).map((s) => s.id)
  const plusieurs = new Set(tete.map((s) => s.par?.id)).size > 1

  let groupe = null
  const lignes = tete
    .map((s) => {
      const nom = s.par?.nom || '—'
      const entete = plusieurs && nom !== groupe ? `<li class="restau-groupe">${esc(nom)}</li>` : ''
      groupe = nom
      const detail = [s.ref, TYPES[s.type]?.label, leJour(s.maj), s.nPhotos ? `${s.nPhotos} photo${s.nPhotos > 1 ? 's' : ''}` : '']
        .filter(Boolean)
        .join(' · ')
      return `${entete}
        <li><label class="restau-ligne">
          <input type="checkbox" data-restau="${esc(s.id)}" checked />
          <span><b>${esc(s.titre || s.ref || 'Rapport')}</b><small>${esc(detail)}</small></span>
        </label></li>`
    })
    .join('')

  const overlay = openOverlay(`
    <h2>Récupérer des rapports</h2>
    <p class="muted small">Sauvegardés en ligne, absents de ce téléphone. Les photos reviennent avec eux.</p>
    <button type="button" class="link" data-tout>Tout décocher</button>
    <ul class="restau-liste">${lignes}</ul>
    <div class="dialog-actions">
      <button class="btn ghost" data-close>Annuler</button>
      <button class="btn primary" data-ok>Récupérer</button>
    </div>`)

  const cases = () => [...overlay.querySelectorAll('[data-restau]')]
  const majBouton = () => {
    const n = cases().filter((c) => c.checked).length
    overlay.querySelector('[data-ok]').textContent = n ? `Récupérer (${n})` : 'Récupérer'
    overlay.querySelector('[data-ok]').disabled = !n
    overlay.querySelector('[data-tout]').textContent = n === cases().length ? 'Tout décocher' : 'Tout cocher'
  }
  majBouton()
  overlay.addEventListener('change', majBouton)

  return new Promise((resolve) => {
    overlay.addEventListener('click', (ev) => {
      if (ev.target.closest('[data-tout]')) {
        const tout = cases().every((c) => c.checked)
        cases().forEach((c) => (c.checked = !tout))
        return majBouton()
      }
      const ok = ev.target.closest('[data-ok]')
      if (!ok && ev.target !== overlay && !ev.target.closest('[data-close]')) return
      const ids = ok ? cases().filter((c) => c.checked).flatMap((c) => [c.dataset.restau, ...enfants(c.dataset.restau)]) : null
      overlay.remove()
      resolve(ids)
    })
  })
}
