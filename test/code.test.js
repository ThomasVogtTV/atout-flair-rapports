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
