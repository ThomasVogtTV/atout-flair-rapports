// Reordonner les cartes d'un rapport au doigt.
//
// La carte saisie sort du flux et suit le pointeur ; un espace en pointille
// marque la place qu'elle prendra si on lache maintenant ; la liste defile
// toute seule quand le doigt approche du haut ou du bas de l'ecran - sans quoi
// une piece ne pourrait jamais passer devant une pièce hors de l'ecran.
//
// Les cartes n'ont pas toutes la meme hauteur (photos, puces de noms) : on
// deplace donc un vrai element dans le DOM plutot que de calculer des
// decalages, et le navigateur recalcule la mise en page tout seul.

const EDGE = 100 // hauteur des zones de defilement automatique, en px
const SPEED = 16 // vitesse maximale du defilement, en px par image
const MOVED = 5 // deplacement minimal avant de parler de glissement, en px

/**
 * Demarre un glissement. A appeler sur le pointerdown de la poignee.
 * @param {PointerEvent} ev
 * @param {HTMLElement} grip     la poignee (le badge numerote)
 * @param {(from:number,to:number)=>void} onDrop  appele si l'ordre a change
 */
export function startRowDrag(ev, grip, onDrop) {
  const card = grip.closest('.row-card')
  const list = card?.parentElement
  if (!card || !list || list.children.length < 2) return

  const rect = card.getBoundingClientRect()
  const startY = ev.clientY
  const from = [...list.children].indexOf(card)
  let pointerY = ev.clientY
  let moved = false
  let raf = null

  const placeholder = document.createElement('div')
  placeholder.className = 'row-placeholder'
  placeholder.style.height = `${rect.height}px`

  // La carte quitte la liste pour le body : elle flotte au-dessus de tout,
  // et la liste ne contient plus que ses voisines et l'espace d'accueil.
  list.insertBefore(placeholder, card)
  card.classList.add('row-dragging')
  card.style.width = `${rect.width}px`
  card.style.height = `${rect.height}px`
  card.style.left = `${rect.left}px`
  card.style.top = `${rect.top}px`
  document.body.appendChild(card)
  document.body.classList.add('dragging-rows')

  // L'espace d'accueil se place la ou le doigt se trouve : avant la premiere
  // voisine dont il a depasse le milieu.
  const reslot = () => {
    for (const el of list.children) {
      if (el === placeholder) continue
      const r = el.getBoundingClientRect()
      if (pointerY < r.top + r.height / 2) {
        if (placeholder.nextElementSibling !== el) list.insertBefore(placeholder, el)
        return
      }
    }
    if (list.lastElementChild !== placeholder) list.appendChild(placeholder)
  }

  const tick = () => {
    // Position fixe : la carte reste sous le doigt meme si la page defile.
    card.style.top = `${rect.top + (pointerY - startY)}px`

    // Rien ne bouge tant que le doigt n'a pas bouge : sinon un simple appui sur
    // le badge d'une carte basse de l'ecran suffirait a lancer le defilement
    // automatique et a promener la place d'accueil.
    if (moved) {
      const h = window.innerHeight
      const y = Math.max(0, Math.min(h, pointerY))
      const scroller = document.scrollingElement
      if (y < EDGE) scroller.scrollTop -= SPEED * (1 - y / EDGE)
      else if (y > h - EDGE) scroller.scrollTop += SPEED * (1 - (h - y) / EDGE)
      reslot()
    }
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)

  const onMove = (e) => {
    pointerY = e.clientY
    if (Math.abs(pointerY - startY) > MOVED) moved = true
  }

  const finish = () => {
    cancelAnimationFrame(raf)
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', finish)
    window.removeEventListener('pointercancel', finish)

    const to = [...list.children].indexOf(placeholder)
    // La carte reprend sa place dans la liste, a l'endroit de l'espace.
    card.classList.remove('row-dragging')
    card.style.cssText = ''
    list.replaceChild(card, placeholder)
    document.body.classList.remove('dragging-rows')

    // Pas de garde-fou contre le clic qui suit le relachement : le badge n'a
    // aucune action au clic, et preventDefault sur le pointerdown le supprime
    // deja au doigt. Un guet-apens sur le prochain clic, lui, avalait le tap
    // suivant n'importe ou dans l'ecran.
    if (moved && to !== from) onDrop(from, to)
  }

  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', finish)
  window.addEventListener('pointercancel', finish)
}
