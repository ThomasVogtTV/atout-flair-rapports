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

// L'affichage est repousse d'une frame pour que la transition CSS parte du
// bon etat. Si le travail se termine avant cette frame - un PDF leger se
// genere en quelques millisecondes - hideLoading passait avant l'ajout de la
// classe, et l'ecran de chargement s'affichait ensuite pour ne plus jamais
// partir. La frame en attente est donc annulee a la fermeture.
let loadingFrame = null

export function showLoading(message) {
  let el = document.querySelector('.loading-overlay')
  if (!el) {
    el = document.createElement('div')
    el.className = 'loading-overlay'
    el.innerHTML = `<div class="loading-card"><span class="spinner"></span><span class="loading-text"></span></div>`
    document.body.appendChild(el)
  }
  el.querySelector('.loading-text').textContent = message
  cancelAnimationFrame(loadingFrame)
  loadingFrame = requestAnimationFrame(() => el.classList.add('show'))
}

export function hideLoading() {
  cancelAnimationFrame(loadingFrame)
  loadingFrame = null
  document.querySelector('.loading-overlay')?.classList.remove('show')
}
