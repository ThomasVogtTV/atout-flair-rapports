// Carnet commun, cote serveur : comment les changements de chaque telephone se
// fondent dans le carnet de l'equipe. Aucune entree/sortie ici, seulement la
// regle - elle se teste sans base.
//
// Trois cas pour un contact qui arrive :
//   - meme identifiant : c'est la meme fiche, la version la plus recente gagne
//     (une modification faite dans le formulaire remplace l'ancienne) ;
//   - meme nom, autre identifiant : deux telephones ont cree le meme client
//     chacun de leur cote. Les deux se fondent en une fiche, sans rien perdre :
//     un champ vide se complete, un champ plus recent remplace l'ancien ;
//   - inconnu : il entre au carnet.

const CHAMPS = ['type', 'nom', 'prenom', 'adresse', 'npaLieu', 'email', 'tel']
const TYPES = new Set(['', 'particulier', 'locataire', 'proprietaire', 'gerance'])
const ID_OK = /^[\w-]{1,64}$/
const LONGUEUR_MAX = 200
// Un carnet d'entreprise, pas un annuaire : de quoi absorber la premiere
// synchronisation d'un telephone bien rempli, et rien de plus par requete.
export const ENVOI_MAX = 2000

const sansAccent = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')

// Meme regle que fullName cote app : une gerance n'a pas de prenom.
export const cleNom = (c) =>
  sansAccent([c.nom, c.type === 'gerance' ? '' : c.prenom].filter(Boolean).join(' '))
    .replace(/\s+/g, ' ')
    .trim()

/** Un contact propre, ou null s'il n'a pas d'identifiant valable ni de nom. */
export function nettoyerContact(brut, maintenant = Date.now()) {
  if (!brut || typeof brut !== 'object' || typeof brut.id !== 'string' || !ID_OK.test(brut.id)) return null
  const c = { id: brut.id }
  for (const k of CHAMPS) c[k] = String(brut[k] ?? '').trim().slice(0, LONGUEUR_MAX)
  if (!TYPES.has(c.type)) c.type = ''
  if (!c.nom) return null
  // Une horloge de telephone en avance ne doit pas rendre une fiche
  // impossible a corriger pour tous les autres.
  const maj = Number(brut.maj)
  c.maj = Number.isFinite(maj) && maj > 0 ? Math.min(maj, maintenant) : maintenant
  return c
}

/**
 * Fond les changements d'un telephone dans le carnet. `carnet` est modifie en
 * place ; la fonction rend les seules fiches qui ont change, a ecrire en base.
 *
 * @param {Map<string, object>} carnet
 * @param {object[]} entrants contacts crees ou modifies sur le telephone
 * @param {string[]} supprimes identifiants supprimes sur le telephone
 */
export function fusionnerCarnet(carnet, entrants = [], supprimes = [], maintenant = Date.now()) {
  const changes = new Map()
  const parNom = new Map()
  for (const c of carnet.values()) if (!c.supprime) parNom.set(cleNom(c), c)

  const poser = (c) => {
    const avant = carnet.get(c.id)
    if (avant && !avant.supprime && parNom.get(cleNom(avant)) === avant) parNom.delete(cleNom(avant))
    carnet.set(c.id, c)
    changes.set(c.id, c)
    if (!c.supprime) parNom.set(cleNom(c), c)
  }

  for (const id of (Array.isArray(supprimes) ? supprimes : []).slice(0, ENVOI_MAX)) {
    if (typeof id === 'string' && ID_OK.test(id)) poser({ id, supprime: true, maj: maintenant })
  }

  for (const brut of (Array.isArray(entrants) ? entrants : []).slice(0, ENVOI_MAX)) {
    const c = nettoyerContact(brut, maintenant)
    if (!c) continue

    const meme = carnet.get(c.id)
    if (meme) {
      // La plus recente gagne - y compris face a une suppression : une fiche
      // corrigee apres avoir ete supprimee ailleurs revient.
      if (c.maj >= (meme.maj ?? 0)) poser(c)
      continue
    }

    const jumeau = parNom.get(cleNom(c))
    if (jumeau) {
      const recent = c.maj >= (jumeau.maj ?? 0)
      const fusion = { ...jumeau }
      for (const k of CHAMPS) if (c[k] && (recent || !jumeau[k])) fusion[k] = c[k]
      fusion.maj = Math.max(c.maj, jumeau.maj ?? 0)
      poser(fusion)
      continue
    }

    poser(c)
  }

  return [...changes.values()]
}

export const contactsVivants = (carnet) => [...carnet.values()].filter((c) => !c.supprime)
