// Briques d'affichage partagees par tous les ecrans : le conteneur racine,
// l'echappement HTML, et les retours visuels de l'app (message court,
// ecran de chargement, pulsation d'un compteur qui vient de changer).

export const root = document.getElementById('app')

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

export function pulse(el) {
  el.classList.remove('pulse')
  void el.offsetWidth // force le reflow pour rejouer l'animation
  el.classList.add('pulse')
}

let toastTimer = null
export function toast(message) {
  let el = document.querySelector('.toast')
  if (!el) {
    el = document.createElement('div')
    el.className = 'toast'
    document.body.appendChild(el)
  }
  el.textContent = message
  el.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200)
}

export function showLoading(message) {
  let el = document.querySelector('.loading-overlay')
  if (!el) {
    el = document.createElement('div')
    el.className = 'loading-overlay'
    el.innerHTML = `<div class="loading-card"><span class="spinner"></span><span class="loading-text"></span></div>`
    document.body.appendChild(el)
  }
  el.querySelector('.loading-text').textContent = message
  requestAnimationFrame(() => el.classList.add('show'))
}

export function hideLoading() {
  document.querySelector('.loading-overlay')?.classList.remove('show')
}
