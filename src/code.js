// Comparaison d'un code saisi avec le code attendu. Meme regle que le serveur
// (api/send.js, api/check-code.js) : espaces autour ignores, casse indifferente -
// le champ du telephone coupe la majuscule automatique.

/**
 * "Se souvenir de moi" dispense du code pendant trente jours, puis le
 * redemande : un telephone perdu ne reste pas ouvert indefiniment.
 */
export const SOUVENIR_MS = 30 * 24 * 60 * 60 * 1000
export const souvenirValide = (jusqua, maintenant = Date.now()) => Number(jusqua) > maintenant

export const normaliserCode = (v) => String(v ?? '').trim().toLowerCase()

export function codeCorrespond(saisi, attendu) {
  const a = normaliserCode(saisi)
  return a !== '' && a === normaliserCode(attendu)
}
