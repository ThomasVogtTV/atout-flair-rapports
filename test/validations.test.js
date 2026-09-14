// Rapports d'invites : ils attendent la validation de l'administrateur avant de
// partir chez le client. Les deux adresses tournent pour de vrai, contre une
// imitation de Redis, du stockage et du serveur de mail.
import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import * as E from '../api/_lib/equipe.js'
import { _brancherStockage } from '../api/_lib/stockage.js'
import { _brancherMail } from '../api/_lib/mail.js'
import envoi from '../api/send.js'
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
      case 'HSET': for (let i = 0; i < a.length; i += 2) h(k).set(a[i], a[i + 1]); return a.length / 2
      case 'HGET': return h(k).get(a[0]) ?? null
      case 'HDEL': return h(k).delete(a[0]) ? 1 : 0
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

let fichiers
let mails
const fauxStockage = () => ({
  put: async (chemin, contenu, o) => void fichiers.set(chemin, { contenu: Buffer.from(contenu), type: o.contentType }),
  get: async (chemin) => {
    const f = fichiers.get(chemin)
    return f ? { stream: new Blob([f.contenu]).stream(), blob: { contentType: f.type } } : null
  },
  del: async (chemins) => [].concat(chemins).forEach((c) => fichiers.delete(c)),
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
  meta: { ref: 'AF-00042', type: 'detection', adresse: 'Rue du Lac 12', rapportId: 'r42', envoiId: 'e42' },
})

describe("les rapports d'un invite passent par l'administrateur", () => {
  let invite
  let employe

  beforeEach(async () => {
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
    invite = await E.creerEmploye('Sous-traitant', { fin: Date.now() + 86_400_000 })
    employe = await E.creerEmploye('Marc')
  })

  test('un employe envoie directement au client', async () => {
    const r = await appel(envoi, employe.code, { corps: demande() })
    assert.equal(r.statut, 200)
    assert.equal(mails.length, 1)
    assert.equal(mails[0].to, 'regie@exemple.ch')
  })

  test("un invite ne parle pas au client : sa demande et son PDF attendent l'administrateur", async () => {
    const r = await appel(envoi, invite.code, { corps: demande() })
    assert.equal(r.statut, 202)
    assert.equal(r.corps.validation, true)
    assert.equal(mails.length, 0)
    assert.ok(fichiers.has('validations/e42.pdf'))

    const a = await appel(admin, ADMIN, { methode: 'GET' })
    assert.equal(a.corps.validations.length, 1)
    assert.equal(a.corps.validations[0].par.nom, 'Sous-traitant')
    assert.equal(a.corps.validations[0].to, 'regie@exemple.ch')
  })

  test("rejouee par la file d'attente, la meme demande ne s'empile pas", async () => {
    await appel(envoi, invite.code, { corps: demande() })
    await appel(envoi, invite.code, { corps: demande() })
    assert.equal((await appel(admin, ADMIN, { methode: 'GET' })).corps.validations.length, 1)
  })

  test("validee, elle part chez le client avec le PDF de l'invite, et l'invite le sait", async () => {
    await appel(envoi, invite.code, { corps: demande() })
    assert.equal((await appel(admin, ADMIN, { methode: 'GET', query: { pdf: 'e42' } })).corps.pdfBase64, PDF)

    assert.equal((await appel(admin, ADMIN, { corps: { action: 'valider', id: 'e42' } })).statut, 200)
    assert.equal(mails.length, 1)
    assert.equal(mails[0].to, 'regie@exemple.ch')
    assert.equal(mails[0].attachments[0].content.toString('base64'), PDF)
    assert.equal(fichiers.has('validations/e42.pdf'), false)
    assert.equal((await appel(admin, ADMIN, { methode: 'GET' })).corps.validations.length, 0)

    const suivi = await appel(envoi, invite.code, { methode: 'GET' })
    assert.deepEqual(
      suivi.corps.validations.map((v) => [v.rapportId, v.statut]),
      [['r42', 'envoye']]
    )
    // Deja partie : la valider une seconde fois n'enverrait pas un second mail.
    assert.equal((await appel(admin, ADMIN, { corps: { action: 'valider', id: 'e42' } })).statut, 409)
    assert.equal(mails.length, 1)
  })

  test('refusee, elle ne part pas et porte son motif', async () => {
    await appel(envoi, invite.code, { corps: demande() })
    await appel(admin, ADMIN, { corps: { action: 'refuser', id: 'e42', motif: 'Photos du salon manquantes' } })
    assert.equal(mails.length, 0)
    const [v] = (await appel(envoi, invite.code, { methode: 'GET' })).corps.validations
    assert.equal(v.statut, 'refuse')
    assert.equal(v.motif, 'Photos du salon manquantes')
  })

  test("seul l'administrateur valide, et chaque invite ne voit que ses demandes", async () => {
    await appel(envoi, invite.code, { corps: demande() })
    assert.equal((await appel(admin, employe.code, { corps: { action: 'valider', id: 'e42' } })).statut, 403)
    assert.equal((await appel(admin, invite.code, { corps: { action: 'valider', id: 'e42' } })).statut, 403)
    assert.equal(mails.length, 0)
    const autre = await E.creerEmploye('Autre sous-traitant', { fin: Date.now() + 86_400_000 })
    assert.equal((await appel(envoi, autre.code, { methode: 'GET' })).corps.validations.length, 0)
  })
})
