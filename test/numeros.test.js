// Numeros de rapport uniques dans toute l'equipe : le serveur distribue des
// lots qui ne se chevauchent jamais, et le telephone les consomme avant son
// compteur local.

import { remetAneuf } from './aide/navigateur.js'
import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import * as S from '../src/state.js'
import * as E from '../api/_lib/equipe.js'
import handler from '../api/numeros.js'

// Imitation de Redis : les commandes des codes, et le script du compteur.
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
      case 'SADD': s(k).add(a[0]); return 1
      case 'EVAL': {
        // [script, nbCles, cle, plusHaut, taille]
        const [, cle, plusHaut, taille] = a
        if (Number(plusHaut) > Number(kv.get(cle) ?? 0)) kv.set(cle, String(plusHaut))
        const v = Number(kv.get(cle) ?? 0) + Number(taille)
        kv.set(cle, String(v))
        return v
      }
      default: throw new Error('commande non imitee : ' + cmd)
    }
  }
}

beforeEach(() => {
  remetAneuf()
  process.env.APP_CODE = 'StessyOberli'
  process.env.KV_REST_API_URL = 'https://faux'
  process.env.KV_REST_API_TOKEN = 'faux'
  E._brancherBase(fauxRedis())
})

describe('le serveur', () => {
  test('distribue des lots qui ne se chevauchent jamais', async () => {
    // Un telephone qui avait deja numerote jusqu'a 37, puis un autre moins
    // avance, puis un troisieme qui etait alle bien plus loin.
    const a = await E.reserverNumeros(37)
    const b = await E.reserverNumeros(12)
    const c = await E.reserverNumeros(100)
    assert.deepEqual([a, b, c], [
      { debut: 38, fin: 47 },
      { debut: 48, fin: 57 },
      { debut: 101, fin: 110 },
    ])
  })

  test('sert aussi les invites, pas les codes faux', async () => {
    const { code } = await E.creerEmploye('Sous-traitant', { fin: Date.now() + 86_400_000 })
    const appel = async (c) => {
      const res = { statut: 0, corps: null, status(n) { this.statut = n; return this }, json(o) { this.corps = o; return this }, setHeader() {} }
      await handler({ method: 'POST', headers: { 'x-app-code': c }, body: { plusHaut: 5 } }, res)
      return res
    }
    const ok = await appel(code)
    assert.equal(ok.statut, 200)
    assert.deepEqual(ok.corps, { debut: 6, fin: 15 })
    assert.equal((await appel('pas-un-code')).statut, 401)
  })
})

describe('le telephone', () => {
  test('prend ses numeros dans le lot reserve, puis reprend au-dessus', () => {
    S.ajouterNumeros(501, 503)
    assert.equal(S.numerosRestants(), 3)
    const refs = [1, 2, 3, 4].map(() => S.newReport('detection').ref)
    assert.deepEqual(refs.slice(0, 3), ['AF-00501', 'AF-00502', 'AF-00503'])
    // Lot epuise sans reseau : le secours local ne redescend pas sous le lot.
    assert.ok(S.numeroDeRef(refs[3]) > 503)
    assert.equal(S.numerosRestants(), 0)
    assert.ok(S.numeroLocalMax() >= 504)
  })
})
