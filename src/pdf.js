import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { TYPES } from './templates.js'
import { frDate, frTime, filledRows, contaminatedCount } from './state.js'

// Reproduction de la mise en page des rapports Atout Flair (A4 portrait).
// Les cotes sont en points PDF (1 pt = 1/72 pouce).

const PAGE = { W: 595.28, H: 841.89 }
const M = 62                      // marge laterale
const CW = PAGE.W - 2 * M         // largeur utile
const RIGHT = M + CW
const BLACK = rgb(0, 0, 0)
const RED = rgb(0.85, 0.1, 0.1)

// Les polices standard sont encodees en WinAnsi : on remplace ce qui n'y passe pas.
function san(s) {
  return String(s ?? '')
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
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

  text(text, x, y, { size = 8, bold = false, color = BLACK, align = 'left', maxW } = {}) {
    const str = san(text)
    if (!str) return
    const s = maxW ? this.fit(str, bold, size, maxW) : size
    const w = this.width(str, bold, s)
    let px = x
    if (align === 'center') px = x - w / 2
    else if (align === 'right') px = x - w
    this.page.drawText(str, { x: px, y, size: s, font: bold ? this.f.bold : this.f.reg, color })
  }

  rect(x, y, w, h, thickness = 0.8) {
    this.page.drawRectangle({ x, y, width: w, height: h, borderWidth: thickness, borderColor: BLACK })
  }

  line(x1, y, x2, thickness = 0.6) {
    this.page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color: BLACK })
  }

  vline(x, y1, y2, thickness = 0.6) {
    this.page.drawLine({ start: { x, y: y1 }, end: { x, y: y2 }, thickness, color: BLACK })
  }

  // Bandeau de section centre, comme "Lieu d'intervention et informations".
  heading(label, y, width = 300, h = 17) {
    const x = PAGE.W / 2 - width / 2
    this.rect(x, y, width, h, 1.2)
    this.text(label, PAGE.W / 2, y + h / 2 - 3.6, { size: 10, bold: true, align: 'center', maxW: width - 10 })
  }

  // Champ "Label : valeur" avec la valeur soulignee.
  field(label, value, x, y, labelW, valueW) {
    this.text(`${label} :`, x, y, { size: 8, maxW: labelW })
    const vx = x + labelW + 4
    this.text(value, vx + 3, y, { size: 8, maxW: valueW - 6 })
    this.line(vx, y - 3, vx + valueW, 0.6)
  }

  wrap(text, x, y, { size = 8, bold = false, maxW, lh = 11, align = 'left', maxLines = 99 } = {}) {
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
    lines.slice(0, maxLines).forEach((l, i) => {
      this.text(l, x, y - i * lh, { size, bold, align, maxW })
    })
    return Math.min(lines.length, maxLines) * lh
  }
}

// --- en-tetes --------------------------------------------------------------

function mandantBox(sh, report, x, y, w, title = 'Mandant') {
  const titleH = 20
  sh.rect(x, y - titleH, w, titleH, 1.2)
  sh.text(title, x + w / 2, y - titleH + 6, { size: 11, bold: true, align: 'center' })
  const tw = sh.width(title, true, 11)
  sh.line(x + w / 2 - tw / 2, y - titleH + 4, x + w / 2 + tw / 2, 0.8)

  const rows = [
    ['Nom', report.mandant.nom],
    ['Adresse', report.mandant.adresse],
    ['NPA/Lieu', report.mandant.npaLieu],
    ['Email', report.mandant.email],
    ['N° tél', report.mandant.tel],
  ]
  let cy = y - titleH - 15
  for (const [label, value] of rows) {
    sh.field(label, value, x + 6, cy, 40, w - 58)
    cy -= 15
  }
  return cy
}

function lieuBox(sh, report, t, x, y, w) {
  const titleH = 20
  sh.rect(x, y - titleH, w, titleH, 1.2)
  sh.text("Lieu d'intervention et informations", x + w / 2, y - titleH + 6, {
    size: 10, bold: true, align: 'center', maxW: w - 8,
  })
  let cy = y - titleH - 15
  for (const f of t.lieuFields[0]) {
    sh.field(f.label, formatValue(f, report.lieu[f.key]), x + 6, cy, 48, w - 66)
    cy -= 15
  }
  return cy
}

function formatValue(field, value) {
  if (!value) return ''
  if (field.type === 'date') return frDate(value)
  if (field.type === 'time') return frTime(value)
  return value
}

function badge(sh, label, x, y, w = 132) {
  sh.rect(x, y, w, 15, 1.2)
  sh.text(label, x + w / 2, y + 4.5, { size: 7.5, bold: true, align: 'center', maxW: w - 6 })
}

// --- rapport de detection (appartement / maison) ---------------------------

async function drawDetection(sh, report, logo) {
  const t = TYPES.detection
  sh.newPage()
  const top = PAGE.H - 46

  const logoH = 104
  sh.page.drawImage(logo, { x: M, y: top - logoH, width: logoH * (logo.width / logo.height), height: logoH })
  mandantBox(sh, report, M + 250, top, CW - 250)
  badge(sh, t.badge, M, top - 128)
  sh.line(M, top - 146, RIGHT, 2)

  // Lieu d'intervention : bandeau + deux colonnes
  let y = top - 168
  sh.heading("Lieu d'intervention et informations", y, 300)
  y -= 30
  const lh = 22
  t.lieuFields[0].forEach((f, i) => {
    sh.field(f.label, formatValue(f, report.lieu[f.key]), M, y - i * lh, 108, 175)
  })
  t.lieuFields[1].forEach((f, i) => {
    sh.field(f.label, formatValue(f, report.lieu[f.key]), M + 300, y - i * lh, 92, 117)
  })
  y -= lh * 4
  sh.line(M, y, RIGHT, 2)

  // Compteurs
  y -= 26
  sh.heading(t.sectionTitle, y - 6, 300)
  y -= 46
  const boxW = 78
  const boxH = 28
  sh.text('Nombre de pièce :', M, y - 10, { size: 9 })
  sh.rect(M + 108, y - boxH + 2, boxW, boxH, 1.2)
  sh.text(String(filledRows(report).length), M + 108 + boxW / 2, y - 14, { size: 15, align: 'center' })
  sh.text('Nombre de pièce contaminée :', M + 232, y - 10, { size: 9 })
  sh.rect(RIGHT - boxW, y - boxH + 2, boxW, boxH, 1.2)
  sh.text(String(contaminatedCount(report)), RIGHT - boxW / 2, y - 14, { size: 15, align: 'center' })

  // Tableau des pieces
  y -= 48
  const cols = [
    { label: 'Pièces', w: CW * 0.26 },
    { label: 'Contaminée', w: CW * 0.24 },
    { label: 'Informations', w: CW * 0.5 },
  ]
  const xs = [M]
  cols.forEach((c) => xs.push(xs[xs.length - 1] + c.w))

  const headH = 16
  sh.rect(M, y - headH, CW, headH, 1)
  cols.forEach((c, i) => {
    if (i) sh.vline(xs[i], y - headH, y, 1)
    sh.text(c.label, xs[i] + c.w / 2, y - headH + 5, { size: 8.5, bold: true, align: 'center' })
  })
  // sous-entetes Oui / Non
  const subY = y - headH - 10
  sh.text('Oui', xs[1] + cols[1].w * 0.25, subY, { size: 7.5, align: 'center' })
  sh.text('Non', xs[1] + cols[1].w * 0.75, subY, { size: 7.5, align: 'center' })

  let ry = subY - 4
  const rowH = 23
  const rows = filledRows(report)
  const count = Math.max(t.minRows, rows.length)
  for (let i = 0; i < count; i++) {
    const row = rows[i]
    const yTop = ry - i * rowH
    sh.rect(M, yTop - rowH, CW, rowH, 0.8)
    sh.vline(xs[1], yTop - rowH, yTop, 0.8)
    sh.vline(xs[1] + cols[1].w / 2, yTop - rowH, yTop, 0.8)
    sh.vline(xs[2], yTop - rowH, yTop, 0.8)
    if (!row) continue
    const midY = yTop - rowH / 2 - 3
    sh.text(row.nom, xs[0] + cols[0].w / 2, midY, { size: 8.5, align: 'center', maxW: cols[0].w - 8 })
    const markX = row.contamine === 'oui' ? xs[1] + cols[1].w * 0.25 : xs[1] + cols[1].w * 0.75
    if (row.contamine === 'oui' || row.contamine === 'non') {
      sh.text('X', markX, yTop - rowH / 2 - 5, {
        size: 13, bold: false, align: 'center', color: row.contamine === 'oui' ? RED : BLACK,
      })
    } else if (row.contamine === 'inconnu') {
      sh.text('?', xs[1] + cols[1].w * 0.25, yTop - rowH / 2 - 5, { size: 13, align: 'center' })
      sh.text('?', xs[1] + cols[1].w * 0.75, yTop - rowH / 2 - 5, { size: 13, align: 'center' })
    }
    sh.text(row.info, xs[2] + 5, midY, { size: 8, maxW: cols[2].w - 10 })
  }

  // Remarques + signature
  let by = ry - count * rowH - 22
  const remW = CW * 0.62
  const sigW = CW - remW - 8
  const boxHeight = 86
  sh.text('Remarques et recommandations', M + remW / 2, by, { size: 8.5, bold: true, align: 'center' })
  sh.text('Signature', M + remW + 8 + sigW / 2, by, { size: 8.5, bold: true, align: 'center' })
  by -= 6
  sh.rect(M, by - boxHeight, remW, boxHeight, 1.2)
  sh.rect(M + remW + 8, by - boxHeight, sigW, boxHeight, 1.2)
  if (report.remarques) {
    sh.wrap(report.remarques, M + remW / 2, by - 16, {
      size: 8.5, maxW: remW - 16, lh: 12, align: 'center', maxLines: 6,
    })
  }
  if (report.signature) {
    const img = await sh.doc.embedPng(dataUrlToBytes(report.signature))
    const scale = Math.min((sigW - 16) / img.width, (boxHeight - 16) / img.height)
    sh.page.drawImage(img, {
      x: M + remW + 8 + (sigW - img.width * scale) / 2,
      y: by - boxHeight + (boxHeight - img.height * scale) / 2,
      width: img.width * scale,
      height: img.height * scale,
    })
  }
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

  const rowH = 21
  const headH = 24

  const drawTableHead = (y) => {
    sh.rect(M, y - headH, CW, headH, 1.2)
    cols.forEach((c, i) => {
      if (i) sh.vline(xs[i], y - headH, y, 0.8)
      if (c.type === 'contamine') {
        // deux sous-colonnes OUI / NON
        sh.text(c.label, xs[i] + widths[i] / 2, y - 10, { size: 7.5, bold: true, align: 'center', maxW: widths[i] - 4 })
        sh.line(xs[i], y - 13, xs[i] + widths[i], 0.8)
        sh.vline(xs[i] + widths[i] / 2, y - headH, y - 13, 0.8)
        sh.text('OUI', xs[i] + widths[i] * 0.25, y - headH + 4, { size: 6.5, bold: true, align: 'center' })
        sh.text('NON', xs[i] + widths[i] * 0.75, y - headH + 4, { size: 6.5, bold: true, align: 'center' })
      } else {
        sh.wrap(c.label, xs[i] + widths[i] / 2, y - 10, {
          size: 7.5, bold: true, maxW: widths[i] - 4, lh: 8.5, align: 'center', maxLines: 2,
        })
      }
    })
    return y - headH
  }

  const startFirstPage = () => {
    sh.newPage()
    const top = PAGE.H - 46
    const logoH = 92
    sh.page.drawImage(logo, { x: M, y: top - logoH, width: logoH * (logo.width / logo.height), height: logoH })
    mandantBox(sh, report, M + 108, top, 168)
    lieuBox(sh, report, t, M + 288, top, CW - 288)
    badge(sh, t.badge, M, top - 112, 118)
    sh.line(M, top - 128, RIGHT, 2)
    return drawTableHead(top - 150)
  }

  const startNextPage = () => {
    sh.newPage()
    return drawTableHead(PAGE.H - 60)
  }

  let y = startFirstPage()
  const bottom = 90
  const count = Math.max(t.minRows, rows.length + 2)

  for (let i = 0; i < count; i++) {
    if (y - rowH < bottom) y = startNextPage()
    const row = rows[i]
    sh.rect(M, y - rowH, CW, rowH, 0.8)
    cols.forEach((c, ci) => {
      if (ci) sh.vline(xs[ci], y - rowH, y, 0.8)
      if (c.type === 'contamine') sh.vline(xs[ci] + widths[ci] / 2, y - rowH, y, 0.8)
      if (!row) return
      const midY = y - rowH / 2 - 2.8
      if (c.type === 'contamine') {
        if (row.contamine === 'oui' || row.contamine === 'non') {
          const cx = xs[ci] + widths[ci] * (row.contamine === 'oui' ? 0.25 : 0.75)
          sh.text('X', cx, y - rowH / 2 - 4.5, {
            size: 12, bold: true, align: 'center', color: row.contamine === 'oui' ? RED : BLACK,
          })
        }
      } else if (c.type === 'sousRapport') {
        if (row.sousRapportId) sh.text('X', xs[ci] + widths[ci] / 2, y - rowH / 2 - 4.5, { size: 12, bold: true, align: 'center' })
      } else if (c.type === 'photoFlag') {
        const n = report.photos.filter((p) => p.rowId === row.id).length
        if (n) sh.text('X', xs[ci] + widths[ci] / 2, y - rowH / 2 - 4.5, { size: 12, bold: true, align: 'center' })
      } else {
        const value = c.type === 'date' ? `${frDate(row[c.key])}${row[c.key] ? '.' : ''}` : row[c.key]
        sh.text(value, xs[ci] + widths[ci] / 2, midY, { size: 7.5, align: 'center', maxW: widths[ci] - 6 })
      }
    })
    y -= rowH
  }

  if (report.remarques) {
    if (y - 30 < bottom) y = startNextPage()
    sh.rect(M, y - 26, CW, 26, 0.8)
    sh.wrap(report.remarques, PAGE.W / 2, y - 11, {
      size: 7.5, maxW: CW - 20, lh: 9, align: 'center', maxLines: 2,
    })
    y -= 26
  }
  sh.line(M, y - 6, RIGHT, 2)
}

// --- pages photos ----------------------------------------------------------

async function drawPhotos(sh, report) {
  for (const photo of report.photos) {
    const img = await sh.doc.embedJpg(dataUrlToBytes(photo.dataUrl))
    sh.newPage()
    const maxW = PAGE.W - 2 * 36
    const maxH = PAGE.H - 2 * 40
    const scale = Math.min(maxW / img.width, maxH / img.height)
    const w = img.width * scale
    const h = img.height * scale
    sh.page.drawImage(img, { x: (PAGE.W - w) / 2, y: PAGE.H - 40 - h, width: w, height: h })
  }
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

export async function buildPdf(report) {
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

  doc.setTitle(TYPES[report.type].label)
  doc.setProducer('Atout Flair')
  doc.setCreator('Atout Flair - Rapports')
  return doc.save()
}

export async function buildPdfBlob(report) {
  return new Blob([await buildPdf(report)], { type: 'application/pdf' })
}

/**
 * Rapport principal suivi des rapports de detection individuels (immeuble),
 * le tout dans un seul fichier.
 */
export async function buildCombinedPdf(report, children = []) {
  const main = await PDFDocument.load(await buildPdf(report))
  for (const child of children) {
    const sub = await PDFDocument.load(await buildPdf(child))
    const pages = await main.copyPages(sub, sub.getPageIndices())
    pages.forEach((p) => main.addPage(p))
  }
  return main.save()
}
