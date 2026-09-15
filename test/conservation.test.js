// La conservation des donnees : le bilan dit ce qui depasse les durees de la
// declaration de confidentialite, et n'efface rien - l'administrateur l'a demande.
import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import * as E from '../api/_lib/equipe.js'
import { noterIncident } from '../api/_lib/incidents.js'
import { bilanConservation, EFFACEMENT_ACTIF } from '../api/_lib/conservation.js'
import admin from '../api/admin.js'

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

const AN = 365.25 * 86_400_000
const MAINTENANT = Date.UTC(2040, 0, 15, 12)
const client = (nom, prenom) => ({ type: 'particulier', nom, prenom })

beforeEach(() => {
  process.env.APP_CODE = 'StessyOberli'
  process.env.KV_REST_API_URL = 'https://faux'
  process.env.KV_REST_API_TOKEN = 'faux'
  E._brancherBase(fauxRedis())
})

async function remplir() {
  await E.indexerSauvegarde({ id: 'vieux', maj: MAINTENANT - 11 * AN })
  await E.indexerSauvegarde({ id: 'appart', parentId: 'vieux', maj: MAINTENANT - 11 * AN })
  await E.indexerSauvegarde({ id: 'recent', maj: MAINTENANT - AN })
  await E.journaliser({ date: MAINTENANT - 11 * AN, statut: 'envoye', ref: 'AF-1' })
  await E.journaliser({ date: MAINTENANT - 11 * AN, statut: 'echec', ref: 'AF-2' })
  await E.journaliser({ date: MAINTENANT - AN, statut: 'envoye', ref: 'AF-3' })
  await E.ecrireAgenda([
    { id: 'a1', date: '2030-03-01', client: client('Favre', 'Julien') },
    { id: 'a2', date: '2039-06-01', client: client('Bonvin', 'Claire') },
    { id: 'a3', date: '2040-02-01', client: client('Rochat', 'Anne') },
  ])
  await E.ecrireCarnet([
    { id: 'c1', ...client('Favre', 'Julien'), maj: MAINTENANT - 6 * AN },
    { id: 'c2', ...client('Bonvin', 'Claire'), maj: MAINTENANT - 6 * AN },
    { id: 'c3', supprime: true, maj: MAINTENANT - 9 * AN },
  ])
  await noterIncident({ message: 'ancien' }, { maintenant: MAINTENANT - 100 * 86_400_000 })
  await noterIncident({ message: 'recent' }, { maintenant: MAINTENANT - 86_400_000 })
}

describe('la conservation des donnees', () => {
  test('le bilan compte ce qui depasse chaque duree', async () => {
    await remplir()
    const { effacementActif, categories } = await bilanConservation({ maintenant: MAINTENANT })
    assert.equal(effacementActif, false)
    const par = Object.fromEntries(categories.map((c) => [c.cle, c]))
    // Le rapport d'appartement part avec son immeuble : il ne compte pas a part.
    assert.deepEqual([par.rapports.total, par.rapports.aEffacer], [2, 1])
    assert.deepEqual([par.journal.total, par.journal.aEffacer], [3, 2])
    assert.deepEqual([par.facturation.total, par.facturation.aEffacer], [2, 1])
    // Le rendez-vous a venir n'est pas un rendez-vous passe.
    assert.deepEqual([par.agenda.total, par.agenda.aEffacer], [2, 1])
    // Bonvin a eu un rendez-vous l'an dernier : sa fiche est active. La fiche supprimee ne compte pas.
    assert.deepEqual([par.carnet.total, par.carnet.aEffacer], [2, 1])
    assert.deepEqual([par.incidents.total, par.incidents.aEffacer], [2, 1])
    assert.equal(par.rapports.plusAncien, MAINTENANT - 11 * AN)
  })

  test('rien n’est efface', async () => {
    await remplir()
    await bilanConservation({ maintenant: MAINTENANT })
    assert.equal(EFFACEMENT_ACTIF, false)
    assert.equal((await E.lireSauvegardes()).length, 3)
    assert.equal((await E.lireJournal(100)).length, 3)
    assert.equal((await E.lireAgenda()).size, 3)
    assert.equal((await E.lireCarnet()).size, 3)
  })

  test('le bilan est reserve a l’administrateur', async () => {
    const { code } = await E.creerEmploye('Marc')
    const appel = async (c) => {
      const res = { statut: 0, corps: null, status(n) { this.statut = n; return this }, json(o) { this.corps = o; return this }, setHeader() {} }
      await admin({ method: 'GET', headers: { 'x-app-code': c }, query: { conservation: '1' } }, res)
      return res
    }
    assert.equal((await appel(code)).statut, 403)
    const r = await appel('stessyoberli')
    assert.equal(r.statut, 200)
    assert.equal(r.corps.categories.length, 6)
    assert.equal(r.corps.effacementActif, false)
  })
})
