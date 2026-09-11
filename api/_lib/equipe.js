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
const JOURNAL_MAX = 2000

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
  return { role: 'employe', id, nom: emp.nom }
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
export async function noterActivite(ident, { envoi = false } = {}) {
  if (!ident || !baseConfiguree()) return
  const cle = ident.role === 'admin' ? ADMIN : cleEmp(ident.id)
  await r('HSET', cle, 'vu', Date.now())
  if (envoi) await r('HINCRBY', cle, 'envois', 1)
}

export async function journaliser(entree) {
  if (!baseConfiguree()) return
  await r('LPUSH', JOURNAL, JSON.stringify({ date: Date.now(), ...entree }))
  await r('LTRIM', JOURNAL, 0, JOURNAL_MAX - 1)
}

export async function lireJournal(n = 300) {
  const lignes = (await r('LRANGE', JOURNAL, 0, n - 1)) ?? []
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

const nouvelId = () => Date.now().toString(36) + randomInt(36 ** 4).toString(36)

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

export async function ecrireCarnet(contacts) {
  if (!contacts.length) return
  await r('HSET', CARNET, ...contacts.flatMap((c) => [c.id, JSON.stringify(c)]))
}

// Le journal garde le nom : supprimer un employe n'efface pas ce qu'il a envoye.
export async function supprimerEmploye(id) {
  const e = await exiger(id)
  if (e.empreinte) await r('DEL', cleCode(e.empreinte))
  await r('DEL', cleEmp(id))
  await r('SREM', EMPLOYES, id)
}
