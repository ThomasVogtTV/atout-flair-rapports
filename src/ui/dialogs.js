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

/**
 * Demande le code d'acces de l'app. Un vrai dialogue, et non la boite nue du
 * navigateur : celle-ci ne disait pas ce qu'etait ce code ni ou le trouver, et
 * un technicien a qui l'on confie le telephone se retrouvait bloque devant une
 * question sans reponse possible.
 *
 * @param {boolean} refuse vrai si l'on revient ici apres un refus du serveur
 * @returns {Promise<string>} le code saisi, ou '' si l'on renonce
 */
export function askAppCode({ refuse = false } = {}) {
  const overlay = openOverlay(`
    <h2>${refuse ? "Code d'accès refusé" : "Code d'accès"}</h2>
    <p class="muted small">${
      refuse
        ? "Ce code ne correspond pas. Attention aux majuscules : il s'écrit exactement comme il a été défini."
        : "Ce code autorise l'envoi des rapports depuis la boîte de l'entreprise. Il n'est demandé qu'une fois sur cet appareil."
    }</p>
    <label>Code<input id="app-code" type="text" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="Demandez-le à Thomas" /></label>
    <p class="muted small">Sans ce code, le rapport reste enregistré : vous pourrez toujours l'envoyer depuis la messagerie du téléphone avec « Partager ».</p>
    <div class="dialog-actions">
      <button class="btn ghost" data-code="">Plus tard</button>
      <button class="btn primary" data-code="ok">Valider</button>
    </div>`)

  const champ = overlay.querySelector('#app-code')
  champ.focus()

  return new Promise((resolve) => {
    const finir = (valeur) => {
      overlay.remove()
      resolve(valeur)
    }
    champ.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') finir(champ.value.trim())
    })
    overlay.addEventListener('click', (ev) => {
      if (ev.target === overlay) return finir('')
      const choix = ev.target.closest('[data-code]')?.dataset.code
      if (choix === undefined) return
      finir(choix === 'ok' ? champ.value.trim() : '')
    })
  })
}
