// Sauvegarde en ligne, de bout en bout : le telephone depose ses rapports, un
// telephone neuf les recupere a l'identique, et une suppression suit. Le
// serveur tourne pour de vrai, contre une imitation de Redis et du stockage.

import { remetAneuf, contenu } from './aide/navigateur.js'
import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import * as S from '../src/state.js'
import * as E from '../api/_lib/equipe.js'
import { _brancherStockage } from '../api/_lib/stockage.js'
import handler from '../api/sauvegarde.js'
import { sauvegarder, listerSauvegardes, restaurer } from '../src/sauvegarde.js'
import { rapportDetection } from './aide/rapports.js'

function fauxRedis() {
  const kv = new Map()
  const h = (k) => kv.get(k) ?? kv.set(k, new Map()).get(k)
  const s = (k) => kv.get(k) ?? kv.set(k, new Set()).get(k)
  return async ([cmd, k, ...a]) => {
    switch (cmd) {
      case 'GET': return typeof kv.get(k) === 'string' ? kv.get(k) : null
      case 'SET': if (a[1] === 'NX' && kv.has(k)) return null; kv.set(k, a[0]); return 'OK'
      case 'HSET': for (let i = 0; i < a.length; i += 2) h(k).set(a[i], a[i + 1]); return a.length / 2
      case 'HGET': return h(k).get(a[0]) ?? null
      case 'HDEL': return h(k).delete(a[0]) ? 1 : 0
      case 'HGETALL': return kv.has(k) ? [...h(k)].flat() : []
      case 'SADD': s(k).add(a[0]); return 1
      default: throw new Error('commande non imitee : ' + cmd)
    }
  }
}

// Le stockage : chemin -> {contenu, type}.
let fichiers
const fauxStockage = () => ({
  put: async (chemin, contenu, o) => void fichiers.set(chemin, { contenu: Buffer.from(contenu), type: o.contentType }),
  get: async (chemin) => {
    const f = fichiers.get(chemin)
    return f ? { stream: new Blob([f.contenu]).stream(), blob: { contentType: f.type } } : null
  },
  del: async (chemins) => [].concat(chemins).forEach((c) => fichiers.delete(c)),
})

// fetch du telephone -> le vrai serveur, sans reseau.
const fetchInitial = globalThis.fetch
function brancherFetch() {
  globalThis.fetch = async (url, o = {}) => {
    const u = new URL(url, 'https://app.test')
    const res = { statut: 0, corps: null, status(n) { this.statut = n; return this }, json(c) { this.corps = c; return this }, setHeader() {} }
    await handler({ method: o.method ?? 'GET', headers: o.headers ?? {}, query: Object.fromEntries(u.searchParams), body: o.body ? JSON.parse(o.body) : undefined }, res)
    return { ok: res.statut < 400, status: res.statut, json: async () => res.corps }
  }
}

const image = (texte) => `data:image/jpeg;base64,${Buffer.from(texte).toString('base64')}`

beforeEach(() => {
  remetAneuf()
  process.env.APP_CODE = 'StessyOberli'
  process.env.KV_REST_API_URL = 'https://faux'
  process.env.KV_REST_API_TOKEN = 'faux'
  process.env.BLOB_READ_WRITE_TOKEN = 'faux'
  E._brancherBase(fauxRedis())
  fichiers = new Map()
  _brancherStockage(fauxStockage())
  brancherFetch()
  localStorage.setItem('af-code', 'stessyoberli')
})
afterEach(() => {
  globalThis.fetch = fetchInitial
})

const rapportAvecPhotos = () => {
  const r = rapportDetection()
  r.photos = [
    { id: 'p1', rowId: null, original: image('brute-1'), dataUrl: image('annotee-1'), shapes: [{ t: 'cercle' }] },
    { id: 'p2', rowId: null, original: image('brute-2'), dataUrl: image('brute-2'), shapes: [] },
  ]
  return r
}

describe('la sauvegarde en ligne', () => {
  test("depose le rapport et chaque image une seule fois", async () => {
    const r = rapportAvecPhotos()
    await S.saveReport(r)
    assert.equal(await sauvegarder(), true)
    // rapport.json + 3 images distinctes (la photo 2 n'est pas annotee).
    assert.equal(fichiers.size, 4)
    assert.ok(fichiers.has(`rapports/${r.id}/rapport.json`))
    const json = JSON.parse(fichiers.get(`rapports/${r.id}/rapport.json`).contenu.toString())
    assert.equal(json.photos[0].dataUrl, undefined, 'les images ne doivent pas etre dans le JSON')

    // Rien de change : rien ne repart.
    const avant = new Map(fichiers)
    assert.equal(await sauvegarder(), true)
    assert.deepEqual([...fichiers.keys()], [...avant.keys()])
  })

  test("remplace une photo annotee a nouveau, sans laisser l'ancienne", async () => {
    const r = rapportAvecPhotos()
    await S.saveReport(r)
    await sauvegarder()
    r.photos[0].dataUrl = image('annotee-2')
    await S.saveReport(r)
    await sauvegarder()
    assert.equal(fichiers.size, 4)
  })

  test("un telephone neuf recupere tout, photos comprises", async () => {
    const r = rapportAvecPhotos()
    await S.saveReport(r)
    await sauvegarder()

    // Le telephone est perdu : un appareil neuf, meme code.
    remetAneuf()
    localStorage.setItem('af-code', 'stessyoberli')
    const manquants = await listerSauvegardes()
    assert.deepEqual(manquants.map((m) => m.id), [r.id])
    assert.equal(await restaurer([r.id]), 1)

    const [relu] = contenu('reports')
    assert.equal(relu.ref, r.ref)
    assert.equal(relu.photos[0].original, r.photos[0].original)
    assert.equal(relu.photos[0].dataUrl, r.photos[0].dataUrl)
    assert.equal(relu.photos[1].dataUrl, r.photos[1].dataUrl)
    assert.equal(contenu('resumes').length, 1, 'le rapport recupere doit apparaitre dans les listes')
  })

  test('un rapport supprime sur le telephone est efface en ligne', async () => {
    const r = rapportAvecPhotos()
    await S.saveReport(r)
    await sauvegarder()
    await S.deleteReport(r.id)
    await sauvegarder()
    assert.equal(fichiers.size, 0)
    assert.deepEqual(await E.lireSauvegardes(), [])
  })

  test("un employe ne voit pas les rapports des autres, l'administrateur voit tout", async () => {
    await S.saveReport(rapportAvecPhotos())
    await sauvegarder() // depose par l'administrateur
    const { code } = await E.creerEmploye('Marc')
    remetAneuf()
    localStorage.setItem('af-code', code)
    assert.deepEqual(await listerSauvegardes(), [])
    localStorage.setItem('af-code', 'stessyoberli')
    assert.equal((await listerSauvegardes()).length, 1)
  })
})
