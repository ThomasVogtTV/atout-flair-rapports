// Les resumes : ce que les listes lisent a la place des rapports entiers. Ils
// doivent rester legers, toujours en phase, et ne jamais pouvoir ecraser le
// rapport dont ils sont tires.

import { remetAneuf, contenu } from './aide/navigateur.js'
import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import * as S from '../src/state.js'
import * as db from '../src/db.js'
import { rapportDetection } from './aide/rapports.js'

beforeEach(() => remetAneuf())

const avecPhotos = () => {
  const r = rapportDetection()
  r.photos = [{ id: 'p1', rowId: null, original: 'data:image/jpeg;base64,AAAA', dataUrl: 'data:image/jpeg;base64,BBBB' }]
  r.signature = 'data:image/png;base64,CCCC'
  return r
}

describe('les resumes', () => {
  test("s'ecrivent avec le rapport, sans photos ni signature", async () => {
    const r = avecPhotos()
    await S.saveReport(r)
    const [resume] = contenu('resumes')
    assert.equal(resume.id, r.id)
    assert.equal(resume.ref, r.ref)
    assert.equal(resume.nPhotos, 1)
    assert.equal(resume.photos, undefined)
    assert.equal(resume.signature, undefined)
    assert.deepEqual(resume.rows, [])
    assert.equal(contenu('reports')[0].photos.length, 1, 'le rapport entier a perdu ses photos')
  })

  test('sont ce que les listes lisent', async () => {
    await S.saveReport(avecPhotos())
    const [ligne] = await S.listReports()
    assert.equal(ligne.photos, undefined)
    assert.equal(ligne.resume, true)
  })

  test("ne peuvent jamais etre enregistres a la place du rapport", async () => {
    const r = avecPhotos()
    await S.saveReport(r)
    const [ligne] = await S.listReports()
    assert.equal(await S.saveReport(ligne), false)
    assert.equal(contenu('reports')[0].photos.length, 1)
  })

  test('se reconstruisent pour les rapports qui n’en ont pas, et disparaissent avec eux', async () => {
    // Un rapport ecrit avant la mise a jour : pas de resume.
    const ancien = avecPhotos()
    await db.put('reports', ancien)
    await db.put('resumes', { id: 'orphelin', resume: true })
    await S.synchroniserResumes()
    assert.deepEqual(contenu('resumes').map((r) => r.id), [ancien.id])
  })

  test('suivent la suppression', async () => {
    const r = avecPhotos()
    await S.saveReport(r)
    await S.deleteReport(r.id)
    assert.deepEqual(contenu('resumes'), [])
  })

  test("les sous-rapports d'un immeuble se rechargent en entier", async () => {
    const enfant = avecPhotos()
    enfant.parentId = 'parent1'
    await S.saveReport(enfant)
    const [relu] = await S.enfantsDe('parent1')
    assert.equal(relu.photos.length, 1)
  })
})
