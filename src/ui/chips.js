// Le type de mandant se choisit au meme endroit dans deux ecrans : le bloc
// "Mandant" du rapport et le formulaire du carnet de contacts. Une seule
// definition, pour que les deux restent identiques.


export const MANDANT_TYPES = [
  { key: 'particulier', label: 'Particulier' },
  { key: 'locataire', label: 'Locataire' },
  { key: 'proprietaire', label: 'Propriétaire' },
  { key: 'gerance', label: 'Gérance' },
]

export const mandantTypeLabel = (key) => MANDANT_TYPES.find((t) => t.key === key)?.label ?? ''

/**
 * Type de mandant : une seule ligne de pastilles, celles-la memes qui servent
 * aux noms de pieces et aux constats. Le choix est visible sans rien deplier et
 * se change d'un doigt.
 *
 * Le volet repliable qu'il remplace prenait une ligne entiere de formulaire
 * rien que pour annoncer son propre titre, puis une deuxieme une fois ouvert.
 * Une ligne de pastilles dit la meme chose, montre les quatre reponses, et
 * defile lateralement plutot que de passer a la ligne sur un ecran etroit.
 *
 * @param {string} value type selectionne ('' si aucun)
 * @param {{ attr: string }} opts attribut repere du groupe
 */
export function mandantPicker(value, { attr }) {
  const chips = MANDANT_TYPES.map(
    (mt) => `<button type="button" class="chip chip-sm${value === mt.key ? ' on' : ''}" data-val="${mt.key}">${mt.label}</button>`
  ).join('')

  return `
    <div class="type-picker" ${attr}>
      <span class="field-label">Type de mandant</span>
      <div class="quick-rooms">${chips}</div>
    </div>`
}
