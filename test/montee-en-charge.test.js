// Ce qui tient quand l'equipe grandit : un telephone a jour ne recharge ni
// l'agenda ni le carnet, les rendez-vous anciens partent aux archives, l'index
// des sauvegardes reste leger, les essais de code en serie butent, la base est
// copiee chaque nuit, chacun garde sa couleur et le journal se lit par pages.

import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import * as E from '../api/_lib/equipe.js'
import { _brancherStockage } from '../api/_lib/stockage.js'
import agenda from '../api/agenda.js'
import carnet from '../api/carnet.js'
import sauvegarde from '../api/sauvegarde.js'
import admin from '../api/admin.js'
import copieBase, { cheminCopie } from '../api/sauvegarde-base.js'
import { retenirTons, tonPersonne, TONS } from '../src/agenda-outils.js'

// Imitation de Redis qui garde la trace des commandes recues.
function fauxRedis() {
  const kv = new Map()
  const h = (k) => kv.get(k) ?? kv.set(k, new Map()).get(k)
  const s = (k) => kv.get(k) ?? kv.set(k, new Set()).get(k)
  const l = (k) => kv.get(k) ?? kv.set(k, []).get(k)
  const commandes = []
  const executer = async ([cmd, k, ...a]) => {
    commandes.push(cmd)
    switch (cmd) {
      case 'GET': return typeof kv.get(k) === 'string' ? kv.get(k) : null
      case 'SET': if (a[1] === 'NX' && kv.has(k)) return null; kv.set(k, a[0]); return 'OK'
      case 'DEL': return kv.delete(k) ? 1 : 0
      case 'INCR': { const n = (Number(kv.get(k)) || 0) + 1; kv.set(k, String(n)); return n }
      case 'HSET': for (let i = 0; i < a.length; i += 2) h(k).set(a[i], a[i + 1]); return a.length / 2
      case 'HSETNX': if (h(k).has(a[0])) return 0; h(k).set(a[0], a[1]); return 1
      case 'HGET': return h(k).get(a[0]) ?? null
      case 'HDEL': return a.filter((f) => h(k).delete(f)).length
      case 'HGETALL': return kv.has(k) ? [...h(k)].flat() : []
      case 'SADD': s(k).add(a[0]); return 1
      case 'SMEMBERS': return [...s(k)]
      case 'LPUSH': l(k).unshift(a[0]); return l(k).length
      case 'LTRIM': kv.set(k, l(k).slice(Number(a[0]), Number(a[1]) + 1)); return 'OK'
      case 'LRANGE': {
        const fin = Number(a[1])
        return l(k).slice(Number(a[0]), fin < 0 ? l(k).length + fin + 1 : fin + 1)
      }
      default: throw new Error('commande non imitee : ' + cmd)
    }
  }
  executer.commandes = commandes
  return executer
}

let redis
let fichiers
const fauxStockage = () => ({
  put: async (chemin, contenu, o) => void fichiers.set(chemin, { contenu: Buffer.from(contenu), type: o.contentType }),
  get: async () => null,
  del: async (chemins) => [].concat(chemins).forEach((c) => fichiers.delete(c)),
  list: async ({ prefix }) => ({
    blobs: [...fichiers.keys()].filter((c) => c.startsWith(prefix)).map((pathname) => ({ pathname })),
    hasMore: false,
  }),
})

beforeEach(() => {
  process.env.APP_CODE = 'StessyOberli'
  process.env.KV_REST_API_URL = 'https://faux'
  process.env.KV_REST_API_TOKEN = 'faux'
  process.env.BLOB_READ_WRITE_TOKEN = 'faux'
  redis = fauxRedis()
  E._brancherBase(redis)
  fichiers = new Map()
  _brancherStockage(fauxStockage())
})

const ADMIN = 'stessyoberli'
const reponse = () => ({ statut: 0, corps: null, status(n) { this.statut = n; return this }, json(o) { this.corps = o; return this }, setHeader() {} })
const appel = async (handler, code, { corps, query } = {}) => {
  const res = reponse()
  await handler({ method: corps ? 'POST' : 'GET', headers: { 'x-app-code': code }, query, body: corps }, res)
  return res
}
// Le jour a Lausanne, a n jours d'aujourd'hui.
const jour = (n) => new Date(Date.now() + n * 86_400_000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Zurich' })
const rdv = (id, date, nom = 'Régie Duval') => ({ id, date, heure: '10:00', type: 'immeuble', client: { type: 'gerance', nom } })

describe("l'agenda d'une grande equipe", () => {
  test("un telephone a jour ne relit rien, un changement fait tout revenir", async () => {
    const premier = (await appel(agenda, ADMIN)).corps
    assert.ok(premier.version >= 1)

    const avant = redis.commandes.length
    const ensuite = await appel(agenda, ADMIN, { query: { v: String(premier.version) } })
    assert.deepEqual(ensuite.corps, { inchange: true, version: premier.version })
    assert.ok(!redis.commandes.slice(avant).includes('HGETALL'), "l'agenda ne doit pas etre relu")

    await appel(agenda, ADMIN, { corps: { action: 'enregistrer', rdv: rdv('r1', jour(1)) } })
    const apres = (await appel(agenda, ADMIN, { query: { v: String(premier.version) } })).corps
    assert.deepEqual(apres.rdvs.map((x) => x.id), ['r1'])
    assert.ok(apres.version > premier.version)
  })

  test('les rendez-vous de plus de deux mois partent aux archives, sans rien faire recharger', async () => {
    await E.ecrireAgenda([rdv('vieux', jour(-90), 'Ancien client'), rdv('r1', jour(1))])
    const lu = (await appel(agenda, ADMIN)).corps
    assert.deepEqual(lu.rdvs.map((x) => x.id), ['r1'])
    assert.equal((await E.lireAgenda()).has('vieux'), false)
    assert.equal((await E.lireArchivesAgenda()).get('vieux').client.nom, 'Ancien client')
    // Ranger aux archives ne change rien a ce que montrent les telephones.
    assert.equal((await appel(agenda, ADMIN, { query: { v: String(lu.version) } })).corps.inchange, true)
  })

  test("modifier ou marquer fait ne relit pas l'agenda entier", async () => {
    await appel(agenda, ADMIN, { corps: { action: 'enregistrer', rdv: rdv('r1', jour(1)) } })
    const avant = redis.commandes.length
    const fait = await appel(agenda, ADMIN, { corps: { action: 'statut', id: 'r1', statut: 'fait' } })
    assert.equal(fait.corps.rdv.statut, 'fait')
    assert.ok(!redis.commandes.slice(avant).includes('HGETALL'))
    assert.equal((await appel(agenda, ADMIN, { corps: { action: 'statut', id: 'inconnu', statut: 'fait' } })).statut, 404)
  })
})

describe("le carnet d'une grande equipe", () => {
  const vide = { contacts: [], supprimes: [] }

  test("un telephone a jour ne recoit pas le carnet une seconde fois", async () => {
    const { code } = await E.creerEmploye('Marc')
    await appel(carnet, ADMIN, { corps: { contacts: [{ id: 'a1', nom: 'Favre', maj: Date.now() - 10 }], supprimes: [] } })
    const relu = (await appel(carnet, ADMIN, { corps: vide })).corps
    assert.deepEqual(relu.contacts.map((c) => c.nom), ['Favre'])

    const avant = redis.commandes.length
    const rien = await appel(carnet, ADMIN, { corps: { ...vide, version: relu.version } })
    assert.deepEqual(rien.corps, { inchange: true, version: relu.version })
    assert.ok(!redis.commandes.slice(avant).includes('HGETALL'), 'le carnet ne doit pas etre relu')

    // Un collegue ajoute un client : la version avance, le carnet revient.
    await appel(carnet, code, { corps: { contacts: [{ id: 'b1', nom: 'Rochat', maj: Date.now() - 5 }], supprimes: [] } })
    const apres = (await appel(carnet, ADMIN, { corps: { ...vide, version: relu.version } })).corps
    assert.deepEqual(apres.contacts.map((c) => c.nom).sort(), ['Favre', 'Rochat'])
  })

  test('un telephone qui envoie quelque chose recoit toujours le carnet en retour', async () => {
    const { code } = await E.creerEmploye('Marc')
    await appel(carnet, ADMIN, { corps: { contacts: [{ id: 'a1', nom: 'Favre', maj: Date.now() - 10 }], supprimes: [] } })
    const { version } = (await appel(carnet, code, { corps: vide })).corps
    // La suppression d'un employe est ignoree : la fiche doit lui revenir.
    const r = (await appel(carnet, code, { corps: { contacts: [], supprimes: ['a1'], version } })).corps
    assert.deepEqual(r.contacts.map((c) => c.nom), ['Favre'])
  })
})

describe("l'index des sauvegardes", () => {
  const image = (texte) => `data:image/jpeg;base64,${Buffer.from(texte).toString('base64')}`
  const A = 'a'.repeat(24)
  const B = 'b'.repeat(24)

  test('ne porte plus la liste des photos, et un rapport supprime part en entier', async () => {
    await appel(sauvegarde, ADMIN, { corps: { action: 'photo', rapportId: 'rap1', cle: A, dataUrl: image('photo') } })
    // Deposee, puis jamais rattachee : le telephone a coupe au mauvais moment.
    await appel(sauvegarde, ADMIN, { corps: { action: 'photo', rapportId: 'rap1', cle: B, dataUrl: image('orpheline') } })
    const depot = await appel(sauvegarde, ADMIN, {
      corps: { action: 'rapport', rapport: { id: 'rap1', ref: 'AF-2026-001', photos: [{ id: 'p1', hOriginal: A, hImage: A }] }, obsoletes: [] },
    })
    assert.equal(depot.statut, 200)
    assert.equal((await E.lireSauvegarde('rap1')).fichiers, undefined)
    assert.equal((await E.lireSauvegarde('rap1')).nPhotos, 1)

    await appel(sauvegarde, ADMIN, { corps: { action: 'supprimer', ids: ['rap1'] } })
    assert.equal(fichiers.size, 0)
    assert.equal(await E.lireSauvegarde('rap1'), null)
  })

  test("une ancienne ligne qui portait ses photos ne les envoie plus aux telephones", async () => {
    await E.indexerSauvegarde({ id: 'ancien', ref: 'AF-2025-100', fichiers: [A, B], par: { id: 'admin', nom: 'Administrateur', role: 'admin' }, maj: 1 })
    const { sauvegardes } = (await appel(sauvegarde, ADMIN, { query: { liste: '1' } })).corps
    assert.equal(sauvegardes.length, 1)
    assert.equal(sauvegardes[0].ref, 'AF-2025-100')
    assert.equal('fichiers' in sauvegardes[0], false)
  })
})

describe('les essais de code en serie', () => {
  const requete = (code, ip) => ({ method: 'GET', headers: { 'x-app-code': code, 'x-real-ip': ip }, query: {} })

  test("apres trop de codes refuses, l'adresse attend - meme avec le bon code - et les autres non", async () => {
    for (let i = 0; i < E.ESSAIS_MAX; i++) assert.equal(await E.identifierRequete(requete(`faux${i}`, '203.0.113.7')), null)
    await assert.rejects(E.identifierRequete(requete(ADMIN, '203.0.113.7')), E.TropDEssais)
    assert.equal((await E.identifierRequete(requete(ADMIN, '198.51.100.2')))?.role, 'admin')

    const res = reponse()
    await agenda(requete(ADMIN, '203.0.113.7'), res)
    assert.equal(res.statut, 429)
  })

  test("un bon code ne compte jamais, et une base en panne ne bloque pas l'administrateur", async () => {
    for (let i = 0; i < E.ESSAIS_MAX + 5; i++) assert.equal((await E.identifierRequete(requete(ADMIN, '203.0.113.9')))?.role, 'admin')
    E._brancherBase(async () => {
      throw new Error('base en panne')
    })
    assert.equal((await E.identifierRequete(requete(ADMIN, '203.0.113.7')))?.role, 'admin')
  })
})

describe('la copie de nuit de la base', () => {
  test('depose une copie par nuit, complete, sans aucun code en clair', async () => {
    const { code } = await E.creerEmploye('Marc')
    await E.ecrireAgenda([rdv('r1', jour(1))])
    await E.ecrireCarnet([{ id: 'a1', nom: 'Favre', maj: 1 }])

    const r = await appel(copieBase, '')
    assert.equal(r.statut, 200)
    const brut = fichiers.get(cheminCopie(r.corps.jour)).contenu.toString()
    const copie = JSON.parse(brut)
    assert.equal(copie.employes[0].nom, 'Marc')
    assert.ok(copie.employes[0].empreinte, "l'empreinte du code, pour le reconstruire")
    assert.ok(copie.agenda.r1)
    assert.ok(copie.carnet.a1)
    assert.equal(brut.includes(code), false, 'aucun code en clair dans la copie')

    // Appelee une seconde fois la meme nuit : rien de plus.
    assert.equal((await appel(copieBase, '')).corps.deja, true)
    assert.ok((await E.derniereCopie()) > 0)
  })

  test("la copie d'il y a trente jours s'efface", async () => {
    const vieille = cheminCopie(jour(-30))
    fichiers.set(vieille, { contenu: Buffer.from('{}'), type: 'application/json' })
    await appel(copieBase, '')
    assert.equal(fichiers.has(vieille), false)
  })
})

describe('douze couleurs pour une grande equipe', () => {
  test('chacun recoit la teinte la moins portee, puis la garde', async () => {
    const ids = Array.from({ length: 12 }, (_, i) => `e${i}`)
    const tons = await E.tonsDe(ids)
    assert.equal(new Set(Object.values(tons)).size, 12, 'douze personnes, douze teintes')
    const encore = await E.tonsDe(['e3', 'e12', 'admin'])
    assert.equal(encore.e3, tons.e3)
    assert.equal('admin' in encore, false)
    assert.ok(Number.isInteger(encore.e12) && encore.e12 < E.NB_TONS)
    assert.equal(TONS.length, E.NB_TONS)
  })

  test("l'agenda donne a chaque telephone la couleur des personnes qu'il montre", async () => {
    await appel(agenda, ADMIN, { corps: { action: 'enregistrer', rdv: { ...rdv('r1', jour(1)), pour: { id: 'e1', nom: 'Luc' } } } })
    await appel(agenda, ADMIN, { corps: { action: 'enregistrer', rdv: { ...rdv('r2', jour(1)), pour: { id: 'e2', nom: 'Sophie' } } } })
    const { tons } = (await appel(agenda, ADMIN)).corps
    assert.deepEqual(Object.keys(tons).sort(), ['e1', 'e2'])
    assert.notEqual(tons.e1, tons.e2)

    retenirTons(tons)
    assert.equal(tonPersonne('e1'), TONS[tons.e1])
    assert.notEqual(tonPersonne('e1'), tonPersonne('e2'))
    assert.equal(tonPersonne('admin'), 'accent')
    assert.ok(TONS.includes(tonPersonne('inconnu')))
  })
})

describe("le journal d'une grande equipe", () => {
  test('garde bien plus que quelques semaines, et se lit page apres page', async () => {
    for (let i = 0; i < 650; i++) await E.journaliser({ qui: 'Marc', role: 'employe', statut: 'envoye', ref: `AF-${i}` })
    const premiere = (await appel(admin, ADMIN)).corps.journal
    assert.equal(premiere.length, 300)
    assert.equal(premiere[0].ref, 'AF-649')
    const suite = (await appel(admin, ADMIN, { query: { journal: '300' } })).corps.journal
    assert.deepEqual([suite.length, suite[0].ref], [300, 'AF-349'])
    const fin = (await appel(admin, ADMIN, { query: { journal: '600' } })).corps.journal
    assert.deepEqual([fin.length, fin.at(-1).ref], [50, 'AF-0'])
  })
})
