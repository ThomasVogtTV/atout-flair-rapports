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
    signature: null,
    photos: [],
    sentAt: null,
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

// Les champs qui font qu'une ligne existe vraiment : sans eux, c'est une ligne
// vide qu'on ne compte pas. Une seule liste, lue a la fois pour compter et pour
// savoir quelle frappe doit rafraichir le compteur (voir app.js) - separees,
// les deux avaient derive : le compteur d'un immeuble ne bougeait plus.
const CHAMPS_LIGNE = { pieces: ['nom'], lignes: ['numero', 'resident', 'etage'] }

export const champsQuiComptent = (report) => CHAMPS_LIGNE[TYPES[report.type].layout]

export function filledRows(report) {
  const champs = champsQuiComptent(report)
  return report.rows.filter((r) => champs.some((c) => (r[c] || '').trim()))
}

// --- persistance -----------------------------------------------------------

export const saveReport = (report) => {
  report.updatedAt = Date.now()
  return db.put('reports', report)
}
export const loadReport = (id) => db.get('reports', id)
export const deleteReport = (id) => db.del('reports', id)
export const listReports = async () =>
  (await db.all('reports')).sort((a, b) => b.updatedAt - a.updatedAt)

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
  const [reports, contacts, technicien] = await Promise.all([
    db.all('reports'),
    db.all('contacts'),
    db.get('settings', 'technicien'),
  ])
  return {
    format: BACKUP_FORMAT,
    date: new Date().toISOString(),
    refSeq: localStorage.getItem('af-ref-seq') ?? '0',
    reports,
    contacts,
    settings: technicien ? [technicien] : [],
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

export function backupFilename() {
  const d = new Date()
  const deux = (n) => String(n).padStart(2, '0')
  return `Atout Flair - sauvegarde du ${deux(d.getDate())}.${deux(d.getMonth() + 1)}.${d.getFullYear()}.json`
}

// --- nom de fichier --------------------------------------------------------

const slug = (s) =>
  (s || '')
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
