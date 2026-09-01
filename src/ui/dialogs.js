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
 * Propose de clore le rapport quand son PDF vient d'etre passe a la messagerie
 * du telephone.
 *
 * C'est le seul instant ou l'on sait que le rapport a quitte l'app : le
 * demander ici evite d'avoir a y repenser plus tard, quand "En cours" aura
 * accumule une tournee entiere.
 *
 * @returns {Promise<boolean>} vrai si le rapport doit passer en "terminé"
 */
export function confirmRemise() {
  const overlay = openOverlay(`
    <h2>Rapport remis ?</h2>
    <p class="muted small">Le PDF est passé à votre messagerie. Une fois parti, ce rapport peut quitter « En cours » : il reste consultable, modifiable et renvoyable dans « Mes rapports ».</p>
    <div class="dialog-actions">
      <button class="btn ghost" data-remise="non">Le garder en cours</button>
      <button class="btn primary" data-remise="oui">Terminer</button>
    </div>`)

  return new Promise((resolve) => {
    overlay.addEventListener('click', (ev) => {
      const choix = ev.target === overlay ? 'non' : ev.target.closest('[data-remise]')?.dataset.remise
      if (!choix) return
      overlay.remove()
      resolve(choix === 'oui')
    })
  })
}

/**
 * Previent que l'appareil n'a plus de place, ou vient de refuser une ecriture.
 *
 * Un toast ne suffit pas ici : c'est le seul incident de l'app qui fait perdre
 * du travail deja saisi, et le remede - exporter la sauvegarde, puis effacer
 * des rapports remis - demande d'aller ailleurs dans l'app.
 *
 * @param {'refus'|'bientot'} motif ecriture deja refusee, ou place qui manque
 * @returns {Promise<'reglages'|'continuer'>}
 */
export function alerteStockage(motif) {
  const refus = motif === 'refus'
  const overlay = openOverlay(`
    <h2>${refus ? 'Enregistrement refusé' : 'Mémoire presque pleine'}</h2>
    <p class="muted small">${
      refus
        ? "L'appareil n'a plus de place : ce qui vient d'être saisi n'a pas pu être enregistré et sera perdu au prochain démarrage. Exportez la sauvegarde, puis supprimez des rapports déjà remis."
        : "Il reste peu de place sur cet appareil. Les prochaines photos risquent de ne plus tenir. Exportez la sauvegarde, puis supprimez des rapports déjà remis."
    }</p>
    <div class="dialog-actions">
      <button class="btn ghost" data-place="continuer">${refus ? 'Plus tard' : 'Continuer quand même'}</button>
      <button class="btn primary" data-place="reglages">Ouvrir les réglages</button>
    </div>`)

  return new Promise((resolve) => {
    overlay.addEventListener('click', (ev) => {
      const choix = ev.target === overlay ? 'continuer' : ev.target.closest('[data-place]')?.dataset.place
      if (!choix) return
      overlay.remove()
      resolve(choix)
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
