// Fenetres modales de l'app. Toutes suivent la meme structure (voile plein
// ecran + carte au centre) : `openOverlay` la pose, l'appelant branche ses
// boutons dessus et appelle `overlay.remove()` quand il a fini.

/** @returns {HTMLElement} le voile ajoute au document */
export function openOverlay(innerHTML) {
  const overlay = document.createElement('div')
  overlay.className = 'overlay dialog'
  overlay.innerHTML = `<div class="dialog-box">${innerHTML}</div>`
  document.body.appendChild(overlay)
  return overlay
}

/**
 * Demande quoi faire d'un brouillon quand on quitte via le bouton retour.
 * @returns {Promise<'cancel'|'keep'|'delete'>}
 */
export function confirmLeave() {
  const overlay = openOverlay(`
    <h2>Quitter ce rapport ?</h2>
    <p class="muted small">Vous pouvez le garder en brouillon pour le reprendre plus tard, ou le supprimer s'il ne doit pas être conservé.</p>
    <div class="dialog-actions">
      <button class="btn ghost" data-leave="cancel">Reprendre</button>
      <button class="btn ghost danger" data-leave="delete">Supprimer</button>
      <button class="btn primary" data-leave="keep">Garder en brouillon</button>
    </div>`)

  return new Promise((resolve) => {
    overlay.addEventListener('click', (ev) => {
      const choice = ev.target === overlay ? 'cancel' : ev.target.closest('[data-leave]')?.dataset.leave
      if (!choice) return
      overlay.remove()
      resolve(choice)
    })
  })
}
