// Terrain : l'etat de l'ecran. Une seule vue a la fois - l'ecran ouvert, le
// rapport en cours, les listes affichees - partagee par tous les modules de
// l'app. On la modifie en place (view.x = ...) ; changer d'ecran passe par
// changerVue, qui repart d'une copie.

import { goHome } from './navigation.js'

// reportsOpen / filter : etat de la liste de l'accueil (repliee sur les trois
// derniers rapports, ou deroulee et filtrable). Il survit aux allers-retours
// vers un rapport (goHome recopie la vue), de sorte qu'on retrouve la liste
// dans l'etat ou on l'a laissee.
export let view = {
  screen: 'home',
  report: null,
  children: [],
  reports: [],
  contacts: [],
  reportsOpen: false,
  filter: 'tous',
  queue: [],
  enAttente: 0,
  enEchec: 0,
  // Terrain montre l'agenda de celui qui tient le telephone ; le planning de
  // toute l'equipe vit dans le Bureau.
  agendaPerso: true,
}

/** Change d'ecran : la vue repart d'une copie, avec ce qui change. */
export function changerVue(maj) {
  view = { ...view, ...maj }
}
