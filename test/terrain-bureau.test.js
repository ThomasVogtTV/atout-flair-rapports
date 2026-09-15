// Terrain et le Bureau : Terrain ne montre que les rendez-vous de celui qui tient
// le telephone, et son accueil ne demande au serveur que le resume de l'equipe.
import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import * as E from '../api/_lib/equipe.js'
import admin from '../api/admin.js'
import { aMoi } from '../src/agenda-outils.js'

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
      case 'HGET': return h(k).get(a[0]) ?? null
      case 'HDEL': return a.filter((f) => h(k).delete(f)).length
      case 'HGETALL': return kv.has(k) ? [...h(k)].flat() : []
      case 'SADD': s(k).add(a[0]); return 1
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

const ADMIN = 'stessyoberli'
const appel = async (handler, code, { query = {} } = {}) => {
  const res = { statut: 0, corps: null, status(n) { this.statut = n; return this }, json(o) { this.corps = o; return this }, setHeader() {} }
  await handler({ method: 'GET', headers: { 'x-app-code': code }, query }, res)
  return res
}

beforeEach(() => {
  process.env.APP_CODE = 'StessyOberli'
  process.env.KV_REST_API_URL = 'https://faux'
  process.env.KV_REST_API_TOKEN = 'faux'
  E._brancherBase(fauxRedis())
})

describe('Terrain', () => {
  test('ne garde que les rendez-vous de celui qui tient le telephone', () => {
    const agenda = { moi: { id: 'e1', nom: 'Luc' } }
    const rdvs = [{ id: 'a', pour: { id: 'e1' } }, { id: 'b', pour: { id: 'e2' } }, { id: 'c', pour: null }]
    assert.deepEqual(rdvs.filter(aMoi(agenda)).map((r) => r.id), ['a', 'c'])
  })

  test("l'accueil d'un administrateur ne lit que le resume de l'equipe", async () => {
    await E.creerEmploye('Marc')
    await E.journaliser({ qui: 'Luc', role: 'employe', statut: 'a-valider', ref: 'AF-1' })
    await E.journaliser({ qui: 'Luc', role: 'employe', statut: 'echec', ref: 'AF-2' })
    await E.journaliser({ qui: 'Luc', role: 'employe', statut: 'envoye', ref: 'AF-3' })
    // Un echec d'il y a dix jours : ce n'est plus une alerte.
    await E.journaliser({ date: Date.now() - 10 * 86_400_000, qui: 'Luc', role: 'employe', statut: 'echec', ref: 'AF-0' })

    const r = await appel(admin, ADMIN, { query: { resume: '1' } })
    assert.equal(r.statut, 200)
    assert.deepEqual(Object.keys(r.corps).sort(), ['journal', 'validations'])
    assert.deepEqual(r.corps.journal.map((j) => j.ref).sort(), ['AF-2', 'AF-3'])
    assert.deepEqual(r.corps.validations, [])
  })
})
