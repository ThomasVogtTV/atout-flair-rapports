// Rapports de reference pour les tests.
//
// Ils passent tous par `newReport`, comme l'app : un rapport ecrit a la main
// dans un test finirait par diverger du modele reel sans que rien ne le dise.

import * as S from '../../src/state.js'

/** Un JPEG minuscule mais valide, pour ne pas depender d'un fichier photo. */
export const PHOTO_JPEG =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsL' +
  'DBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwh' +
  'MjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAKAAoDASIA' +
  'AhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQID' +
  'AAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpT' +
  'VFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXG' +
  'x8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcI' +
  'CQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYk' +
  'NOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOU' +
  'lZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oA' +
  'DAMBAAIRAxEAPwD3+iiigD//2Q=='

const remplirMandant = (r) =>
  Object.assign(r.mandant, {
    type: 'gerance',
    nom: 'Régie du Lac SA',
    prenom: '',
    adresse: 'Avenue de la Gare 14',
    npaLieu: '1400 Yverdon-les-Bains',
    email: 'contact@regie-du-lac.ch',
    tel: '024 425 00 00',
  })

/**
 * Rapport de detection complet : mandant, lieu, six pieces aux trois etats,
 * remarques, technicien, signature et deux photos.
 */
export function rapportDetection(surcharge = {}) {
  const r = S.newReport('detection')
  remplirMandant(r)
  Object.assign(r.lieu, {
    adresseIntervention: 'Rue des Fontaines 6, 1423 Vaugondry',
    locataire: 'Mme Élise Favre-Œuvray',
    dateIntervention: '2026-03-17',
    heureIntervention: '09:30',
    etagePorte: '2e étage, porte gauche',
    bon: 'BC-2026-0412',
    presenceLocataire: 'Oui',
  })
  r.rows[0].contamine = 'oui'
  r.rows[0].info = 'Marquage franc du chien à la tête de lit, punaises vivantes visibles dans la couture du matelas et derrière le cadre.'
  r.rows[1].contamine = 'non'
  r.rows[1].info = 'Aucun marquage'
  r.rows[2].contamine = 'inconnu'
  r.rows[2].info = 'Pièce encombrée, contrôle à refaire'
  // Les trois dernieres pieces restent sans etat ni texte : elles doivent
  // figurer au PDF quand meme.
  r.remarques = 'Traitement thermique recommandé dans les dix jours. Literie et textiles à laver à 60 °C.'
  r.technicien = { nom: 'Oberli Stessy', signature: null }
  r.signataire = { nom: 'Mme Favre' }
  r.photos = [
    { id: 'ph1', rowId: r.rows[0].id, original: PHOTO_JPEG, dataUrl: PHOTO_JPEG, shapes: [] },
    { id: 'ph2', rowId: null, original: PHOTO_JPEG, dataUrl: PHOTO_JPEG, shapes: [] },
  ]
  return Object.assign(r, surcharge)
}

/** Rapport d'immeuble : plusieurs appartements, en lignes. */
export function rapportImmeuble({ lignes = 4 } = {}) {
  const r = S.newReport('immeuble')
  remplirMandant(r)
  Object.assign(r.lieu, {
    adresse: 'Chemin des Vergers 22',
    npaLieu: '1400 Yverdon-les-Bains',
    dateIntervention: '2026-03-18',
    bon: 'BC-2026-0413',
  })
  r.rows = Array.from({ length: lignes }, (_, i) => ({
    ...S.newRow('immeuble'),
    etage: String(i),
    numero: `${i}${i}`,
    resident: i === 1 ? 'M. Jean-Sébastien Vuilleumier-de la Fontaine' : `Locataire ${i + 1}`,
    contamine: i === 0 ? 'oui' : i === 1 ? 'non' : '',
    infos:
      i === 0
        ? "Marquage du chien dans la chambre principale ainsi que sur le canapé du salon ; traces et déjections nettement visibles sur le sommier, contrôle du logement voisin recommandé."
        : '',
  }))
  return r
}

/** Rapport d'hotel : chambres et photos. */
export function rapportHotel({ lignes = 3 } = {}) {
  const r = S.newReport('hotel')
  remplirMandant(r)
  Object.assign(r.lieu, {
    adresse: 'Hôtel des Bains, Quai de Nogent 5',
    npaLieu: '1400 Yverdon-les-Bains',
    dateIntervention: '2026-03-19',
  })
  r.rows = Array.from({ length: lignes }, (_, i) => ({
    ...S.newRow('hotel'),
    numero: `${20 + i}`,
    contamine: i === 0 ? 'oui' : 'non',
  }))
  return r
}

/** Un rapport de detection avec `n` photos, pour eprouver l'annexe. */
export function rapportAvecPhotos(n) {
  const r = rapportDetection()
  r.photos = Array.from({ length: n }, (_, i) => ({
    id: `ph${i}`,
    rowId: i % 2 === 0 ? r.rows[0].id : null,
    original: PHOTO_JPEG,
    dataUrl: PHOTO_JPEG,
    shapes: [],
  }))
  return r
}
