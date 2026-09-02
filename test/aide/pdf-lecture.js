// Lecture d'un PDF produit par src/pdf.js, pour pouvoir affirmer quelque chose
// sur son contenu.
//
// Aucun rasteriseur n'est installe sur la machine (ni poppler, ni ImageMagick,
// ni Ghostscript) et un PDF ne se compare pas utilement pixel a pixel de toute
// facon : un decalage d'un point ferait echouer un test sans rien apprendre.
// On lit donc le flux de contenu - la liste des ordres de dessin - et l'on
// mesure ce qui compte : quel texte, a quelle place, dans quelle taille, de
// quelle couleur, et quelle image a quelle dimension.

import { PDFDocument, PDFName, PDFArray, PDFRawStream, decodePDFRawStream } from 'pdf-lib'

// --- WinAnsi ---------------------------------------------------------------

// Les polices standard de pdf-lib encodent en WinAnsi. Il coincide avec Latin-1
// partout sauf entre 0x80 et 0x9F, ou Latin-1 ne place que des caracteres de
// controle : ce sont justement les guillemets francais courbes, les tirets
// cadratins et l'apostrophe typographique qui vivent la.
const WINANSI_HAUT = {
  0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…',
  0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰', 0x8a: 'Š',
  0x8b: '‹', 0x8c: 'Œ', 0x8e: 'Ž', 0x91: '‘', 0x92: '’',
  0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—',
  0x98: '˜', 0x99: '™', 0x9a: 'š', 0x9b: '›', 0x9c: 'œ',
  0x9e: 'ž', 0x9f: 'Ÿ',
}

const enTexte = (octets) =>
  octets.map((o) => WINANSI_HAUT[o] ?? String.fromCharCode(o)).join('')

// --- decoupage du flux -----------------------------------------------------

const BLANC = new Set([0x20, 0x0a, 0x0d, 0x09, 0x0c, 0x00])
const DELIM = new Set([0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25])

/**
 * Decoupe un flux de contenu en jetons.
 *
 * Les chaines sont rendues en octets et non en texte : c'est seulement au
 * moment de les afficher qu'on sait dans quel encodage les lire.
 */
function jetons(octets) {
  const out = []
  let i = 0
  while (i < octets.length) {
    const c = octets[i]

    if (BLANC.has(c)) {
      i++
      continue
    }

    // Commentaire jusqu'a la fin de ligne.
    if (c === 0x25) {
      while (i < octets.length && octets[i] !== 0x0a && octets[i] !== 0x0d) i++
      continue
    }

    // Chaine litterale : les parentheses s'imbriquent, la barre echappe.
    if (c === 0x28) {
      i++
      const octetsChaine = []
      let profondeur = 1
      while (i < octets.length) {
        const d = octets[i]
        if (d === 0x5c) {
          const e = octets[i + 1]
          i += 2
          if (e >= 0x30 && e <= 0x37) {
            // Echappement octal, de une a trois chiffres.
            let val = e - 0x30
            let pris = 1
            while (pris < 3 && octets[i] >= 0x30 && octets[i] <= 0x37) {
              val = val * 8 + (octets[i] - 0x30)
              i++
              pris++
            }
            octetsChaine.push(val & 0xff)
          } else if (e === 0x6e) octetsChaine.push(0x0a)
          else if (e === 0x72) octetsChaine.push(0x0d)
          else if (e === 0x74) octetsChaine.push(0x09)
          else if (e === 0x62) octetsChaine.push(0x08)
          else if (e === 0x66) octetsChaine.push(0x0c)
          else if (e === 0x0a) continue // barre + saut de ligne : rien
          else octetsChaine.push(e)
          continue
        }
        if (d === 0x28) profondeur++
        if (d === 0x29) {
          profondeur--
          if (profondeur === 0) {
            i++
            break
          }
        }
        octetsChaine.push(d)
        i++
      }
      out.push({ type: 'chaine', octets: octetsChaine })
      continue
    }

    // Chaine hexadecimale.
    if (c === 0x3c && octets[i + 1] !== 0x3c) {
      i++
      const chiffres = []
      while (i < octets.length && octets[i] !== 0x3e) {
        const ch = String.fromCharCode(octets[i])
        if (/[0-9a-fA-F]/.test(ch)) chiffres.push(ch)
        i++
      }
      i++
      if (chiffres.length % 2) chiffres.push('0')
      const octetsChaine = []
      for (let k = 0; k < chiffres.length; k += 2) {
        octetsChaine.push(parseInt(chiffres[k] + chiffres[k + 1], 16))
      }
      out.push({ type: 'chaine', octets: octetsChaine })
      continue
    }

    // Dictionnaires et tableaux : gardes comme simples marqueurs.
    if (c === 0x3c && octets[i + 1] === 0x3c) {
      out.push({ type: 'marqueur', valeur: '<<' })
      i += 2
      continue
    }
    if (c === 0x3e && octets[i + 1] === 0x3e) {
      out.push({ type: 'marqueur', valeur: '>>' })
      i += 2
      continue
    }
    if (c === 0x5b || c === 0x5d) {
      out.push({ type: 'marqueur', valeur: String.fromCharCode(c) })
      i++
      continue
    }

    // Nom.
    if (c === 0x2f) {
      i++
      let nom = ''
      while (i < octets.length && !BLANC.has(octets[i]) && !DELIM.has(octets[i])) {
        nom += String.fromCharCode(octets[i])
        i++
      }
      out.push({ type: 'nom', valeur: nom })
      continue
    }

    // Nombre ou operateur.
    let brut = ''
    while (i < octets.length && !BLANC.has(octets[i]) && !DELIM.has(octets[i])) {
      brut += String.fromCharCode(octets[i])
      i++
    }
    if (!brut) {
      i++
      continue
    }
    if (/^[-+]?(\d+\.?\d*|\.\d+)$/.test(brut)) out.push({ type: 'nombre', valeur: Number(brut) })
    else out.push({ type: 'operateur', valeur: brut })
  }
  return out
}

// --- lecture d'une page ----------------------------------------------------

const arrondi = (n) => Math.round(n * 100) / 100

const enCouleur = (composantes) => {
  if (composantes.length === 1) {
    const g = composantes[0]
    return { r: g, v: g, b: g }
  }
  if (composantes.length === 4) {
    const [c, m, j, n] = composantes
    return { r: (1 - c) * (1 - n), v: (1 - m) * (1 - n), b: (1 - j) * (1 - n) }
  }
  const [r, v, b] = composantes
  return { r, v, b }
}

const memeCouleur = (a, b, tolerance = 0.02) =>
  Math.abs(a.r - b.r) < tolerance && Math.abs(a.v - b.v) < tolerance && Math.abs(a.b - b.b) < tolerance

/** Un `#rrggbb` a partir d'une couleur lue, pour des messages d'echec lisibles. */
export const enHexa = (c) =>
  '#' + [c.r, c.v, c.b].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('')

/**
 * Un sous-chemin rendu en segments droits, prets a etre mesures.
 *
 * Les segments sont orientes de la gauche vers la droite, et du bas vers le
 * haut. Sans cela le cote inferieur d'un rectangle - trace de droite a gauche
 * par le retour a la case depart - avait une largeur negative et disparaissait
 * de toute mesure : l'en-tete du tableau semblait n'avoir aucun bord bas, et un
 * intitule qui debordait dessus ne se voyait pas.
 */
function segments(sc) {
  const oriente = (a, b) =>
    b.x < a.x || (b.x === a.x && b.y < a.y)
      ? { x1: b.x, y1: b.y, x2: a.x, y2: a.y }
      : { x1: a.x, y1: a.y, x2: b.x, y2: b.y }

  const out = []
  for (let i = 1; i < sc.points.length; i++) out.push(oriente(sc.points[i - 1], sc.points[i]))
  if (sc.close && sc.points.length > 2) {
    const a = sc.points.at(-1)
    const b = sc.points[0]
    if (a.x !== b.x || a.y !== b.y) out.push(oriente(a, b))
  }
  return out
}

function litLaPage(flux, polices, images, numero) {
  const ops = jetons(flux)

  const textes = []
  const dessins = []
  const traits = []
  const posesImage = []
  const policesVues = []

  let pile = []
  const etat = { police: null, taille: 0, epaisseur: 1, remplissage: { r: 0, v: 0, b: 0 }, trait: { r: 0, v: 0, b: 0 }, matrice: [1, 0, 0, 1, 0, 0] }
  const etats = []
  let ligne = { x: 0, y: 0 }
  // pdf-lib ne dessine presque jamais avec `re` : un rectangle sort en
  // `m`/`l`/`h`, precede d'un `cm` qui le place. On accumule donc des
  // sous-chemins de points deja transformes, et l'on reconnait le rectangle au
  // moment du remplissage.
  let chemin = []
  let sousChemin = null

  const projette = (x, y) => {
    const [a, b, c, d, e, f] = etat.matrice
    return { x: arrondi(a * x + c * y + e), y: arrondi(b * x + d * y + f) }
  }

  const ferme = () => {
    if (sousChemin?.points.length) chemin.push(sousChemin)
    sousChemin = null
  }

  // Un sous-chemin de quatre coins aux cotes paralleles aux axes est un
  // rectangle : c'est sous cette forme que sortent les bandeaux, les trames
  // zebrees et les pastilles du document.
  const enRectangle = (points) => {
    const p = points.length > 4 && points[0].x === points.at(-1).x && points[0].y === points.at(-1).y
      ? points.slice(0, -1)
      : points
    if (p.length !== 4) return null
    const xs = [...new Set(p.map((q) => q.x))]
    const ys = [...new Set(p.map((q) => q.y))]
    if (xs.length !== 2 || ys.length !== 2) return null
    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      l: arrondi(Math.max(...xs) - Math.min(...xs)),
      h: arrondi(Math.max(...ys) - Math.min(...ys)),
    }
  }

  const nombres = (n) => pile.slice(-n).map((j) => (j.type === 'nombre' ? j.valeur : 0))

  for (const jeton of ops) {
    if (jeton.type !== 'operateur') {
      pile.push(jeton)
      continue
    }
    const op = jeton.valeur

    switch (op) {
      case 'q':
        etats.push({ ...etat, matrice: [...etat.matrice] })
        break
      case 'Q': {
        const p = etats.pop()
        if (p) Object.assign(etat, p)
        break
      }
      case 'cm': {
        const [a, b, c, d, e, f] = nombres(6)
        const [A, B, C, D, E, F] = etat.matrice
        etat.matrice = [
          a * A + b * C, a * B + b * D,
          c * A + d * C, c * B + d * D,
          e * A + f * C + E, e * B + f * D + F,
        ]
        break
      }
      case 'Tf': {
        const taille = nombres(1)[0]
        const nom = pile.filter((j) => j.type === 'nom').at(-1)?.valeur ?? null
        etat.police = polices[nom] ?? nom
        etat.taille = taille
        policesVues.push({ nom, police: etat.police, taille })
        break
      }
      case 'Tm': {
        const [, , , , e, f] = nombres(6)
        ligne = { x: e, y: f }
        break
      }
      case 'Td': {
        const [dx, dy] = nombres(2)
        ligne = { x: ligne.x + dx, y: ligne.y + dy }
        break
      }
      case 'rg':
      case 'sc':
      case 'scn':
        etat.remplissage = enCouleur(pile.filter((j) => j.type === 'nombre').slice(-3).map((j) => j.valeur))
        break
      case 'g':
        etat.remplissage = enCouleur(nombres(1))
        break
      case 'k':
        etat.remplissage = enCouleur(nombres(4))
        break
      case 'RG':
      case 'SC':
      case 'SCN':
        etat.trait = enCouleur(pile.filter((j) => j.type === 'nombre').slice(-3).map((j) => j.valeur))
        break
      case 'G':
        etat.trait = enCouleur(nombres(1))
        break
      case 'K':
        etat.trait = enCouleur(nombres(4))
        break
      case 'Tj':
      case "'": {
        const chaine = pile.filter((j) => j.type === 'chaine').at(-1)
        if (chaine) {
          textes.push({
            texte: enTexte(chaine.octets),
            x: arrondi(ligne.x),
            y: arrondi(ligne.y),
            taille: etat.taille,
            police: etat.police,
            couleur: { ...etat.remplissage },
            page: numero,
          })
        }
        break
      }
      case 'TJ': {
        // Tableau de morceaux : pdf-lib ne s'en sert pas, mais un PDF valide le
        // peut. On recolle les chaines, en ignorant les ajustements de chasse.
        const morceaux = pile.filter((j) => j.type === 'chaine')
        if (morceaux.length) {
          textes.push({
            texte: morceaux.map((m) => enTexte(m.octets)).join(''),
            x: arrondi(ligne.x),
            y: arrondi(ligne.y),
            taille: etat.taille,
            police: etat.police,
            couleur: { ...etat.remplissage },
            page: numero,
          })
        }
        break
      }
      case 'w':
        etat.epaisseur = nombres(1)[0]
        break
      case 're': {
        const [x, y, l, h] = nombres(4)
        ferme()
        chemin.push({
          points: [projette(x, y), projette(x + l, y), projette(x + l, y + h), projette(x, y + h)],
          close: true,
        })
        break
      }
      case 'm': {
        const [x, y] = nombres(2)
        ferme()
        sousChemin = { points: [projette(x, y)], close: false }
        break
      }
      case 'l': {
        const [x, y] = nombres(2)
        sousChemin ??= { points: [], close: false }
        sousChemin.points.push(projette(x, y))
        break
      }
      case 'h':
        if (sousChemin) sousChemin.close = true
        break
      case 'c':
      case 'v':
      case 'y': {
        // Courbe de Bezier : seul le point d'arrivee nous interesse, le reste
        // ne sert qu'a arrondir un coin.
        const n = nombres(op === 'c' ? 6 : 4)
        sousChemin ??= { points: [], close: false }
        sousChemin.points.push(projette(n.at(-2), n.at(-1)))
        break
      }
      case 'f':
      case 'f*':
      case 'F':
      case 'B':
      case 'B*':
      case 'b':
      case 'b*': {
        ferme()
        const trace = op[0] === 'B' || op[0] === 'b'
        for (const sc of chemin) {
          const rect = enRectangle(sc.points)
          if (rect) dessins.push({ ...rect, couleur: { ...etat.remplissage }, page: numero })
          if (trace) {
            for (const seg of segments(sc)) {
              traits.push({ ...seg, couleur: { ...etat.trait }, epaisseur: etat.epaisseur, page: numero })
            }
          }
        }
        chemin = []
        break
      }
      case 'S':
      case 's': {
        ferme()
        for (const sc of chemin) {
          for (const seg of segments(sc)) {
            traits.push({ ...seg, couleur: { ...etat.trait }, epaisseur: etat.epaisseur, page: numero })
          }
        }
        chemin = []
        break
      }
      case 'n':
        chemin = []
        sousChemin = null
        break
      case 'Do': {
        const nom = pile.filter((j) => j.type === 'nom').at(-1)?.valeur
        const info = images[nom]
        if (info) {
          const [a, , , d, e, f] = etat.matrice
          posesImage.push({
            nom,
            largeur: arrondi(Math.abs(a)),
            hauteur: arrondi(Math.abs(d)),
            x: arrondi(e),
            y: arrondi(f),
            pixels: info,
            page: numero,
          })
        }
        break
      }
      default:
        break
    }
    pile = []
  }

  return { textes, dessins, traits, images: posesImage, polices: policesVues }
}

// --- entree publique -------------------------------------------------------

function fluxDeLaPage(page) {
  const contenu = page.node.Contents()
  const flux = contenu instanceof PDFArray ? contenu.asArray().map((r) => page.doc.context.lookup(r)) : [contenu]
  const morceaux = flux
    .filter((f) => f instanceof PDFRawStream)
    .map((f) => decodePDFRawStream(f).decode())
  const total = morceaux.reduce((n, m) => n + m.length, 0)
  const tout = new Uint8Array(total + morceaux.length)
  let i = 0
  for (const m of morceaux) {
    tout.set(m, i)
    i += m.length
    tout[i] = 0x0a // les flux se concatenent separes par un blanc
    i++
  }
  return tout
}

function ressources(page) {
  const dict = page.node.Resources()
  const polices = {}
  const images = {}
  const fontDict = dict?.lookup(PDFName.of('Font'))
  if (fontDict) {
    for (const [cle, valeur] of fontDict.asMap()) {
      const f = page.doc.context.lookup(valeur)
      const base = f?.lookup?.(PDFName.of('BaseFont'))
      polices[cle.asString().slice(1)] = base?.asString?.().slice(1) ?? 'inconnue'
    }
  }
  const xDict = dict?.lookup(PDFName.of('XObject'))
  if (xDict) {
    for (const [cle, valeur] of xDict.asMap()) {
      const x = page.doc.context.lookup(valeur)
      images[cle.asString().slice(1)] = {
        largeur: x?.dict?.get(PDFName.of('Width'))?.asNumber?.() ?? 0,
        hauteur: x?.dict?.get(PDFName.of('Height'))?.asNumber?.() ?? 0,
      }
    }
  }
  return { polices, images }
}

/**
 * Ouvre un PDF et rend tout ce qu'on peut en affirmer.
 *
 * @param {Uint8Array} octets le PDF tel que l'app le produit
 */
export async function litLePdf(octets) {
  const doc = await PDFDocument.load(octets)
  const pages = doc.getPages().map((page, i) => {
    const { polices, images } = ressources(page)
    const lu = litLaPage(fluxDeLaPage(page), polices, images, i + 1)
    const { width, height } = page.getSize()
    return { numero: i + 1, largeur: arrondi(width), hauteur: arrondi(height), ...lu }
  })

  const tout = (cle) => pages.flatMap((p) => p[cle])

  return {
    doc,
    pages,
    nbPages: pages.length,
    textes: tout('textes'),
    dessins: tout('dessins'),
    traits: tout('traits'),
    images: tout('images'),
    polices: tout('polices'),
    titre: doc.getTitle(),
    sujet: doc.getSubject(),
    auteur: doc.getAuthor(),
    /** Tout le texte d'une page (ou du document), dans l'ordre du flux. */
    texteDe: (page = null) =>
      (page ? pages[page - 1].textes : tout('textes')).map((t) => t.texte).join(' '),
    /** Les fragments dont le texte contient `motif`. */
    cherche: (motif) => {
      const test = motif instanceof RegExp ? (t) => motif.test(t) : (t) => t.includes(motif)
      return tout('textes').filter((t) => test(t.texte))
    },
    /** Le premier fragment correspondant, ou `undefined`. */
    trouve(motif) {
      return this.cherche(motif)[0]
    },
  }
}

export { memeCouleur, arrondi }
