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

export function newReport(type) {
  const t = TYPES[type]
  const report = {
    id: uid(),
    ref: nextRef(),
    type,
    status: 'draft',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    mandant: { type: '', nom: '', adresse: '', npaLieu: '', email: '', tel: '' },
    lieu: {},
    rows: [],
    remarques: '',
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

export function contaminatedCount(report) {
  return report.rows.filter((r) => r.contamine === 'oui').length
}

export function filledRows(report) {
  const t = TYPES[report.type]
  if (t.layout === 'pieces') return report.rows.filter((r) => (r.nom || '').trim())
  return report.rows.filter((r) => (r.numero || '').trim() || (r.resident || '').trim() || (r.etage || '').trim())
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
  (await db.all('contacts')).sort((a, b) => (a.nom || '').localeCompare(b.nom || ''))

export async function rememberContact(mandant) {
  const nom = (mandant.nom || '').trim()
  if (!nom) return
  const existing = (await listContacts()).find(
    (c) => (c.nom || '').toLowerCase() === nom.toLowerCase()
  )
  await db.put('contacts', { id: existing?.id ?? uid(), ...mandant, nom })
}

export const deleteContact = (id) => db.del('contacts', id)

// Enregistrement direct (carnet de contacts) : contrairement a
// rememberContact, met a jour l'id fourni sans re-chercher par nom -
// necessaire pour pouvoir renommer un contact existant sans en dupliquer un.
export async function saveContact(contact) {
  const nom = (contact.nom || '').trim()
  if (!nom) return
  await db.put('contacts', { ...contact, id: contact.id ?? uid(), nom })
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
  const who = slug(report.lieu.locataire || report.mandant.nom || 'Rapport')
  const date = frDate(report.lieu.dateIntervention || report.rows[0]?.date || todayISO())
  const adresse = slug(report.lieu.adresseIntervention || report.lieu.adresse || '')
  const parts = [who, `${t.label} du ${date}`]
  if (adresse) parts.push(adresse)
  return `${parts.join(' - ')}.pdf`.replace(/\s+/g, ' ')
}
