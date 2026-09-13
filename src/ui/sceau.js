// Le sceau : un cachet qui se pose quand un rapport est termine, comme sur un
// document officiel, puis s'efface. Il ne bloque rien et ne demande rien - il
// marque le moment ou le travail est rendu.

import { ICONS } from './icons.js'
import { esc } from './dom.js'

export function montrerSceau({ titre = 'Rapport terminé', ref = '' } = {}) {
  document.querySelector('.sceau')?.remove()
  const el = document.createElement('div')
  el.className = 'sceau'
  el.setAttribute('role', 'status')
  el.innerHTML = `
    <div class="sceau-disque">
      <span class="sceau-cachet">${ICONS.coche}</span>
      <span class="sceau-titre">${esc(titre)}</span>
      ${ref ? `<span class="sceau-ref">${esc(ref)}</span>` : ''}
    </div>`
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 1600)
}
