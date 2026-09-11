// Comparaison d'un code saisi avec le code attendu. Meme regle que le serveur
// (api/send.js, api/check-code.js) : espaces autour ignores, casse indifferente -
// le champ du telephone coupe la majuscule automatique.

export const normaliserCode = (v) => String(v ?? '').trim().toLowerCase()

export function codeCorrespond(saisi, attendu) {
  const a = normaliserCode(saisi)
  return a !== '' && a === normaliserCode(attendu)
}
