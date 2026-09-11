// Agenda : ce qui se calcule sans reseau ni ecran - l'ordre des rendez-vous,
// le nom des jours, et le rendez-vous mis au format des agendas de telephone
// (fichier .ics pour l'iPhone, lien Google Agenda pour Android).

import { TYPE_LIST } from './templates.js'

const deux = (n) => String(n).padStart(2, '0')
const isoDe = (d) => `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`

export const typeRdv = (id) => TYPE_LIST.find((t) => t.id === id) ?? TYPE_LIST[0]

/** Le nom du client, dans l'ordre du carnet ; une gerance n'a pas de prenom. */
export const nomClient = (c = {}) =>
  (c.type === 'gerance' ? [c.nom] : [c.nom, c.prenom]).filter((s) => (s || '').trim()).join(' ').trim()

/** Ou l'on va : l'adresse du rendez-vous, a defaut celle du client. */
export const adresseRdv = (r) =>
  [r.lieu?.adresse || r.client?.adresse, r.lieu?.npaLieu || r.client?.npaLieu].filter(Boolean).join(', ')

/** Du plus proche au plus lointain ; un rendez-vous sans heure passe en fin de journee. */
export const trierRdv = (rdvs) =>
  [...rdvs].sort((a, b) => `${a.date} ${a.heure || '99:99'}`.localeCompare(`${b.date} ${b.heure || '99:99'}`))

export const plusJours = (iso, n) => {
  const [a, m, j] = iso.split('-').map(Number)
  return isoDe(new Date(a, m - 1, j + n))
}

// --- le calendrier du mois ---------------------------------------------------

/** Le mois d'une date : "2026-09". */
export const moisDe = (iso) => iso.slice(0, 7)

export function decalerMois(mois, n) {
  const [a, m] = mois.split('-').map(Number)
  const d = new Date(a, m - 1 + n, 1)
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}`
}

/** "Septembre 2026". */
export function libelleMois(mois) {
  const [a, m] = mois.split('-').map(Number)
  const s = new Date(a, m - 1, 1).toLocaleDateString('fr-CH', { month: 'long', year: 'numeric' })
  return s[0].toUpperCase() + s.slice(1)
}

/**
 * Les cases du calendrier d'un mois, semaine par semaine, lundi en premier
 * (l'usage suisse). Les jours des mois voisins completent la premiere et la
 * derniere semaine ; cinq ou six semaines selon le mois.
 */
export function grilleMois(mois) {
  const [a, m] = mois.split('-').map(Number)
  const decalage = (new Date(a, m - 1, 1).getDay() + 6) % 7
  const jours = new Date(a, m, 0).getDate()
  const cases = Math.ceil((decalage + jours) / 7) * 7
  return Array.from({ length: cases }, (_, i) => {
    const d = new Date(a, m - 1, 1 - decalage + i)
    return { iso: isoDe(d), jour: d.getDate(), dansMois: d.getMonth() === m - 1 }
  })
}

export const aVenir = (rdvs, aujourdhui) => trierRdv(rdvs.filter((r) => r.date >= aujourdhui))

/** Les rendez-vous des deux dernieres semaines, du plus recent au plus ancien. */
export const recents = (rdvs, aujourdhui, jours = 14) =>
  trierRdv(rdvs.filter((r) => r.date < aujourdhui && r.date >= plusJours(aujourdhui, -jours))).reverse()

/** "Aujourd'hui", "Demain", ou le jour en toutes lettres. */
export function libelleJour(iso, aujourdhui) {
  if (iso === aujourdhui) return "Aujourd'hui"
  if (iso === plusJours(aujourdhui, 1)) return 'Demain'
  const [a, m, j] = iso.split('-').map(Number)
  const s = new Date(a, m - 1, j).toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long' })
  return s[0].toUpperCase() + s.slice(1)
}

// --- vers l'agenda du telephone ---------------------------------------------

// Debut et fin d'un rendez-vous, en heure locale "flottante" (sans fuseau) :
// l'agenda du telephone la lit a l'heure du telephone, en Suisse. Une heure
// par defaut ; sans heure, toute la journee.
function bornes(rdv) {
  const [a, m, j] = rdv.date.split('-').map(Number)
  if (!rdv.heure) {
    const fin = new Date(a, m - 1, j + 1)
    return { journee: true, debut: `${a}${deux(m)}${deux(j)}`, fin: isoDe(fin).replace(/-/g, '') }
  }
  const [h, mi] = rdv.heure.split(':').map(Number)
  const format = (d) => `${isoDe(d).replace(/-/g, '')}T${deux(d.getHours())}${deux(d.getMinutes())}00`
  return { journee: false, debut: format(new Date(a, m - 1, j, h, mi)), fin: format(new Date(a, m - 1, j, h + 1, mi)) }
}

export const titreRdv = (rdv) => `${nomClient(rdv.client)} - ${typeRdv(rdv.type).choix}`

function descriptionRdv(rdv) {
  return [
    rdv.note,
    rdv.client?.tel && `Tél. ${rdv.client.tel}`,
    rdv.pour?.nom && `Pour : ${rdv.pour.nom}`,
    'Atout Flair - rendez-vous de détection canine',
  ]
    .filter(Boolean)
    .join('\n')
}

// Echappement du format iCalendar (RFC 5545).
const echapper = (s) =>
  String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')

/**
 * Le rendez-vous en fichier .ics : l'iPhone l'ouvre dans son Calendrier, avec
 * un rappel trente minutes avant (a 8 h pour un rendez-vous sans heure).
 */
export function fichierIcs(rdv, maintenant = new Date()) {
  const b = bornes(rdv)
  const horodatage = maintenant.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const lieu = adresseRdv(rdv)
  const lignes = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Atout Flair//Agenda//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${rdv.id}@atout-flair`,
    `DTSTAMP:${horodatage}`,
    b.journee ? `DTSTART;VALUE=DATE:${b.debut}` : `DTSTART:${b.debut}`,
    b.journee ? `DTEND;VALUE=DATE:${b.fin}` : `DTEND:${b.fin}`,
    `SUMMARY:${echapper(titreRdv(rdv))}`,
    ...(lieu ? [`LOCATION:${echapper(lieu)}`] : []),
    `DESCRIPTION:${echapper(descriptionRdv(rdv))}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${echapper(titreRdv(rdv))}`,
    b.journee ? 'TRIGGER:PT8H' : 'TRIGGER:-PT30M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return `${lignes.join('\r\n')}\r\n`
}

/** Le rendez-vous pret a enregistrer dans Google Agenda (Android, ordinateur). */
export function lienGoogleAgenda(rdv) {
  const b = bornes(rdv)
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: titreRdv(rdv),
    dates: `${b.debut}/${b.fin}`,
    details: descriptionRdv(rdv),
    location: adresseRdv(rdv),
    ctz: 'Europe/Zurich',
  })
  return `https://calendar.google.com/calendar/render?${p}`
}
