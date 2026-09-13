// Les etapes d'un rapport : ce qui est fait, ce qui manque, et ou l'on reprend.
// Une etape ne bloque rien - elle dit ce qui reste, pour que rien ne parte par
// oubli. C'est cette promesse-la qu'on verifie.
import { remetAneuf } from './aide/navigateur.js'
import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import * as S from '../src/state.js'
import { ETAPES, etapesDuRapport, etapeDeReprise, manques, progression, adresseDuLieu } from '../src/etapes.js'
import { rapportDetection } from './aide/rapports.js'

beforeEach(() => remetAneuf())

const etat = (r) => Object.fromEntries(etapesDuRapport(r).map((e) => [e.id, e.fait]))

describe('un rapport neuf', () => {
  test('commence par le client, et rien de ce qu il faut saisir n est coche', () => {
    const r = S.newReport('detection')
    assert.deepEqual(ETAPES, ['client', 'lieu', 'detection', 'constats', 'cloture'])
    const e = etat(r)
    assert.equal(e.client, false)
    assert.equal(e.lieu, false)
    assert.equal(e.detection, false)
    assert.equal(e.cloture, false)
    assert.equal(etapeDeReprise(r), 0)
  })

  test('les pieces pre-remplies ne comptent pas comme controlees', () => {
    const r = S.newReport('detection')
    const detection = etapesDuRapport(r).find((x) => x.id === 'detection')
    assert.equal(detection.resume, `0/${r.rows.length} pièces`)
  })
})

describe('un brouillon repris', () => {
  test('reprend a la premiere etape qui reste a faire', () => {
    const r = rapportDetection()
    // trois pieces sur six n'ont pas encore de verdict
    assert.equal(etapeDeReprise(r), 2)
    for (const l of r.rows) l.contamine ||= 'non'
    r.signature = 'data:image/png;base64,AAAA'
    assert.equal(etapeDeReprise(r), 4)
  })

  test('un marquage du chien avec le constat par defaut reclame les remarques', () => {
    const r = S.newReport('detection')
    r.rows[0].contamine = 'oui'
    const constats = etapesDuRapport(r).find((x) => x.id === 'constats')
    assert.equal(r.remarques, S.DEFAULT_REMARQUES)
    assert.equal(constats.fait, false)
    assert.equal(constats.alerte, 'Remarques à compléter')
    assert.deepEqual(manques(r).find((m) => m.texte === 'Les remarques, puisque le chien a marqué'), {
      texte: 'Les remarques, puisque le chien a marqué',
      etape: 3,
    })
  })

  test('la detection signale les contaminees, accordees au type', () => {
    const r = S.newReport('immeuble')
    // un immeuble demarre avec une ligne ; on en veut deux, toutes deux tranchees
    r.rows = [S.newRow('immeuble'), S.newRow('immeuble')]
    r.rows[0].contamine = 'oui'
    r.rows[1].contamine = 'oui'
    const d = etapesDuRapport(r).find((x) => x.id === 'detection')
    assert.equal(d.alerte, '2 contaminés')
    assert.equal(d.resume, '2/2 appartements')
    assert.equal(d.fait, true)
  })
})

describe('la cloture', () => {
  test('un rapport deja remis s ouvre sur son bilan', () => {
    const r = rapportDetection()
    r.status = 'sent'
    assert.equal(etapeDeReprise(r), ETAPES.length - 1)
  })

  test('liste ce qui manque en toutes lettres', () => {
    const r = S.newReport('immeuble')
    const liste = manques(r).map((m) => m.texte)
    assert.ok(liste.includes('Le nom du client'))
    assert.ok(liste.includes("L'adresse d'intervention"))
    assert.ok(liste.includes('1 appartement sans verdict'))
    assert.ok(liste.includes('La signature sur place'))
    r.rows = []
    assert.ok(manques(r).map((m) => m.texte).includes('Au moins un appartement'))
  })

  test('un rapport complet ne manque de rien', () => {
    const r = rapportDetection()
    for (const l of r.rows) l.contamine ||= 'non'
    r.signature = 'data:image/png;base64,AAAA'
    assert.deepEqual(manques(r), [])
    assert.deepEqual(progression(r), { faites: 5, total: 5, part: 1 })
  })

  test("l'adresse du lieu suit la forme du rapport", () => {
    const r = S.newReport('hotel')
    r.lieu.adresse = 'Pl. du Port 17'
    r.lieu.npaLieu = '1006 Lausanne'
    assert.equal(adresseDuLieu(r), 'Pl. du Port 17, 1006 Lausanne')
  })
})
