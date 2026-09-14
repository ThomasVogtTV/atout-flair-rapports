// Plusieurs administrateurs, et l'export de facturation des envois.
//
// Le titulaire du code principal donne l'acces administrateur ; un administrateur
// nomme gere l'equipe, mais pas les comptes des autres administrateurs. Chaque
// mois, les envois partis s'exportent en CSV pour le tableur.
import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import * as E from '../api/_lib/equipe.js'
import { _brancherStockage } from '../api/_lib/stockage.js'
import { _brancherMail } from '../api/_lib/mail.js'
import { envoisDuMois, enCsv, COLONNES } from '../api/_lib/export.js'
import envoi from '../api/send.js'
import admin from '../api/admin.js'
import agenda from '../api/agenda.js'
import verification from '../api/check-code.js'

function fauxRedis() {
  const kv = new Map()
  const h = (k) => kv.get(k) ?? kv.set(k, new Map()).get(k)
  const s = (k) => kv.get(k) ?? kv.set(k, new Set()).get(k)
  const l = (k) => kv.get(k) ?? kv.set(k, []).get(k)
  return async ([cmd, k, ...a]) => {
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
      case 'HINCRBY': { const v = Number(h(k).get(a[0]) ?? 0) + Number(a[1]); h(k).set(a[0], String(v)); return v }
      case 'SADD': s(k).add(a[0]); return 1
      case 'SREM': return s(k).delete(a[0]) ? 1 : 0
      case 'SMEMBERS': return [...s(k)]
      case 'LPUSH': l(k).unshift(a[0]); return l(k).length
      case 'RPUSH': l(k).push(a[0]); return l(k).length
      case 'LTRIM': kv.set(k, l(k).slice(Number(a[0]), Number(a[1]) + 1)); return 'OK'
      case 'LRANGE': {
        const fin = Number(a[1])
        return l(k).slice(Number(a[0]), fin < 0 ? l(k).length + fin + 1 : fin + 1)
      }
      default: throw new Error('commande non imitee : ' + cmd)
    }
  }
}

let fichiers
let mails
const fauxStockage = () => ({
  put: async (chemin, contenu, o) => void fichiers.set(chemin, { contenu: Buffer.from(contenu), type: o.contentType }),
  get: async (chemin) => {
    const f = fichiers.get(chemin)
    return f ? { stream: new Blob([f.contenu]).stream(), blob: { contentType: f.type } } : null
  },
  del: async (chemins) => [].concat(chemins).forEach((c) => fichiers.delete(c)),
  list: async ({ prefix }) => ({ blobs: [...fichiers.keys()].filter((c) => c.startsWith(prefix)).map((pathname) => ({ pathname })), hasMore: false }),
})

const appel = async (handler, code, { methode = 'POST', corps, query = {} } = {}) => {
  const res = { statut: 0, corps: null, status(n) { this.statut = n; return this }, json(o) { this.corps = o; return this }, setHeader() {} }
  await handler({ method: methode, headers: { 'x-app-code': code }, body: corps, query }, res)
  return res
}

const ADMIN = 'stessyoberli'
const PDF = Buffer.from('%PDF-1.4 rapport de test').toString('base64')
const demande = () => ({
  to: 'regie@exemple.ch',
  cc: '',
  subject: 'Rapport AF-00042',
  body: 'Bonjour',
  filename: 'AF-00042.pdf',
  pdfBase64: PDF,
  meta: { ref: 'AF-00042', type: 'detection', client: 'Régie Duval', adresse: 'Rue du Lac 12', rapportId: 'r42', envoiId: 'e42' },
})
// Le mois et le jour de demain, a Lausanne.
const moisSuisse = (ms) => new Date(ms).toLocaleDateString('sv-SE', { timeZone: 'Europe/Zurich' }).slice(0, 7)
const demain = () => new Date(Date.now() + 86_400_000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Zurich' })

beforeEach(() => {
  Object.assign(process.env, {
    APP_CODE: 'StessyOberli',
    KV_REST_API_URL: 'https://faux',
    KV_REST_API_TOKEN: 'faux',
    BLOB_READ_WRITE_TOKEN: 'faux',
    SMTP_HOST: 'smtp.faux',
    SMTP_PORT: '587',
    SMTP_USER: 'info@atout-flair.ch',
    SMTP_PASS: 'faux',
  })
  delete process.env.MAIL_OFF
  E._brancherBase(fauxRedis())
  fichiers = new Map()
  mails = []
  _brancherStockage(fauxStockage())
  _brancherMail(async (m) => {
    mails.push(m)
    return { messageId: `faux-${mails.length}` }
  })
})

const donnerAcces = (id, oui = true) => appel(admin, ADMIN, { corps: { action: 'administrateur', id, oui } })

describe('plusieurs administrateurs', () => {
  test("le code principal donne l'acces ; l'administrateur nomme gere l'equipe, pas les autres administrateurs", async () => {
    const marie = await E.creerEmploye('Marie')
    const luc = await E.creerEmploye('Luc')
    const paul = await E.creerEmploye('Paul')

    assert.equal((await donnerAcces(marie.id)).statut, 200)
    assert.deepEqual(await E.identifier(marie.code), { role: 'admin', id: marie.id, nom: 'Marie' })

    const vu = await appel(admin, marie.code, { methode: 'GET' })
    assert.equal(vu.statut, 200)
    assert.equal(vu.corps.titulaire, false)
    assert.equal(vu.corps.employes.find((e) => e.id === marie.id).admin, true)
    assert.equal((await appel(admin, ADMIN, { methode: 'GET' })).corps.titulaire, true)

    // Elle gere l'equipe...
    assert.equal((await appel(admin, marie.code, { corps: { action: 'creer', nom: 'Nouveau' } })).statut, 200)
    assert.equal((await appel(admin, marie.code, { corps: { action: 'revoquer', id: luc.id } })).statut, 200)
    // ... mais ne donne pas l'acces, et ne touche pas au compte d'un autre administrateur.
    assert.equal((await appel(admin, marie.code, { corps: { action: 'administrateur', id: luc.id, oui: true } })).statut, 403)
    await donnerAcces(paul.id)
    for (const action of ['nouveau-code', 'revoquer', 'supprimer']) {
      assert.equal((await appel(admin, marie.code, { corps: { action, id: paul.id } })).statut, 403, action)
    }
    assert.equal((await E.identifier(paul.code))?.role, 'admin')

    // Le titulaire retire l'acces : elle redevient employee, et l'onglet se ferme.
    await donnerAcces(marie.id, false)
    assert.equal((await E.identifier(marie.code))?.role, 'employe')
    assert.equal((await appel(admin, marie.code, { methode: 'GET' })).statut, 403)
  })

  test("un invite ne devient pas administrateur, et un employe ne se donne pas l'acces", async () => {
    const invite = await E.creerEmploye('Sous-traitant', { fin: Date.now() + 86_400_000 })
    assert.equal((await donnerAcces(invite.id)).statut, 400)
    const luc = await E.creerEmploye('Luc')
    assert.equal((await appel(admin, luc.code, { corps: { action: 'administrateur', id: luc.id, oui: true } })).statut, 403)
    assert.equal((await E.identifier(luc.code))?.role, 'employe')
  })

  test("le journal, l'agenda et l'activite disent quel administrateur a agi", async () => {
    const marie = await E.creerEmploye('Marie')
    await donnerAcces(marie.id)
    const invite = await E.creerEmploye('Sous-traitant', { fin: Date.now() + 86_400_000 })

    // Son code la designe, elle, avec son role.
    const verifie = await appel(verification, marie.code)
    assert.deepEqual(verifie.corps, { role: 'admin', nom: 'Marie', id: marie.id })
    assert.ok((await E.listerEmployes()).employes.find((e) => e.id === marie.id).vu > 0)

    // Elle valide le rapport d'un invite : le journal la nomme.
    await appel(envoi, invite.code, { corps: demande() })
    assert.equal((await appel(admin, marie.code, { corps: { action: 'valider', id: 'e42' } })).statut, 200)
    const parti = (await appel(admin, ADMIN, { methode: 'GET' })).corps.journal.find((j) => j.statut === 'envoye')
    assert.equal(parti.validePar, 'Marie')

    // Un rendez-vous qu'elle se donne est a son nom, pas a celui du titulaire.
    const r = await appel(agenda, marie.code, {
      corps: { action: 'enregistrer', rdv: { id: 'r1', date: demain(), heure: '09:00', client: { nom: 'Favre' } } },
    })
    assert.equal(r.corps.rdv.pour.id, marie.id)
  })
})

describe("l'export de facturation", () => {
  const envoye = (date, x = {}) => ({
    date,
    statut: 'envoye',
    ref: 'AF-1',
    type: 'detection',
    client: 'Régie Duval',
    adresse: 'Rue du Lac 12',
    destinataire: 'regie@exemple.ch',
    qui: 'Luc',
    ...x,
  })

  test("les envois partis du mois, a l'heure de Lausanne, les renvois marques", () => {
    const premier = envoye(Date.UTC(2026, 8, 3, 8, 0))
    const lignes = [
      envoye(Date.UTC(2026, 8, 12, 8, 0)), // le meme rapport, renvoye
      { ...envoye(Date.UTC(2026, 8, 10, 8, 0)), statut: 'echec', ref: 'AF-2' }, // rate : ne se facture pas
      envoye(Date.UTC(2026, 8, 30, 22, 30), { ref: 'AF-3' }), // 1er octobre, 0 h 30 a Lausanne
      premier,
      premier, // lu deux fois : dans le mois et dans le journal
    ]
    assert.deepEqual(envoisDuMois(lignes, '2026-09').map((e) => [e.ref, e.renvoi]), [['AF-1', false], ['AF-1', true]])
    assert.deepEqual(envoisDuMois(lignes, '2026-10').map((e) => e.ref), ['AF-3'])
  })

  test('un CSV que le tableur ouvre tel quel, sans formule cachee', () => {
    const [ligne] = envoisDuMois(
      [envoye(Date.UTC(2026, 8, 3, 8, 5), { type: 'immeuble', client: 'Duval; Fils', adresse: '=HYPERLINK("x")', validePar: 'Marie' })],
      '2026-09'
    )
    const csv = enCsv([ligne])
    assert.equal(csv[0], '﻿')
    const [entete, contenu, fin] = csv.slice(1).split('\r\n')
    assert.equal(entete, COLONNES.join(';'))
    assert.equal(contenu, '03.09.2026;10:05;AF-1;Immeuble;"Duval; Fils";"\'=HYPERLINK(""x"")";regie@exemple.ch;Luc;Premier envoi;Marie')
    assert.equal(fin, '')
  })

  test("s'exporte depuis l'onglet Administration, et reste range par mois", async () => {
    const marc = await E.creerEmploye('Marc')
    assert.equal((await appel(envoi, marc.code, { corps: demande() })).statut, 200)
    const mois = moisSuisse(Date.now())

    const r = await appel(admin, ADMIN, { methode: 'GET', query: { export: mois } })
    assert.equal(r.statut, 200)
    assert.equal(r.corps.nombre, 1)
    assert.equal(r.corps.nom, `envois-atout-flair-${mois}.csv`)
    assert.match(r.corps.csv, /;AF-00042;Détection;Régie Duval;Rue du Lac 12;regie@exemple\.ch;Marc;Premier envoi;\r\n$/)
    assert.equal((await E.lireEnvoisDuMois(mois)).length, 1)
    assert.equal((await E.exporterBase()).envois[mois].length, 1, 'la copie de nuit garde aussi les envois du mois')

    assert.equal((await appel(admin, marc.code, { methode: 'GET', query: { export: mois } })).statut, 403)
    assert.equal((await appel(admin, ADMIN, { methode: 'GET', query: { export: '2026-13' } })).statut, 400)
  })
})
