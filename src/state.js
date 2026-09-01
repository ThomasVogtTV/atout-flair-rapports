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

// Reference imprimee sur le rapport (ex. AF-00001). Compteur local a
// l'appareil : suffisant pour un usage a un seul technicien, et sans
// dependance a un serveur pour rester utilisable hors ligne.
function nextRef() {
  const n = Number(localStorage.getItem('af-ref-seq') ?? '0') + 1
  localStorage.setItem('af-ref-seq', String(n))
  return `AF-${String(n).padStart(5, '0')}`
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
  report.updatedAt = Date.now()
  try {
    await db.put('reports', report)
    return true
  } catch (err) {
    console.error('Enregistrement du rapport impossible', err)
    signalEcriture?.(memoirePleine(err))
    return false
  }
}
export const loadReport = (id) => db.get('reports', id)
export const deleteReport = (id) => db.del('reports', id)
export const listReports = async () =>
  (await db.all('reports')).sort((a, b) => b.updatedAt - a.updatedAt)

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
  const key = fullName(mandant).toLowerCase()
  const existing = (await listContacts()).find((c) => fullName(c).toLowerCase() === key)
  await db.put('contacts', { id: existing?.id ?? uid(), ...mandant, nom })
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

export const deleteContact = (id) => db.del('contacts', id)

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
  await db.put('contacts', { ...contact, id: contact.id ?? uid(), nom })
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
    refSeq: localStorage.getItem('af-ref-seq') ?? '0',
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
  for (const r of data.reports ?? []) await db.put('reports', r)
  for (const c of data.contacts ?? []) await db.put('contacts', c)
  for (const s of data.settings ?? []) await db.put('settings', s)
  // Le compteur de numeros repart au plus haut des deux : sans cela, un rapport
  // restaure sur un appareil neuf reattribuerait un numero deja imprime.
  const seq = Math.max(Number(localStorage.getItem('af-ref-seq') ?? '0'), Number(data.refSeq ?? '0'))
  localStorage.setItem('af-ref-seq', String(seq))
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
  const parts = [who, `${t.label} du ${date}`]
  if (adresse) parts.push(adresse)
  return `${parts.join(' - ')}.pdf`.replace(/\s+/g, ' ')
}
