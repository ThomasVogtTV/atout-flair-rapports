// Carnet commun, cote serveur : la regle de fusion, et l'adresse /api/carnet
// contre une imitation de Redis en memoire.
import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { fusionnerCarnet, nettoyerContact, contactsVivants } from '../api/_lib/carnet.js'
import * as E from '../api/_lib/equipe.js'
import handler from '../api/carnet.js'

const T = 1_000_000

describe('la fusion du carnet', () => {
  test('un contact inconnu entre, un contact sans nom ou sans identifiant non', () => {
    const carnet = new Map()
    const ecrits = fusionnerCarnet(carnet, [{ id: 'a1', nom: ' Favre ', maj: T }, { id: 'a2', nom: '' }, { nom: 'Sans id' }, { id: 'x y', nom: 'Id faux' }], [], T)
    assert.equal(ecrits.length, 1)
    assert.equal(carnet.get('a1').nom, 'Favre')
  })

  test('meme fiche : la version la plus recente gagne, champ vide compris', () => {
    const carnet = new Map([['a1', { id: 'a1', nom: 'Favre', email: 'vieux@x.ch', maj: T }]])
    fusionnerCarnet(carnet, [{ id: 'a1', nom: 'Favre', email: '', maj: T + 5 }], [], T + 10)
    assert.equal(carnet.get('a1').email, '')
    fusionnerCarnet(carnet, [{ id: 'a1', nom: 'Favre', email: 'perime@x.ch', maj: T + 1 }], [], T + 10)
    assert.equal(carnet.get('a1').email, '')
  })

  test('meme client cree sur deux telephones : une seule fiche, rien de perdu', () => {
    const carnet = new Map([['a1', { id: 'a1', type: 'gerance', nom: 'Régie Duval', email: 'info@duval.ch', tel: '', maj: T }]])
    fusionnerCarnet(carnet, [{ id: 'b7', type: 'gerance', nom: 'regie  duval', tel: '021 000 00 00', email: '', maj: T + 1 }], [], T + 2)
    const vivants = contactsVivants(carnet)
    assert.equal(vivants.length, 1)
    assert.equal(vivants[0].id, 'a1')
    assert.equal(vivants[0].email, 'info@duval.ch')
    assert.equal(vivants[0].tel, '021 000 00 00')
  })

  test("une suppression tient face a une copie plus ancienne, pas face a une correction plus recente", () => {
    const carnet = new Map([['a1', { id: 'a1', nom: 'Favre', maj: T }]])
    fusionnerCarnet(carnet, [], ['a1'], T + 10)
    assert.equal(contactsVivants(carnet).length, 0)
    fusionnerCarnet(carnet, [{ id: 'a1', nom: 'Favre', maj: T + 5 }], [], T + 20)
    assert.equal(contactsVivants(carnet).length, 0)
    fusionnerCarnet(carnet, [{ id: 'a1', nom: 'Favre', maj: T + 15 }], [], T + 20)
    assert.equal(contactsVivants(carnet).length, 1)
  })

  test("une date venue du futur est ramenee a maintenant", () => {
    assert.equal(nettoyerContact({ id: 'a1', nom: 'X', maj: T * 10 }, T).maj, T)
    assert.equal(nettoyerContact({ id: 'a1', nom: 'X', type: 'pirate' }, T).type, '')
  })
})

// --- l'adresse /api/carnet ------------------------------------------------------

function fauxRedis() {
  const kv = new Map()
  const h = (k) => kv.get(k) ?? kv.set(k, new Map()).get(k)
  const s = (k) => kv.get(k) ?? kv.set(k, new Set()).get(k)
  return async ([cmd, k, ...a]) => {
    switch (cmd) {
      case 'GET': return typeof kv.get(k) === 'string' ? kv.get(k) : null
      case 'SET': if (a[1] === 'NX' && kv.has(k)) return null; kv.set(k, a[0]); return 'OK'
      case 'DEL': return kv.delete(k) ? 1 : 0
      case 'HSET': for (let i = 0; i < a.length; i += 2) h(k).set(a[i], a[i + 1]); return a.length / 2
      case 'HGETALL': return kv.has(k) ? [...h(k)].flat() : []
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

describe('/api/carnet', () => {
  beforeEach(() => {
    process.env.APP_CODE = 'StessyOberli'
    process.env.KV_REST_API_URL = 'https://faux'
    process.env.KV_REST_API_TOKEN = 'faux'
    E._brancherBase(fauxRedis())
  })

  test("l'administrateur et un employe partagent le meme carnet", async () => {
    const { code } = await E.creerEmploye('Marc')
    await appel('stessyoberli', { contacts: [{ id: 'a1', nom: 'Favre', maj: Date.now() - 10 }] })
    const r = await appel(code, { contacts: [{ id: 'b1', nom: 'Rochat', maj: Date.now() - 5 }], supprimes: [] })
    assert.equal(r.statut, 200)
    assert.deepEqual(r.corps.contacts.map((c) => c.nom).sort(), ['Favre', 'Rochat'])
  })

  test("seul l'administrateur retire un client du carnet de l'equipe", async () => {
    const { code } = await E.creerEmploye('Marc')
    await appel('stessyoberli', { contacts: [{ id: 'a1', nom: 'Favre', maj: Date.now() - 10 }, { id: 'a2', nom: 'Rochat', maj: Date.now() - 10 }] })
    const parEmploye = await appel(code, { contacts: [], supprimes: ['a1'] })
    assert.deepEqual(parEmploye.corps.contacts.map((c) => c.nom).sort(), ['Favre', 'Rochat'])
    const parAdmin = await appel('stessyoberli', { contacts: [], supprimes: ['a1'] })
    assert.deepEqual(parAdmin.corps.contacts.map((c) => c.nom), ['Rochat'])
  })

  test("un invite est refuse, un code faux aussi", async () => {
    const { code } = await E.creerEmploye('Sous-traitant', { fin: Date.now() + 86_400_000 })
    assert.equal((await appel(code)).statut, 403)
    assert.equal((await appel('pas-un-code')).statut, 401)
  })
})

describe('les favoris du carnet commun', () => {
  test('voyagent avec la fiche et survivent a la fusion de deux jumeaux', () => {
    const carnet = new Map()
    fusionnerCarnet(carnet, [{ id: 'a1', nom: 'Favre', favori: true, maj: T }], [], T)
    assert.equal(carnet.get('a1').favori, true)
    // Le meme client cree sans etoile sur un autre telephone : l'etoile reste.
    fusionnerCarnet(carnet, [{ id: 'b2', nom: 'favre', tel: '079', maj: T + 1 }], [], T + 2)
    assert.equal(contactsVivants(carnet)[0].favori, true)
    // Decochee plus tard sur la fiche elle-meme : elle part.
    fusionnerCarnet(carnet, [{ id: 'a1', nom: 'Favre', favori: false, maj: T + 5 }], [], T + 6)
    assert.equal(carnet.get('a1').favori, false)
    assert.equal(nettoyerContact({ id: 'x', nom: 'X', favori: 'oui' }, T).favori, false)
  })
})
