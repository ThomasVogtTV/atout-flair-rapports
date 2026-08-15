// Le type de mandant se choisit au meme endroit dans deux ecrans : le bloc
// "Mandant" du rapport et le formulaire du carnet de contacts. Une seule
// definition, pour que les deux restent identiques.

export const MANDANT_TYPES = [
  { key: 'particulier', label: 'Particulier' },
  { key: 'locataire', label: 'Locataire' },
  { key: 'proprietaire', label: 'Propriétaire' },
  { key: 'gerance', label: 'Gérance' },
]

/**
 * @param {string} value type actuellement selectionne ('' si aucun)
 * @param {{ attr: string, extraClass?: string }} opts attribut repere du groupe
 */
export function mandantChips(value, { attr, extraClass = '' }) {
  const chips = MANDANT_TYPES.map(
    (mt) => `<button type="button" class="chip${value === mt.key ? ' on' : ''}" data-val="${mt.key}">${mt.label}</button>`
  ).join('')
  return `<div class="${extraClass}chip-group" ${attr}>${chips}</div>`
}
