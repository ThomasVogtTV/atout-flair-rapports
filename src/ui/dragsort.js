// Reordonner les cartes d'un rapport au doigt.
//
// La carte saisie sort du flux et suit le pointeur ; un espace en pointille
// marque la place qu'elle prendra si on lache maintenant ; la liste defile
// toute seule quand le doigt approche du haut ou du bas de l'ecran - sans quoi
// une piece ne pourrait jamais passer devant une carte hors de l'ecran.
//
// Deux contraintes ont dicte la forme de ce code :
//
// 1. La carte ne quitte JAMAIS sa liste. Un ecran tactile attache le doigt a
//    l'element touche ; deplacer cet element dans le DOM (le sortir vers le
//    body, par exemple) libere cette prise, le navigateur annule le geste et se
//    remet a faire defiler la page. La carte est donc positionnee en absolu
//    dans sa propre liste, et n'en bouge qu'au moment du depot.
// 2. Les cartes n'ont pas toutes la meme hauteur (photos, puces de noms) : on
//    deplace un vrai element vide dans le DOM plutot que de calculer des
//    decalages, et le navigateur recalcule la mise en page tout seul.

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
  const listTop = list.getBoundingClientRect().top
  const top0 = rect.top - listTop
  const startY = ev.clientY
  const startScroll = window.scrollY
  const from = [...list.children].indexOf(card)
  let pointerY = ev.clientY
  let moved = false
  let autoRaf = null
  let done = false

  const placeholder = document.createElement('div')
  placeholder.className = 'row-placeholder'
  placeholder.style.height = `${rect.height}px`

  // La carte passe en absolu : elle ne prend plus de place dans la grille, mais
  // reste un enfant de la liste (voir contrainte 1 en tete de fichier).
  list.insertBefore(placeholder, card)
  card.classList.add('row-dragging')
  card.style.width = `${rect.width}px`
  card.style.height = `${rect.height}px`
  card.style.top = `${top0}px`
  document.body.classList.add('dragging-rows')

  // Garde le doigt (ou la souris) attache a la poignee jusqu'au relachement.
  try {
    grip.setPointerCapture(ev.pointerId)
  } catch {
    // Pointeur deja relache : le glissement se terminera de lui-meme.
  }

  // L'espace d'accueil se place la ou le doigt se trouve : avant la premiere
  // voisine dont il a depasse le milieu.
  const reslot = () => {
    for (const el of list.children) {
      if (el === placeholder || el === card) continue
      const r = el.getBoundingClientRect()
      if (pointerY < r.top + r.height / 2) {
        if (placeholder.nextElementSibling !== el) list.insertBefore(placeholder, el)
        return
      }
    }
    if (list.lastElementChild !== placeholder) list.appendChild(placeholder)
  }

  // La liste defile avec la page : le decalage de defilement garde la carte sous
  // le doigt, qui lui est repere par rapport a l'ecran.
  const follow = () => {
    card.style.top = `${top0 + (pointerY - startY) + (window.scrollY - startScroll)}px`
  }

  // Vitesse de defilement quand le doigt entre dans une zone de bord : nulle
  // ailleurs, progressive a l'approche du bord.
  const edgeSpeed = () => {
    const h = window.innerHeight
    const y = Math.max(0, Math.min(h, pointerY))
    if (y < EDGE) return -SPEED * (1 - y / EDGE)
    if (y > h - EDGE) return SPEED * (1 - (h - y) / EDGE)
    return 0
  }

  // Seul le defilement automatique a besoin d'une boucle d'images : il doit
  // continuer alors que le doigt, lui, ne bouge plus. Le reste du travail se
  // fait au mouvement (voir onMove), ou le navigateur nous appelle deja une
  // fois par image.
  const autoScroll = () => {
    const v = edgeSpeed()
    if (!v || done) {
      autoRaf = null
      return
    }
    document.scrollingElement.scrollTop += v
    follow()
    reslot()
    autoRaf = requestAnimationFrame(autoScroll)
  }

  const onMove = (e) => {
    pointerY = e.clientY
    // Rien ne bouge tant que le doigt n'a pas bouge : sinon un simple appui sur
    // le badge d'une carte basse de l'ecran lancerait le defilement automatique
    // et promenerait la place d'accueil.
    if (!moved && Math.abs(pointerY - startY) > MOVED) moved = true
    if (!moved) return
    follow()
    reslot()
    if (!autoRaf && edgeSpeed()) autoRaf = requestAnimationFrame(autoScroll)
  }

  const finish = () => {
    if (done) return
    done = true
    if (autoRaf) cancelAnimationFrame(autoRaf)
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', finish)
    window.removeEventListener('pointercancel', finish)

    const to = [...list.children].filter((el) => el !== card).indexOf(placeholder)
    // La carte reprend sa place dans le flux, a l'endroit de l'espace.
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
