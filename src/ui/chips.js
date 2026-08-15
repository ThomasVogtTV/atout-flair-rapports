// Le type de mandant se choisit au meme endroit dans deux ecrans : le bloc
// "Mandant" du rapport et le formulaire du carnet de contacts. Une seule
// definition, pour que les deux restent identiques.

import { esc } from './dom.js'
import { ICONS } from './icons.js'

export const MANDANT_TYPES = [
  { key: 'particulier', label: 'Particulier' },
  { key: 'locataire', label: 'Locataire' },
  { key: 'proprietaire', label: 'Propriétaire' },
  { key: 'gerance', label: 'Gérance' },
]

export const mandantTypeLabel = (key) => MANDANT_TYPES.find((t) => t.key === key)?.label ?? ''

/**
 * Selecteur repliable : une ligne qui affiche le choix courant, et qui
 * s'ouvre sur les quatre possibilites. Quatre pastilles en permanence
 * mangeaient deux lignes du formulaire pour une information qu'on ne change
 * qu'une fois par rapport.
 *
 * @param {string} value type selectionne ('' si aucun)
 * @param {{ attr: string, open: boolean }} opts attribut repere du groupe, etat d'ouverture
 */
export function mandantPicker(value, { attr, open }) {
  const chips = MANDANT_TYPES.map(
    (mt) => `<button type="button" class="chip chip-sm${value === mt.key ? ' on' : ''}" data-val="${mt.key}">${mt.label}</button>`
  ).join('')

  return `
    <div class="picker${open ? ' open' : ''}" ${attr}>
      <button type="button" class="picker-head" data-picker>
        <span class="picker-title">Type de mandant</span>
        <span class="picker-value${value ? '' : ' empty'}">${esc(mandantTypeLabel(value) || 'À préciser')}</span>
        <span class="picker-chevron">${ICONS.chevron}</span>
      </button>
      ${open ? `<div class="picker-options">${chips}</div>` : ''}
    </div>`
}
