// Le carnet : il se remplit tout seul, ne perd rien de ce qu'il savait, et
// retrouve un client et ses rapports sans se soucier des accents.

import { remetAneuf, contenu } from './aide/navigateur.js'
import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import * as S from '../src/state.js'
import * as db from '../src/db.js'

beforeEach(() => remetAneuf())

const rapport = (mandant, extra = {}) => {
  const r = S.newReport('detection')
  r.mandant = { ...r.mandant, ...mandant }
  return Object.assign(r, extra)
}

describe('le carnet', () => {
  test("se souvient d'un client sans effacer ce qu'il savait deja", async () => {
    await S.rememberContact({ type: 'gerance', nom: 'Régie Duval', email: 'info@duval.ch', tel: '021 000 00 00', adresse: '', npaLieu: '' })
    await S.rememberContact({ type: '', nom: 'regie  duval', email: '', tel: '', adresse: 'Rue du Lac 3', npaLieu: '1000 Lausanne' })
    const tous = contenu('contacts')
    assert.equal(tous.length, 1)
    assert.equal(tous[0].email, 'info@duval.ch')
    assert.equal(tous[0].type, 'gerance')
    assert.equal(tous[0].adresse, 'Rue du Lac 3')
  })

  test('retrouve un client par morceaux, sans accents, ou par son numero', () => {
    const c = { nom: 'Favre', prenom: 'Élise', adresse: 'Rue des Fontaines 4', npaLieu: '1400 Yverdon', tel: '079 123 45 67' }
    assert.ok(S.matchContact(c, 'fontaines elise'))
    assert.ok(S.matchContact(c, '0791234567'))
    assert.ok(S.matchContact(c, ''))
    assert.ok(!S.matchContact(c, 'duval'))
  })

  test('rattache a un client ses rapports, comme mandant ou comme locataire', () => {
    const c = { nom: 'Favre', prenom: 'Élise' }
    const a = rapport({ nom: 'Favre', prenom: 'Elise' }, { updatedAt: 1 })
    const b = rapport({ type: 'gerance', nom: 'Régie Duval' }, { updatedAt: 3, lieu: { locataire: 'favre élise' } })
    const autre = rapport({ nom: 'Rochat' }, { updatedAt: 2 })
    const enfant = rapport({ nom: 'Favre', prenom: 'Elise' }, { parentId: 'x' })
    const liste = S.rapportsDuContact(c, [a, b, autre, enfant])
    assert.deepEqual(liste.map((r) => r.id), [b.id, a.id])

    const act = S.activiteDe(c, S.activiteParNom([a, b, autre, enfant]))
    assert.deepEqual(act, { n: 2, dernier: 3 })
  })

  test('reprend une fois les clients des rapports deja faits, sans doublon', async () => {
    await S.saveContact({ nom: 'Rochat', type: 'proprietaire' })
    // Ecrits directement : saveReport remettrait leur date a maintenant.
    await db.put('reports', rapport({ type: 'gerance', nom: 'Régie Duval', email: 'ancien@duval.ch', tel: '021 000 00 00' }, { updatedAt: 1 }))
    await db.put('reports', rapport({ type: 'gerance', nom: 'Regie Duval', email: 'info@duval.ch' }, { updatedAt: 2 }))
    await S.saveReport(rapport({ nom: 'rochat' }))
    await S.saveReport(rapport({ nom: '' }))

    assert.equal(await S.reprendreClients(), 1)
    const duval = contenu('contacts').find((c) => c.nom.startsWith('Regie') || c.nom.startsWith('Régie'))
    assert.equal(duval.email, 'info@duval.ch')
    // Le telephone manquait au dernier rapport : il vient du premier.
    assert.equal(duval.tel, '021 000 00 00')
    assert.equal(contenu('contacts').length, 2)

    // Un contact supprime ensuite ne revient pas au prochain demarrage.
    await S.deleteContact(duval.id)
    assert.equal(await S.reprendreClients(), 0)
    assert.equal(contenu('contacts').length, 1)
  })

  // Le carnet commun ne recoit que ce qui a change : chaque ecriture est datee
  // et marquee a envoyer, chaque suppression attend son tour.
  test('note ce qui reste a envoyer au carnet de l’équipe', async () => {
    let signaux = 0
    S.onCarnetModifie(() => signaux++)
    await S.saveContact({ nom: 'Rochat' })
    const [c] = contenu('contacts')
    assert.equal(c.aEnvoyer, true)
    assert.ok(c.maj > 0)
    await S.deleteContact(c.id)
    assert.deepEqual(S.suppressionsEnAttente(), [c.id])
    assert.equal(signaux, 2)
    S.onCarnetModifie(null)
  })
})

describe('les favoris', () => {
  test("se cochent et se decochent, et partent au carnet de l'equipe", async () => {
    await S.saveContact({ nom: 'Régie Duval', type: 'gerance' })
    const [c] = contenu('contacts')
    assert.equal((await S.basculerFavori(c.id)).favori, true)
    assert.equal(contenu('contacts')[0].favori, true)
    assert.equal(contenu('contacts')[0].aEnvoyer, true)
    assert.equal((await S.basculerFavori(c.id)).favori, false)
    assert.equal(await S.basculerFavori(undefined), null)
  })

  // Le formulaire ne connait que les coordonnees : l'enregistrer ne doit pas
  // faire tomber l'etoile.
  test('survivent a une modification de la fiche', async () => {
    await S.saveContact({ nom: 'Favre' })
    const [c] = contenu('contacts')
    await S.basculerFavori(c.id)
    await S.saveContact({ id: c.id, type: '', nom: 'Favre', prenom: 'Élise', adresse: '', npaLieu: '', tel: '', email: '' })
    assert.equal(contenu('contacts')[0].favori, true)
    assert.equal(contenu('contacts')[0].prenom, 'Élise')
  })

  test('passent en tete des propositions pendant la frappe', () => {
    const contacts = [{ id: 'a', nom: 'Favre Anne' }, { id: 'b', nom: 'Favre Bruno', favori: true }]
    assert.deepEqual(S.matchContacts('favre', contacts).map((c) => c.id), ['b', 'a'])
  })
})
