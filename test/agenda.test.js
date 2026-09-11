// Agenda de l'equipe : qui voit et touche quoi cote serveur, et le rendez-vous
// mis au format des agendas de telephone.
import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { nettoyerRdv, visiblesPour, peutModifier } from '../api/_lib/agenda.js'
import * as E from '../api/_lib/equipe.js'
import handler from '../api/agenda.js'
import { fichierIcs, lienGoogleAgenda, trierRdv, libelleJour, plusJours, aVenir } from '../src/agenda-outils.js'

const rdvBrut = (x = {}) => ({ id: 'r1', date: '2026-09-14', heure: '14:30', type: 'immeuble', client: { type: 'gerance', nom: 'Régie Duval' }, ...x })

describe('un rendez-vous', () => {
  test("n'existe pas sans date ni client", () => {
    assert.equal(nettoyerRdv(rdvBrut({ date: '' })), null)
    assert.equal(nettoyerRdv(rdvBrut({ client: { nom: ' ' } })), null)
    assert.equal(nettoyerRdv(rdvBrut({ id: 'a b' })), null)
  })

  test('une heure ou un type faux se corrigent au lieu de tout refuser', () => {
    const r = nettoyerRdv(rdvBrut({ heure: '25:99', type: 'pirate' }), 1)
    assert.equal(r.heure, '')
    assert.equal(r.type, 'detection')
  })
})

describe('qui voit et modifie quoi', () => {
  const admin = { role: 'admin', nom: 'Administrateur' }
  const marc = { role: 'employe', id: 'e1', nom: 'Marc' }
  const paul = { role: 'invite', id: 'e2', nom: 'Paul' }
  const rdvs = [
    { id: 'a', pour: { id: 'e1' }, par: { id: 'admin' } },
    { id: 'b', pour: { id: 'e2' }, par: { id: 'admin' } },
    { id: 'c', pour: { id: 'admin' }, par: { id: 'admin' } },
  ]

  test("l'equipe voit tout, un invite seulement les siens", () => {
    assert.equal(visiblesPour(admin, rdvs).length, 3)
    assert.equal(visiblesPour(marc, rdvs).length, 3)
    assert.deepEqual(visiblesPour(paul, rdvs).map((r) => r.id), ['b'])
  })

  test('un employe ne modifie que les siens, un invite aucun', () => {
    assert.equal(peutModifier(admin, rdvs[2]), true)
    assert.equal(peutModifier(marc, rdvs[0]), true)
    assert.equal(peutModifier(marc, rdvs[2]), false)
    assert.equal(peutModifier(paul, rdvs[1]), false)
  })
})

// --- l'adresse /api/agenda, contre une imitation de Redis ------------------

function fauxRedis() {
  const kv = new Map()
  const h = (k) => kv.get(k) ?? kv.set(k, new Map()).get(k)
  const s = (k) => kv.get(k) ?? kv.set(k, new Set()).get(k)
  return async ([cmd, k, ...a]) => {
    switch (cmd) {
      case 'GET': return typeof kv.get(k) === 'string' ? kv.get(k) : null
      case 'SET': if (a[1] === 'NX' && kv.has(k)) return null; kv.set(k, a[0]); return 'OK'
      case 'HSET': for (let i = 0; i < a.length; i += 2) h(k).set(a[i], a[i + 1]); return a.length / 2
      case 'HGETALL': return kv.has(k) ? [...h(k)].flat() : []
      case 'HDEL': return h(k).delete(a[0]) ? 1 : 0
      case 'SADD': s(k).add(a[0]); return 1
      default: throw new Error('commande non imitee : ' + cmd)
    }
  }
}

const appel = async (code, corps) => {
  const res = { statut: 0, corps: null, status(n) { this.statut = n; return this }, json(o) { this.corps = o; return this }, setHeader() {} }
  await handler({ method: corps ? 'POST' : 'GET', headers: { 'x-app-code': code }, body: corps }, res)
  return res
}

describe('/api/agenda', () => {
  const ADMIN = 'stessyoberli'
  const demain = new Date(Date.now() + 86_400_000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Zurich' })

  beforeEach(() => {
    process.env.APP_CODE = 'StessyOberli'
    process.env.KV_REST_API_URL = 'https://faux'
    process.env.KV_REST_API_TOKEN = 'faux'
    E._brancherBase(fauxRedis())
  })

  test("l'administrateur attribue un rendez-vous, l'employe le voit", async () => {
    const { id, code } = await E.creerEmploye('Marc')
    const r = await appel(ADMIN, { action: 'enregistrer', rdv: rdvBrut({ date: demain, pour: { id, nom: 'Marc' } }) })
    assert.equal(r.statut, 200)
    assert.equal(r.corps.rdv.pour.id, id)
    const vu = await appel(code)
    assert.deepEqual(vu.corps.rdvs.map((x) => x.id), ['r1'])
    assert.equal(vu.corps.moi.id, id)
  })

  test("un employe n'attribue qu'a lui-meme, et ne touche pas au rendez-vous d'un collegue", async () => {
    const marc = await E.creerEmploye('Marc')
    const julie = await E.creerEmploye('Julie')
    const r = await appel(marc.code, { action: 'enregistrer', rdv: rdvBrut({ date: demain, pour: { id: julie.id, nom: 'Julie' } }) })
    assert.equal(r.corps.rdv.pour.id, marc.id)
    assert.equal((await appel(julie.code, { action: 'supprimer', id: 'r1' })).statut, 403)
    assert.equal((await appel(marc.code, { action: 'supprimer', id: 'r1' })).statut, 200)
    assert.equal((await appel(ADMIN)).corps.rdvs.length, 0)
  })

  test('un invite voit les siens, les commence, et ne peut rien modifier', async () => {
    const paul = await E.creerEmploye('Paul', { fin: Date.now() + 5 * 86_400_000 })
    await appel(ADMIN, { action: 'enregistrer', rdv: rdvBrut({ date: demain, pour: { id: paul.id, nom: 'Paul' } }) })
    await appel(ADMIN, { action: 'enregistrer', rdv: rdvBrut({ id: 'r2', date: demain }) })
    const vu = await appel(paul.code)
    assert.deepEqual(vu.corps.rdvs.map((x) => x.id), ['r1'])
    assert.equal((await appel(paul.code, { action: 'enregistrer', rdv: rdvBrut({ id: 'r9', date: demain }) })).statut, 403)
    assert.equal((await appel(paul.code, { action: 'commencer', id: 'r1', rapportId: 'rap1' })).statut, 200)
    assert.equal((await appel(paul.code, { action: 'commencer', id: 'r2', rapportId: 'rap2' })).statut, 404)
  })
})

describe("vers l'agenda du telephone", () => {
  test('un fichier .ics a la bonne heure, avec un rappel trente minutes avant', () => {
    const ics = fichierIcs(nettoyerRdv(rdvBrut({ lieu: { adresse: 'Ch. des Pins 8', npaLieu: '1005 Lausanne' }, note: 'Code 1234' }), 1))
    assert.match(ics, /DTSTART:20260914T143000\r\n/)
    assert.match(ics, /DTEND:20260914T153000\r\n/)
    assert.match(ics, /LOCATION:Ch. des Pins 8\\, 1005 Lausanne/)
    assert.match(ics, /TRIGGER:-PT30M/)
    assert.match(ics, /SUMMARY:Régie Duval - Immeuble/)
  })

  test('sans heure, toute la journee, et un lien Google Agenda', () => {
    const r = nettoyerRdv(rdvBrut({ heure: '' }), 1)
    assert.match(fichierIcs(r), /DTSTART;VALUE=DATE:20260914\r\nDTEND;VALUE=DATE:20260915/)
    assert.match(lienGoogleAgenda(r), /dates=20260914%2F20260915/)
  })

  test("s'ordonne par jour et par heure, et nomme les jours proches", () => {
    const l = trierRdv([{ date: '2026-09-14', heure: '' }, { date: '2026-09-14', heure: '08:00' }, { date: '2026-09-13', heure: '17:00' }])
    assert.deepEqual(l.map((x) => `${x.date} ${x.heure}`), ['2026-09-13 17:00', '2026-09-14 08:00', '2026-09-14 '])
    assert.equal(libelleJour('2026-09-11', '2026-09-11'), "Aujourd'hui")
    assert.equal(libelleJour(plusJours('2026-09-11', 1), '2026-09-11'), 'Demain')
    assert.match(libelleJour('2026-09-14', '2026-09-11'), /^Lundi 14 septembre$/)
    assert.equal(aVenir([{ date: '2026-09-10' }, { date: '2026-09-12' }], '2026-09-11').length, 1)
  })
})
