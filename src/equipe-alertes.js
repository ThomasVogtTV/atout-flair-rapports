// Ce que l'equipe attend de l'administrateur, vu depuis son accueil.
//
// Le journal complet vit dans l'onglet Administration. L'accueil n'en garde
// qu'une alerte, pour ce qui reste a regarder : un envoi rate par un membre de
// l'equipe, pas encore vu dans l'onglet, et datant de moins d'une semaine -
// au-dela, ce n'est plus une nouvelle, c'est le journal.
//
// Ne comptent pas :
// - ses propres envois : son telephone les garde en file, et l'alerte "envoi a
//   corriger" du poste les signale deja (a plusieurs administrateurs, chacun
//   voit ceux des autres) ;
// - les rapports d'invites relus par l'administrateur : l'erreur s'est affichee
//   sous ses yeux, au moment de valider ;
// - un envoi rate puis reparti : le meme rapport, de la meme personne, a fini
//   par passer.

const CLE_VU = 'af-journal-vu'
const SEMAINE = 7 * 86_400_000

/** La date de la plus recente ligne du journal deja montree dans l'onglet. */
export function journalVu() {
  try {
    return Number(localStorage.getItem(CLE_VU)) || 0
  } catch {
    return 0
  }
}

/**
 * L'onglet Administration vient de montrer le journal : tout ce qu'il contenait
 * est vu. On retient la date de sa ligne la plus recente, posee par le serveur,
 * plutot que l'heure du telephone - une horloge en avance cacherait un echec
 * arrive juste apres.
 */
export function marquerJournalVu(journal) {
  const plusRecente = Math.max(0, ...(journal ?? []).map((j) => Number(j.date) || 0))
  if (plusRecente <= journalVu()) return
  try {
    localStorage.setItem(CLE_VU, String(plusRecente))
  } catch {
    // Stockage indisponible : l'alerte reviendra a la prochaine ouverture.
  }
}

/** Les envois rates a signaler. Le journal arrive du plus recent au plus ancien. */
export function echecsARegarder(journal, { vu = 0, maintenant = Date.now(), moi = 'admin' } = {}) {
  const lignes = journal ?? []
  const depuis = Math.max(vu, maintenant - SEMAINE)
  return lignes.filter((j, i) => {
    if (j.statut !== 'echec' || j.validePar) return false
    // Une ligne d'avant l'identifiant venue d'un administrateur : c'etait le titulaire.
    if ((j.id ?? (j.role === 'admin' ? 'admin' : null)) === moi) return false
    if (!(Number(j.date) > depuis)) return false
    // Reparti depuis : une ligne plus recente, de la meme personne, pour le meme rapport.
    return !(j.ref && lignes.slice(0, i).some((k) => k.statut === 'envoye' && k.qui === j.qui && k.ref === j.ref))
  })
}
