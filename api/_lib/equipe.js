// Equipe et journal, cote serveur : qui a le droit d'utiliser l'app, et ce qui
// a ete envoye. Stocke dans une petite base Redis (Upstash, branchee depuis le
// Marketplace Vercel), jointe en HTTP - aucune dependance a installer.
//
// Le dossier commence par "_" : Vercel n'en fait pas une adresse publique.
//
// Deux sortes de codes :
//   - APP_CODE (variable Vercel) : le code administrateur. Il ouvre tout, y
//     compris l'onglet Administration, et ne depend pas de la base : si elle
//     tombe, l'administrateur garde la main.
//   - les codes des employes, crees depuis l'onglet Administration. Ils ne sont
//     jamais stockes en clair, seulement leur empreinte (SHA-256) : une fuite de
//     la base ne donne aucun code utilisable.

import { createHash, randomInt } from 'node:crypto'
import { jourSuisse } from './agenda.js'

const urlBase = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
const jeton = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN

export const baseConfiguree = () => !!(urlBase() && jeton())

// Client Redis minimal : une commande = un POST sur l'API REST d'Upstash.
let executer = async (commande) => {
  const res = await fetch(urlBase(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${jeton()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commande),
  })
  const data = await res.json()
  if (data.error) throw new Error(`Redis : ${data.error}`)
  return data.result
}
/** Remplace la base par une imitation en memoire. Tests uniquement. */
export const _brancherBase = (fn) => {
  executer = fn
}
const r = (...commande) => executer(commande.map(String))

export class Erreur400 extends Error {}

// Meme regle que partout ailleurs : espaces autour ignores, casse indifferente
// (le champ du telephone coupe la majuscule automatique).
export const normaliser = (v) => String(v ?? '').trim().toLowerCase()
const empreinte = (code) => createHash('sha256').update(normaliser(code)).digest('hex')

// Sans les caracteres qui se confondent a l'ecran ou a l'oral (0/o, 1/l/i) :
// un code se dicte au telephone a un employe.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
export function genererCode() {
  let c = ''
  for (let i = 0; i < 8; i++) c += ALPHABET[randomInt(ALPHABET.length)]
  return c
}

const cleEmp = (id) => `af:emp:${id}`
const cleCode = (h) => `af:code:${h}`
const EMPLOYES = 'af:emps'
const ADMIN = 'af:admin'
const JOURNAL = 'af:journal'
// De quoi retrouver un envoi de l'annee, meme a dix techniciens.
const JOURNAL_MAX = 10000
// Les envois partis, ranges aussi par mois et sans limite : c'est ce que relit
// l'export de facturation (voir api/_lib/export.js).
const ENVOIS = (mois) => `af:envois:${mois}`
const MOIS_ENVOIS = 'af:envois:mois'

// HGETALL rend une liste a plat [cle1, valeur1, cle2, valeur2...].
const enObjet = (plat) => {
  const o = {}
  for (let i = 0; i + 1 < (plat?.length ?? 0); i += 2) o[plat[i]] = plat[i + 1]
  return o
}

async function lireEmploye(id) {
  const o = enObjet(await r('HGETALL', cleEmp(id)))
  return Object.keys(o).length ? { id, ...o } : null
}

/**
 * Qui se cache derriere ce code ?
 * @returns {Promise<null | {role: 'admin'|'employe', id?: string, nom: string}>}
 */
export async function identifier(code) {
  const saisi = normaliser(code)
  if (!saisi) return null
  if (process.env.APP_CODE && saisi === normaliser(process.env.APP_CODE)) {
    return { role: 'admin', nom: 'Administrateur' }
  }
  if (!baseConfiguree()) return null
  const id = await r('GET', cleCode(empreinte(saisi)))
  if (!id) return null
  const emp = await lireEmploye(id)
  if (!emp || emp.actif !== '1') return null
  // Invite : l'acces s'arrete tout seul a la date prevue.
  if (emp.fin && Date.now() > Number(emp.fin)) return null
  if (emp.invite === '1') return { role: 'invite', id, nom: emp.nom, fin: Number(emp.fin) || null }
  // Un employe a qui le code principal a donne l'acces administrateur.
  if (emp.admin === '1') return { role: 'admin', id, nom: emp.nom }
  return { role: 'employe', id, nom: emp.nom }
}

/**
 * Le titulaire du code principal (APP_CODE) : le seul administrateur sans fiche
 * d'employe. Lui seul donne ou retire l'acces administrateur, et gere les
 * comptes des autres administrateurs - sans quoi l'un d'eux pourrait se faire
 * donner le code d'un autre, ou l'ecarter.
 */
export const estTitulaire = (ident) => ident?.role === 'admin' && !ident.id

// --- essais de code en serie ---------------------------------------------------
// Chaque adresse de reseau a droit a ESSAIS_MAX codes refuses par quart d'heure.
// Au-dela, plus rien ne passe depuis elle - un bon code non plus : sinon la
// difference entre un refus et un blocage dirait a qui essaie en boucle qu'il
// est tombe juste. Une equipe entiere derriere le meme wifi reste tres loin du
// plafond ; un programme qui essaie des codes l'atteint en quelques secondes.
export const ESSAIS_MAX = 50
const ESSAIS_FENETRE = 15 * 60

export class TropDEssais extends Error {
  constructor() {
    super('Trop de codes refusés depuis ce réseau. Réessayez dans un quart d’heure.')
  }
}

// Vercel pose lui-meme ces en-tetes : un appareil ne peut pas s'en inventer.
const adresseDe = (req) =>
  String(req.headers?.['x-real-ip'] || req.headers?.['x-forwarded-for'] || 'inconnue').split(',')[0].trim()
// L'adresse ne s'ecrit pas en clair dans la base.
const cleEssais = (req) => `af:essais:${createHash('sha256').update(adresseDe(req)).digest('hex').slice(0, 24)}`

/**
 * Qui se cache derriere le code de cette requete, avec le frein aux essais en
 * serie. Un compteur injoignable ne bloque personne : si la base tombe, le code
 * administrateur doit continuer d'ouvrir l'app.
 * @throws {TropDEssais} quand l'adresse a epuise ses essais
 */
export async function identifierRequete(req) {
  const cle = baseConfiguree() ? cleEssais(req) : null
  if (cle && Number(await r('GET', cle).catch(() => 0)) >= ESSAIS_MAX) throw new TropDEssais()
  const ident = await identifier(req.headers?.['x-app-code'])
  if (!ident && cle) {
    try {
      // Cree avec son delai d'expiration, puis compte : un compteur ne peut pas
      // rester sans fin de vie si la seconde commande echoue.
      await r('SET', cle, '0', 'NX', 'EX', ESSAIS_FENETRE)
      await r('INCR', cle)
    } catch {
      // Compteur indisponible : le refus reste un refus, sans plus.
    }
  }
  return ident
}

/**
 * Pour un code refuse, un motif plus parlant que "code invalide" quand on en a
 * un : acces retire, ou invite arrive a sa date de fin. Sinon null.
 */
export async function pourquoiRefuse(code) {
  const saisi = normaliser(code)
  if (!saisi || !baseConfiguree()) return null
  const id = await r('GET', cleCode(empreinte(saisi)))
  if (!id) return null
  const emp = await lireEmploye(id)
  if (!emp) return null
  if (emp.actif !== '1') return 'Accès retiré par l’administrateur.'
  if (emp.fin && Date.now() > Number(emp.fin)) {
    const jour = new Date(Number(emp.fin)).toLocaleDateString('fr-CH', {
      day: 'numeric',
      month: 'long',
      timeZone: 'Europe/Zurich',
    })
    return `Accès invité terminé le ${jour}.`
  }
  return null
}

/** Note une ouverture de l'app, et le cas echeant un rapport parti. */
export async function noterActivite(ident, { envoi = false, vu = true } = {}) {
  if (!ident || !baseConfiguree()) return
  // Le titulaire du code principal n'a pas de fiche : son activite a sa propre cle.
  const cle = ident.id ? cleEmp(ident.id) : ADMIN
  if (vu) await r('HSET', cle, 'vu', Date.now())
  if (envoi) await r('HINCRBY', cle, 'envois', 1)
}

export async function journaliser(entree) {
  if (!baseConfiguree()) return
  const ligne = { date: Date.now(), ...entree }
  const json = JSON.stringify(ligne)
  await r('LPUSH', JOURNAL, json)
  await r('LTRIM', JOURNAL, 0, JOURNAL_MAX - 1)
  if (ligne.statut === 'envoye') {
    const mois = jourSuisse(ligne.date).slice(0, 7)
    await r('RPUSH', ENVOIS(mois), json)
    await r('SADD', MOIS_ENVOIS, mois)
  }
}

/** Les envois partis dans un mois (AAAA-MM), du plus ancien au plus recent. */
export async function lireEnvoisDuMois(mois) {
  return ((await r('LRANGE', ENVOIS(mois), 0, -1)) ?? []).map(lireJson).filter(Boolean)
}

/** `n` lignes du journal, de la plus recente a la plus ancienne, a partir de la `depuis`-ieme. */
export async function lireJournal(n = 300, depuis = 0) {
  const lignes = (await r('LRANGE', JOURNAL, depuis, depuis + n - 1)) ?? []
  return lignes
    .map((l) => {
      try {
        return JSON.parse(l)
      } catch {
        return null
      }
    })
    .filter(Boolean)
}

export async function listerEmployes() {
  const ids = (await r('SMEMBERS', EMPLOYES)) ?? []
  const emps = (await Promise.all(ids.map(lireEmploye))).filter(Boolean)
  const admin = enObjet(await r('HGETALL', ADMIN))
  return {
    admin: { vu: Number(admin.vu) || null, envois: Number(admin.envois) || 0 },
    employes: emps
      .map((e) => ({
        id: e.id,
        nom: e.nom,
        actif: e.actif === '1',
        cree: Number(e.cree) || null,
        vu: Number(e.vu) || null,
        envois: Number(e.envois) || 0,
        invite: e.invite === '1',
        admin: e.admin === '1',
        fin: Number(e.fin) || null,
        expire: !!(Number(e.fin) && Date.now() > Number(e.fin)),
      }))
      .sort((a, b) => a.nom.localeCompare(b.nom)),
  }
}

// Un code neuf, unique, qui ne soit pas le code administrateur. L'ancien code
// de l'employe, s'il en avait un, cesse de fonctionner dans le meme geste.
async function poserCode(id) {
  for (let essai = 0; essai < 20; essai++) {
    const code = genererCode()
    if (process.env.APP_CODE && code === normaliser(process.env.APP_CODE)) continue
    const h = empreinte(code)
    if ((await r('SET', cleCode(h), id, 'NX')) !== 'OK') continue
    const ancien = (await lireEmploye(id))?.empreinte
    if (ancien) await r('DEL', cleCode(ancien))
    await r('HSET', cleEmp(id), 'empreinte', h)
    return code
  }
  throw new Error('Impossible de générer un code unique')
}

async function exiger(id) {
  const e = await lireEmploye(String(id ?? ''))
  if (!e) throw new Erreur400('Employé introuvable')
  return e
}

export const nouvelId = () => Date.now().toString(36) + randomInt(36 ** 4).toString(36)

// Date de fin d'un invite : dans le futur, et pas au-dela de deux ans.
const DEUX_ANS = 2 * 365 * 24 * 60 * 60 * 1000
function validerFin(fin) {
  if (fin === undefined || fin === null || fin === '') return null
  const n = Number(fin)
  if (!Number.isFinite(n) || n <= Date.now()) throw new Erreur400('La date de fin doit être dans le futur')
  if (n > Date.now() + DEUX_ANS) throw new Erreur400('Date de fin trop lointaine : deux ans au plus')
  return n
}

/**
 * Cree un employe, ou un invite quand une date de fin est donnee : sous-traitant,
 * interimaire - son acces s'arrete tout seul ce jour-la.
 */
export async function creerEmploye(nom, { fin } = {}) {
  const propre = String(nom ?? '').trim().slice(0, 60)
  if (!propre) throw new Erreur400('Indiquez le nom de l’employé')
  const finOk = validerFin(fin)
  const id = nouvelId()
  const champs = ['nom', propre, 'actif', '1', 'cree', Date.now()]
  if (finOk) champs.push('invite', '1', 'fin', finOk)
  await r('HSET', cleEmp(id), ...champs)
  await r('SADD', EMPLOYES, id)
  return { id, nom: propre, code: await poserCode(id), fin: finOk }
}

/** Prolonge (ou avance) la fin d'acces d'un invite. */
export async function changerFin(id, fin) {
  const e = await exiger(id)
  if (e.invite !== '1') throw new Erreur400('Seul un invité a une date de fin')
  const n = validerFin(fin)
  if (!n) throw new Erreur400('Indiquez une date de fin')
  await r('HSET', cleEmp(id), 'fin', n)
}

export async function nouveauCode(id) {
  await exiger(id)
  return { code: await poserCode(id) }
}

export async function changerStatut(id, actif) {
  await exiger(id)
  await r('HSET', cleEmp(id), 'actif', actif ? '1' : '0')
}

/** Donne ou retire l'acces administrateur. Un invite n'y a pas droit : son acces s'arrete a une date. */
export async function changerAdministrateur(id, oui) {
  const e = await exiger(id)
  if (oui && e.invite === '1') throw new Erreur400('Un invité ne peut pas être administrateur')
  await r('HSET', cleEmp(id), 'admin', oui ? '1' : '0')
}

/** Vrai si cette fiche porte l'acces administrateur. */
export const estAdministrateur = async (id) => (await lireEmploye(String(id ?? '')))?.admin === '1'

// --- numeros de rapport ------------------------------------------------------
// Chaque telephone numerotait de son cote : deux techniciens sortaient chacun
// leur AF-00012. Le serveur tient maintenant le compteur de toute l'equipe et
// distribue les numeros par lots ; un telephone garde son lot d'avance et
// numerote hors ligne sans rien demander.
const COMPTEUR_REF = 'af:ref'
export const LOT_NUMEROS = 10

// En une seule operation atomique : le compteur remonte d'abord au plus haut
// numero deja utilise sur le telephone qui demande (les numeros d'avant le
// compteur commun ne doivent jamais ressortir), puis avance d'un lot. Deux
// telephones qui demandent au meme instant recoivent deux lots distincts.
const SCRIPT_LOT =
  "local c = tonumber(redis.call('GET', KEYS[1]) or '0') " +
  'local m = tonumber(ARGV[1]) ' +
  "if m > c then redis.call('SET', KEYS[1], m) end " +
  "return redis.call('INCRBY', KEYS[1], ARGV[2])"

/** @returns {Promise<{debut: number, fin: number}>} un lot de numeros propre a ce telephone */
export async function reserverNumeros(plusHaut) {
  const m = Math.max(0, Math.min(99_000, Math.floor(Number(plusHaut) || 0)))
  const fin = Number(await r('EVAL', SCRIPT_LOT, 1, COMPTEUR_REF, m, LOT_NUMEROS))
  return { debut: fin - LOT_NUMEROS + 1, fin }
}

// --- sauvegarde en ligne : l'index ---------------------------------------------
// Les fichiers vivent dans Vercel Blob (voir stockage.js) ; l'index, lui, dit
// quels rapports sont sauvegardes, a qui ils appartiennent et quels fichiers
// les composent. Il se lit en une commande, sans parcourir le stockage.
const SAUVEGARDES = 'af:sauvegardes'

const lireJson = (json) => {
  try {
    return json ? JSON.parse(json) : null
  } catch {
    return null
  }
}

export async function lireSauvegardes() {
  return Object.values(enObjet(await r('HGETALL', SAUVEGARDES))).map(lireJson).filter(Boolean)
}

export const lireSauvegarde = async (id) => lireJson(await r('HGET', SAUVEGARDES, id))
export const indexerSauvegarde = (entree) => r('HSET', SAUVEGARDES, entree.id, JSON.stringify(entree))
export const retirerSauvegarde = (id) => r('HDEL', SAUVEGARDES, id)

// --- rapports d'invites a valider ------------------------------------------------
// Un invite (sous-traitant, interimaire) ne parle pas au client au nom de la
// maison sans que l'administrateur ait relu : sa demande d'envoi attend ici, et
// son PDF dans le stockage prive (voir api/send.js et api/admin.js).
// Un hash : id de la demande -> demande en JSON.
const VALIDATIONS = 'af:validations'

export const lireValidations = async () =>
  Object.values(enObjet(await r('HGETALL', VALIDATIONS))).map(lireJson).filter(Boolean)
export const lireValidation = async (id) => lireJson(await r('HGET', VALIDATIONS, id))
export const ecrireValidation = (v) => r('HSET', VALIDATIONS, v.id, JSON.stringify(v))
export const retirerValidation = (id) => r('HDEL', VALIDATIONS, id)

// --- agenda de l'equipe ------------------------------------------------------
// Un hash : id du rendez-vous -> rendez-vous en JSON. Il ne garde que ce qui
// sert encore - les deux derniers mois et tout ce qui vient ; le reste part aux
// archives, qu'aucun telephone ne relit. Sans cela, dix techniciens remplissent
// en un an un agenda que chaque ouverture de l'app relirait en entier.
//
// La version avance a chaque ecriture : un telephone qui la connait deja n'a
// rien a recharger, et la plupart des ouvertures s'arretent la.
const AGENDA = 'af:agenda'
const AGENDA_ARCHIVES = 'af:agenda:archives'
const AGENDA_VERSION = 'af:agenda:version'
// L'archivage d'une annee entiere passe en quelques paquets plutot qu'en une
// seule requete geante.
const PAQUET = 500

const enMap = (plat) => {
  const m = new Map()
  for (const [id, json] of Object.entries(enObjet(plat))) {
    const x = lireJson(json)
    // Une entree illisible est ignoree plutot que de bloquer tout l'agenda.
    if (x) m.set(id, x)
  }
  return m
}

export const lireAgenda = async () => enMap(await r('HGETALL', AGENDA))
export const lireRdv = async (id) => lireJson(await r('HGET', AGENDA, id))
export const lireArchivesAgenda = async () => enMap(await r('HGETALL', AGENDA_ARCHIVES))

export const versionAgenda = () => lireVersion(AGENDA_VERSION)

export async function ecrireAgenda(rdvs) {
  if (!rdvs.length) return
  await r('HSET', AGENDA, ...rdvs.flatMap((x) => [x.id, JSON.stringify(x)]))
  await r('INCR', AGENDA_VERSION)
}

export async function retirerDeAgenda(id) {
  await r('HDEL', AGENDA, id)
  await r('INCR', AGENDA_VERSION)
}

/**
 * Range aux archives les rendez-vous d'avant `avant` (AAAA-MM-JJ), et les retire
 * de `agenda`. La version ne bouge pas : aucun telephone ne les montrait plus.
 * @returns {Promise<number>} combien sont partis
 */
export async function archiverAgenda(agenda, avant) {
  const vieux = [...agenda.values()].filter((x) => String(x.date ?? '') < avant)
  for (let i = 0; i < vieux.length; i += PAQUET) {
    const lot = vieux.slice(i, i + PAQUET)
    await r('HSET', AGENDA_ARCHIVES, ...lot.flatMap((x) => [x.id, JSON.stringify(x)]))
    await r('HDEL', AGENDA, ...lot.map((x) => x.id))
  }
  for (const x of vieux) agenda.delete(x.id)
  return vieux.length
}

// --- carnet commun -----------------------------------------------------------
// Un seul hash : id du contact -> contact en JSON. Un contact supprime y reste
// sous forme de pierre tombale ({id, supprime, maj}) : sans elle, le telephone
// d'un collegue qui l'avait encore le renverrait au prochain passage.
const CARNET = 'af:carnet'

export async function lireCarnet() {
  const o = enObjet(await r('HGETALL', CARNET))
  const carnet = new Map()
  for (const [id, json] of Object.entries(o)) {
    try {
      carnet.set(id, JSON.parse(json))
    } catch {
      // Une entree illisible est ignoree plutot que de bloquer tout le carnet.
    }
  }
  return carnet
}

// Comme l'agenda : la version avance a chaque ecriture, et un telephone qui la
// connait deja n'a rien a recevoir.
const CARNET_VERSION = 'af:carnet:version'

/** Une version, posee a 1 la premiere fois pour que les telephones puissent la retenir. */
async function lireVersion(cle) {
  const v = Number(await r('GET', cle)) || 0
  if (v) return v
  await r('SET', cle, '1', 'NX')
  return Number(await r('GET', cle)) || 1
}

export const versionCarnet = () => lireVersion(CARNET_VERSION)

export async function ecrireCarnet(contacts) {
  if (!contacts.length) return
  await r('HSET', CARNET, ...contacts.flatMap((c) => [c.id, JSON.stringify(c)]))
  await r('INCR', CARNET_VERSION)
}

// Le journal garde le nom : supprimer un employe n'efface pas ce qu'il a envoye.
export async function supprimerEmploye(id) {
  const e = await exiger(id)
  if (e.empreinte) await r('DEL', cleCode(e.empreinte))
  await r('DEL', cleEmp(id))
  await r('SREM', EMPLOYES, id)
}

// --- copie de la base, chaque nuit ----------------------------------------------
// Voir api/sauvegarde-base.js. Le verrou fait qu'une nuit ne donne qu'une copie,
// qui que ce soit qui appelle l'adresse.
const COPIE_VERROU = 'af:copie:verrou'
const COPIE_DATE = 'af:copie:date'

export const reserverCopie = async () => (await r('SET', COPIE_VERROU, '1', 'NX', 'EX', 20 * 3600)) === 'OK'
export const libererCopie = () => r('DEL', COPIE_VERROU)
export const noterCopie = (ms) => r('SET', COPIE_DATE, String(ms))
export const derniereCopie = async () => Number(await r('GET', COPIE_DATE)) || null

/**
 * Tout ce que l'equipe perdrait avec la base, de quoi la reconstruire : l'equipe
 * (les codes n'y sont qu'en empreinte), l'agenda et ses archives, le carnet,
 * l'index des sauvegardes, les demandes a valider, le journal et le compteur
 * des numeros de rapport.
 */
export async function exporterBase() {
  const hash = async (cle) => enObjet(await r('HGETALL', cle))
  const ids = (await r('SMEMBERS', EMPLOYES)) ?? []
  return {
    format: 1,
    date: Date.now(),
    employes: (await Promise.all(ids.map(lireEmploye))).filter(Boolean),
    admin: await hash(ADMIN),
    compteurRef: await r('GET', COMPTEUR_REF),
    agenda: await hash(AGENDA),
    archivesAgenda: await hash(AGENDA_ARCHIVES),
    carnet: await hash(CARNET),
    sauvegardes: await hash(SAUVEGARDES),
    validations: await hash(VALIDATIONS),
    tons: await hash(TEINTES),
    envois: Object.fromEntries(
      await Promise.all(((await r('SMEMBERS', MOIS_ENVOIS)) ?? []).map(async (m) => [m, (await r('LRANGE', ENVOIS(m), 0, -1)) ?? []]))
    ),
    journal: (await r('LRANGE', JOURNAL, 0, -1)) ?? [],
  }
}

// --- la couleur de chacun ---------------------------------------------------------
// Un hash : id de la personne -> numero de teinte (voir TONS dans
// src/agenda-outils.js). Attribuee la premiere fois que la personne apparait
// dans l'agenda - la moins portee du moment - puis gardee.
const TEINTES = 'af:tons'
export const NB_TONS = 12

/** @returns {Promise<Record<string, number>>} la teinte de chacune de ces personnes */
export async function tonsDe(ids) {
  const uniques = [...new Set(ids.filter((id) => id && id !== 'admin'))]
  if (!uniques.length) return {}
  const tous = enObjet(await r('HGETALL', TEINTES))
  for (const id of uniques) {
    if (tous[id] !== undefined) continue
    const portes = new Array(NB_TONS).fill(0)
    for (const v of Object.values(tous)) portes[Number(v) % NB_TONS]++
    const ton = portes.indexOf(Math.min(...portes))
    // Deux telephones qui la demandent au meme instant repartent avec la meme.
    if (Number(await r('HSETNX', TEINTES, id, ton)) === 1) tous[id] = String(ton)
    else tous[id] = await r('HGET', TEINTES, id)
  }
  return Object.fromEntries(uniques.map((id) => [id, (Number(tous[id]) || 0) % NB_TONS]))
}
