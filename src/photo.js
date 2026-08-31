// Capture, compression et annotation des photos.
// L'annotation est stockee en coordonnees image : le rendu final est donc
// fait en pleine resolution, pas a la taille de l'ecran.

const MAX_DIM = 1280
const QUALITY = 0.72

// Horodatage appose en bas a droite. Discret mais indelebile : il est cuit dans
// l'image des la prise, donc il traverse l'annotation, le re-encodage avant
// envoi et le PDF. Un rapport photographie l'apres-midi et redige le soir porte
// ainsi l'heure du terrain, pas celle de la redaction.
function stampTime(ctx, w, h, moment) {
  const d = new Date(moment)
  const deux = (n) => String(n).padStart(2, '0')
  const texte = `${deux(d.getDate())}.${deux(d.getMonth() + 1)}.${d.getFullYear()}  ${deux(d.getHours())}:${deux(d.getMinutes())}`
  const taille = Math.max(11, Math.round(w / 38))
  const marge = Math.round(taille * 0.9)
  ctx.save()
  ctx.font = `600 ${taille}px "Segoe UI", Arial, sans-serif`
  ctx.textAlign = 'right'
  ctx.textBaseline = 'bottom'
  // Blanc cerne de noir plutot qu'un bandeau : le texte reste lisible sur un
  // drap blanc comme sur un sommier sombre, sans masquer un centimetre de la
  // photo. Un simple blanc ombre disparaissait sur une literie claire - le cas
  // le plus frequent.
  ctx.lineWidth = Math.max(2, taille / 4.5)
  ctx.lineJoin = 'round'
  ctx.miterLimit = 2
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.62)'
  ctx.strokeText(texte, w - marge, h - marge)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
  ctx.fillText(texte, w - marge, h - marge)
  ctx.restore()
}

export async function fileToPhoto(file) {
  // imageOrientation: 'from-image' applique l'orientation EXIF du telephone.
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close?.()
  // lastModified porte l'instant de la prise de vue quand la photo vient de
  // l'appareil ; une image choisie dans la galerie garde sa date d'origine.
  // Le repli sur l'heure courante ne sert qu'aux fichiers sans date.
  stampTime(ctx, w, h, file.lastModified || Date.now())
  return { dataUrl: canvas.toDataURL('image/jpeg', QUALITY), width: w, height: h }
}

// Logo d'un partenaire. Plus petit qu'une photo : il n'occupe que quelques
// centimetres en tete du rapport, et 720 px suffisent largement a l'impression.
const LOGO_MAX = 720

/**
 * Prepare un logo depose ou choisi : reduit, et re-encode dans son format
 * d'origine. Un PNG reste un PNG, car un logo est presque toujours detoure sur
 * fond transparent - le passer en JPEG lui collerait un rectangle blanc autour,
 * qui se verrait sur le papier comme a l'ecran.
 *
 * @returns {Promise<string>} data URL prete a etre stockee et imprimee
 */
export async function fileToLogo(file) {
  const src = await imageDepuis(file)
  const w0 = src.width || src.naturalWidth || 0
  const h0 = src.height || src.naturalHeight || 0
  if (!w0 || !h0) throw new Error('Image illisible')
  const scale = Math.min(1, LOGO_MAX / Math.max(w0, h0))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(w0 * scale))
  canvas.height = Math.max(1, Math.round(h0 * scale))
  canvas.getContext('2d').drawImage(src, 0, 0, canvas.width, canvas.height)
  src.close?.()
  const jpeg = file.type === 'image/jpeg' || file.type === 'image/jpg'
  return canvas.toDataURL(jpeg ? 'image/jpeg' : 'image/png', 0.92)
}

// createImageBitmap ne sait pas lire tous les formats sur tous les telephones
// (le SVG, notamment, lui echappe encore) : on retombe alors sur une balise
// <img>, qui sait afficher tout ce que le navigateur sait afficher.
async function imageDepuis(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    const url = URL.createObjectURL(file)
    try {
      return await loadImage(url)
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 2000)
    }
  }
}

/**
 * Re-encode une photo deja annotee plus petite / plus compressee.
 * Sert au garde-fou de taille avant l'envoi par mail.
 */
export async function recompress(dataUrl, maxDim, quality) {
  const img = await loadImage(dataUrl)
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.naturalWidth * scale)
  canvas.height = Math.round(img.naturalHeight * scale)
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', quality)
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

// Couleur des annotations : le cyan de la maison, mais sa version franche et
// non le cyan assombri du reste. Ce trait doit ressortir sur un matelas clair
// comme sur un sommier sombre - il est regarde a l'ecran, jamais photocopie.
// Le rouge, lui, reste reserve au signalement d'une contamination.
const MARK = '#00a6c8'

function drawShapes(ctx, shapes, imgW) {
  const base = Math.max(3, imgW / 320)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const s of shapes) {
    ctx.strokeStyle = MARK
    ctx.fillStyle = MARK
    ctx.lineWidth = base
    if (s.type === 'circle') {
      const rx = Math.abs(s.x2 - s.x1) / 2
      const ry = Math.abs(s.y2 - s.y1) / 2
      ctx.beginPath()
      ctx.ellipse(Math.min(s.x1, s.x2) + rx, Math.min(s.y1, s.y2) + ry, rx || 1, ry || 1, 0, 0, Math.PI * 2)
      ctx.stroke()
    } else if (s.type === 'arrow') {
      const head = base * 6
      const angle = Math.atan2(s.y2 - s.y1, s.x2 - s.x1)
      ctx.beginPath()
      ctx.moveTo(s.x1, s.y1)
      ctx.lineTo(s.x2, s.y2)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(s.x2, s.y2)
      ctx.lineTo(s.x2 - head * Math.cos(angle - Math.PI / 7), s.y2 - head * Math.sin(angle - Math.PI / 7))
      ctx.lineTo(s.x2 - head * Math.cos(angle + Math.PI / 7), s.y2 - head * Math.sin(angle + Math.PI / 7))
      ctx.closePath()
      ctx.fill()
    } else if (s.type === 'text') {
      const size = s.size ?? Math.max(22, imgW / 26)
      ctx.font = `600 ${size}px "Segoe UI", Arial, sans-serif`
      ctx.textBaseline = 'top'
      ctx.fillText(s.text, s.x1, s.y1)
    }
  }
}

async function render(dataUrl, shapes) {
  const img = await loadImage(dataUrl)
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0)
  drawShapes(ctx, shapes, canvas.width)
  return canvas.toDataURL('image/jpeg', QUALITY)
}

/**
 * Ouvre l'editeur plein ecran.
 * @param {string} dataUrl  photo d'origine (non annotee)
 * @param {object} opts     { label } etiquette de piece pre-placee
 * @returns {Promise<{dataUrl:string, shapes:array}|null>} null si annule
 */
export function openAnnotator(dataUrl, { label = '', shapes: initial = null } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.className = 'overlay annotator'
    overlay.innerHTML = `
      <div class="annot-bar">
        <button class="btn ghost" data-act="cancel">Annuler</button>
        <div class="tools">
          <button class="tool active" data-tool="circle" title="Cercle">◯</button>
          <button class="tool" data-tool="arrow" title="Flèche">↗</button>
          <button class="tool" data-tool="text" title="Texte">T</button>
          <button class="tool" data-act="undo" title="Annuler le dernier tracé">⟲</button>
        </div>
        <button class="btn primary" data-act="save">Valider</button>
      </div>
      <div class="annot-stage"><canvas></canvas></div>
      <p class="annot-hint">Glissez pour entourer la zone signalée par le chien. « T » ajoute du texte.</p>
    `
    document.body.appendChild(overlay)

    const canvas = overlay.querySelector('canvas')
    const ctx = canvas.getContext('2d')
    let tool = 'circle'
    let shapes = initial ? [...initial] : []
    let img = null
    let drag = null

    if (label && !initial) {
      shapes.push({ type: 'text', x1: 0, y1: 0, text: label })
    }

    const paint = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      const scale = canvas.width / img.naturalWidth
      ctx.save()
      ctx.scale(scale, scale)
      drawShapes(ctx, drag ? [...shapes, drag] : shapes, img.naturalWidth)
      ctx.restore()
    }

    loadImage(dataUrl).then((loaded) => {
      img = loaded
      const stage = overlay.querySelector('.annot-stage')
      const fit = Math.min(stage.clientWidth / img.naturalWidth, stage.clientHeight / img.naturalHeight)
      canvas.width = Math.round(img.naturalWidth * fit)
      canvas.height = Math.round(img.naturalHeight * fit)
      // L'etiquette est placee dans le coin haut-gauche, un peu en retrait.
      const first = shapes[0]
      if (first?.type === 'text' && first.x1 === 0 && first.y1 === 0) {
        first.x1 = img.naturalWidth * 0.05
        first.y1 = img.naturalHeight * 0.04
      }
      paint()
    })

    const toImage = (ev) => {
      const r = canvas.getBoundingClientRect()
      const scale = img.naturalWidth / r.width
      return { x: (ev.clientX - r.left) * scale, y: (ev.clientY - r.top) * scale }
    }

    canvas.addEventListener('pointerdown', (ev) => {
      if (!img) return
      const p = toImage(ev)
      if (tool === 'text') {
        const value = prompt('Texte à ajouter')
        if (value) {
          shapes.push({ type: 'text', x1: p.x, y1: p.y, text: value })
          paint()
        }
        return
      }
      canvas.setPointerCapture(ev.pointerId)
      drag = { type: tool, x1: p.x, y1: p.y, x2: p.x, y2: p.y }
    })

    canvas.addEventListener('pointermove', (ev) => {
      if (!drag) return
      const p = toImage(ev)
      drag.x2 = p.x
      drag.y2 = p.y
      paint()
    })

    const endDrag = () => {
      if (!drag) return
      const moved = Math.hypot(drag.x2 - drag.x1, drag.y2 - drag.y1)
      if (moved > 8) shapes.push(drag)
      drag = null
      paint()
    }
    canvas.addEventListener('pointerup', endDrag)
    canvas.addEventListener('pointercancel', endDrag)

    overlay.addEventListener('click', async (ev) => {
      const toolBtn = ev.target.closest('[data-tool]')
      if (toolBtn) {
        tool = toolBtn.dataset.tool
        overlay.querySelectorAll('.tool').forEach((b) => b.classList.toggle('active', b === toolBtn))
        return
      }
      const act = ev.target.closest('[data-act]')?.dataset.act
      if (act === 'undo') {
        shapes.pop()
        paint()
      } else if (act === 'cancel') {
        overlay.remove()
        resolve(null)
      } else if (act === 'save') {
        const out = await render(dataUrl, shapes)
        overlay.remove()
        resolve({ dataUrl: out, shapes })
      }
    })
  })
}
