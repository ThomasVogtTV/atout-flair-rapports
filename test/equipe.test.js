// Equipe et journal cote serveur, contre une imitation de Redis en memoire.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import * as E from '../api/_lib/equipe.js'

// Imitation des quelques commandes Redis utilisees, avec les memes formes de
// reponse que l'API REST d'Upstash.
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
      case 'HSET': for (let i = 0; i < a.length; i += 2) h(k).set(a[i], a[i + 1]); return a.length / 2
      case 'HGETALL': return kv.has(k) ? [...h(k)].flat() : []
      case 'HINCRBY': { const v = Number(h(k).get(a[0]) ?? 0) + Number(a[1]); h(k).set(a[0], String(v)); return v }
      case 'SADD': s(k).add(a[0]); return 1
      case 'SREM': return s(k).delete(a[0]) ? 1 : 0
      case 'SMEMBERS': return [...s(k)]
      case 'LPUSH': l(k).unshift(a[0]); return l(k).length
      case 'RPUSH': l(k).push(a[0]); return l(k).length
      case 'LTRIM': kv.set(k, l(k).slice(Number(a[0]), Number(a[1]) + 1)); return 'OK'
      case 'LRANGE': return l(k).slice(Number(a[0]), Number(a[1]) + 1)
      default: throw new Error('commande non imitee : ' + cmd)
    }
  }
}

beforeEach(() => {
  process.env.APP_CODE = 'StessyOberli'
  process.env.KV_REST_API_URL = 'https://faux'
  process.env.KV_REST_API_TOKEN = 'faux'
  E._brancherBase(fauxRedis())
})

test("le code administrateur ouvre tout, quelle que soit la casse", async () => {
  assert.deepEqual(await E.identifier('stessyoberli'), { role: 'admin', nom: 'Administrateur' })
  assert.equal(await E.identifier('StessyOberly'), null)
  assert.equal(await E.identifier(''), null)
})

test("un employe cree recoit un code qui l'identifie", async () => {
  const { id, code, nom } = await E.creerEmploye('  Marc Dupont ')
  assert.equal(nom, 'Marc Dupont')
  assert.match(code, /^[a-hj-km-np-z2-9]{8}$/)
  assert.deepEqual(await E.identifier(code.toUpperCase()), { role: 'employe', id, nom: 'Marc Dupont' })
})

test('un employe revoque ne passe plus, et repasse une fois reactive', async () => {
  const { id, code } = await E.creerEmploye('Julie')
  await E.changerStatut(id, false)
  assert.equal(await E.identifier(code), null)
  await E.changerStatut(id, true)
  assert.equal((await E.identifier(code))?.nom, 'Julie')
})

test("un nouveau code remplace l'ancien", async () => {
  const { id, code: ancien } = await E.creerEmploye('Karim')
  const { code: neuf } = await E.nouveauCode(id)
  assert.notEqual(neuf, ancien)
  assert.equal(await E.identifier(ancien), null)
  assert.equal((await E.identifier(neuf))?.nom, 'Karim')
})

test('supprimer un employe coupe son code et le retire de la liste', async () => {
  const { id, code } = await E.creerEmploye('Temporaire')
  await E.supprimerEmploye(id)
  assert.equal(await E.identifier(code), null)
  assert.equal((await E.listerEmployes()).employes.length, 0)
  await assert.rejects(E.supprimerEmploye(id), E.Erreur400)
})

test("l'activite et les envois se comptent par personne", async () => {
  const { id, code } = await E.creerEmploye('Ana')
  const ana = await E.identifier(code)
  await E.noterActivite(ana)
  await E.noterActivite(ana, { envoi: true })
  await E.noterActivite(ana, { envoi: true })
  const fiche = (await E.listerEmployes()).employes.find((e) => e.id === id)
  assert.equal(fiche.envois, 2)
  assert.ok(fiche.vu > 0)
})

test('le journal rend les envois du plus recent au plus ancien', async () => {
  await E.journaliser({ qui: 'Ana', ref: 'AF-1' })
  await E.journaliser({ qui: 'Marc', ref: 'AF-2' })
  const j = await E.lireJournal()
  assert.deepEqual(j.map((e) => e.ref), ['AF-2', 'AF-1'])
  assert.ok(j[0].date > 0)
})

test("sans base, seul le code administrateur fonctionne", async () => {
  const { code } = await E.creerEmploye('Ana')
  delete process.env.KV_REST_API_URL
  assert.equal(await E.identifier(code), null)
  assert.equal((await E.identifier('StessyOberli'))?.role, 'admin')
})

test('un nom vide est refuse', async () => {
  await assert.rejects(E.creerEmploye('   '), E.Erreur400)
})

test("un invite passe jusqu'a sa date de fin, puis plus du tout", async () => {
  const fin = Date.now() + 60_000
  const { id, code } = await E.creerEmploye('Paul (sous-traitant)', { fin })
  assert.deepEqual(await E.identifier(code), { role: 'invite', id, nom: 'Paul (sous-traitant)', fin })
  const vrai = Date.now
  Date.now = () => fin + 1
  try {
    assert.equal(await E.identifier(code), null)
    assert.match(await E.pourquoiRefuse(code), /invité terminé/)
    const fiche = (await E.listerEmployes()).employes.find((e) => e.id === id)
    assert.equal(fiche.invite, true)
    assert.equal(fiche.expire, true)
  } finally {
    Date.now = vrai
  }
})

test("prolonger un invite lui rend l'acces", async () => {
  const fin = Date.now() + 60_000
  const { id, code } = await E.creerEmploye('Paul', { fin })
  await E.changerFin(id, Date.now() + 10 * 86_400_000)
  const vrai = Date.now
  Date.now = () => fin + 1
  try {
    assert.equal((await E.identifier(code))?.role, 'invite')
  } finally {
    Date.now = vrai
  }
})

test('une date de fin passee ou absurde est refusee', async () => {
  await assert.rejects(E.creerEmploye('Paul', { fin: Date.now() - 1 }), E.Erreur400)
  await assert.rejects(E.creerEmploye('Paul', { fin: 'demain' }), E.Erreur400)
  const { id } = await E.creerEmploye('Marc')
  await assert.rejects(E.changerFin(id, Date.now() + 1000), E.Erreur400)
})

test('un employe revoque recoit un motif clair, un inconnu aucun', async () => {
  const { id, code } = await E.creerEmploye('Julie')
  await E.changerStatut(id, false)
  assert.match(await E.pourquoiRefuse(code), /retiré/)
  assert.equal(await E.pourquoiRefuse('inconnu'), null)
})
