import * as db from './db.js'
import { TYPES } from './templates.js'

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36)

export const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const nowTime = () => {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function frDate(iso) {
  if (!iso) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso
}

export function frTime(t) {
  if (!t) return ''
  const m = /^(\d{1,2}):(\d{2})$/.exec(t)
  return m ? `${m[1].padStart(2, '0')}H${m[2]}` : t
}

export function newRow(type) {
  const t = TYPES[type]
  const row = { id: uid(), contamine: '' }
  if (t.layout === 'pieces') {
    row.nom = ''
    row.info = ''
  } else {
    row.date = todayISO()
    row.etage = ''
    row.numero = ''
    row.resident = ''
    row.infos = ''
    row.sousRapportId = null
  }
  return row
}

// Reference imprimee sur le rapport (ex. AF-00001). Les numeros viennent de
// lots reserves aupres du serveur, uniques dans toute l'equipe (voir plus bas).
// Ce compteur local retient le plus haut numero utilise sur l'appareil, et
// numerote en secours quand le lot est epuise sans reseau.
const REF_KEY = 'af-ref-seq'

/** Le numero contenu dans une reference, ou 0 si elle n'en porte pas. */
export const numeroDeRef = (ref) => {
  const m = /^AF-(\d+)$/.exec(String(ref ?? '').trim())
  return m ? Number(m[1]) : 0
}

// Copie en memoire du compteur. localStorage et IndexedDB sont deux stockages
// que le navigateur vide separement : si le premier disparait en cours de
// session, celle-ci continue de numeroter juste.
let compteurMemoire = 0

// Lots de numeros reserves aupres du serveur (voir api/numeros.js et
// src/numeros.js) : uniques dans toute l'equipe, et utilisables hors ligne.
const LOTS_KEY = 'af-ref-lots'

function lireLots() {
  try {
    const lots = JSON.parse(localStorage.getItem(LOTS_KEY) ?? '[]')
    return Array.isArray(lots) ? lots.filter((l) => l.prochain <= l.fin) : []
  } catch {
    return []
  }
}
const ecrireLots = (lots) => localStorage.setItem(LOTS_KEY, JSON.stringify(lots))

export const numerosRestants = () => lireLots().reduce((n, l) => n + (l.fin - l.prochain + 1), 0)

export function ajouterNumeros(debut, fin) {
  ecrireLots([...lireLots(), { prochain: debut, fin }])
}

/** Le plus haut numero deja utilise sur ce telephone. */
export const numeroLocalMax = () => Math.max(Number(localStorage.getItem(REF_KEY) ?? '0'), compteurMemoire)

function nextRef() {
  // Un numero du lot reserve d'abord : lui seul est garanti unique dans
  // l'equipe. Le compteur local ne sert plus que de secours - un telephone
  // reste sans reseau assez longtemps pour epuiser son lot.
  const lots = lireLots()
  if (lots.length) {
    const n = lots[0].prochain++
    ecrireLots(lots)
    compteurMemoire = Math.max(compteurMemoire, n)
    if (n > Number(localStorage.getItem(REF_KEY) ?? '0')) localStorage.setItem(REF_KEY, String(n))
    return `AF-${String(n).padStart(5, '0')}`
  }
  const n = Math.max(Number(localStorage.getItem(REF_KEY) ?? '0'), compteurMemoire) + 1
  compteurMemoire = n
  localStorage.setItem(REF_KEY, String(n))
  return `AF-${String(n).padStart(5, '0')}`
}

/**
 * Remet le compteur au niveau des rapports reellement presents dans la base.
 *
 * Le compteur vivait dans le seul localStorage, les rapports dans IndexedDB.
 * Un nettoyage du navigateur, un "effacer les donnees du site", l'eviction
 * d'une PWA non installee sur iOS : localStorage part sans emporter la base,
 * la numerotation repart a AF-00001, et un numero deja imprime chez une regie
 * se retrouve porte par une autre intervention. Les rapports, eux, disent la
 * verite - ils portent leur numero.
 *
 * Appele au demarrage, avant qu'aucun rapport ne puisse etre cree.
 *
 * @returns {Promise<{compteur: number, plusHaut: number, repris: boolean}>}
 */
export async function repriseCompteur() {
  // Les resumes portent le numero : pas besoin des photos pour le lire.
  await synchroniserResumes()
  const reports = await db.all('resumes')
  const plusHaut = reports.reduce((max, r) => Math.max(max, numeroDeRef(r.ref)), 0)
  const enregistre = Number(localStorage.getItem(REF_KEY) ?? '0')
  const compteur = Math.max(enregistre, compteurMemoire)
  const juste = Math.max(compteur, plusHaut)
  compteurMemoire = juste
  // La comparaison porte sur ce que localStorage contient, et non sur le plus
  // haut des trois : la copie en memoire masquerait sinon un localStorage vide,
  // et la sauvegarde exportee ensuite emporterait un compteur a zero.
  if (juste > enregistre) localStorage.setItem(REF_KEY, String(juste))
  return { compteur, plusHaut, repris: plusHaut > compteur }
}

// Constat par defaut, pre-rempli a la creation : c'est le cas le plus frequent
// et l'issue qu'un rapport doit enoncer explicitement plutot que de laisser
// vide. Le champ reste modifiable, et l'app le vide d'elle-meme des qu'une
// piece est declaree contaminee (voir app.js) pour qu'un rapport ne puisse pas
// affirmer l'inverse de son propre tableau.
export const DEFAULT_REMARQUES =
  'Aucun marquage du chien de recherche. Aucune trace de punaises de lit visible.'

export function newReport(type) {
  const t = TYPES[type]
  const report = {
    id: uid(),
    ref: nextRef(),
    type,
    status: 'draft',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    mandant: { type: '', nom: '', prenom: '', adresse: '', npaLieu: '', email: '', tel: '' },
    lieu: {},
    rows: [],
    remarques: DEFAULT_REMARQUES,
    // Qui a fait la detection : recopie du technicien par defaut a l'ouverture
    // (voir app.js). Stocke dans le rapport et non lu au moment du PDF, pour
    // qu'un rapport garde la signature de celui qui etait sur place, meme si
    // le technicien par defaut change ensuite.
    technicien: { nom: '', signature: null },
    // Qui signe sur place. Le nom est repris du locataire ou du mandant a
    // l'ouverture du pad, mais reste modifiable : c'est souvent la concierge,
    // le fils, ou un voisin qui ouvre la porte - et le rapport doit porter le
    // nom de celui qui a reellement signe.
    signataire: { nom: '' },
    // Desinsectiseur avec qui l'intervention est menee, le cas echeant. Son
    // logo est copie dans le rapport et non seulement reference : le rapport
    // doit rester imprimable a l'identique meme si le partenaire est retire
    // de la liste de l'appareil des mois plus tard.
    partenaire: { nom: '', logo: null },
    signature: null,
    photos: [],
    sentAt: null,
    // Quand le rapport a ete declare remis (voir terminerReport). Distinct de
    // sentAt : un rapport peut etre remis de la main a la main, ou par la
    // messagerie du telephone, sans jamais passer par l'envoi automatique.
    remisAt: null,
  }
  if (t.layout === 'pieces') {
    report.lieu.dateIntervention = todayISO()
    report.lieu.heureIntervention = nowTime()
    report.lieu.presenceLocataire = 'Oui'
    report.rows = t.defaultRows.map((nom) => ({ ...newRow(type), nom }))
  } else {
    // Immeuble / hotel : une seule ligne au depart, l'utilisateur ajoute
    // chaque chambre au fur et a mesure via "+ Ajouter une ligne".
    report.rows = [newRow(type)]
  }
  return report
}

/**
 * Nom affichable d'un mandant ou d'un contact, dans l'ordre administratif
 * (nom puis prenom), celui des rapports et du carnet.
 *
 * Une gerance est une societe : elle n'a pas de prenom. Un prenom saisi puis
 * bascule en "Gerance" est ignore plutot qu'efface - repasser en particulier
 * le retrouve, et il ne peut pas ressortir tout seul dans un PDF.
 */
export const fullName = (p) => {
  if (!p) return ''
  const parts = p.type === 'gerance' ? [p.nom] : [p.nom, p.prenom]
  return parts.filter((s) => (s || '').trim()).join(' ').trim()
}

export function contaminatedCount(report) {
  return report.rows.filter((r) => r.contamine === 'oui').length
}

/**
 * Les lignes du rapport - toutes.
 *
 * Le PDF n'en imprimait qu'une partie : une piece sans nom, un appartement
 * sans numero ni resident etaient tenus pour vides et disparaissaient du
 * document. Or une piece qui figure encore dans le rapport y figure parce que
 * le technicien l'y a laissee : elle a ete inspectee, et le fait qu'elle ne
 * porte ni marquage ni commentaire est precisement ce que le rapport doit
 * attester. Une piece qui ne concerne pas l'intervention se supprime a la
 * saisie ; ce qui reste s'imprime.
 *
 * La fonction est gardee malgre sa simplicite : elle nomme la regle, et elle
 * est le seul endroit ou la changer si elle devait un jour revenir.
 */
export const filledRows = (report) => report.rows

/**
 * Un nouveau rapport calque sur un ancien.
 *
 * Une regie renvoie quatre fois par an dans le meme immeuble : le mandant, le
 * lieu et le plan des pieces ne changent pas, seule l'inspection recommence.
 *
 * Ce qui se reprend : le mandant, le lieu, le technicien, le partenaire, et le
 * nom des pieces ou le numero des appartements - le plan des lieux.
 * Ce qui repart a zero : les statuts, les constatations, les photos, les
 * signatures, les remarques et la date. Un rapport neuf ne peut pas naitre en
 * affirmant ce qu'on a constate il y a six mois.
 */
export function duplicateReport(src) {
  const copie = newReport(src.type)
  copie.mandant = { ...src.mandant }
  copie.lieu = { ...src.lieu, dateIntervention: todayISO(), heureIntervention: nowTime() }
  copie.technicien = { ...(src.technicien ?? {}) }
  copie.partenaire = { ...(src.partenaire ?? { nom: '', logo: null }) }
  copie.rows = src.rows.map((r) => {
    const vide = newRow(src.type)
    return TYPES[src.type].layout === 'pieces'
      ? { ...vide, nom: r.nom ?? '' }
      : { ...vide, etage: r.etage ?? '', numero: r.numero ?? '', resident: r.resident ?? '' }
  })
  return copie
}

// --- cycle de vie ----------------------------------------------------------

/**
 * Un rapport encore sur les bras, et le seul que l'accueil pose en tete.
 *
 * L'etat ne quittait 'draft' qu'a l'instant ou le mail partait (voir send.js).
 * Tant que l'envoi automatique n'est pas branche, le PDF se remet a la main -
 * par la messagerie du telephone, ou de vive voix - et le rapport n'avait alors
 * aucun moyen de se declarer fini : "En cours" grossissait sans fin jusqu'a ne
 * plus rien vouloir dire. "Terminer" est ce geste-la, rendu explicite.
 */
export const enCours = (r) => r.status === 'draft'

/** Remis d'une facon ou d'une autre : a la main, ou parti par mail. */
export const estTermine = (r) => r.status === 'done' || r.status === 'sent'

export function terminerReport(report) {
  report.status = 'done'
  report.remisAt = Date.now()
  return saveReport(report)
}

// Rouvrir ne fait que revenir en arriere : un rapport termine d'un doigt trop
// rapide, ou une correction que la regie demande apres coup. `sentAt` reste :
// s'il est reellement parti, cela s'est produit et le nier serait faux.
export function rouvrirReport(report) {
  report.status = 'draft'
  report.remisAt = null
  return saveReport(report)
}

// --- persistance -----------------------------------------------------------

/**
 * L'ecriture refusee est le seul echec de l'app qui coute du travail : sans
 * signal, la photo reste a l'ecran, le rapport parait enregistre, et tout
 * disparait au rechargement. Ce fichier n'a pas a connaitre l'interface, il se
 * contente de prevenir qui veut l'entendre (voir app.js).
 */
let signalEcriture = null
export const onEcritureRefusee = (fn) => {
  signalEcriture = fn
}

const memoirePleine = (err) =>
  err?.name === 'QuotaExceededError' || /quota|storage|space/i.test(err?.message ?? '')

/** @returns {Promise<boolean>} vrai si le rapport est bien dans l'appareil */
export const saveReport = async (report) => {
  // Un resume n'a ni photos ni signatures : l'enregistrer a la place du
  // rapport les effacerait. Les listes ne portent que des resumes.
  if (report?.resume) {
    console.error('Enregistrement refusé : ceci est un résumé de liste, pas un rapport')
    return false
  }
  report.updatedAt = Date.now()
  try {
    await ecrireRapport(report)
    return true
  } catch (err) {
    console.error('Enregistrement du rapport impossible', err)
    signalEcriture?.(memoirePleine(err))
    return false
  }
}
export const loadReport = (id) => db.get('reports', id)

// --- resumes : ce que les listes lisent ------------------------------------
//
// L'accueil, le carnet et les envois relisaient tous les rapports en entier a
// chaque passage - photos comprises, deux copies de chacune en texte base64.
// Une vingtaine de rapports photographies, et chaque retour a l'accueil
// chargeait des centaines de megaoctets pour afficher des noms et des dates.
//
// Chaque rapport a donc son resume : les memes champs, sans photos, lignes ni
// signatures. Les listes ne lisent que lui ; le rapport entier ne se charge
// qu'a l'ouverture.

// A monter quand le resume gagne un champ : les resumes d'une version plus
// ancienne se refont d'eux-memes au demarrage (voir synchroniserResumes).
const VERSION_RESUME = 2

/** Le rapport sans ce qui pese. Marque, pour ne jamais etre enregistre a sa place. */
export function resumeDe(report) {
  const { photos, signature, rows, technicien, partenaire, ...reste } = report
  const lignes = rows ?? []
  return {
    ...reste,
    resume: true,
    v: VERSION_RESUME,
    rows: [],
    nPhotos: photos?.length ?? 0,
    // Ou en est la visite, pour la barre de l'accueil : les lignes deja
    // tranchees (contaminee, rien trouve, a revoir) sur l'ensemble.
    avancement: { fait: lignes.filter((l) => l.contamine).length, total: lignes.length },
    technicien: { nom: technicien?.nom ?? '' },
    partenaire: { nom: partenaire?.nom ?? '' },
  }
}

/** Ecrit un rapport et son resume. Seule porte d'entree du magasin des rapports. */
export async function ecrireRapport(report) {
  await db.put('reports', report)
  await db.put('resumes', resumeDe(report))
}

/**
 * Remet les resumes en phase avec les rapports : un resume par rapport, aucun
 * resume orphelin. Ne compare que les identifiants - c'est quasi gratuit - et
 * ne charge que les rapports qui n'ont pas encore de resume (le premier
 * demarrage apres la mise a jour, une ecriture interrompue).
 */
export async function synchroniserResumes() {
  // Les resumes sont legers : les relire tous coute peu, et dit lesquels
  // datent d'une version precedente.
  const [rapports, resumes] = await Promise.all([db.keys('reports'), db.all('resumes')])
  const aJour = new Set(resumes.filter((r) => r.v === VERSION_RESUME).map((r) => r.id))
  const presents = new Set(rapports)
  for (const id of rapports) {
    if (aJour.has(id)) continue
    const r = await db.get('reports', id)
    if (r) await db.put('resumes', resumeDe(r))
  }
  for (const r of resumes) if (!presents.has(r.id)) await db.del('resumes', r.id)
}

/** Les sous-rapports d'un immeuble, en entier : le PDF fusionne en a besoin. */
export async function enfantsDe(parentId) {
  const ids = (await db.all('resumes')).filter((r) => r.parentId === parentId).map((r) => r.id)
  const enfants = await Promise.all(ids.map((id) => db.get('reports', id)))
  return enfants.filter(Boolean).sort((a, b) => b.updatedAt - a.updatedAt)
}

/**
 * Efface un rapport, et avec lui tout ce qui n'aurait plus de sens sans lui.
 *
 * Un immeuble porte des rapports de detection, un par appartement visite. Le
 * parent efface seul, ils restaient dans la base : exclus de toutes les listes
 * par `!r.parentId`, donc invisibles et inatteignables - mais leurs photos
 * occupaient toujours la place de l'appareil, celle-la meme que la jauge des
 * reglages surveille.
 *
 * Dans l'autre sens : un sous-rapport efface laissait sa ligne d'immeuble
 * pointer sur du vide, et le bouton "Rapport de detection ✓" ouvrait un rapport
 * qui n'existait plus. La ligne redevient donc une ligne sans sous-rapport.
 *
 * @returns {Promise<{enfants: number}>} ce qui est parti avec lui
 */
export async function deleteReport(id) {
  // Les liens de parente se lisent dans les resumes : inutile de charger les
  // photos de tout l'appareil pour savoir qui depend de qui.
  const tous = await db.all('resumes')
  const cible = tous.find((r) => r.id === id)

  const enfants = tous.filter((r) => r.parentId === id)
  for (const enfant of enfants) await db.del('reports', enfant.id)
  for (const enfant of enfants) await db.del('resumes', enfant.id)

  if (cible?.parentId) {
    const parent = await db.get('reports', cible.parentId)
    const ligne = parent?.rows?.find((x) => x.sousRapportId === id)
    if (ligne) {
      ligne.sousRapportId = null
      // Date touchee : la sauvegarde en ligne doit reprendre l'immeuble modifie.
      parent.updatedAt = Date.now()
      await ecrireRapport(parent)
    }
  }

  await db.del('reports', id)
  await db.del('resumes', id)
  noterSuppressionSauvegarde([id, ...enfants.map((e) => e.id)])
  return { enfants: enfants.length }
}

// Rapports effaces sur l'appareil, que la sauvegarde en ligne doit effacer a
// son tour au prochain passage avec du reseau (voir sauvegarde.js).
const SAUV_SUPPR_KEY = 'af-sauvegarde-suppr'

export function sauvegardesASupprimer() {
  try {
    const ids = JSON.parse(localStorage.getItem(SAUV_SUPPR_KEY) ?? '[]')
    return Array.isArray(ids) ? ids : []
  } catch {
    return []
  }
}

function noterSuppressionSauvegarde(ids) {
  localStorage.setItem(SAUV_SUPPR_KEY, JSON.stringify([...new Set([...sauvegardesASupprimer(), ...ids])]))
}

export function oublierSuppressionsSauvegarde(ids) {
  localStorage.setItem(SAUV_SUPPR_KEY, JSON.stringify(sauvegardesASupprimer().filter((id) => !ids.includes(id))))
}

/** Les resumes de tous les rapports, du plus recent au plus ancien. */
export const listReports = async () =>
  (await db.all('resumes')).sort((a, b) => b.updatedAt - a.updatedAt)

/**
 * Un rapport correspond-il a ce qui est tape dans la recherche ?
 *
 * On cherche un rapport par ce dont on se souvient : le nom du locataire ou de
 * la regie, la rue, la localite, le numero du rapport. Les mots peuvent venir
 * dans n'importe quel ordre - "fontaines favre" doit trouver "Mme Favre, rue
 * des Fontaines" - donc chaque mot est cherche separement, et tous doivent
 * etre presents.
 *
 * La comparaison se fait sans accents : on tape rarement "Yverdon-les-Bains"
 * avec ses traits d'union, et jamais "Gerance" avec son accent quand on a les
 * mains prises.
 */
const sansAccent = (s) =>
  (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')

export function matchRapport(report, recherche) {
  const mots = sansAccent(recherche).split(/\s+/).filter(Boolean)
  if (!mots.length) return true
  const foin = sansAccent(
    [
      report.ref,
      report.lieu?.locataire,
      fullName(report.mandant),
      report.lieu?.adresseIntervention,
      report.lieu?.adresse,
      report.lieu?.npaLieu,
      report.mandant?.npaLieu,
      report.lieu?.etagePorte,
    ]
      .filter(Boolean)
      .join(' ')
  )
  return mots.every((m) => foin.includes(m))
}

// --- carnet d'adresses -----------------------------------------------------

export const listContacts = async () =>
  (await db.all('contacts')).sort((a, b) => fullName(a).localeCompare(fullName(b)))

export async function rememberContact(mandant) {
  const nom = (mandant.nom || '').trim()
  if (!nom) return
  // Comparaison sur nom + prenom : deux personnes du meme nom de famille sont
  // deux contacts differents, pas une mise a jour de la premiere.
  const key = cleNom(fullName(mandant))
  const existing = (await listContacts()).find((c) => cleNom(fullName(c)) === key)
  // Fusion : un champ laisse vide dans ce rapport n'efface pas ce que le carnet
  // savait deja. Un mail tape une fois pour la regie reste, meme si le rapport
  // suivant ne le reprend pas.
  const fusion = { ...(existing ?? {}) }
  for (const [k, v] of Object.entries(mandant)) if (String(v ?? '').trim()) fusion[k] = v
  await db.put('contacts', marque({ ...fusion, id: existing?.id ?? uid(), nom }))
  signalCarnet?.()
}

/**
 * Entre plusieurs contacts d'un coup, sans jamais ecraser un existant : deux
 * "M. Rochat" a deux adresses sont deux personnes, et un carnet qui se
 * reecrit tout seul cesse d'etre une reference.
 *
 * @param {object[]} nouveaux
 * @returns {Promise<{ajoutes: number, connus: number}>}
 */
export async function ajouterContacts(nouveaux) {
  const cle = (c) => `${fullName(c).toLowerCase()}|${(c.adresse || '').trim().toLowerCase()}`
  const vus = new Set((await listContacts()).map(cle))
  let ajoutes = 0
  let connus = 0
  for (const c of nouveaux) {
    if (!(c.nom || '').trim()) continue
    if (vus.has(cle(c))) {
      connus++
      continue
    }
    vus.add(cle(c))
    await db.put('contacts', marque({ id: uid(), ...c }))
    ajoutes++
  }
  if (ajoutes) signalCarnet?.()
  return { ajoutes, connus }
}

/**
 * Contacts du carnet qui correspondent a ce qui est en train d'etre tape.
 * La recherche porte sur le nom, le prenom et le lieu : on cherche parfois une
 * regie par sa ville quand son nom exact echappe.
 *
 * @param {string} saisi ce qui est dans le champ
 * @param {object[]} contacts le carnet
 * @param {number} max nombre de propositions
 */
export function matchContacts(saisi, contacts, max = 4) {
  const q = (saisi ?? '').trim().toLowerCase()
  if (q.length < 2) return []
  const exact = q
  return contacts
    .filter((c) => {
      const champs = [c.nom, c.prenom, c.npaLieu, c.adresse].filter(Boolean).join(' ').toLowerCase()
      return champs.includes(q)
    })
    // Un contact dont le nom est deja tape en entier n'a plus rien a proposer :
    // la suggestion doit disparaitre une fois la saisie faite, pas rester
    // affichee sous le champ qu'elle a servi a remplir.
    .filter((c) => fullName(c).toLowerCase() !== exact)
    // Les clients habituels d'abord : ce sont eux qu'on tape le plus souvent.
    .sort((a, b) => (b.favori ? 1 : 0) - (a.favori ? 1 : 0))
    .slice(0, max)
}

/**
 * Coordonnees du mandant en un bloc, pretes a etre collees dans une facture.
 * Format postal suisse : raison sociale, rue, NPA + localite, puis les moyens
 * de contact - c'est ainsi qu'on les recopie sur un document comptable.
 */
export function mandantEnTexte(mandant) {
  return [
    fullName(mandant),
    mandant.adresse,
    mandant.npaLieu,
    mandant.email,
    mandant.tel,
  ]
    .map((s) => (s ?? '').trim())
    .filter(Boolean)
    .join('\n')
}

// --- carnet commun : ce qui reste a envoyer ----------------------------------
//
// Le carnet du telephone est la copie de celui de l'equipe (voir
// carnet-sync.js). Chaque fiche ecrite ici est datee et marquee a envoyer ;
// chaque suppression attend dans une liste. Ce fichier ne sait rien du
// reseau : il previent seulement qui veut l'entendre qu'il y a du nouveau.
let signalCarnet = null
export const onCarnetModifie = (fn) => {
  signalCarnet = fn
}

const marque = (c) => ({ ...c, maj: Date.now(), aEnvoyer: true })

const SUPPR_KEY = 'af-carnet-suppr'
export function suppressionsEnAttente() {
  try {
    return JSON.parse(localStorage.getItem(SUPPR_KEY) ?? '[]')
  } catch {
    return []
  }
}
export const ecrireSuppressions = (ids) => localStorage.setItem(SUPPR_KEY, JSON.stringify(ids))

export async function deleteContact(id) {
  await db.del('contacts', id)
  ecrireSuppressions([...new Set([...suppressionsEnAttente(), id])])
  signalCarnet?.()
}

// Un nom compare sans accents, sans casse et sans espaces en trop : "Régie
// Duval" et "regie  duval" sont le meme client.
const cleNom = (s) => sansAccent(s).replace(/\s+/g, ' ').trim()

/** Le bloc mandant d'un rapport, rempli depuis une fiche du carnet. */
export const contactVersMandant = (c) => ({
  type: c.type ?? '',
  nom: c.nom ?? '',
  prenom: c.prenom ?? '',
  adresse: c.adresse ?? '',
  npaLieu: c.npaLieu ?? '',
  email: c.email ?? '',
  tel: c.tel ?? '',
})

/**
 * Un contact correspond-il a la recherche du carnet ? Memes regles que pour
 * les rapports : mots dans n'importe quel ordre, sans accents. Le telephone
 * compte aussi - on retrouve souvent un client par le numero qui a appele.
 */
export function matchContact(contact, recherche) {
  const mots = sansAccent(recherche).split(/\s+/).filter(Boolean)
  if (!mots.length) return true
  const foin = sansAccent(
    [contact.nom, contact.prenom, contact.adresse, contact.npaLieu, contact.email, contact.tel, (contact.tel || '').replace(/\D/g, '')]
      .filter(Boolean)
      .join(' ')
  )
  return mots.every((m) => foin.includes(m))
}

/**
 * Les rapports d'un client : ceux dont il est le mandant, ou le locataire.
 * Les sous-rapports d'immeuble sont comptes avec leur immeuble.
 */
export function rapportsDuContact(contact, reports) {
  const cle = cleNom(fullName(contact))
  if (!cle) return []
  return reports
    .filter((r) => !r.parentId && (cleNom(fullName(r.mandant)) === cle || cleNom(r.lieu?.locataire) === cle))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
}

/**
 * Nombre de rapports et date du dernier, pour tout le carnet d'un coup : la
 * liste le montre a chaque ligne, et la recalculer contact par contact
 * reparcourrait tous les rapports autant de fois qu'il y a de clients.
 *
 * @returns {Map<string, {n: number, dernier: number}>} par nom compare
 */
export function activiteParNom(reports) {
  const index = new Map()
  for (const r of reports) {
    if (r.parentId) continue
    const cles = new Set([cleNom(fullName(r.mandant)), cleNom(r.lieu?.locataire)].filter(Boolean))
    for (const k of cles) {
      const a = index.get(k) ?? { n: 0, dernier: 0 }
      a.n++
      a.dernier = Math.max(a.dernier, r.updatedAt || 0)
      index.set(k, a)
    }
  }
  return index
}

export const activiteDe = (contact, index) => index.get(cleNom(fullName(contact))) ?? { n: 0, dernier: 0 }

/**
 * Les mandants des rapports deja faits qui manquent au carnet, un par nom.
 * Le rapport le plus recent donne les coordonnees les plus fraiches ; un champ
 * qu'il laisse vide se reprend d'un rapport plus ancien - le telephone saisi
 * au premier passage, et oublie au second.
 */
export function clientsDesRapports(reports, contacts) {
  const connus = new Set(contacts.map((c) => cleNom(fullName(c))))
  const clients = new Map()
  for (const r of [...reports].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))) {
    if (r.parentId || !(r.mandant?.nom || '').trim()) continue
    const cle = cleNom(fullName(r.mandant))
    if (connus.has(cle)) continue
    const ici = { ...contactVersMandant(r.mandant), nom: r.mandant.nom.trim() }
    const deja = clients.get(cle)
    if (!deja) clients.set(cle, ici)
    else for (const [k, v] of Object.entries(ici)) if (!String(deja[k] ?? '').trim()) deja[k] = v
  }
  return [...clients.values()]
}

/**
 * Le carnet ne se remplissait qu'a l'envoi automatique : les clients des
 * rapports remis a la main n'y entraient jamais. Une seule fois par appareil,
 * les mandants des rapports existants y sont verses - ensuite, le carnet se
 * tient a jour a chaque envoi et a chaque rapport termine, et un contact
 * supprime ne revient pas tout seul.
 *
 * @returns {Promise<number>} nombre de clients ajoutes
 */
const CARNET_KEY = 'af-carnet-repris'

export async function reprendreClients() {
  if (localStorage.getItem(CARNET_KEY)) return 0
  await synchroniserResumes()
  const nouveaux = clientsDesRapports(await db.all('resumes'), await db.all('contacts'))
  for (const c of nouveaux) await db.put('contacts', marque({ id: uid(), ...c }))
  localStorage.setItem(CARNET_KEY, '1')
  if (nouveaux.length) signalCarnet?.()
  return nouveaux.length
}

// --- technicien par defaut -------------------------------------------------

// Nom et signature repris d'office par chaque nouveau rapport. Un rapport
// confie a un collegue se modifie ensuite dans le rapport lui-meme, sans
// toucher a ce reglage - c'est tout l'interet de le stocker a part.
export const TECHNICIEN_NOM_DEFAUT = 'Oberli Stessy'

export async function loadTechnicien() {
  const saved = await db.get('settings', 'technicien')
  return { nom: saved?.nom || TECHNICIEN_NOM_DEFAUT, signature: saved?.signature ?? null }
}

export const saveTechnicien = ({ nom, signature }) =>
  db.put('settings', { id: 'technicien', nom: (nom || '').trim() || TECHNICIEN_NOM_DEFAUT, signature: signature ?? null })

// --- partenaires (desinsectiseurs) -----------------------------------------

// Les logos deja utilises, gardes sur l'appareil pour qu'un partenaire habituel
// se rattache d'un tap plutot que d'etre reglisse a chaque rapport.
//
// Jamais repris d'office sur un nouveau rapport, et c'est volontaire : toutes
// les detections ne se font pas en collaboration, et un logo tiers pose par
// defaut ferait cosigner un rapport a une entreprise qui n'etait pas la.
const PARTENAIRES_MAX = 6

export async function listPartenaires() {
  const saved = await db.get('settings', 'partenaires')
  return saved?.liste ?? []
}

export async function rememberPartenaire(partenaire) {
  if (!partenaire?.logo) return
  const nom = (partenaire.nom || '').trim()
  const liste = await listPartenaires()
  // Un partenaire deja connu remonte en tete au lieu de se dupliquer. Meme
  // logo OU meme nom : le logo arrive souvent avant que le nom soit tape, et
  // ne regarder que le nom laissait derriere une entree anonyme portant le
  // meme logo.
  const autres = liste.filter(
    (p) => p.logo !== partenaire.logo && !(nom && (p.nom || '').trim().toLowerCase() === nom.toLowerCase())
  )
  const liste2 = [{ id: uid(), nom, logo: partenaire.logo }, ...autres].slice(0, PARTENAIRES_MAX)
  await db.put('settings', { id: 'partenaires', liste: liste2 })
}

export async function deletePartenaire(id) {
  const liste = (await listPartenaires()).filter((p) => p.id !== id)
  await db.put('settings', { id: 'partenaires', liste })
}

// Enregistrement direct (carnet de contacts) : contrairement a
// rememberContact, met a jour l'id fourni sans re-chercher par nom -
// necessaire pour pouvoir renommer un contact existant sans en dupliquer un.
export async function saveContact(contact) {
  const nom = (contact.nom || '').trim()
  if (!nom) return
  // Le formulaire ne connait que les coordonnees : ce que la fiche porte
  // d'autre (l'etoile des favoris) reste tel quel.
  const avant = contact.id ? await db.get('contacts', contact.id) : null
  await db.put('contacts', marque({ ...(avant ?? {}), ...contact, id: contact.id ?? uid(), nom }))
  signalCarnet?.()
}

/**
 * Coche ou decoche l'etoile d'un client habituel. Elle part au carnet de
 * l'equipe comme n'importe quelle modification de la fiche.
 * @returns {Promise<object|null>} la fiche a jour
 */
export async function basculerFavori(id) {
  if (!id) return null
  const c = await db.get('contacts', id)
  if (!c) return null
  const maj = marque({ ...c, favori: !c.favori })
  await db.put('contacts', maj)
  signalCarnet?.()
  return maj
}

// --- sauvegarde exportable --------------------------------------------------

// Les rapports, le carnet et la signature du technicien n'existent que dans ce
// telephone. Perdu, casse ou vole, tout part avec lui : d'ou un fichier unique
// qu'on peut s'envoyer par mail et ranger ailleurs.
const BACKUP_FORMAT = 'atout-flair-sauvegarde-1'

export async function exportBackup() {
  // Tous les reglages, et non le seul technicien : la liste des partenaires y
  // vit aussi, et une sauvegarde qui l'oublierait obligerait a reglisser les
  // logos un a un sur le telephone neuf.
  const [reports, contacts, settings] = await Promise.all([
    db.all('reports'),
    db.all('contacts'),
    db.all('settings'),
  ])
  return {
    format: BACKUP_FORMAT,
    date: new Date().toISOString(),
    refSeq: localStorage.getItem(REF_KEY) ?? '0',
    reports,
    contacts,
    settings,
  }
}

export async function importBackup(data) {
  if (data?.format !== BACKUP_FORMAT) throw new Error('Fichier de sauvegarde non reconnu')
  // Fusion, jamais remplacement : restaurer une sauvegarde ne doit pas effacer
  // ce qui a ete saisi depuis. Un enregistrement de meme identifiant est repris
  // du fichier, les autres restent en place.
  for (const r of data.reports ?? []) await ecrireRapport(r)
  // Les contacts restaures partent aussi au carnet de l'equipe.
  for (const c of data.contacts ?? []) await db.put('contacts', marque(c))
  if ((data.contacts ?? []).length) signalCarnet?.()
  for (const s of data.settings ?? []) await db.put('settings', s)
  // Le compteur de numeros repart au plus haut des deux : sans cela, un rapport
  // restaure sur un appareil neuf reattribuerait un numero deja imprime. Les
  // rapports restaures ont ensuite le dernier mot (repriseCompteur) - une
  // sauvegarde peut avoir perdu son `refSeq`, jamais les numeros qu'elle porte.
  const seq = Math.max(Number(localStorage.getItem(REF_KEY) ?? '0'), Number(data.refSeq ?? '0'))
  localStorage.setItem(REF_KEY, String(seq))
  await repriseCompteur()
  return { reports: (data.reports ?? []).length, contacts: (data.contacts ?? []).length }
}

/**
 * Quand la derniere sauvegarde a-t-elle ete faite ?
 *
 * Tout vit dans un seul telephone, et l'export est un geste volontaire : perdu,
 * casse ou vole, l'appareil emporte tout. Une sauvegarde qu'on doit penser a
 * faire ne se fait pas - on retient donc la date, et l'app la rappelle.
 */
const BACKUP_KEY = 'af-backup-date'

export const lastBackup = () => Number(localStorage.getItem(BACKUP_KEY)) || 0
export const markBackup = () => localStorage.setItem(BACKUP_KEY, String(Date.now()))

/** Nombre de jours depuis la derniere sauvegarde, ou null si jamais faite. */
export function backupAge() {
  const t = lastBackup()
  return t ? Math.floor((Date.now() - t) / 86400000) : null
}

// --- place restante --------------------------------------------------------

/**
 * Ce que l'app occupe dans l'appareil, et ce que le navigateur lui accorde.
 *
 * Les photos sont stockees en clair : une tournee chargee pese plus qu'on ne
 * croit, et un telephone plein refuse l'ecriture sans prevenir. C'est le seul
 * endroit ou du travail peut disparaitre - autant le voir venir.
 *
 * Retourne null quand le navigateur ne sait pas repondre : mieux vaut ne rien
 * afficher qu'un chiffre invente.
 *
 * @returns {Promise<{usage: number, quota: number, part: number}|null>}
 */
export async function stockage() {
  if (!navigator.storage?.estimate) return null
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate()
    if (!quota) return null
    return { usage, quota, part: usage / quota }
  } catch {
    return null
  }
}

// Au-dela, la prochaine photo peut ne plus tenir : c'est le seuil ou l'app
// previent au lieu de laisser l'ecriture echouer.
export const STOCKAGE_ALERTE = 0.9

/** Un poids lisible d'un coup d'oeil, a la virgule suisse. */
export function enPoids(octets) {
  if (octets >= 1_073_741_824) return `${(octets / 1_073_741_824).toFixed(1).replace('.', ',')} Go`
  if (octets >= 1_048_576) return `${Math.round(octets / 1_048_576)} Mo`
  return `${Math.max(1, Math.round(octets / 1024))} Ko`
}

export function backupFilename() {
  const d = new Date()
  const deux = (n) => String(n).padStart(2, '0')
  return `Atout Flair - sauvegarde du ${deux(d.getDate())}.${deux(d.getMonth() + 1)}.${d.getFullYear()}.json`
}

// --- nom de fichier --------------------------------------------------------

const slug = (s) =>
  (s || '')
    // Les ligatures ne se decomposent pas en NFD : elles traversaient donc le
    // retrait des accents intactes, pour se faire supprimer juste apres par le
    // filtre des lettres autorisees. "Mme Cœur-Favre" arrivait chez la regie en
    // "Mme Cur-Favre", dans le nom du fichier comme dans l'objet du mail.
    // Meme chose pour les lettres barrees, que la decomposition ignore aussi.
    .replace(/[œŒæÆøØłŁđĐ]/g, (c) => ({ œ: 'oe', Œ: 'OE', æ: 'ae', Æ: 'AE', ø: 'o', Ø: 'O', ł: 'l', Ł: 'L', đ: 'd', Đ: 'D' })[c])
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^A-Za-z0-9 .'-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

export function reportFilename(report) {
  const t = TYPES[report.type]
  const who = slug(report.lieu.locataire || fullName(report.mandant) || 'Rapport')
  const date = frDate(report.lieu.dateIntervention || report.rows[0]?.date || todayISO())
  const adresse = slug(report.lieu.adresseIntervention || report.lieu.adresse || '')
  // Le libelle passe par le meme tamis que le nom du locataire : sans cela le
  // fichier melangeait "Mme Elise Favre-OEuvray" - poncee jusqu'a l'ASCII - et
  // "Rapport de détection", avec son accent. Ou l'on tient au nom de fichier
  // sans accent, ou l'on n'y tient pas ; on ne fait pas les deux.
  const parts = [who, `${slug(t.label)} du ${date}`]
  if (adresse) parts.push(adresse)
  return `${parts.join(' - ')}.pdf`.replace(/\s+/g, ' ')
}
