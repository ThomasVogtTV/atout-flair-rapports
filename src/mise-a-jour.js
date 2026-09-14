// Toute l'equipe sur la meme version.
//
// Une app de telephone reste ouverte des jours en arriere-plan : un technicien
// pouvait travailler une semaine sur une ancienne version, que le serveur ne
// comprenait plus forcement. L'app regarde donc si une version plus recente est
// en ligne - au retour dans l'app, au retour du reseau, a l'accueil, et au plus
// toutes les dix minutes. Si c'est le cas :
//   - au retour dans l'app, a l'accueil et sans rien d'ouvert, elle se recharge
//     d'elle-meme : c'est le moment ou l'on s'attend a la voir repartir ;
//   - ailleurs, un bandeau le dit, et un tap recharge quand on veut. On ne
//     recharge pas un rapport sous les doigts de celui qui le remplit.

const SCRIPT = /\/assets\/index-[\w-]+\.js/
const INTERVALLE = 10 * 60_000

let derniere = 0
let annoncee = false

// Le script de l'app en train de tourner. En developpement (Vite), il n'y en a
// pas : rien a comparer, rien a annoncer.
const versionChargee = () =>
  document.querySelector('script[type="module"][src*="/assets/index-"]')?.getAttribute('src')?.match(SCRIPT)?.[0] ?? null

async function nouvelleVersion() {
  const chargee = versionChargee()
  if (!chargee || !navigator.onLine) return false
  try {
    // Le parametre fait passer la requete a cote du cache du service worker
    // (voir public/sw.js), qui rendrait sinon la page qu'il connait deja.
    const res = await fetch(`/index.html?verif=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return false
    const enLigne = (await res.text()).match(SCRIPT)?.[0]
    return !!enLigne && enLigne !== chargee
  } catch {
    return false
  }
}

function montrerBandeau(recharger) {
  if (document.querySelector('.mise-a-jour')) return
  const bandeau = document.createElement('button')
  bandeau.type = 'button'
  bandeau.className = 'mise-a-jour'
  bandeau.textContent = 'Nouvelle version · toucher pour mettre à jour'
  bandeau.addEventListener('click', recharger)
  document.body.prepend(bandeau)
  document.body.dataset.maj = '1'
}

/**
 * @param {object} o
 * @param {boolean} [o.force] sans attendre les dix minutes
 * @param {() => boolean} [o.peutRecharger] vrai si l'app peut repartir tout de suite
 * @param {() => Promise<unknown>} [o.avantRecharge] ce qui doit etre enregistre avant
 */
export async function verifierMiseAJour({ force = false, peutRecharger, avantRecharge } = {}) {
  if (annoncee) return
  if (!force && Date.now() - derniere < INTERVALLE) return
  derniere = Date.now()
  if (!(await nouvelleVersion())) return
  annoncee = true
  const recharger = async () => {
    await avantRecharge?.()
    location.reload()
  }
  if (peutRecharger?.()) return recharger()
  montrerBandeau(recharger)
}
