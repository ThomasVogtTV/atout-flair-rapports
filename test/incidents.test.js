// Les incidents techniques : une meme erreur ne fait qu'une ligne, la liste ne
// grossit pas sans fin, n'importe quel appareil peut signaler mais seul
// l'administrateur lit et regle.
import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import * as E from '../api/_lib/equipe.js'
import * as I from '../api/_lib/incidents.js'
import handler from '../api/incidents.js'
import { incidentsNouveaux } from '../src/equipe-alertes.js'

function fauxRedis() {
  const kv = new Map()
  const h = (k) => kv.get(k) ?? kv.set(k, new Map()).get(k)
  const s = (k) => kv.get(k) ?? kv.set(k, new Set()).get(k)
  return async ([cmd, k, ...a]) => {
    switch (cmd) {
      case 'GET': return typeof kv.get(k) === 'string' ? kv.get(k) : null
      case 'SET': if (a[1] === 'NX' && kv.has(k)) return null; kv.set(k, a[0]); return 'OK'
      case 'DEL': return kv.delete(k) ? 1 : 0
      case 'INCR': { const n = (Number(kv.get(k)) || 0) + 1; kv.set(k, String(n)); return n }
      case 'HSET': for (let i = 0; i < a.length; i += 2) h(k).set(a[i], a[i + 1]); return a.length / 2
      case 'HGET': return h(k).get(a[0]) ?? null
      case 'HDEL': return a.filter((f) => h(k).delete(f)).length
      case 'HGETALL': return kv.has(k) ? [...h(k)].flat() : []
      case 'SADD': s(k).add(a[0]); return 1
      case 'SMEMBERS': return [...s(k)]
      default: throw new Error('commande non imitee : ' + cmd)
    }
  }
}

const ADMIN = 'stessyoberli'
const appel = async ({ method = 'POST', code, body, ip = '1.2.3.4' } = {}) => {
  const res = { statut: 0, corps: null, status(n) { this.statut = n; return this }, json(o) { this.corps = o; return this }, setHeader() {} }
  await handler({ method, headers: { 'x-app-code': code, 'x-real-ip': ip }, query: {}, body }, res)
  return res
}

const erreur = (message, pile = `TypeError: ${message}\n    at ouvrir (https://site/assets/index-DKzpQsne.js:12:345)`) => ({
  app: 'terrain',
  message,
  pile,
  version: 'index-DKzpQsne.js',
  ecran: 'editor',
})

beforeEach(() => {
  process.env.APP_CODE = 'StessyOberli'
  process.env.KV_REST_API_URL = 'https://faux'
  process.env.KV_REST_API_TOKEN = 'faux'
  E._brancherBase(fauxRedis())
})

describe('les incidents', () => {
  test('une meme erreur ne fait qu’une ligne, qui compte ses repetitions et qui l’a eue', async () => {
    await I.noterIncident(erreur('x is undefined'), { qui: 'Marc', maintenant: 1000 })
    await I.noterIncident(erreur('x is undefined'), { qui: 'Julie', maintenant: 2000 })
    await I.noterIncident(erreur('x is undefined'), { qui: 'Marc', maintenant: 3000 })
    const [i, ...autres] = await I.lireIncidents()
    assert.equal(autres.length, 0)
    assert.equal(i.nombre, 3)
    assert.equal(i.premiere, 1000)
    assert.equal(i.derniere, 3000)
    assert.deepEqual(i.qui, ['Julie', 'Marc'])
  })

  test('la meme erreur garde sa ligne d’une version a l’autre', () => {
    const avant = I.nettoyer(erreur('x is undefined'))
    const apres = I.nettoyer(erreur('x is undefined', 'TypeError: x is undefined\n    at ouvrir (https://site/assets/index-B7fQx2Lm.js:14:18)'))
    assert.equal(I.signature(avant), I.signature(apres))
    assert.notEqual(I.signature(avant), I.signature(I.nettoyer(erreur('y is undefined'))))
  })

  test('rien a garder sans message, et un texte trop long est coupe', async () => {
    assert.equal(I.nettoyer({ message: '   ' }), null)
    assert.equal(await I.noterIncident({ pile: 'rien' }), null)
    const i = I.nettoyer({ message: 'a'.repeat(5000), pile: 'b'.repeat(9000), app: 'pirate' })
    assert.equal(i.message.length, 300)
    assert.equal(i.pile.length, 2000)
    assert.equal(i.app, 'terrain')
  })

  test('au-dela du plafond, les plus anciennes s’effacent', async () => {
    for (let n = 0; n <= I.INCIDENTS_MAX; n++) await I.noterIncident(erreur(`erreur ${n}`), { maintenant: 1000 + n })
    const liste = await I.lireIncidents()
    assert.equal(liste.length, I.INCIDENTS_MAX)
    assert.equal(liste.at(-1).message, 'erreur 1')
  })

  test('une erreur du serveur est consignee sans jamais faire echouer la reponse', async () => {
    await I.signalerServeur('agenda', new Error('Redis : délai dépassé'))
    const [i] = await I.lireIncidents()
    assert.equal(i.app, 'serveur')
    assert.match(i.message, /agenda : Redis/)
    E._brancherBase(async () => {
      throw new Error('base tombee')
    })
    await I.signalerServeur('agenda', new Error('encore'))
  })
})

describe('l’adresse /api/incidents', () => {
  test('n’importe quel appareil signale ; le code dit seulement qui', async () => {
    const { code } = await E.creerEmploye('Marc')
    assert.equal((await appel({ body: erreur('sans code') })).statut, 200)
    assert.equal((await appel({ code, body: erreur('avec code') })).statut, 200)
    // Un faux code ne change rien a la reponse : pas de quoi essayer des codes.
    assert.equal((await appel({ code: 'fauxcode', body: erreur('faux code') })).statut, 200)
    const parMessage = Object.fromEntries((await I.lireIncidents()).map((i) => [i.message, i.qui]))
    assert.deepEqual(parMessage['avec code'], ['Marc'])
    assert.deepEqual(parMessage['sans code'], [])
    assert.deepEqual(parMessage['faux code'], [])
  })

  test('seul l’administrateur lit et regle', async () => {
    const { code } = await E.creerEmploye('Marc')
    await appel({ body: erreur('a regler') })
    assert.equal((await appel({ method: 'GET' })).statut, 401)
    assert.equal((await appel({ method: 'GET', code })).statut, 403)
    assert.equal((await appel({ code, body: { action: 'tout-regler' } })).statut, 403)
    const lu = await appel({ method: 'GET', code: ADMIN })
    assert.equal(lu.statut, 200)
    const [{ sig }] = lu.corps.incidents
    assert.equal((await appel({ code: ADMIN, body: { action: 'regler', sig: '../../x' } })).statut, 400)
    assert.equal((await appel({ code: ADMIN, body: { action: 'regler', sig } })).statut, 200)
    assert.deepEqual((await appel({ method: 'GET', code: ADMIN })).corps.incidents, [])
  })

  test('un appareil qui signale en boucle est freine', async () => {
    for (let n = 0; n < I.SIGNALEMENTS_MAX; n++) assert.equal((await appel({ body: erreur(`boucle ${n}`) })).statut, 200)
    assert.equal((await appel({ body: erreur('de trop') })).statut, 429)
    // Un autre reseau n'est pas concerne.
    assert.equal((await appel({ body: erreur('ailleurs'), ip: '5.6.7.8' })).statut, 200)
  })
})

describe('l’alerte de l’administrateur', () => {
  test('ne compte que ce qui est arrive depuis sa derniere visite, dans la semaine', () => {
    const maintenant = 10 * 86_400_000
    const incidents = [
      { sig: 'a', derniere: maintenant - 3600_000 },
      { sig: 'b', derniere: maintenant - 2 * 86_400_000 },
      { sig: 'c', derniere: maintenant - 8 * 86_400_000 },
    ]
    assert.deepEqual(incidentsNouveaux(incidents, { maintenant }).map((i) => i.sig), ['a', 'b'])
    assert.deepEqual(incidentsNouveaux(incidents, { vu: maintenant - 86_400_000, maintenant }).map((i) => i.sig), ['a'])
  })
})
