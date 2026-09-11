import { test } from 'node:test'
import assert from 'node:assert/strict'
import { codeCorrespond } from '../src/code.js'

test("le code d'accès", async (t) => {
  await t.test('accepte le bon code, quelle que soit la casse', () => {
    assert.equal(codeCorrespond('StessyOberli', 'StessyOberli'), true)
    assert.equal(codeCorrespond('stessyoberli', 'StessyOberli'), true)
    assert.equal(codeCorrespond('  STESSYOBERLI ', 'StessyOberli'), true)
  })
  await t.test('refuse un autre code', () => {
    assert.equal(codeCorrespond('StessyOberly', 'StessyOberli'), false)
  })
  await t.test("refuse tout quand rien n'est enregistré", () => {
    assert.equal(codeCorrespond('', ''), false)
    assert.equal(codeCorrespond('StessyOberli', ''), false)
    assert.equal(codeCorrespond('   ', '   '), false)
  })
})

import { souvenirValide, SOUVENIR_MS } from '../src/code.js'

test('se souvenir de moi', async (t) => {
  const maintenant = 1_800_000_000_000
  await t.test('dispense du code pendant trente jours', () => {
    assert.equal(souvenirValide(maintenant + SOUVENIR_MS, maintenant + SOUVENIR_MS - 1), true)
  })
  await t.test('redemande le code une fois le delai passe', () => {
    assert.equal(souvenirValide(maintenant + SOUVENIR_MS, maintenant + SOUVENIR_MS), false)
  })
  await t.test('rien de memorise, rien de valide', () => {
    assert.equal(souvenirValide(null, maintenant), false)
    assert.equal(souvenirValide(0, maintenant), false)
    assert.equal(souvenirValide('pas une date', maintenant), false)
  })
})
