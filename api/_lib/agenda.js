// Agenda de l'equipe, cote serveur : la forme d'un rendez-vous, et qui en
// voit ou en touche quoi. Aucune entree/sortie ici : la regle se teste sans
// base.
//
//   - l'administrateur voit et modifie tout, et attribue un rendez-vous a qui
//     il veut ;
//   - un employe voit l'agenda de toute l'equipe, et modifie les rendez-vous
//     qui sont a lui ou qu'il a crees ;
//   - un invite ne voit que les rendez-vous qui lui sont attribues, et n'en
//     modifie aucun - il peut seulement commencer le rapport.

const TYPES = new Set(['detection', 'immeuble', 'hotel'])

// Ou en est le rendez-vous. "prevu" tant que rien n'est dit ; les anciens
// rendez-vous, qui n'ont pas ce champ, le sont donc naturellement.
const STATUTS = new Set(['prevu', 'fait', 'annule'])
export const statutValable = (v) => STATUTS.has(v)
const ID_OK = /^[\w-]{1,64}$/
const DATE_OK = /^\d{4}-\d{2}-\d{2}$/
const HEURE_OK = /^([01]\d|2[0-3]):[0-5]\d$/
const CHAMPS_CLIENT = ['type', 'nom', 'prenom', 'adresse', 'npaLieu', 'email', 'tel']
const texte = (v, max = 200) => String(v ?? '').trim().slice(0, max)

// Combien de temps l'on reste sur place. Une heure par defaut ; au plus douze,
// et par pas de cinq minutes - de quoi couvrir un immeuble entier sans laisser
// passer une valeur fantaisiste.
export const DUREE_DEFAUT = 60
const DUREE_MINI = 15
const DUREE_MAXI = 720
export function nettoyerDuree(v) {
  const n = Math.round(Number(v) / 5) * 5
  return Number.isFinite(n) && n >= DUREE_MINI && n <= DUREE_MAXI ? n : DUREE_DEFAUT
}

export const idValable = (id) => typeof id === 'string' && ID_OK.test(id)

/**
 * Qui est derriere un code, sous la forme que l'agenda retient. Le titulaire du
 * code principal est "admin" ; un administrateur nomme, comme tout employe,
 * garde son propre identifiant.
 */
export const personne = (ident) => ({ id: ident.id ?? 'admin', nom: ident.nom })

/** Le jour (AAAA-MM-JJ) a Lausanne, a un instant donne. */
export const jourSuisse = (ms) => new Date(ms).toLocaleDateString('sv-SE', { timeZone: 'Europe/Zurich' })

/**
 * Un rendez-vous propre, ou null s'il lui manque l'essentiel : un identifiant,
 * une date, et le client chez qui l'on va.
 */
export function nettoyerRdv(brut, maintenant = Date.now()) {
  if (!brut || typeof brut !== 'object' || !idValable(brut.id)) return null
  if (!DATE_OK.test(String(brut.date ?? ''))) return null
  const client = {}
  for (const k of CHAMPS_CLIENT) client[k] = texte(brut.client?.[k])
  if (!client.nom) return null
  // Sans heure, c'est un rendez-vous "dans la journee" : sa duree n'a alors
  // plus de sens, et vaut zero.
  const heure = HEURE_OK.test(String(brut.heure ?? '')) ? brut.heure : ''
  return {
    id: brut.id,
    date: brut.date,
    heure,
    duree: heure ? nettoyerDuree(brut.duree) : 0,
    statut: STATUTS.has(brut.statut) ? brut.statut : 'prevu',
    type: TYPES.has(brut.type) ? brut.type : 'detection',
    client,
    lieu: { adresse: texte(brut.lieu?.adresse), npaLieu: texte(brut.lieu?.npaLieu) },
    note: texte(brut.note, 500),
    pour: brut.pour && idValable(brut.pour.id) ? { id: brut.pour.id, nom: texte(brut.pour.nom, 60) } : null,
    rapportId: idValable(brut.rapportId) ? brut.rapportId : null,
    // Le rapport dont ce rendez-vous est le controle, s'il en est un.
    suiteDe: idValable(brut.suiteDe) ? brut.suiteDe : null,
    maj: maintenant,
  }
}

/** Ce qu'une personne voit de l'agenda. */
export function visiblesPour(ident, rdvs) {
  const moi = personne(ident).id
  return rdvs.filter((r) => ident.role !== 'invite' || r.pour?.id === moi)
}

/** Peut-elle modifier ou supprimer ce rendez-vous ? */
export function peutModifier(ident, rdv) {
  if (ident.role === 'admin') return true
  if (ident.role !== 'employe') return false
  const moi = personne(ident).id
  return rdv.pour?.id === moi || rdv.par?.id === moi
}

/** Du plus proche au plus lointain ; un rendez-vous sans heure passe en fin de journee. */
export const trierParDate = (rdvs) =>
  [...rdvs].sort((a, b) => `${a.date} ${a.heure || '99:99'}`.localeCompare(`${b.date} ${b.heure || '99:99'}`))
