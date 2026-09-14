// Les envois rates signales sur l'accueil de l'administrateur : ceux qui restent
// a regarder, et seulement ceux-la.

import { videLeLocalStorage } from './aide/navigateur.js'
import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { echecsARegarder, journalVu, marquerJournalVu } from '../src/equipe-alertes.js'

const MAINTENANT = Date.UTC(2026, 8, 14, 12)
const HEURE = 3_600_000
const JOUR = 24 * HEURE

// Une ligne du journal, telle que l'ecrit api/_lib/mail.js. `il` : il y a combien de temps.
const ligne = (statut, { il = HEURE, ...reste } = {}) => ({
  date: MAINTENANT - il,
  qui: 'Marc',
  role: 'employe',
  statut,
  ref: 'AF-2026-001',
  ...reste,
})

const compter = (journal, vu = 0) => echecsARegarder(journal, { vu, maintenant: MAINTENANT }).length

describe("les envois rates, sur l'accueil de l'administrateur", () => {
  test("un envoi rate d'un employe est signale", () => {
    assert.equal(compter([ligne('echec')]), 1)
  })

  test("deja montre dans l'onglet Administration, il ne l'est plus", () => {
    const journal = [ligne('echec', { il: 2 * HEURE })]
    assert.equal(compter(journal, MAINTENANT - HEURE), 0)
    assert.equal(compter(journal, MAINTENANT - 3 * HEURE), 1)
  })

  test("au-dela d'une semaine, ce n'est plus une nouvelle", () => {
    assert.equal(compter([ligne('echec', { il: 8 * JOUR })]), 0)
    assert.equal(compter([ligne('echec', { il: 6 * JOUR })]), 1)
  })

  test('un envoi rate puis reparti ne compte plus', () => {
    assert.equal(compter([ligne('envoye', { il: HEURE }), ligne('echec', { il: 2 * HEURE })]), 0)
  })

  test('un autre rapport, une autre personne ou un succes plus ancien ne le rattrapent pas', () => {
    const echec = ligne('echec', { il: 2 * HEURE })
    assert.equal(compter([ligne('envoye', { il: HEURE, ref: 'AF-2026-002' }), echec]), 1)
    assert.equal(compter([ligne('envoye', { il: HEURE, qui: 'Luc' }), echec]), 1)
    assert.equal(compter([echec, ligne('envoye', { il: 3 * HEURE })]), 1)
  })

  test("ni les envois de l'administrateur, ni les rapports d'invites qu'il relisait", () => {
    assert.equal(compter([ligne('echec', { qui: 'Administrateur', role: 'admin' })]), 0)
    assert.equal(compter([ligne('echec', { qui: 'Zoé', role: 'invite', validePar: 'Administrateur' })]), 0)
  })

  test("sans journal, ou sans echec, rien n'est signale", () => {
    assert.equal(compter(undefined), 0)
    assert.equal(compter([ligne('envoye'), ligne('a-valider'), ligne('refuse', { validePar: 'Administrateur' })]), 0)
  })

  test('a plusieurs administrateurs, chacun voit les envois rates des autres, pas les siens', () => {
    const journal = [ligne('echec', { qui: 'Marie', role: 'admin', id: 'e7' }), ligne('echec', { qui: 'Administrateur', role: 'admin', id: 'admin' })]
    assert.deepEqual(echecsARegarder(journal, { maintenant: MAINTENANT, moi: 'e7' }).map((j) => j.qui), ['Administrateur'])
    assert.deepEqual(echecsARegarder(journal, { maintenant: MAINTENANT }).map((j) => j.qui), ['Marie'])
  })
})

describe("le journal vu dans l'onglet Administration", () => {
  beforeEach(videLeLocalStorage)

  test('retient la date de sa ligne la plus recente, posee par le serveur', () => {
    assert.equal(journalVu(), 0)
    marquerJournalVu([ligne('envoye', { il: HEURE }), ligne('echec', { il: 2 * HEURE })])
    assert.equal(journalVu(), MAINTENANT - HEURE)
  })

  test('ne recule jamais : un journal plus court ne fait pas reapparaitre ce qui a ete vu', () => {
    marquerJournalVu([ligne('envoye', { il: HEURE })])
    marquerJournalVu([ligne('envoye', { il: 5 * HEURE })])
    marquerJournalVu([])
    marquerJournalVu(undefined)
    assert.equal(journalVu(), MAINTENANT - HEURE)
  })
})
