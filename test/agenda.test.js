// Agenda de l'equipe : qui voit et touche quoi cote serveur, et le rendez-vous
// mis au format des agendas de telephone.
import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { nettoyerRdv, visiblesPour, peutModifier } from '../api/_lib/agenda.js'
import * as E from '../api/_lib/equipe.js'
import handler from '../api/agenda.js'
import {
  fichierIcs,
  lienGoogleAgenda,
  trierRdv,
  libelleJour,
  plusJours,
  aVenir,
  grilleMois,
  decalerMois,
  libelleMois,
  enHeure,
  finDe,
  libelleDuree,
  seChevauchent,
  conflitsDe,
  lundiDe,
  decalerSemaine,
  grilleSemaine,
  libelleSemaine,
  plageJournee,
  disposerJour,
  tonPersonne,
  personnesDe,
  estAnnule,
  libelleStatut,
} from '../src/agenda-outils.js'

const rdvBrut = (x = {}) => ({ id: 'r1', date: '2026-09-14', heure: '14:30', type: 'immeuble', client: { type: 'gerance', nom: 'Régie Duval' }, ...x })

describe('un rendez-vous', () => {
  test("n'existe pas sans date ni client", () => {
    assert.equal(nettoyerRdv(rdvBrut({ date: '' })), null)
    assert.equal(nettoyerRdv(rdvBrut({ client: { nom: ' ' } })), null)
    assert.equal(nettoyerRdv(rdvBrut({ id: 'a b' })), null)
  })

  test('une heure ou un type faux se corrigent au lieu de tout refuser', () => {
    const r = nettoyerRdv(rdvBrut({ heure: '25:99', type: 'pirate' }), 1)
    assert.equal(r.heure, '')
    assert.equal(r.type, 'detection')
  })
})

describe('qui voit et modifie quoi', () => {
  const admin = { role: 'admin', nom: 'Administrateur' }
  const marc = { role: 'employe', id: 'e1', nom: 'Marc' }
  const paul = { role: 'invite', id: 'e2', nom: 'Paul' }
  const rdvs = [
    { id: 'a', pour: { id: 'e1' }, par: { id: 'admin' } },
    { id: 'b', pour: { id: 'e2' }, par: { id: 'admin' } },
    { id: 'c', pour: { id: 'admin' }, par: { id: 'admin' } },
  ]

  test("l'equipe voit tout, un invite seulement les siens", () => {
    assert.equal(visiblesPour(admin, rdvs).length, 3)
    assert.equal(visiblesPour(marc, rdvs).length, 3)
    assert.deepEqual(visiblesPour(paul, rdvs).map((r) => r.id), ['b'])
  })

  test('un employe ne modifie que les siens, un invite aucun', () => {
    assert.equal(peutModifier(admin, rdvs[2]), true)
    assert.equal(peutModifier(marc, rdvs[0]), true)
    assert.equal(peutModifier(marc, rdvs[2]), false)
    assert.equal(peutModifier(paul, rdvs[1]), false)
  })
})

// --- l'adresse /api/agenda, contre une imitation de Redis ------------------

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
      case 'HDEL': return h(k).delete(a[0]) ? 1 : 0
      case 'SADD': s(k).add(a[0]); return 1
      default: throw new Error('commande non imitee : ' + cmd)
    }
  }
}

const appel = async (code, corps) => {
  const res = { statut: 0, corps: null, status(n) { this.statut = n; return this }, json(o) { this.corps = o; return this }, setHeader() {} }
  await handler({ method: corps ? 'POST' : 'GET', headers: { 'x-app-code': code }, body: corps }, res)
  return res
}

describe('/api/agenda', () => {
  const ADMIN = 'stessyoberli'
  const demain = new Date(Date.now() + 86_400_000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Zurich' })

  beforeEach(() => {
    process.env.APP_CODE = 'StessyOberli'
    process.env.KV_REST_API_URL = 'https://faux'
    process.env.KV_REST_API_TOKEN = 'faux'
    E._brancherBase(fauxRedis())
  })

  test("l'administrateur attribue un rendez-vous, l'employe le voit", async () => {
    const { id, code } = await E.creerEmploye('Marc')
    const r = await appel(ADMIN, { action: 'enregistrer', rdv: rdvBrut({ date: demain, pour: { id, nom: 'Marc' } }) })
    assert.equal(r.statut, 200)
    assert.equal(r.corps.rdv.pour.id, id)
    const vu = await appel(code)
    assert.deepEqual(vu.corps.rdvs.map((x) => x.id), ['r1'])
    assert.equal(vu.corps.moi.id, id)
  })

  test("un employe n'attribue qu'a lui-meme, et ne touche pas au rendez-vous d'un collegue", async () => {
    const marc = await E.creerEmploye('Marc')
    const julie = await E.creerEmploye('Julie')
    const r = await appel(marc.code, { action: 'enregistrer', rdv: rdvBrut({ date: demain, pour: { id: julie.id, nom: 'Julie' } }) })
    assert.equal(r.corps.rdv.pour.id, marc.id)
    assert.equal((await appel(julie.code, { action: 'supprimer', id: 'r1' })).statut, 403)
    assert.equal((await appel(marc.code, { action: 'supprimer', id: 'r1' })).statut, 200)
    assert.equal((await appel(ADMIN)).corps.rdvs.length, 0)
  })

  test('un invite voit les siens, les commence, et ne peut rien modifier', async () => {
    const paul = await E.creerEmploye('Paul', { fin: Date.now() + 5 * 86_400_000 })
    await appel(ADMIN, { action: 'enregistrer', rdv: rdvBrut({ date: demain, pour: { id: paul.id, nom: 'Paul' } }) })
    await appel(ADMIN, { action: 'enregistrer', rdv: rdvBrut({ id: 'r2', date: demain }) })
    const vu = await appel(paul.code)
    assert.deepEqual(vu.corps.rdvs.map((x) => x.id), ['r1'])
    assert.equal((await appel(paul.code, { action: 'enregistrer', rdv: rdvBrut({ id: 'r9', date: demain }) })).statut, 403)
    assert.equal((await appel(paul.code, { action: 'commencer', id: 'r1', rapportId: 'rap1' })).statut, 200)
    assert.equal((await appel(paul.code, { action: 'commencer', id: 'r2', rapportId: 'rap2' })).statut, 404)
  })
})

describe("vers l'agenda du telephone", () => {
  test('un fichier .ics a la bonne heure, avec un rappel trente minutes avant', () => {
    const ics = fichierIcs(nettoyerRdv(rdvBrut({ lieu: { adresse: 'Ch. des Pins 8', npaLieu: '1005 Lausanne' }, note: 'Code 1234' }), 1))
    assert.match(ics, /DTSTART:20260914T143000\r\n/)
    assert.match(ics, /DTEND:20260914T153000\r\n/)
    assert.match(ics, /LOCATION:Ch. des Pins 8\\, 1005 Lausanne/)
    assert.match(ics, /TRIGGER:-PT30M/)
    assert.match(ics, /SUMMARY:Régie Duval - Immeuble/)
  })

  test('sans heure, toute la journee, et un lien Google Agenda', () => {
    const r = nettoyerRdv(rdvBrut({ heure: '' }), 1)
    assert.match(fichierIcs(r), /DTSTART;VALUE=DATE:20260914\r\nDTEND;VALUE=DATE:20260915/)
    assert.match(lienGoogleAgenda(r), /dates=20260914%2F20260915/)
  })

  test("s'ordonne par jour et par heure, et nomme les jours proches", () => {
    const l = trierRdv([{ date: '2026-09-14', heure: '' }, { date: '2026-09-14', heure: '08:00' }, { date: '2026-09-13', heure: '17:00' }])
    assert.deepEqual(l.map((x) => `${x.date} ${x.heure}`), ['2026-09-13 17:00', '2026-09-14 08:00', '2026-09-14 '])
    assert.equal(libelleJour('2026-09-11', '2026-09-11'), "Aujourd'hui")
    assert.equal(libelleJour(plusJours('2026-09-11', 1), '2026-09-11'), 'Demain')
    assert.match(libelleJour('2026-09-14', '2026-09-11'), /^Lundi 14 septembre$/)
    assert.equal(aVenir([{ date: '2026-09-10' }, { date: '2026-09-12' }], '2026-09-11').length, 1)
  })
})

describe('le calendrier du mois', () => {
  // Septembre 2026 commence un mardi : la grille part du lundi 31 aout.
  test('commence un lundi et couvre des semaines entieres', () => {
    const g = grilleMois('2026-09')
    assert.equal(g[0].iso, '2026-08-31')
    assert.equal(g[0].dansMois, false)
    assert.equal(g[1].iso, '2026-09-01')
    assert.equal(g.length % 7, 0)
    assert.equal(g.filter((c) => c.dansMois).length, 30)
    assert.equal(g.at(-1).iso, '2026-10-04')
  })

  test('passe d un mois a l autre, annee comprise', () => {
    assert.equal(decalerMois('2026-12', 1), '2027-01')
    assert.equal(decalerMois('2026-01', -1), '2025-12')
    assert.equal(libelleMois('2026-09'), 'Septembre 2026')
  })
})

describe('les durees', () => {
  test('une heure par defaut, et une valeur absurde ne passe pas', () => {
    assert.equal(nettoyerRdv(rdvBrut(), 1).duree, 60)
    assert.equal(nettoyerRdv(rdvBrut({ duree: 9999 }), 1).duree, 60)
    assert.equal(nettoyerRdv(rdvBrut({ duree: 'deux heures' }), 1).duree, 60)
    assert.equal(nettoyerRdv(rdvBrut({ duree: 92 }), 1).duree, 90)
    assert.equal(nettoyerRdv(rdvBrut({ duree: 480 }), 1).duree, 480)
  })

  test("un rendez-vous sans heure n'a pas de duree", () => {
    assert.equal(nettoyerRdv(rdvBrut({ heure: '', duree: 120 }), 1).duree, 0)
  })

  test('la fin du rendez-vous suit la duree, jusque dans le fichier .ics', () => {
    const r = nettoyerRdv(rdvBrut({ duree: 150 }), 1)
    assert.equal(enHeure(finDe(r)), '17:00')
    assert.match(fichierIcs(r), /DTEND:20260914T170000/)
    assert.equal(libelleDuree(150), '2 h 30')
    assert.equal(libelleDuree(45), '45 min')
  })
})

describe('la double reservation', () => {
  const marc = { id: 'e1', nom: 'Marc' }
  const julie = { id: 'e2', nom: 'Julie' }
  const a = { id: 'a', date: '2026-09-14', heure: '09:00', duree: 90, pour: marc }

  test('se voit quand la meme personne est prise, pas quand c est une collegue', () => {
    const b = { id: 'b', date: '2026-09-14', heure: '10:00', duree: 60, pour: marc }
    assert.equal(seChevauchent(a, b), true)
    assert.deepEqual(conflitsDe(a, [a, b]).map((r) => r.id), ['b'])
    assert.equal(conflitsDe(a, [a, { ...b, pour: julie }]).length, 0)
  })

  test('deux rendez-vous qui se suivent ne se chevauchent pas', () => {
    assert.equal(seChevauchent(a, { id: 'c', date: '2026-09-14', heure: '10:30', duree: 60, pour: marc }), false)
    assert.equal(seChevauchent(a, { id: 'd', date: '2026-09-15', heure: '09:00', duree: 60, pour: marc }), false)
    assert.equal(seChevauchent(a, { id: 'e', date: '2026-09-14', heure: '', pour: marc }), false)
  })
})

describe('le semainier', () => {
  test('part du lundi et le dit en toutes lettres', () => {
    assert.equal(lundiDe('2026-09-12'), '2026-09-07')
    assert.equal(lundiDe('2026-09-07'), '2026-09-07')
    assert.equal(decalerSemaine('2026-09-07', 1), '2026-09-14')
    assert.deepEqual(grilleSemaine('2026-09-07').map((j) => j.jour), [7, 8, 9, 10, 11, 12, 13])
    assert.equal(libelleSemaine('2026-09-07'), '7 – 13 septembre 2026')
    assert.match(libelleSemaine('2026-09-28'), /^28 sept\. – 4 oct\. 2026$/)
    assert.match(libelleSemaine('2026-12-28'), /2026 – 3 janv\. 2027$/)
  })

  test('la journee montree va de 7 h a 19 h, et s elargit pour un rendez-vous matinal', () => {
    assert.deepEqual(plageJournee([]), { debut: 420, fin: 1140 })
    const tot = plageJournee([{ heure: '06:30', duree: 60 }])
    assert.equal(tot.debut, 360)
    const tard = plageJournee([{ heure: '19:00', duree: 180 }])
    assert.equal(tard.fin, 22 * 60)
  })

  test('deux rendez-vous qui se chevauchent se partagent la colonne', () => {
    const places = disposerJour([
      { id: 'a', heure: '09:00', duree: 60 },
      { id: 'b', heure: '09:30', duree: 60 },
      { id: 'c', heure: '14:00', duree: 30 },
      { id: 'd', heure: '', duree: 0 },
    ])
    assert.deepEqual(
      places.map((p) => [p.rdv.id, p.colonne, p.colonnes]),
      [['a', 0, 2], ['b', 1, 2], ['c', 0, 1]]
    )
    assert.equal(places[0].fin, 600)
  })

  test('chacun garde sa couleur, le patron celle de la marque', () => {
    assert.equal(tonPersonne('admin'), 'accent')
    assert.equal(tonPersonne('e1'), tonPersonne('e1'))
    assert.notEqual(tonPersonne('e1'), 'accent')
  })

  test('les personnes de l agenda sortent par ordre alphabetique, sans doublon', () => {
    const gens = personnesDe([
      { pour: { id: 'e2', nom: 'Marc' } },
      { pour: { id: 'e1', nom: 'Julie' } },
      { pour: { id: 'e2', nom: 'Marc' } },
      { pour: null },
    ])
    assert.deepEqual(gens, [{ id: 'e1', nom: 'Julie' }, { id: 'e2', nom: 'Marc' }])
  })
})

describe("l'etat d'un rendez-vous", () => {
  test('prevu par defaut, et un etat invente est refuse', () => {
    assert.equal(nettoyerRdv(rdvBrut(), 1).statut, 'prevu')
    assert.equal(nettoyerRdv(rdvBrut({ statut: 'peut-etre' }), 1).statut, 'prevu')
    assert.equal(nettoyerRdv(rdvBrut({ statut: 'annule' }), 1).statut, 'annule')
  })

  test('un rendez-vous annule ne compte plus parmi ceux a venir', () => {
    const l = [
      { id: 'a', date: '2026-09-14' },
      { id: 'b', date: '2026-09-15', statut: 'annule' },
      { id: 'c', date: '2026-09-16', statut: 'fait' },
    ]
    assert.deepEqual(aVenir(l, '2026-09-11').map((r) => r.id), ['a', 'c'])
    assert.equal(libelleStatut(l[1]), 'Annulé')
    assert.equal(libelleStatut(l[2]), 'Fait')
    assert.equal(libelleStatut(l[0]), '')
    assert.equal(estAnnule(l[1]), true)
  })

  test('le controle garde le rapport dont il est la suite', () => {
    assert.equal(nettoyerRdv(rdvBrut({ suiteDe: 'rap-1' }), 1).suiteDe, 'rap-1')
    assert.equal(nettoyerRdv(rdvBrut({ suiteDe: 'pas un id !' }), 1).suiteDe, null)
  })
})

describe('/api/agenda : fait, annule', () => {
  const ADMIN = 'stessyoberli'
  const demain = new Date(Date.now() + 86_400_000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Zurich' })

  beforeEach(() => {
    process.env.APP_CODE = 'StessyOberli'
    process.env.KV_REST_API_URL = 'https://faux'
    process.env.KV_REST_API_TOKEN = 'faux'
    E._brancherBase(fauxRedis())
  })

  test("l'employe marque le sien fait, pas celui d'une collegue", async () => {
    const marc = await E.creerEmploye('Marc')
    const julie = await E.creerEmploye('Julie')
    await appel(ADMIN, { action: 'enregistrer', rdv: rdvBrut({ date: demain, pour: { id: marc.id, nom: 'Marc' } }) })
    assert.equal((await appel(julie.code, { action: 'statut', id: 'r1', statut: 'fait' })).statut, 403)
    const ok = await appel(marc.code, { action: 'statut', id: 'r1', statut: 'fait' })
    assert.equal(ok.statut, 200)
    assert.equal(ok.corps.rdv.statut, 'fait')
    assert.equal((await appel(marc.code, { action: 'statut', id: 'r1', statut: 'brouillon' })).statut, 400)
    assert.equal((await appel(ADMIN)).corps.rdvs[0].statut, 'fait')
  })

  test("modifier un rendez-vous ne perd ni son etat ni le rapport dont il est la suite", async () => {
    await appel(ADMIN, { action: 'enregistrer', rdv: rdvBrut({ date: demain, suiteDe: 'rap-1' }) })
    await appel(ADMIN, { action: 'statut', id: 'r1', statut: 'fait' })
    const vu = (await appel(ADMIN)).corps.rdvs[0]
    await appel(ADMIN, { action: 'enregistrer', rdv: { ...vu, heure: '16:00' } })
    const apres = (await appel(ADMIN)).corps.rdvs[0]
    assert.equal(apres.heure, '16:00')
    assert.equal(apres.statut, 'fait')
    assert.equal(apres.suiteDe, 'rap-1')
  })
})
