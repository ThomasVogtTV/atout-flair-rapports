// Pad de signature tactile. Retourne un PNG transparent, recadre au trace.

export function openSignaturePad(existing = null) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.className = 'overlay signature'
    overlay.innerHTML = `
      <div class="annot-bar">
        <button class="btn ghost" data-act="cancel">Annuler</button>
        <span class="sig-title">Signature du locataire</span>
        <button class="btn primary" data-act="save">Valider</button>
      </div>
      <div class="sig-stage"><canvas></canvas></div>
      <div class="sig-actions">
        <button class="btn ghost" data-act="clear">Effacer</button>
        <span class="hint">Signez avec le doigt dans le cadre</span>
      </div>
    `
    document.body.appendChild(overlay)

    const canvas = overlay.querySelector('canvas')
    const stage = overlay.querySelector('.sig-stage')
    const dpr = window.devicePixelRatio || 1
    canvas.width = stage.clientWidth * dpr
    canvas.height = stage.clientHeight * dpr
    canvas.style.width = `${stage.clientWidth}px`
    canvas.style.height = `${stage.clientHeight}px`
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)
    ctx.strokeStyle = '#101010'
    ctx.lineWidth = 2.4
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    let drawing = false
    let empty = true

    if (existing) {
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(stage.clientWidth / img.width, stage.clientHeight / img.height, 1)
        ctx.drawImage(img, 10, 10, img.width * scale * 0.9, img.height * scale * 0.9)
        empty = false
      }
      img.src = existing
    }

    const pos = (ev) => {
      const r = canvas.getBoundingClientRect()
      return { x: ev.clientX - r.left, y: ev.clientY - r.top }
    }

    canvas.addEventListener('pointerdown', (ev) => {
      canvas.setPointerCapture(ev.pointerId)
      drawing = true
      empty = false
      const p = pos(ev)
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
    })
    canvas.addEventListener('pointermove', (ev) => {
      if (!drawing) return
      const p = pos(ev)
      ctx.lineTo(p.x, p.y)
      ctx.stroke()
    })
    const stop = () => {
      drawing = false
    }
    canvas.addEventListener('pointerup', stop)
    canvas.addEventListener('pointercancel', stop)

    // Recadre sur le trace pour que la signature remplisse la case du PDF.
    const trim = () => {
      const { width, height } = canvas
      const data = ctx.getImageData(0, 0, width, height).data
      let minX = width
      let minY = height
      let maxX = 0
      let maxY = 0
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (data[(y * width + x) * 4 + 3] > 12) {
            if (x < minX) minX = x
            if (x > maxX) maxX = x
            if (y < minY) minY = y
            if (y > maxY) maxY = y
          }
        }
      }
      if (minX > maxX) return null
      const pad = Math.round(8 * dpr)
      minX = Math.max(0, minX - pad)
      minY = Math.max(0, minY - pad)
      maxX = Math.min(width - 1, maxX + pad)
      maxY = Math.min(height - 1, maxY + pad)
      const out = document.createElement('canvas')
      out.width = maxX - minX + 1
      out.height = maxY - minY + 1
      out.getContext('2d').drawImage(canvas, minX, minY, out.width, out.height, 0, 0, out.width, out.height)
      return out.toDataURL('image/png')
    }

    overlay.addEventListener('click', (ev) => {
      const act = ev.target.closest('[data-act]')?.dataset.act
      if (act === 'clear') {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        empty = true
      } else if (act === 'cancel') {
        overlay.remove()
        resolve(undefined)
      } else if (act === 'save') {
        const out = empty ? null : trim()
        overlay.remove()
        resolve(out)
      }
    })
  })
}
