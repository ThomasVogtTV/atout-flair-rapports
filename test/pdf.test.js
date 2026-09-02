// Ce que le client recoit.
//
// Le PDF est le produit de l'app : une regression y est invisible depuis
// l'ecran et ne se decouvre que chez le destinataire. Chaque test ci-dessous
// correspond a un defaut reellement constate sur le terrain, ou a une regle du
// document qu'on ne veut pas voir partir sans s'en apercevoir.

import './aide/navigateur.js'
import { test, describe, before } from 'node:test'
import assert from 'node:assert/strict'
import { buildCombinedPdf } from '../src/pdf.js'
import { litLePdf, enHexa } from './aide/pdf-lecture.js'
import { rapportDetection, rapportImmeuble, rapportHotel, rapportAvecPhotos } from './aide/rapports.js'

const A4 = { largeur: 595.28, hauteur: 841.89 }

// Les couleurs du document, telles que src/pdf.js les pose.
const ROUGE = '#c02a2a'
const ROUGE_PALE = '#fbeaea'
const VERT = '#1f7a4d'
const VERT_PALE = '#e7f5ee'
const PETROLE = '#0e7c93'

const construit = async (report, enfants = []) => litLePdf(await buildCombinedPdf(report, enfants))

// Les tests partagent un meme document quand ils l'interrogent sans le modifier :
// une construction de PDF coute une seconde, et il y en a une trentaine.
let detection
let immeuble
let hotel

before(async () => {
  detection = await construit(rapportDetection())
  immeuble = await construit(rapportImmeuble())
  hotel = await construit(rapportHotel())
})

describe('la page', () => {
  test('est un A4 portrait, sur toutes les pages', () => {
    for (const doc of [detection, immeuble, hotel]) {
      for (const page of doc.pages) {
        assert.equal(page.largeur, A4.largeur, `page ${page.numero} : largeur`)
        assert.equal(page.hauteur, A4.hauteur, `page ${page.numero} : hauteur`)
      }
    }
  })

  test('porte le pied de page de la societe partout', () => {
    for (const doc of [detection, immeuble, hotel]) {
      for (const page of doc.pages) {
        // Les coordonnees completes, et non le seul nom : celui-ci figure aussi
        // au-dessus de la signature du technicien, en plein milieu de la page.
        const pied = page.textes.filter((t) => t.texte.includes('079 269 94 96') || t.texte.includes('www.atout-flair.ch'))
        assert.equal(pied.length, 2, `page ${page.numero} : ${pied.length} ligne(s) de pied de page`)
        // Le pied vit sous le contenu, jamais au milieu.
        assert.ok(Math.max(...pied.map((t) => t.y)) < 70, `pied de page trop haut sur la page ${page.numero}`)
      }
    }
  })

  test('numerote ses pages', async () => {
    const doc = await construit(rapportAvecPhotos(9))
    assert.ok(doc.nbPages > 1, 'il faut plusieurs pages pour que la pagination ait un sens')
    for (const page of doc.pages) {
      const num = page.textes.map((t) => t.texte).join(' ')
      assert.match(num, new RegExp(`${page.numero}\\s*/\\s*${doc.nbPages}`), `page ${page.numero} sans son numero`)
    }
  })

  test('nomme le document dans ses metadonnees', () => {
    assert.match(detection.titre, /^Rapport de détection N° AF-\d{5}$/)
    assert.match(detection.sujet, /Détection canine de punaises de lit/)
    assert.match(detection.auteur, /Atout-Flair Sàrl/)
  })
})

describe('les pieces', () => {
  // Le defaut le plus grave qu'on ait eu : le PDF filtrait les lignes sans nom
  // ni constat. Une piece inspectee et trouvee saine disparaissait du document
  // - or c'est precisement ce qu'un rapport doit attester.
  test('figurent toutes, meme sans etat ni commentaire', async () => {
    const r = rapportDetection()
    r.rows.push({ ...r.rows[0], id: 'vide-1', nom: '', info: '', contamine: '' })
    const doc = await construit(r)
    for (const piece of r.rows.filter((x) => x.nom)) {
      assert.ok(doc.cherche(piece.nom).length > 0, `« ${piece.nom} » absente du PDF`)
    }
    // Une piece sans nom occupe quand meme sa rangee : on la compte par les
    // marques Oui/Non du tableau plutot que par un texte qu'elle n'a pas.
    const rangees = doc.pages[0].traits.filter((t) => Math.abs(t.y1 - t.y2) < 0.5 && t.x2 - t.x1 > 400)
    assert.ok(rangees.length >= r.rows.length, `${rangees.length} filets pour ${r.rows.length} pieces`)
  })

  test("d'un immeuble figurent toutes, numero et resident", () => {
    const r = rapportImmeuble()
    for (const ligne of r.rows) {
      assert.ok(immeuble.cherche(ligne.numero).length > 0, `appartement ${ligne.numero} absent`)
    }
    assert.ok(immeuble.cherche(/Vuilleumier/).length > 0, 'le resident au nom long a disparu')
  })

  test("d'un hotel figurent toutes", () => {
    for (const ligne of rapportHotel().rows) {
      assert.ok(hotel.cherche(ligne.numero).length > 0, `chambre ${ligne.numero} absente`)
    }
  })
})

describe('le verdict', () => {
  test('annonce la contamination en rouge, sur un bandeau', () => {
    const banniere = detection.dessins.find((d) => enHexa(d.couleur) === ROUGE_PALE)
    assert.ok(banniere, 'pas de bandeau de contamination')
    assert.ok(banniere.l > 400, 'le bandeau doit traverser la page')
    const titre = detection.trouve(/CONTAMIN/i)
    assert.ok(titre, 'le verdict ne se lit pas')
    assert.equal(enHexa(titre.couleur), ROUGE)
    // Le verdict est en haut : c'est ce qu'une regie cherche en ouvrant le
    // fichier, elle ne doit pas avoir a le chercher.
    assert.ok(titre.y > A4.hauteur / 2, `verdict trop bas (y=${titre.y})`)
  })

  test("annonce l'absence de contamination en vert", async () => {
    const r = rapportDetection()
    r.rows.forEach((x) => (x.contamine = 'non'))
    const doc = await construit(r)
    assert.ok(doc.dessins.some((d) => enHexa(d.couleur) === VERT_PALE), 'pas de bandeau vert')
    assert.ok(doc.textes.some((t) => enHexa(t.couleur) === VERT), 'aucun texte vert')
  })

  // Le rouge decorait aussi le numero de rapport et les tirets des rubriques :
  // une regie ouvrait le fichier, voyait du rouge partout, et devait lire pour
  // savoir s'il y avait des punaises.
  test('est seul a porter du rouge', () => {
    const rougeVif = (c) => {
      const h = enHexa(c)
      return h === ROUGE || h === ROUGE_PALE
    }
    const banniere = detection.dessins.find((d) => enHexa(d.couleur) === ROUGE_PALE)
    const dansLaBanniere = (t) => t.page === banniere.page && t.y >= banniere.y - 2 && t.y <= banniere.y + banniere.h + 2

    for (const t of detection.textes.filter((t) => rougeVif(t.couleur))) {
      assert.ok(
        dansLaBanniere(t) || /^(OUI|✕|X)$/i.test(t.texte.trim()),
        `« ${t.texte} » est en rouge hors du verdict (page ${t.page}, y=${t.y})`
      )
    }
    for (const d of detection.dessins.filter((d) => rougeVif(d.couleur))) {
      assert.ok(
        d.page === banniere.page && Math.abs(d.y - banniere.y) < 2,
        `aplat rouge hors du verdict (page ${d.page}, y=${d.y})`
      )
    }
  })

  test("n'a aucun rouge quand rien n'est trouve", async () => {
    const r = rapportDetection()
    r.rows.forEach((x) => (x.contamine = 'non'))
    const doc = await construit(r)
    const rouges = [...doc.textes, ...doc.dessins].filter((x) => [ROUGE, ROUGE_PALE].includes(enHexa(x.couleur)))
    assert.deepEqual(rouges.map((x) => x.texte ?? `aplat@${x.y}`), [], 'du rouge sur un rapport sain')
  })

  test('laisse le decor a la couleur de la maison', () => {
    const petrole = detection.dessins.filter((d) => enHexa(d.couleur) === PETROLE)
    assert.ok(petrole.length >= 3, `${petrole.length} elements de decor en petrole, trop peu`)
  })
})

describe('le tableau', () => {
  // Les intitules OUI/NON chevauchaient le filet qui les separe de
  // « CONTAMINÉE » : les hampes passaient dessus, et l'intitule du dessus etait
  // rogne. L'affirmation porte sur les deux bords a la fois - un intitule doit
  // tenir tout entier dans son etage, sans deborder ni en haut ni en bas.
  test('garde ses intitules dans leur etage', () => {
    const page = detection.pages[0]
    const intitules = page.textes.filter((t) => /^(OUI|NON)$/.test(t.texte.trim()) && t.taille < 9)
    assert.equal(intitules.length, 2, "les intitules OUI/NON de l'en-tete sont introuvables")

    for (const intitule of intitules) {
      // Tous les filets qui traversent l'abscisse de l'intitule : le bord bas de
      // l'en-tete comme le filet qui coupe la colonne en deux.
      const traversants = page.traits
        .filter((t) => Math.abs(t.y1 - t.y2) < 0.5 && t.x1 <= intitule.x && t.x2 >= intitule.x)
        .map((t) => t.y1)

      // Helvetica descend d'environ 0,21 em sous la ligne de base, et ses
      // capitales montent a 0,72 em au-dessus.
      const bas = intitule.y - intitule.taille * 0.21
      const haut = intitule.y + intitule.taille * 0.72

      const filetDessous = Math.max(...traversants.filter((y) => y < bas), -Infinity)
      const filetDessus = Math.min(...traversants.filter((y) => y > haut), Infinity)

      assert.ok(
        traversants.every((y) => y <= filetDessous || y >= filetDessus),
        `« ${intitule.texte} » chevauche un filet ` +
          `(lettres de ${bas.toFixed(1)} a ${haut.toFixed(1)}, filets ${JSON.stringify(traversants)})`
      )
      assert.ok(
        filetDessous > -Infinity && filetDessus < Infinity,
        `« ${intitule.texte} » n'est borne que d'un cote : il est sorti de son etage`
      )
    }
  })

  // Le defaut exact : `countLines` mesurait sur une largeur, `wrap` ecrivait sur
  // une autre. La rangee etait donc dimensionnee pour une ligne de moins que ce
  // qui allait s'y ecrire, et la derniere ligne tombait sous le filet, dans la
  // rangee suivante, dont la trame la repeignait. Le texte partait chez la
  // regie, present dans le fichier, mais invisible a l'oeil.
  //
  // Une seule longueur de texte ne suffit pas a l'attraper. Entre deux largeurs
  // proches, une seule longueur sur quarante bascule d'un nombre de lignes a
  // l'autre - et c'est celle-la, et elle seule, qui deborde. On balaie donc
  // toutes les longueurs d'affilee plutot que d'en echantillonner quelques-unes :
  // six pieces par document, sept documents.
  test('garde le texte de chaque rangee dans sa rangee, a toute longueur', async () => {
    const MOTS = (
      'Marquage franc du chien de recherche a la tete de lit punaises vivantes visibles ' +
      'dans la couture du matelas traces et dejections sur le sommier ainsi que derriere ' +
      'le cadre et la plinthe attenante au radiateur du salon adjacent controle a refaire'
    ).split(' ')

    for (const depart of [1, 7, 13, 19, 25, 31, 37]) {
      const r = rapportDetection()
      r.rows.forEach((piece, i) => {
        piece.contamine = 'oui'
        // Le constat de chaque rangee est borne par deux mots qui n'existent
        // qu'en elle : ses fragments se reconnaissent alors sans risque de
        // ramasser ceux de la rangee voisine.
        piece.info = `debut${i} ${MOTS.slice(0, depart + i).join(' ')} borne${i}.`
      })
      const doc = await construit(r)

      r.rows.forEach((piece, i) => {
        const nom = doc.textes.find((t) => t.texte === piece.nom)
        assert.ok(nom, `« ${piece.nom} » ne s'imprime pas (longueur ${depart + i})`)
        const page = doc.pages[nom.page - 1]

        const filets = page.traits
          .filter((t) => Math.abs(t.y1 - t.y2) < 0.5 && t.x2 - t.x1 > 400)
          .map((t) => t.y1)
        const bas = Math.max(...filets.filter((f) => f < nom.y), -Infinity)
        const haut = Math.min(...filets.filter((f) => f > nom.y), Infinity)

        // Le constat s'ecrit d'un trait : ses fragments se suivent dans le flux,
        // du mot d'ouverture au mot de fermeture.
        const ouvre = page.textes.findIndex((t) => t.texte.includes(`debut${i}`))
        const ferme = page.textes.findIndex((t) => t.texte.includes(`borne${i}.`))
        assert.ok(ouvre >= 0, `le debut du constat de « ${piece.nom} » ne s'imprime pas`)
        assert.ok(ferme >= ouvre, `la fin du constat de « ${piece.nom} » ne s'imprime pas`)

        for (const ligne of page.textes.slice(ouvre, ferme + 1)) {
          const jambage = ligne.y - ligne.taille * 0.21
          assert.ok(
            jambage > bas,
            `« ${piece.nom} » (${depart + i} mots) : « ${ligne.texte.slice(0, 32)}… » ` +
              `passe sous le filet de sa rangee (${jambage.toFixed(1)} vs ${bas})`
          )
          assert.ok(
            ligne.y < haut,
            `« ${piece.nom} » (${depart + i} mots) deborde par le haut de sa rangee ` +
              `(${ligne.y} vs ${haut})`
          )
        }
      })
    }
  })

  test('ne laisse aucun texte deborder de la page', () => {
    for (const doc of [detection, immeuble, hotel]) {
      for (const t of doc.textes) {
        assert.ok(t.x >= 0 && t.x < A4.largeur, `« ${t.texte} » hors page en x=${t.x}`)
        assert.ok(t.y >= 0 && t.y < A4.hauteur, `« ${t.texte} » hors page en y=${t.y}`)
      }
    }
  })

  test('coupe les textes trop longs plutot que de les laisser filer', () => {
    // Le nom le plus long du jeu d'essai tient sur plusieurs fragments : c'est
    // le signe que le retour a la ligne a bien eu lieu.
    const morceaux = immeuble.cherche(/Vuilleumier|Fontaine/)
    assert.ok(morceaux.length >= 2, 'le nom long ne se replie pas')
    const lignes = new Set(morceaux.map((m) => m.y))
    assert.ok(lignes.size >= 2, 'les morceaux sont tous sur la meme ligne')
  })
})

describe("l'annexe photo", () => {
  test('pose quatre photos par page, sur deux colonnes', async () => {
    const doc = await construit(rapportAvecPhotos(9))
    // La premiere image de la premiere page est le logo de l'en-tete.
    const pagesAnnexe = doc.pages.filter((p) => p.images.length && p.numero > 1)
    const comptes = pagesAnnexe.map((p) => p.images.length)
    assert.ok(Math.max(...comptes) <= 4, `${Math.max(...comptes)} photos sur une page`)
    const pleine = pagesAnnexe.find((p) => p.images.length === 4)
    assert.ok(pleine, 'aucune page pleine avec 9 photos')
    const colonnes = new Set(pleine.images.map((i) => i.x))
    assert.equal(colonnes.size, 2, 'les photos ne tiennent pas sur deux colonnes')
    // Chaque photo est centree dans sa case avec sa legende : deux photos d'une
    // meme rangee peuvent differer de quelques points selon la longueur du
    // texte qui les accompagne. On compte donc des bandes, pas des ordonnees.
    const bandes = []
    for (const y of pleine.images.map((i) => i.y).sort((a, b) => a - b)) {
      if (!bandes.length || y - bandes.at(-1) > 40) bandes.push(y)
    }
    assert.equal(bandes.length, 2, `les photos occupent ${bandes.length} bande(s) au lieu de deux`)
  })

  test('borne la taille d une photo de telephone', async () => {
    const doc = await construit(rapportAvecPhotos(4))
    const photos = doc.images.filter((i) => i.page > 1)
    assert.ok(photos.length > 0, "pas de photo dans l'annexe")
    for (const p of photos) {
      // Une photo prise au telephone sortait sur 17 x 23 cm, soit la page
      // entiere. La moitie de la largeur utile est la limite.
      assert.ok(p.largeur <= 250, `photo large de ${p.largeur} pt`)
      assert.ok(p.hauteur <= 320, `photo haute de ${p.hauteur} pt`)
    }
  })

  test('legende et numerote chaque photo', async () => {
    const doc = await construit(rapportAvecPhotos(5))
    for (let i = 1; i <= 5; i++) {
      assert.ok(doc.cherche(`Photo ${i} / 5`).length > 0, `la photo ${i} n'est pas legendee`)
    }
  })

  test('rattache la legende a la piece photographiee', async () => {
    const r = rapportDetection()
    const doc = await construit(r)
    const legende = doc.cherche(/Photo 1 \/ 2/)[0]
    assert.ok(legende, 'legende introuvable')
    const surLaMemeLigne = doc.textes.filter((t) => t.page === legende.page && Math.abs(t.y - legende.y) < 1)
    assert.ok(
      surLaMemeLigne.some((t) => t.texte.includes(r.rows[0].nom)),
      'la legende ne dit pas de quelle piece vient la photo'
    )
  })
})

describe('le texte', () => {
  test('rend la typographie francaise telle qu elle est saisie', async () => {
    const r = rapportDetection()
    r.lieu.locataire = 'Mme Élise Favre-Œuvray'
    r.remarques = "L’intervention porte sur l’ensemble du logement — chambres, séjour… — et coûte 450 €."
    const doc = await construit(r)
    const tout = doc.texteDe()
    // Ces signes existent en WinAnsi : la police sait les ecrire, le document
    // n'a aucune raison de les rabaisser.
    for (const signe of ['É', 'Œ', '’', '—', '…', '€', 'é', 'è', 'à', 'û', '°']) {
      assert.ok(tout.includes(signe), `« ${signe} » ne survit pas a l'encodage`)
    }
    assert.ok(!tout.includes('OEuvray'), 'la ligature est encore transcrite en deux lettres')
    assert.ok(!/L'intervention/.test(tout), "l'apostrophe courbe est encore rabaissee")
  })

  // Ce qui sort vraiment de WinAnsi doit perdre son accent, jamais sa lettre :
  // un rapport a deja imprime "Mme Szymaska" pour un nom polonais.
  test("ne fait disparaitre aucune lettre d'un nom etranger", async () => {
    const r = rapportDetection()
    r.lieu.locataire = 'Mme Szymańska'
    r.rows[0].info = 'Voisins : Țepeș, Wałęsa'
    const doc = await construit(r)
    const tout = doc.texteDe()
    assert.ok(tout.includes('Szymanska'), `nom polonais ampute : ${doc.cherche(/Szyma/).map((t) => t.texte)}`)
    assert.ok(tout.includes('Tepes'), 'nom roumain ampute')
    assert.ok(tout.includes('Walesa'), 'nom polonais ampute')
  })

  test("n'ecrit qu'avec les deux polices du document", () => {
    const familles = new Set(detection.polices.map((p) => p.police))
    assert.deepEqual([...familles].sort(), ['Helvetica', 'Helvetica-Bold'])
  })

  // Chaque appel a drawText posait sa propre entree de police dans la page :
  // 210 entrees pour une page qui n'en emploie que deux familles.
  test('ne multiplie pas les entrees de police dans la page', () => {
    for (const page of detection.pages) {
      const noms = new Set(page.polices.map((p) => p.nom))
      assert.ok(noms.size <= 40, `${noms.size} entrees de police sur la page ${page.numero}`)
    }
  })
})

describe('le rapport fusionne', () => {
  test("ajoute les pages des sous-rapports et renumerote l'ensemble", async () => {
    const parent = rapportImmeuble({ lignes: 2 })
    const enfantA = rapportDetection()
    const enfantB = rapportDetection()
    enfantA.parentId = parent.id
    enfantB.parentId = parent.id
    parent.rows[0].sousRapportId = enfantA.id
    parent.rows[1].sousRapportId = enfantB.id

    const seul = await construit(parent)
    const fusionne = await construit(parent, [enfantA, enfantB])
    assert.ok(fusionne.nbPages > seul.nbPages, 'les sous-rapports ne sont pas joints')

    for (const page of fusionne.pages) {
      const texte = page.textes.map((t) => t.texte).join(' ')
      assert.match(texte, new RegExp(`${page.numero}\\s*/\\s*${fusionne.nbPages}`), `page ${page.numero} mal numerotee`)
    }
  })

  test('donne aux sous-rapports le partenaire du rapport principal', async () => {
    const parent = rapportImmeuble({ lignes: 1 })
    parent.partenaire = { nom: 'Desinsectisation Dubois SA', logo: null }
    const enfant = rapportDetection()
    enfant.parentId = parent.id
    const doc = await construit(parent, [enfant])
    const mentions = doc.cherche(/Dubois/)
    const pages = new Set(mentions.map((m) => m.page))
    assert.ok(pages.size >= 2, `le partenaire ne figure que sur ${pages.size} page(s)`)
  })
})
