// Le modele : ce qu'un rapport est, et ce qu'il devient.
//
// Tout tient dans un seul telephone, sans serveur pour rattraper une erreur.
// Les regles eprouvees ici sont celles dont la violation coute du travail deja
// fait, ou envoie un document faux chez une regie.

import { remetAneuf, refuseLesEcritures, contenu, poseLaPlace } from './aide/navigateur.js'
import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import * as S from '../src/state.js'
import { rapportDetection, rapportImmeuble } from './aide/rapports.js'

beforeEach(() => {
  remetAneuf()
  poseLaPlace({ usage: 7_000_000, quota: 110_000_000_000 })
})

describe('le numero de rapport', () => {
  // Le compteur garde une copie en memoire pour survivre a la perte de
  // localStorage en pleine session. Cette copie vit dans le module, donc entre
  // les tests : on affirme donc des rapports entre numeros, jamais des valeurs
  // absolues - et l'on recharge un module neuf quand il faut simuler un
  // demarrage a froid.
  const aFroid = () => import(`../src/state.js?froid=${compteurDeChargement++}`)
  let compteurDeChargement = 0

  const numerosEnBase = () => contenu('reports').map((r) => S.numeroDeRef(r.ref))

  test('avance a chaque rapport', () => {
    const a = S.newReport('detection')
    const b = S.newReport('detection')
    assert.equal(S.numeroDeRef(b.ref), S.numeroDeRef(a.ref) + 1)
  })

  test('se lit, ou vaut zero quand il ne dit rien', () => {
    assert.equal(S.numeroDeRef('AF-00042'), 42)
    assert.equal(S.numeroDeRef('AF-00001'), 1)
    assert.equal(S.numeroDeRef(' AF-00007 '), 7)
    for (const rien of [undefined, null, '', 'AF-', 'XX-00012', 'AF-12a', 12]) {
      assert.equal(S.numeroDeRef(rien), 0, `« ${rien} » aurait du valoir 0`)
    }
  })

  test('se formate toujours sur cinq chiffres', () => {
    assert.match(S.newReport('detection').ref, /^AF-\d{5}$/)
  })

  // Le defaut : le compteur vit dans localStorage, les rapports dans IndexedDB.
  // Le navigateur vide le premier sans toucher au second - et AF-00001, deja
  // imprime chez une regie, repartait sur une autre intervention.
  test('se reprend sur les rapports apres un demarrage a froid', async () => {
    for (let i = 0; i < 5; i++) await S.saveReport(S.newReport('detection'))
    const emis = numerosEnBase()
    assert.equal(emis.length, 5)

    // L'appareil redemarre sans son compteur : ni localStorage, ni memoire.
    localStorage.clear()
    const neuve = await aFroid()

    const bilan = await neuve.repriseCompteur()
    assert.equal(bilan.plusHaut, Math.max(...emis))
    assert.equal(bilan.compteur, 0, 'le compteur devait etre vide au demarrage')
    assert.equal(bilan.repris, true)

    const suivant = neuve.newReport('detection')
    assert.equal(neuve.numeroDeRef(suivant.ref), Math.max(...emis) + 1)
    assert.ok(!emis.includes(neuve.numeroDeRef(suivant.ref)), `${suivant.ref} avait deja ete emis`)
  })

  test('ne recule jamais quand la base est en retard sur le compteur', async () => {
    // Des rapports crees mais jamais enregistres : la base ne les connait pas.
    const dernier = [...Array(3)].map(() => S.newReport('detection')).at(-1)
    const bilan = await S.repriseCompteur()
    assert.equal(bilan.repris, false)
    assert.equal(S.numeroDeRef(S.newReport('detection').ref), S.numeroDeRef(dernier.ref) + 1)
  })

  test('reste juste si localStorage disparait en pleine session', async () => {
    const dernier = [...Array(3)].map(() => S.newReport('detection')).at(-1)
    localStorage.clear()
    // Pas de reprise possible : c'est la copie en memoire qui doit tenir.
    assert.equal(S.numeroDeRef(S.newReport('detection').ref), S.numeroDeRef(dernier.ref) + 1)
  })

  test('ne se repete jamais, meme malmene', async () => {
    const vus = new Set(numerosEnBase())
    let module = S
    for (let i = 0; i < 60; i++) {
      const r = module.newReport('detection')
      const n = module.numeroDeRef(r.ref)
      assert.ok(!vus.has(n), `${r.ref} emis deux fois`)
      vus.add(n)
      await module.saveReport(r)
      // Un coup sur sept, l'appareil perd son compteur et redemarre.
      if (i % 7 === 6) {
        localStorage.clear()
        module = await aFroid()
        await module.repriseCompteur()
      }
    }
  })
})

describe('la suppression', () => {
  const immeubleAvecEnfants = async (nb = 2) => {
    const parent = rapportImmeuble({ lignes: nb })
    const enfants = []
    for (let i = 0; i < nb; i++) {
      const enfant = S.newReport('detection')
      enfant.parentId = parent.id
      parent.rows[i].sousRapportId = enfant.id
      enfants.push(enfant)
      await S.saveReport(enfant)
    }
    await S.saveReport(parent)
    return { parent, enfants }
  }

  // Les sous-rapports restaient dans la base, exclus de toutes les listes par
  // `!r.parentId` : invisibles, inatteignables, et leurs photos occupaient
  // toujours la place de l'appareil.
  test("d'un immeuble emporte ses rapports de detection", async () => {
    const { parent } = await immeubleAvecEnfants(3)
    assert.equal(contenu('reports').length, 4)

    const bilan = await S.deleteReport(parent.id)
    assert.equal(bilan.enfants, 3)
    assert.deepEqual(contenu('reports'), [], 'des rapports survivent a leur immeuble')
  })

  test("d'un sous-rapport detache sa ligne d'immeuble", async () => {
    const { parent, enfants } = await immeubleAvecEnfants(2)
    await S.deleteReport(enfants[0].id)

    const relu = await S.loadReport(parent.id)
    assert.equal(relu.rows[0].sousRapportId, null, "la ligne pointe encore sur un rapport efface")
    assert.equal(relu.rows[1].sousRapportId, enfants[1].id, "l'autre ligne a ete touchee pour rien")
    assert.equal(contenu('reports').length, 2)
  })

  test("d'un rapport seul ne touche a rien d'autre", async () => {
    const a = rapportDetection()
    const b = rapportDetection()
    await S.saveReport(a)
    await S.saveReport(b)
    const bilan = await S.deleteReport(a.id)
    assert.equal(bilan.enfants, 0)
    assert.deepEqual(contenu('reports').map((r) => r.id), [b.id])
  })
})

describe('le cycle de vie', () => {
  test('un rapport neuf est en cours', () => {
    const r = S.newReport('detection')
    assert.equal(S.enCours(r), true)
    assert.equal(S.estTermine(r), false)
  })

  test('terminer le sort des rapports en cours, sans le supprimer', async () => {
    const r = S.newReport('detection')
    await S.saveReport(r)
    await S.terminerReport(r)
    assert.equal(S.enCours(r), false)
    assert.equal(S.estTermine(r), true)
    assert.ok(r.remisAt > 0, 'la date de remise manque')
    assert.equal(contenu('reports').length, 1, 'le rapport a disparu de la base')
  })

  test('rouvrir le remet en cours et efface la date de remise', async () => {
    const r = S.newReport('detection')
    await S.terminerReport(r)
    await S.rouvrirReport(r)
    assert.equal(S.enCours(r), true)
    assert.equal(r.remisAt, null)
  })

  test('un rapport envoye compte pour termine', () => {
    const r = S.newReport('detection')
    r.status = 'sent'
    assert.equal(S.estTermine(r), true)
    assert.equal(S.enCours(r), false)
  })

  test("un rapport en file d'attente n'est ni en cours ni termine", () => {
    const r = S.newReport('detection')
    r.status = 'queued'
    assert.equal(S.enCours(r), false)
    assert.equal(S.estTermine(r), false)
  })
})

describe("l'enregistrement", () => {
  test('rend vrai et ecrit vraiment', async () => {
    const r = S.newReport('detection')
    assert.equal(await S.saveReport(r), true)
    assert.equal(contenu('reports')[0].id, r.id)
    assert.ok(r.updatedAt > 0)
  })

  // Sans signal, la photo reste a l'ecran, le rapport parait enregistre, et
  // tout disparait au rechargement.
  test("previent quand l'appareil est plein, et le dit", async () => {
    const vus = []
    S.onEcritureRefusee((plein) => vus.push(plein))
    refuseLesEcritures('plein')
    assert.equal(await S.saveReport(S.newReport('detection')), false)
    assert.deepEqual(vus, [true])
    S.onEcritureRefusee(null)
  })

  test("distingue l'appareil plein d'une autre panne", async () => {
    const vus = []
    S.onEcritureRefusee((plein) => vus.push(plein))
    refuseLesEcritures('autre')
    assert.equal(await S.saveReport(S.newReport('detection')), false)
    assert.deepEqual(vus, [false])
    S.onEcritureRefusee(null)
  })

  test('ne fait pas tomber l app quand personne n ecoute', async () => {
    S.onEcritureRefusee(null)
    refuseLesEcritures('plein')
    assert.equal(await S.saveReport(S.newReport('detection')), false)
  })
})

describe('les pieces du rapport', () => {
  // Le PDF n'imprimait que les lignes "remplies" : une piece inspectee et
  // trouvee saine disparaissait du document.
  test('ne sont jamais filtrees', () => {
    const r = rapportDetection()
    r.rows.push({ id: 'x', nom: '', info: '', contamine: '' })
    assert.equal(S.filledRows(r).length, r.rows.length)
  })

  test('se comptent quand elles sont contaminees', () => {
    const r = rapportDetection()
    assert.equal(S.contaminatedCount(r), 1)
    r.rows[3].contamine = 'oui'
    assert.equal(S.contaminatedCount(r), 2)
    r.rows.forEach((x) => (x.contamine = 'non'))
    assert.equal(S.contaminatedCount(r), 0)
  })
})

describe('la duplication', () => {
  test('reprend le lieu et le plan des pieces', () => {
    const src = rapportDetection()
    const copie = S.duplicateReport(src)
    assert.equal(copie.mandant.nom, src.mandant.nom)
    assert.equal(copie.lieu.adresseIntervention, src.lieu.adresseIntervention)
    assert.deepEqual(copie.rows.map((r) => r.nom), src.rows.map((r) => r.nom))
  })

  // Un rapport neuf ne peut pas naitre en affirmant ce qu'on a constate il y a
  // six mois.
  test('remet a zero tout ce qui a ete constate', () => {
    const src = rapportDetection()
    const copie = S.duplicateReport(src)
    assert.notEqual(copie.id, src.id)
    assert.notEqual(copie.ref, src.ref)
    assert.deepEqual(copie.rows.map((r) => r.contamine), src.rows.map(() => ''))
    assert.deepEqual(copie.rows.map((r) => r.info), src.rows.map(() => ''))
    assert.deepEqual(copie.photos, [])
    assert.equal(copie.signature, null)
    assert.equal(copie.status, 'draft')
    assert.equal(copie.remarques, S.DEFAULT_REMARQUES)
  })

  test("donne au rapport copie la date du jour", () => {
    const copie = S.duplicateReport(rapportDetection())
    assert.equal(copie.lieu.dateIntervention, S.todayISO())
  })

  test("reprend les numeros d'appartement d'un immeuble", () => {
    const src = rapportImmeuble({ lignes: 3 })
    const copie = S.duplicateReport(src)
    assert.deepEqual(copie.rows.map((r) => r.numero), src.rows.map((r) => r.numero))
    assert.deepEqual(copie.rows.map((r) => r.contamine), ['', '', ''])
  })
})

describe('la recherche', () => {
  const r = rapportDetection()

  test('trouve par le nom, la rue, la localite ou le numero', () => {
    for (const mots of ['favre', 'fontaines', 'vaugondry', 'regie du lac', r.ref.toLowerCase()]) {
      assert.equal(S.matchRapport(r, mots), true, `« ${mots} » ne trouve rien`)
    }
  })

  test('accepte les mots dans le desordre', () => {
    assert.equal(S.matchRapport(r, 'fontaines favre'), true)
    assert.equal(S.matchRapport(r, 'favre fontaines'), true)
  })

  test('ignore les accents, dans les deux sens', () => {
    assert.equal(S.matchRapport(r, 'regie'), true)
    assert.equal(S.matchRapport(r, 'Régie'), true)
    assert.equal(S.matchRapport(r, 'elise'), true)
  })

  test('exige tous les mots', () => {
    assert.equal(S.matchRapport(r, 'favre lausanne'), false)
  })

  test('rend tout le monde sur une recherche vide', () => {
    assert.equal(S.matchRapport(r, ''), true)
    assert.equal(S.matchRapport(r, '   '), true)
  })
})

describe('la sauvegarde', () => {
  test('emporte rapports, carnet et reglages', async () => {
    await S.saveReport(rapportDetection())
    await S.rememberContact({ type: 'gerance', nom: 'Régie du Lac SA', npaLieu: '1400 Yverdon' })
    await S.saveTechnicien({ nom: 'Oberli Stessy', signature: null })

    const fichier = await S.exportBackup()
    assert.equal(fichier.reports.length, 1)
    assert.equal(fichier.contacts.length, 1)
    assert.ok(fichier.settings.length >= 1)
    assert.ok(Number(fichier.refSeq) >= 1)
  })

  // La reprise du compteur doit aussi remettre localStorage a niveau : sans
  // cela, une sauvegarde prise juste apres un nettoyage du navigateur partait
  // avec un `refSeq` a zero, et se restaurait sur un appareil neuf en
  // reattribuant des numeros deja imprimes.
  test('emporte un compteur juste, meme apres un nettoyage du navigateur', async () => {
    for (let i = 0; i < 6; i++) await S.saveReport(S.newReport('detection'))
    const plusHaut = Math.max(...contenu('reports').map((r) => S.numeroDeRef(r.ref)))

    localStorage.clear()
    await S.repriseCompteur()

    const fichier = await S.exportBackup()
    assert.equal(Number(fichier.refSeq), plusHaut, 'la sauvegarde emporte un compteur faux')
  })

  test('refuse un fichier qui n est pas une sauvegarde', async () => {
    await assert.rejects(() => S.importBackup({ reports: [] }), /non reconnu/)
    await assert.rejects(() => S.importBackup(null), /non reconnu/)
  })

  test('fusionne au lieu de remplacer', async () => {
    const ancien = rapportDetection()
    await S.saveReport(ancien)
    const fichier = await S.exportBackup()

    remetAneuf()
    const recent = rapportDetection()
    await S.saveReport(recent)
    const bilan = await S.importBackup(fichier)

    assert.equal(bilan.reports, 1)
    const ids = contenu('reports').map((r) => r.id).sort()
    assert.deepEqual(ids, [ancien.id, recent.id].sort(), 'la restauration a efface du travail')
  })

  // Une sauvegarde restauree sur un appareil neuf reattribuait des numeros deja
  // imprimes. L'appareil neuf, ici, est un module charge a froid : sans cela
  // c'est la copie en memoire du compteur qui repondrait, et le test ne
  // prouverait rien.
  const surUnAppareilNeuf = async () => {
    remetAneuf()
    return import(`../src/state.js?neuf=${Math.random().toString(36).slice(2)}`)
  }

  test('remonte le compteur au plus haut numero restaure', async () => {
    for (let i = 0; i < 7; i++) await S.saveReport(S.newReport('detection'))
    const fichier = await S.exportBackup()
    const plusHaut = Math.max(...fichier.reports.map((r) => S.numeroDeRef(r.ref)))

    const neuve = await surUnAppareilNeuf()
    await neuve.importBackup(fichier)
    assert.equal(neuve.numeroDeRef(neuve.newReport('detection').ref), plusHaut + 1)
  })

  test('remonte le compteur meme si le fichier a perdu son compteur', async () => {
    for (let i = 0; i < 4; i++) await S.saveReport(S.newReport('detection'))
    const fichier = await S.exportBackup()
    const plusHaut = Math.max(...fichier.reports.map((r) => S.numeroDeRef(r.ref)))
    delete fichier.refSeq

    const neuve = await surUnAppareilNeuf()
    await neuve.importBackup(fichier)
    assert.equal(neuve.numeroDeRef(neuve.newReport('detection').ref), plusHaut + 1)
  })

  test('retient la date de la derniere sauvegarde', () => {
    assert.equal(S.backupAge(), null)
    S.markBackup()
    assert.equal(S.backupAge(), 0)
  })
})

describe('la place restante', () => {
  test('se rapporte en part de ce qui est accorde', async () => {
    poseLaPlace({ usage: 900_000_000, quota: 1_000_000_000 })
    const place = await S.stockage()
    assert.equal(place.usage, 900_000_000)
    assert.ok(Math.abs(place.part - 0.9) < 0.001)
  })

  test('ne repond rien plutot qu un chiffre invente', async () => {
    poseLaPlace(null)
    assert.equal(await S.stockage(), null)
    poseLaPlace({ usage: 10, quota: 0 })
    assert.equal(await S.stockage(), null)
  })

  test('se lit en Ko, Mo ou Go selon le poids', () => {
    assert.equal(S.enPoids(500), '1 Ko')
    assert.equal(S.enPoids(1024 * 400), '400 Ko')
    assert.equal(S.enPoids(1_048_576 * 7), '7 Mo')
    assert.equal(S.enPoids(1_073_741_824 * 2.5), '2,5 Go')
  })
})

describe('le nom du fichier', () => {
  test('dit qui, quoi et ou', () => {
    const r = rapportDetection()
    const nom = S.reportFilename(r)
    assert.match(nom, /\.pdf$/)
    assert.match(nom, /Rapport de detection du 17\.03\.2026/)
    assert.ok(nom.includes('Favre'), nom)
  })

  test('survit aux ligatures et aux accents', () => {
    const r = rapportDetection()
    r.lieu.locataire = 'Mme Élise Favre-Œuvray'
    const nom = S.reportFilename(r)
    assert.ok(!/[^\x20-\x7E]/.test(nom), `caractere hors ASCII dans « ${nom} »`)
    assert.ok(nom.includes('OEuvray') || nom.includes('Oeuvray'), nom)
  })

  test('ne laisse jamais de caractere interdit par un systeme de fichiers', () => {
    const r = rapportDetection()
    r.lieu.locataire = 'M. A/B\\C:D*E?F"G<H>I|J'
    const nom = S.reportFilename(r)
    assert.ok(!/[/\\:*?"<>|]/.test(nom.replace(/\.pdf$/, '')), `caractere interdit dans « ${nom} »`)
  })
})
