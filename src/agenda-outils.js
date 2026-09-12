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

// --- heures et durees --------------------------------------------------------

/** Une heure par defaut : c'est la duree d'une detection courante. */
export const DUREE_DEFAUT = 60

/** "09:30" -> 570 minutes depuis minuit. */
export const enMinutes = (heure) => {
  const [h, m] = String(heure ?? '').split(':').map(Number)
  return Number.isFinite(h) ? h * 60 + (Number.isFinite(m) ? m : 0) : 0
}

/** 570 -> "09:30". */
export const enHeure = (minutes) => `${deux(Math.floor(minutes / 60) % 24)}:${deux(Math.round(minutes) % 60)}`

/** Combien de temps dure ce rendez-vous, en minutes. */
export const dureeDe = (rdv) => (Number(rdv?.duree) > 0 ? Number(rdv.duree) : DUREE_DEFAUT)

/** L'heure a laquelle on repart, en minutes depuis minuit. */
export const finDe = (rdv) => enMinutes(rdv.heure) + dureeDe(rdv)

/** "09:00 – 10:30", ou "Dans la journée" faute d'heure. */
export const plageRdv = (rdv) => (rdv.heure ? `${rdv.heure} – ${enHeure(finDe(rdv))}` : 'Dans la journée')

/** "1 h 30", "45 min" : la duree telle qu'on la dit. */
export function libelleDuree(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (!h) return `${m} min`
  return m ? `${h} h ${deux(m)}` : `${h} h`
}

/**
 * Deux rendez-vous qui se marchent dessus : le meme jour, tous deux a une
 * heure, et l'un commence avant que l'autre soit fini.
 */
export const seChevauchent = (a, b) =>
  a.date === b.date && !!a.heure && !!b.heure && enMinutes(a.heure) < finDe(b) && enMinutes(b.heure) < finDe(a)

/**
 * Les rendez-vous de la meme personne qui empietent sur celui-ci. C'est la
 * double reservation que l'on veut voir avant d'enregistrer, pas apres.
 */
export function conflitsDe(rdv, rdvs) {
  const qui = rdv.pour?.id ?? null
  return rdvs.filter((r) => r.id !== rdv.id && (r.pour?.id ?? null) === qui && seChevauchent(rdv, r))
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

// --- la semaine --------------------------------------------------------------
//
// Le semainier est la vue de celui qui organise : sept colonnes, les heures en
// hauteur, chaque rendez-vous a sa place et a sa taille. Tout se calcule ici,
// en minutes et en pourcentages ; l'ecran ne fait que poser les blocs.

/** Les initiales des jours, du lundi au dimanche (usage suisse). */
export const LETTRES_JOURS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

/** Le lundi de la semaine d'une date. */
export function lundiDe(iso) {
  const [a, m, j] = iso.split('-').map(Number)
  const decalage = (new Date(a, m - 1, j).getDay() + 6) % 7
  return isoDe(new Date(a, m - 1, j - decalage))
}

/** La semaine d'avant (-1), d'apres (+1)... toujours reperee par son lundi. */
export const decalerSemaine = (lundi, n) => plusJours(lundi, n * 7)

/** Les sept jours d'une semaine, du lundi au dimanche. */
export const grilleSemaine = (lundi) =>
  LETTRES_JOURS.map((lettre, i) => {
    const iso = plusJours(lundi, i)
    return { iso, lettre, jour: Number(iso.slice(8)) }
  })

/** "8 – 14 septembre 2026", ou "29 sept. – 5 oct. 2026" a cheval sur deux mois. */
export function libelleSemaine(lundi) {
  const fin = plusJours(lundi, 6)
  const [a1, m1, j1] = lundi.split('-').map(Number)
  const [a2, m2, j2] = fin.split('-').map(Number)
  const mois = (a, m, court) => new Date(a, m - 1, 1).toLocaleDateString('fr-CH', { month: court ? 'short' : 'long' })
  if (a1 === a2 && m1 === m2) return `${j1} – ${j2} ${mois(a2, m2)} ${a2}`
  if (a1 === a2) return `${j1} ${mois(a1, m1, true)} – ${j2} ${mois(a2, m2, true)} ${a2}`
  return `${j1} ${mois(a1, m1, true)} ${a1} – ${j2} ${mois(a2, m2, true)} ${a2}`
}

/**
 * De quelle heure a quelle heure dessiner la journee. De 7 h a 19 h par
 * defaut, elargi juste ce qu'il faut pour qu'aucun rendez-vous ne depasse.
 */
export function plageJournee(rdvs, premiere = 7, derniere = 19) {
  let debut = premiere * 60
  let fin = derniere * 60
  for (const r of rdvs) {
    if (!r.heure) continue
    debut = Math.min(debut, Math.floor(enMinutes(r.heure) / 60) * 60)
    fin = Math.max(fin, Math.ceil(finDe(r) / 60) * 60)
  }
  return { debut: Math.max(0, debut), fin: Math.min(24 * 60, Math.max(fin, debut + 60)) }
}

/**
 * Les rendez-vous d'une journee, places : ceux qui se chevauchent se partagent
 * la largeur de la colonne au lieu de se cacher l'un l'autre. On avance dans
 * l'ordre des heures ; chaque grappe de rendez-vous qui se touchent recoit
 * autant de colonnes qu'il en faut.
 *
 * @returns {{rdv: object, debut: number, fin: number, colonne: number, colonnes: number}[]}
 */
export function disposerJour(rdvs) {
  const places = []
  let grappe = []
  let finGrappe = -1
  const fermer = () => {
    const largeur = Math.max(...grappe.map((p) => p.colonne + 1))
    for (const p of grappe) p.colonnes = largeur
    grappe = []
  }
  for (const rdv of trierRdv(rdvs.filter((r) => r.heure))) {
    const debut = enMinutes(rdv.heure)
    if (grappe.length && debut >= finGrappe) {
      fermer()
      finGrappe = -1
    }
    let colonne = 0
    while (grappe.some((p) => p.colonne === colonne && p.fin > debut)) colonne++
    const place = { rdv, debut, fin: finDe(rdv), colonne, colonnes: 1 }
    grappe.push(place)
    places.push(place)
    finGrappe = Math.max(finGrappe, place.fin)
  }
  if (grappe.length) fermer()
  return places
}

// La couleur d'une personne : toujours la meme pour la meme personne, sur tous
// les telephones, sans rien avoir a enregistrer. Le patron garde le petrole de
// la marque - qui ne figure donc pas dans la liste, pour qu'aucun employe ne
// porte la meme couleur que lui.
const TONS = ['ardoise', 'prune', 'green', 'amber', 'red']

export function tonPersonne(id) {
  if (!id || id === 'admin') return 'accent'
  let somme = 0
  for (const c of String(id)) somme = (somme * 31 + c.charCodeAt(0)) >>> 0
  return TONS[somme % TONS.length]
}

/** Qui a des rendez-vous dans cette liste, par ordre alphabetique. */
export function personnesDe(rdvs) {
  const vues = new Map()
  for (const r of rdvs) {
    const id = r.pour?.id
    if (id && !vues.has(id)) vues.set(id, { id, nom: r.pour.nom || 'Sans nom' })
  }
  return [...vues.values()].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
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
// l'agenda du telephone la lit a l'heure du telephone, en Suisse. La fin vient
// de la duree saisie ; sans heure, c'est toute la journee.
function bornes(rdv) {
  const [a, m, j] = rdv.date.split('-').map(Number)
  if (!rdv.heure) {
    const fin = new Date(a, m - 1, j + 1)
    return { journee: true, debut: `${a}${deux(m)}${deux(j)}`, fin: isoDe(fin).replace(/-/g, '') }
  }
  const [h, mi] = rdv.heure.split(':').map(Number)
  const format = (d) => `${isoDe(d).replace(/-/g, '')}T${deux(d.getHours())}${deux(d.getMinutes())}00`
  return {
    journee: false,
    debut: format(new Date(a, m - 1, j, h, mi)),
    fin: format(new Date(a, m - 1, j, h, mi + dureeDe(rdv))),
  }
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
