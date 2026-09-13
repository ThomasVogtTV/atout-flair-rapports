// La navigation du bas : quatre portes et l'action principale au centre.
//
// Elle vit hors de #app, posee une fois au demarrage : elle traverse les
// changements d'ecran sans etre redessinee, et reste sous le pouce - le
// technicien a souvent une seule main de libre. Le CSS la retire des ecrans qui
// ne sont pas de premier niveau (un rapport ouvert, une fiche, les reglages).

import { ICONES_3D } from './icones3d.js'
import { ICONS } from './icons.js'

/**
 * @param {(ou: 'home'|'agenda'|'nouveau'|'contacts'|'envois') => void} naviguer
 */
export function installerDock(naviguer) {
  const deja = document.querySelector('.dock')
  if (deja) return deja
  const el = document.createElement('nav')
  el.className = 'dock'
  el.setAttribute('aria-label', 'Navigation principale')
  el.innerHTML = `
    <button type="button" class="dock-item" data-nav="home">
      <span class="dock-ico">${ICONES_3D.rapports}</span><span>Rapports</span>
    </button>
    <button type="button" class="dock-item" data-nav="agenda">
      <span class="dock-ico">${ICONES_3D.agenda}</span><span>Agenda</span>
    </button>
    <button type="button" class="dock-new" data-nav="nouveau" aria-label="Nouveau rapport">${ICONS.ajout}</button>
    <button type="button" class="dock-item" data-nav="contacts" data-dock-carnet>
      <span class="dock-ico">${ICONES_3D.carnet}</span><span>Carnet</span>
    </button>
    <button type="button" class="dock-item" data-nav="envois">
      <span class="dock-ico">${ICONES_3D.envois}<b class="dock-badge" aria-hidden="true"></b></span><span>Envois</span>
    </button>`
  el.addEventListener('click', (ev) => {
    const porte = ev.target.closest('[data-nav]')
    if (porte) naviguer(porte.dataset.nav)
  })
  document.body.appendChild(el)
  return el
}

/**
 * Remet le dock en phase avec l'ecran : la porte ouverte, le carnet cache aux
 * invites, et la pastille des envois qui attendent ou ont echoue.
 */
export function majDock({ ecran, invite = false, enAttente = 0, enEchec = 0 }) {
  const el = document.querySelector('.dock')
  if (!el) return
  const actif = ecran === 'fiche' ? 'contacts' : ecran
  for (const porte of el.querySelectorAll('.dock-item')) {
    const ouverte = porte.dataset.nav === actif
    porte.classList.toggle('actif', ouverte)
    if (ouverte) porte.setAttribute('aria-current', 'page')
    else porte.removeAttribute('aria-current')
  }
  // Pas de carnet pour un invite : la porte s'efface mais garde sa place, pour
  // que l'action principale reste au centre, sous le pouce.
  const carnet = el.querySelector('[data-dock-carnet]')
  carnet.classList.toggle('efface', !!invite)
  carnet.disabled = !!invite
  carnet.setAttribute('aria-hidden', invite ? 'true' : 'false')
  const badge = el.querySelector('.dock-badge')
  const n = enEchec || enAttente || 0
  badge.textContent = n ? String(n) : ''
  badge.classList.toggle('echec', enEchec > 0)
  el.querySelector('[data-nav="envois"]').setAttribute(
    'aria-label',
    enEchec ? `Envois, ${enEchec} à corriger` : enAttente ? `Envois, ${enAttente} en attente` : 'Envois'
  )
}
