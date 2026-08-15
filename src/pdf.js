import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { TYPES } from './templates.js'
import { frDate, frTime, filledRows, contaminatedCount } from './state.js'

// Mise en page des rapports Atout Flair (A4 portrait).
// Les cotes sont en points PDF (1 pt = 1/72 pouce).
//
// Principe general : un rapport se lit de haut en bas comme un document
// d'expertise, pas comme un formulaire a remplir.
//   1. en-tete    - qui edite, quel document, quel numero, quelle date
//   2. les faits  - mandant et lieu d'intervention, cote a cote
//   3. le verdict - contamine ou non, en un coup d'oeil (c'est ce que la
//                   regie cherche en ouvrant le fichier)
//   4. le detail  - le tableau piece par piece
//   5. la suite   - remarques, recommandations, signatures
//   6. l'annexe   - les photos, legendees et numerotees

const PAGE = { W: 595.28, H: 841.89 }
const M = 52                      // marge laterale
const CW = PAGE.W - 2 * M         // largeur utile
const RIGHT = M + CW
const BOTTOM = 74                 // plancher du contenu (au-dessus du pied de page)

// Palette calee sur les tokens de style.css, pour que le PDF s'accorde avec
// l'app plutot que d'utiliser du noir pur partout.
const INK = rgb(0.110, 0.110, 0.118)        // = --ink #1c1c1e : texte principal
const INK_SOFT = rgb(0.282, 0.282, 0.298)   // = --ink-soft #48484c : libelles
const MUTED = rgb(0.525, 0.525, 0.545)      // = --muted #86868b : mentions secondaires
const LINE_HAIR = rgb(0.72, 0.70, 0.67)     // filet fin (doit rester lisible apres photocopie)
const LINE_FRAME = rgb(0.55, 0.54, 0.52)    // cadre des tableaux et blocs
const FILL_HEAD = rgb(0.945, 0.938, 0.925)  // trame des bandeaux et entetes de tableau
const FILL_ZEBRA = rgb(0.976, 0.972, 0.964) // trame tres legere, une ligne sur deux
const RED = rgb(0.753, 0.165, 0.165)        // = --red #c02a2a : accent de marque
const RED_SOFT = rgb(0.984, 0.918, 0.918)   // = --red-soft #fbeaea
const GREEN = rgb(0.122, 0.478, 0.302)      // = --green #1f7a4d : rapport sans contamination
const GREEN_SOFT = rgb(0.906, 0.961, 0.933) // = --green-soft #e7f5ee

// Coordonnees de l'entreprise, imprimees en pied de chaque page.
const FOOTER_LINE1 = 'Atout Flair · Oberli Stessy · Froideville 1, 1422 Grandson (VD) · 079 269 94 96 · info@atout-flair.ch'
const FOOTER_LINE2 = 'Chiens certifiés Bed Bug Foundation'

// Les polices standard sont encodees en WinAnsi : on remplace ce qui n'y passe pas.
function san(s) {
  return String(s ?? '')
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
    .replace(/[^\x20-\x7E¡-ÿ]/g, '')
}

function dataUrlToBytes(dataUrl) {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

class Sheet {
  constructor(doc, fonts) {
    this.doc = doc
    this.f = fonts
    this.page = null
  }

  newPage() {
    this.page = this.doc.addPage([PAGE.W, PAGE.H])
    return this.page
  }

  width(text, bold, size) {
    return (bold ? this.f.bold : this.f.reg).widthOfTextAtSize(san(text), size)
  }

  // Reduit la taille jusqu'a ce que le texte tienne dans maxW (jamais sous 5pt).
  fit(text, bold, size, maxW) {
    let s = size
    while (s > 5 && this.width(text, bold, s) > maxW) s -= 0.25
    return s
  }

  text(text, x, y, { size = 8, bold = false, color = INK, align = 'left', maxW } = {}) {
    const str = san(text)
    if (!str) return
    const s = maxW ? this.fit(str, bold, size, maxW) : size
    const w = this.width(str, bold, s)
    let px = x
    if (align === 'center') px = x - w / 2
    else if (align === 'right') px = x - w
    this.page.drawText(str, { x: px, y, size: s, font: bold ? this.f.bold : this.f.reg, color })
  }

  spacedWidth(text, { size = 8, bold = true, gap = 0.9 } = {}) {
    const chars = [...san(text)]
    return chars.reduce((w, c) => w + this.width(c, bold, size) + gap, -gap)
  }

  // Titre en capitales espacees : le seul endroit ou l'on force l'interlettrage,
  // pour donner aux intitules de section le calme d'un document imprime.
  spacedText(text, x, y, { size = 8, bold = true, color = INK, gap = 0.9, maxW } = {}) {
    const chars = [...san(text)]
    let width = chars.reduce((w, c) => w + this.width(c, bold, size) + gap, -gap)
    let s = size
    if (maxW && width > maxW) {
      s = size * (maxW / width)
      width = maxW
    }
    let cx = x
    for (const c of chars) {
      this.page.drawText(c, { x: cx, y, size: s, font: bold ? this.f.bold : this.f.reg, color })
      cx += this.width(c, bold, s) + gap
    }
    return width
  }

  rect(x, y, w, h, thickness = 0.7, { color = LINE_FRAME, fill = null } = {}) {
    const opts = { x, y, width: w, height: h, borderWidth: thickness, borderColor: color }
    if (fill) opts.color = fill
    this.page.drawRectangle(opts)
  }

  band(x, y, w, h, fill) {
    this.page.drawRectangle({ x, y, width: w, height: h, color: fill })
  }

  line(x1, y, x2, thickness = 0.5, color = LINE_HAIR) {
    this.page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color })
  }

  vline(x, y1, y2, thickness = 0.5, color = LINE_HAIR) {
    this.page.drawLine({ start: { x, y: y1 }, end: { x, y: y2 }, thickness, color })
  }

  // Liseret rouge sur le bord gauche d'un bandeau - meme registre que les
  // titres de section colores de l'app.
  stripe(x, y, h, color = RED) {
    this.page.drawRectangle({ x, y, width: 2.6, height: h, color })
  }

  wrap(text, x, y, { size = 8, bold = false, maxW, lh = 11, color = INK, align = 'left', maxLines = 99 } = {}) {
    const lines = []
    // Le decoupage se fait avant l'assainissement, qui supprime les sauts de ligne.
    for (const para of String(text ?? '').split(/\r?\n/)) {
      let cur = ''
      for (const word of para.split(' ')) {
        const test = cur ? `${cur} ${word}` : word
        if (this.width(test, bold, size) > maxW && cur) {
          lines.push(cur)
          cur = word
        } else cur = test
      }
      lines.push(cur)
    }
    const shown = lines.slice(0, maxLines)
    shown.forEach((l, i) => this.text(l, x, y - i * lh, { size, bold, color, align, maxW }))
    return shown.length * lh
  }

  // Nombre de lignes qu'occuperait `wrap`, sans rien dessiner : sert a savoir
  // si un bloc tient sur la page avant de le commencer.
  countLines(text, { size = 8, bold = false, maxW } = {}) {
    let n = 0
    for (const para of String(text ?? '').split(/\r?\n/)) {
      let cur = ''
      for (const word of para.split(' ')) {
        const test = cur ? `${cur} ${word}` : word
        if (this.width(test, bold, size) > maxW && cur) {
          n++
          cur = word
        } else cur = test
      }
      n++
    }
    return n
  }
}

// --- briques communes ------------------------------------------------------

/**
 * En-tete de la premiere page : logo a gauche, identite du document a droite.
 * C'est la partie qui doit dire, avant toute lecture, de quoi il s'agit.
 * Le titre est en capitales espacees, donc mesure avant d'etre dessine pour
 * pouvoir etre aligne a droite.
 */
function drawMasthead(sh, report, t, logo) {
  const top = PAGE.H - 44
  const logoH = 74
  sh.page.drawImage(logo, { x: M, y: top - logoH, width: logoH * (logo.width / logo.height), height: logoH })

  const title = san(t.badge).toUpperCase()
  const size = 13.5
  const gap = 1.1
  const titleW = [...title].reduce((w, c) => w + sh.width(c, true, size) + gap, -gap)
  sh.spacedText(title, RIGHT - titleW, top - 22, { size, bold: true, gap })

  sh.text(`N° ${report.ref}`, RIGHT, top - 40, { size: 10, bold: true, align: 'right', color: RED })

  const lieu = report.lieu?.dateIntervention || report.rows?.[0]?.date
  const date = frDate(lieu) || frDate(new Date().toISOString().slice(0, 10))
  sh.text(`Intervention du ${date}`, RIGHT, top - 54, { size: 8.5, align: 'right', color: INK_SOFT })

  const y = top - logoH - 12
  sh.page.drawLine({ start: { x: M, y }, end: { x: RIGHT, y }, thickness: 1.6, color: RED })
  return y - 22
}

/** Bloc encadre a libelles : le format "fiche de donnees" des deux entetes. */
function infoBlock(sh, title, rows, x, y, w, h) {
  const headH = 17
  sh.rect(x, y - h, w, h, 0.7)
  sh.band(x, y - headH, w, headH, FILL_HEAD)
  sh.line(x, y - headH, x + w, 0.7, LINE_FRAME)
  sh.stripe(x, y - headH, headH)
  sh.spacedText(san(title).toUpperCase(), x + 9, y - headH + 5.5, { size: 7.6, bold: true, gap: 0.7, maxW: w - 16 })

  const labelW = 62
  let cy = y - headH - 13
  for (const [label, value] of rows) {
    sh.text(san(label).toUpperCase(), x + 9, cy, { size: 6.4, color: MUTED, maxW: labelW - 4 })
    sh.text(value || '—', x + 9 + labelW, cy, { size: 8.3, maxW: w - labelW - 18, color: value ? INK : MUTED })
    cy -= 13.5
  }
  return y - h
}

/**
 * La conclusion, en haut du document : contamine ou non, et dans quelle
 * proportion. C'est l'information que le mandataire cherche en premier ;
 * elle ne doit pas se deduire d'un tableau.
 */
function verdictBanner(sh, y, { count, total, unit, unitPlural }) {
  const h = 38
  const positive = count > 0
  const accent = positive ? RED : GREEN
  const soft = positive ? RED_SOFT : GREEN_SOFT

  sh.band(M, y - h, CW, h, soft)
  sh.rect(M, y - h, CW, h, 0.7, { color: accent })
  sh.stripe(M, y - h, h, accent)

  const numX = M + 20
  const numSize = 21
  sh.text(String(positive ? count : total), numX, y - h / 2 - numSize * 0.34, { size: numSize, bold: true, color: accent })
  const numW = sh.width(String(positive ? count : total), true, numSize)

  const tx = numX + numW + 11
  const label = positive
    ? `${count > 1 ? unitPlural : unit} contaminé${unit.endsWith('e') ? 'e' : ''}${count > 1 ? 's' : ''}`
    : `${total > 1 ? unitPlural : unit} inspecté${unit.endsWith('e') ? 'e' : ''}${total > 1 ? 's' : ''}`
  sh.text(label.toUpperCase(), tx, y - 16, { size: 9.5, bold: true, color: accent, maxW: CW * 0.4 })
  sh.text(
    positive ? `sur ${total} ${total > 1 ? unitPlural : unit} inspecté${unit.endsWith('e') ? 'e' : ''}${total > 1 ? 's' : ''}` : 'Aucune contamination détectée',
    tx,
    y - 28,
    { size: 8, color: INK_SOFT, maxW: CW * 0.45 }
  )

  const verdict = positive ? 'PRÉSENCE DE PUNAISES DE LIT' : 'AUCUNE PRÉSENCE DÉTECTÉE'
  sh.text(verdict, RIGHT - 14, y - h / 2 - 3, { size: 9, bold: true, align: 'right', color: accent, maxW: CW * 0.44 })
  return y - h
}

/** Intitule de rubrique : filet rouge court + capitales espacees. */
function sectionTitle(sh, label, y, w = CW) {
  sh.page.drawRectangle({ x: M, y: y + 1.5, width: 18, height: 2, color: RED })
  sh.spacedText(san(label).toUpperCase(), M + 24, y, { size: 8, bold: true, gap: 0.8, maxW: w - 30 })
  return y - 12
}

/**
 * Bloc de signatures : l'entreprise a gauche, la personne presente a droite.
 * Une signature sans nom ni date ne vaut pas grand-chose : les deux lignes
 * sont donc toujours imprimees, remplies ou non.
 */
async function signatureBlock(sh, report, y) {
  const h = 84
  const colW = (CW - 16) / 2
  const dateStr = frDate(report.lieu?.dateIntervention) || ''

  const drawCol = (x, title, name) => {
    sh.rect(x, y - h, colW, h, 0.7)
    sh.band(x, y - 16, colW, 16, FILL_HEAD)
    sh.line(x, y - 16, x + colW, 0.7, LINE_FRAME)
    sh.stripe(x, y - 16, 16)
    sh.spacedText(san(title).toUpperCase(), x + 9, y - 11, { size: 7, bold: true, gap: 0.7, maxW: colW - 16 })
    sh.line(x + 12, y - h + 26, x + colW - 12, 0.5)
    sh.text(name || '', x + 12, y - h + 15, { size: 7.6, color: INK_SOFT, maxW: colW - 24 })
    sh.text(dateStr ? `Grandson, le ${dateStr}` : '', x + colW - 12, y - h + 15, {
      size: 7, color: MUTED, align: 'right',
    })
  }

  drawCol(M, 'Le technicien', 'Oberli Stessy · Atout Flair')
  drawCol(M + colW + 16, 'Le locataire / le mandant', report.lieu?.locataire || report.mandant?.nom || '')

  if (report.signature) {
    const img = await sh.doc.embedPng(dataUrlToBytes(report.signature))
    const boxW = colW - 30
    const boxH = h - 52
    const scale = Math.min(boxW / img.width, boxH / img.height)
    sh.page.drawImage(img, {
      x: M + colW + 16 + (colW - img.width * scale) / 2,
      y: y - h + 30,
      width: img.width * scale,
      height: img.height * scale,
    })
  }
  return y - h
}

// --- rapport de detection (appartement / maison) ---------------------------

async function drawDetection(sh, report, logo) {
  const t = TYPES.detection
  sh.newPage()
  let y = drawMasthead(sh, report, t, logo)

  // Mandant et lieu d'intervention, cote a cote : les deux jeux de
  // coordonnees du dossier, lisibles d'un seul regard.
  const gap = 14
  const leftW = (CW - gap) * 0.42
  const rightW = CW - gap - leftW
  const blockH = 17 + 6 * 13.5 + 6

  infoBlock(
    sh,
    'Mandant',
    [
      ['Nom', report.mandant.nom],
      ['Adresse', report.mandant.adresse],
      ['NPA / Lieu', report.mandant.npaLieu],
      ['Email', report.mandant.email],
      ['Téléphone', report.mandant.tel],
    ],
    M,
    y,
    leftW,
    blockH
  )

  infoBlock(
    sh,
    "Lieu d'intervention",
    [
      ['Adresse', report.lieu.adresseIntervention],
      ['Locataire', report.lieu.locataire],
      ['Étage / porte', report.lieu.etagePorte],
      ['Date et heure', [frDate(report.lieu.dateIntervention), frTime(report.lieu.heureIntervention)].filter(Boolean).join(' à ')],
      ['Bon de commande', report.lieu.bon],
      ['Présence locataire', report.lieu.presenceLocataire],
    ],
    M + leftW + gap,
    y,
    rightW,
    blockH
  )
  y -= blockH + 20

  const rows = filledRows(report)
  y = verdictBanner(sh, y, {
    count: contaminatedCount(report),
    total: rows.length,
    unit: 'pièce',
    unitPlural: 'pièces',
  })
  y -= 24

  // --- tableau des pieces
  const cols = [
    { label: 'Pièce', w: CW * 0.24 },
    { label: 'Contaminée', w: CW * 0.2 },
    { label: 'Constatations', w: CW * 0.56 },
  ]
  const xs = [M]
  cols.forEach((c) => xs.push(xs[xs.length - 1] + c.w))
  const headH = 24

  const drawHead = (ty) => {
    sh.band(M, ty - headH, CW, headH, FILL_HEAD)
    sh.rect(M, ty - headH, CW, headH, 0.7)
    sh.stripe(M, ty - headH, headH)
    cols.forEach((c, i) => {
      if (i) sh.vline(xs[i], ty - headH, ty, 0.7, LINE_FRAME)
      const label = c.label.toUpperCase()
      const lw = sh.spacedWidth(label, { size: 7.6, gap: 0.6 })
      sh.spacedText(label, xs[i] + c.w / 2 - lw / 2, ty - 10, { size: 7.6, bold: true, gap: 0.6, maxW: c.w - 10 })
    })
    sh.line(xs[1], ty - 14, xs[1] + cols[1].w, 0.5)
    sh.vline(xs[1] + cols[1].w / 2, ty - headH, ty - 14, 0.5)
    sh.text('OUI', xs[1] + cols[1].w * 0.25, ty - headH + 6, { size: 6.6, bold: true, color: MUTED, align: 'center' })
    sh.text('NON', xs[1] + cols[1].w * 0.75, ty - headH + 6, { size: 6.6, bold: true, color: MUTED, align: 'center' })
    return ty - headH
  }

  sectionTitle(sh, 'Détail par pièce', y)
  y -= 14
  let tableTop = y
  y = drawHead(y)
  let blockStart = y

  const closeTable = (from, to) => {
    sh.vline(M, to, from, 0.7, LINE_FRAME)
    sh.vline(RIGHT, to, from, 0.7, LINE_FRAME)
    sh.vline(xs[1], to, from, 0.7, LINE_FRAME)
    sh.vline(xs[1] + cols[1].w / 2, to, from, 0.5)
    sh.vline(xs[2], to, from, 0.7, LINE_FRAME)
    sh.line(M, to, RIGHT, 0.7, LINE_FRAME)
  }

  if (!rows.length) {
    const h = 26
    sh.text('Aucune pièce renseignée.', PAGE.W / 2, y - 17, { size: 8, color: MUTED, align: 'center' })
    closeTable(y, y - h)
    y -= h
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const lines = Math.max(1, sh.countLines(row.info, { size: 8.2, maxW: cols[2].w - 16 }))
    const rowH = Math.max(21, 11 + lines * 10.5)

    if (y - rowH < BOTTOM) {
      closeTable(blockStart, y)
      sh.newPage()
      y = drawHead(PAGE.H - 60)
      blockStart = y
      tableTop = PAGE.H - 60
    }

    if (i % 2 === 1) sh.band(M, y - rowH, CW, rowH, FILL_ZEBRA)
    if (i > 0) sh.line(M, y, RIGHT, 0.4)

    const midY = y - rowH / 2 - 3
    sh.text(row.nom, xs[0] + 10, midY, { size: 8.6, bold: true, maxW: cols[0].w - 18 })

    const markY = y - rowH / 2 - 3.6
    if (row.contamine === 'oui' || row.contamine === 'non') {
      const cx = xs[1] + cols[1].w * (row.contamine === 'oui' ? 0.25 : 0.75)
      sh.text('X', cx, markY, { size: 11, bold: true, align: 'center', color: row.contamine === 'oui' ? RED : INK })
    } else {
      // Statut indetermine : une seule mention, centree sur la colonne, plutot
      // qu'un "?" dans chaque case (qui se lisait comme deux reponses).
      sh.text('non déterminé', xs[1] + cols[1].w / 2, markY + 1, { size: 6.4, align: 'center', color: MUTED })
    }

    if (row.info) {
      sh.wrap(row.info, xs[2] + 10, y - 14, { size: 8.2, maxW: cols[2].w - 20, lh: 10.5 })
    } else {
      sh.text('—', xs[2] + 10, midY, { size: 8.2, color: MUTED })
    }
    y -= rowH
  }
  closeTable(blockStart, y)

  // --- remarques
  if (report.remarques) {
    const need = 16 + sh.countLines(report.remarques, { size: 8.6, maxW: CW - 4 }) * 11.5
    if (y - need - 26 < BOTTOM) {
      sh.newPage()
      y = PAGE.H - 60
    } else y -= 26
    y = sectionTitle(sh, 'Remarques et recommandations', y)
    y -= sh.wrap(report.remarques, M, y - 2, { size: 8.6, maxW: CW - 4, lh: 11.5 }) + 6
  }

  // --- signatures
  if (y - 84 < BOTTOM) {
    sh.newPage()
    y = PAGE.H - 60
  } else y -= 22
  await signatureBlock(sh, report, y)
}

// --- rapports immeuble / hotel ---------------------------------------------

async function drawLignes(sh, report, logo) {
  const t = TYPES[report.type]
  const rows = filledRows(report)
  const cols = t.columns.filter((c) => c.key !== 'sousRapport' || rows.some((r) => r.sousRapportId))
  const totalW = cols.reduce((s, c) => s + c.width, 0)
  const widths = cols.map((c) => (c.width / totalW) * CW)
  const xs = [M]
  widths.forEach((w) => xs.push(xs[xs.length - 1] + w))

  const rowH = 20
  // Assez haut pour trois lignes d'intitule : "RAPPORT DE DETECTION" tenait
  // sur deux lignes en perdant son dernier mot, et l'entete mentait.
  const headH = 30
  const headLh = 8

  const drawTableHead = (y) => {
    sh.band(M, y - headH, CW, headH, FILL_HEAD)
    sh.rect(M, y - headH, CW, headH, 0.7)
    sh.stripe(M, y - headH, headH)
    cols.forEach((c, i) => {
      if (i) sh.vline(xs[i], y - headH, y, 0.7, LINE_FRAME)
      const label = c.label.toUpperCase()
      if (c.type === 'contamine') {
        sh.text(label, xs[i] + widths[i] / 2, y - 12, { size: 7.2, bold: true, align: 'center', maxW: widths[i] - 4 })
        sh.line(xs[i], y - 17, xs[i] + widths[i], 0.5)
        sh.vline(xs[i] + widths[i] / 2, y - headH, y - 17, 0.5)
        sh.text('OUI', xs[i] + widths[i] * 0.25, y - headH + 5, { size: 6.4, bold: true, color: MUTED, align: 'center' })
        sh.text('NON', xs[i] + widths[i] * 0.75, y - headH + 5, { size: 6.4, bold: true, color: MUTED, align: 'center' })
      } else {
        // Intitule centre verticalement, qu'il tienne sur une ou trois lignes.
        const n = Math.min(3, sh.countLines(label, { size: 7.2, bold: true, maxW: widths[i] - 8 }))
        const first = y - (headH - n * headLh) / 2 - headLh + 2
        sh.wrap(label, xs[i] + widths[i] / 2, first, {
          size: 7.2, bold: true, maxW: widths[i] - 8, lh: headLh, align: 'center', maxLines: 3,
        })
      }
    })
    return y - headH
  }

  const closeBlock = (blockTop, blockBottom) => {
    sh.vline(M, blockBottom, blockTop, 0.7, LINE_FRAME)
    sh.vline(RIGHT, blockBottom, blockTop, 0.7, LINE_FRAME)
    sh.line(M, blockBottom, RIGHT, 0.7, LINE_FRAME)
  }

  sh.newPage()
  let y = drawMasthead(sh, report, t, logo)

  const gap = 14
  const leftW = (CW - gap) * 0.42
  const rightW = CW - gap - leftW
  const lieuRows = t.lieuFields[0]
    .filter((f) => !f.derived)
    .map((f) => [f.label, f.type === 'date' ? frDate(report.lieu[f.key]) : report.lieu[f.key]])
  const blockH = 17 + Math.max(5, lieuRows.length) * 13.5 + 6

  infoBlock(
    sh,
    'Mandant',
    [
      ['Nom', report.mandant.nom],
      ['Adresse', report.mandant.adresse],
      ['NPA / Lieu', report.mandant.npaLieu],
      ['Email', report.mandant.email],
      ['Téléphone', report.mandant.tel],
    ],
    M,
    y,
    leftW,
    blockH
  )
  infoBlock(sh, "Lieu d'intervention", lieuRows, M + leftW + gap, y, rightW, blockH)
  y -= blockH + 20

  y = verdictBanner(sh, y, {
    count: contaminatedCount(report),
    total: rows.length,
    unit: t.rowLabel,
    unitPlural: t.rowLabelPlural,
  })
  y -= 24

  y = sectionTitle(sh, `Détail par ${t.rowLabel}`, y)
  y -= 2
  y = drawTableHead(y)
  let blockTop = y

  if (!rows.length) {
    sh.text(`Aucun${t.rowLabel.endsWith('e') ? 'e' : ''} ${t.rowLabel} renseigné${t.rowLabel.endsWith('e') ? 'e' : ''}.`, PAGE.W / 2, y - 17, {
      size: 8, color: MUTED, align: 'center',
    })
    y -= 26
  }

  for (let i = 0; i < rows.length; i++) {
    if (y - rowH < BOTTOM) {
      closeBlock(blockTop, y)
      sh.newPage()
      y = drawTableHead(PAGE.H - 60)
      blockTop = y
    }
    const row = rows[i]
    if (i % 2 === 1) sh.band(M, y - rowH, CW, rowH, FILL_ZEBRA)
    if (i > 0) sh.line(M, y, RIGHT, 0.4)

    cols.forEach((c, ci) => {
      if (ci) sh.vline(xs[ci], y - rowH, y, 0.5)
      if (c.type === 'contamine') sh.vline(xs[ci] + widths[ci] / 2, y - rowH, y, 0.5)
      const midY = y - rowH / 2 - 2.8
      const markY = y - rowH / 2 - 3.6
      if (c.type === 'contamine') {
        if (row.contamine === 'oui' || row.contamine === 'non') {
          const cx = xs[ci] + widths[ci] * (row.contamine === 'oui' ? 0.25 : 0.75)
          sh.text('X', cx, markY, { size: 10.5, bold: true, align: 'center', color: row.contamine === 'oui' ? RED : INK })
        }
      } else if (c.type === 'sousRapport') {
        if (row.sousRapportId) sh.text('X', xs[ci] + widths[ci] / 2, markY, { size: 10.5, bold: true, align: 'center' })
      } else if (c.type === 'photoFlag') {
        const n = report.photos.filter((p) => p.rowId === row.id).length
        if (n) sh.text(String(n), xs[ci] + widths[ci] / 2, markY, { size: 9, bold: true, align: 'center' })
      } else {
        const value = c.type === 'date' ? frDate(row[c.key]) : row[c.key]
        const bold = c.key === 'numero'
        sh.text(value, xs[ci] + widths[ci] / 2, midY, { size: 7.6, bold, align: 'center', maxW: widths[ci] - 6 })
      }
    })
    y -= rowH
  }
  closeBlock(blockTop, y)

  if (report.remarques) {
    const need = 16 + sh.countLines(report.remarques, { size: 8.4, maxW: CW - 4 }) * 11
    if (y - need - 26 < BOTTOM) {
      sh.newPage()
      y = PAGE.H - 60
    } else y -= 26
    y = sectionTitle(sh, 'Remarques et recommandations', y)
    y -= sh.wrap(report.remarques, M, y - 2, { size: 8.4, maxW: CW - 4, lh: 11 }) + 6
  }

  if (t.hasSignature || report.signature) {
    if (y - 84 < BOTTOM) {
      sh.newPage()
      y = PAGE.H - 60
    } else y -= 22
    await signatureBlock(sh, report, y)
  }
}

// --- annexe photographique -------------------------------------------------

/**
 * Une photo par page, cadree et legendee. La legende reprend le nom de la
 * piece : sans elle, une photo de matelas ne prouve rien - on ne sait pas ou
 * elle a ete prise.
 */
async function drawPhotos(sh, report) {
  if (!report.photos.length) return
  const t = TYPES[report.type]

  for (let i = 0; i < report.photos.length; i++) {
    const photo = report.photos[i]
    const img = await sh.doc.embedJpg(dataUrlToBytes(photo.dataUrl))
    sh.newPage()

    let y = PAGE.H - 52
    sh.spacedText('ANNEXE PHOTOGRAPHIQUE', M, y, { size: 8.6, bold: true, gap: 0.9 })
    sh.text(`${san(t.badge)} N° ${report.ref}`, RIGHT, y, { size: 8, align: 'right', color: INK_SOFT })
    y -= 8
    sh.page.drawLine({ start: { x: M, y }, end: { x: RIGHT, y }, thickness: 1.2, color: RED })

    const row = report.rows.find((r) => r.id === photo.rowId)
    const where = row ? row.nom || [row.numero && `N° ${row.numero}`, row.etage].filter(Boolean).join(' - ') : ''
    const caption = `Photo ${i + 1} / ${report.photos.length}${where ? ` — ${where}` : ''}`

    // Image et legende forment un seul bloc, centre dans la hauteur restante :
    // la legende reste collee a sa photo (convention des rapports d'expertise)
    // et le blanc se repartit au lieu de s'accumuler en bas de page.
    y -= 16
    const infoLines = row?.info ? Math.min(2, sh.countLines(row.info, { size: 8, maxW: CW })) : 0
    const legendH = 14 + infoLines * 10
    const availH = y - (BOTTOM + 6)
    const scale = Math.min(CW / img.width, (availH - legendH) / img.height)
    const w = img.width * scale
    const h = img.height * scale
    const x = M + (CW - w) / 2
    const blockTop = y - (availH - (h + legendH)) / 2

    sh.page.drawImage(img, { x, y: blockTop - h, width: w, height: h })
    sh.rect(x - 1.5, blockTop - h - 1.5, w + 3, h + 3, 0.7, { color: LINE_FRAME })

    let ly = blockTop - h - 15
    sh.text(caption, x, ly, { size: 9, bold: true, maxW: w })
    if (row?.info) sh.wrap(row.info, x, ly - 11, { size: 8, maxW: w, lh: 10, color: INK_SOFT, maxLines: 2 })
  }
}

// --- pied de page et pagination --------------------------------------------

/**
 * Pied de page identique sur toutes les pages, numerotation comprise. Il est
 * appose a la fin, quand le nombre total de pages est connu - y compris apres
 * la fusion des sous-rapports d'un immeuble.
 */
async function paginate(doc) {
  const reg = await doc.embedFont(StandardFonts.Helvetica)
  const pages = doc.getPages()
  pages.forEach((page, i) => {
    const y = 34
    const center = (text, ty, size, color) => {
      const w = reg.widthOfTextAtSize(san(text), size)
      page.drawText(san(text), { x: (PAGE.W - w) / 2, y: ty, size, font: reg, color })
    }
    page.drawLine({ start: { x: M, y: y + 20 }, end: { x: RIGHT, y: y + 20 }, thickness: 0.5, color: LINE_HAIR })
    page.drawLine({
      start: { x: PAGE.W / 2 - 16, y: y + 20 },
      end: { x: PAGE.W / 2 + 16, y: y + 20 },
      thickness: 1.4,
      color: RED,
    })
    center(FOOTER_LINE1, y + 8, 6.3, MUTED)
    center(FOOTER_LINE2, y, 6.3, MUTED)
    const num = `${i + 1} / ${pages.length}`
    const w = reg.widthOfTextAtSize(num, 7.2)
    page.drawText(num, { x: RIGHT - w, y: y + 8, size: 7.2, font: reg, color: MUTED })
  })
}

// --- entree publique -------------------------------------------------------

let logoBytesCache = null

async function getLogoBytes() {
  if (!logoBytesCache) {
    const res = await fetch(new URL('/logo.jpg', location.href))
    logoBytesCache = new Uint8Array(await res.arrayBuffer())
  }
  return logoBytesCache
}

async function buildDoc(report) {
  const doc = await PDFDocument.create()
  const fonts = {
    reg: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  }
  const logo = await doc.embedJpg(await getLogoBytes())
  const sh = new Sheet(doc, fonts)

  if (TYPES[report.type].layout === 'pieces') await drawDetection(sh, report, logo)
  else await drawLignes(sh, report, logo)

  await drawPhotos(sh, report)

  doc.setTitle(`${TYPES[report.type].label} N° ${report.ref}`)
  doc.setSubject(`Détection canine de punaises de lit - ${report.lieu?.adresseIntervention || report.lieu?.adresse || ''}`)
  doc.setAuthor('Atout Flair - Oberli Stessy')
  doc.setProducer('Atout Flair')
  doc.setCreator('Atout Flair - Rapports')
  return doc
}

export async function buildPdf(report) {
  const doc = await buildDoc(report)
  await paginate(doc)
  return doc.save()
}

export async function buildPdfBlob(report) {
  return new Blob([await buildPdf(report)], { type: 'application/pdf' })
}

/**
 * Rapport principal suivi des rapports de detection individuels (immeuble),
 * le tout dans un seul fichier. La numerotation des pages est posee a la fin,
 * sur le document fusionne, pour qu'elle compte l'ensemble.
 */
export async function buildCombinedPdf(report, children = []) {
  const main = await buildDoc(report)
  for (const child of children) {
    const sub = await buildDoc(child)
    const bytes = await sub.save()
    const loaded = await PDFDocument.load(bytes)
    const pages = await main.copyPages(loaded, loaded.getPageIndices())
    pages.forEach((p) => main.addPage(p))
  }
  await paginate(main)
  return main.save()
}
