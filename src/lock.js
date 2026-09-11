// Verrou de l'app : le code d'acces est demande a chaque ouverture.
//
// C'est le meme code que pour l'envoi des mails - un seul a retenir. La premiere
// fois sur un appareil, il est verifie aupres du serveur ; ensuite il est retenu
// sur l'appareil et la verification se fait hors ligne : l'app doit s'ouvrir dans
// une cave comme au bureau. Le code n'est donc jamais inscrit dans l'app
// elle-meme, ou n'importe qui pourrait le lire.
//
// "Chaque ouverture" compte aussi le retour d'une app laissee en arriere-plan :
// sur un telephone, on ne la ferme presque jamais. Mais pas un aller-retour de
// quelques minutes - l'appareil photo et la feuille de partage font passer l'app
// en arriere-plan en pleine intervention, et la verrouiller alors la couperait en
// plein geste. D'ou le delai de grace.

import { currentCode, setCode } from './mailer.js'
import { codeCorrespond } from './code.js'

const GRACE_MS = 5 * 60 * 1000
let masqueDepuis = null

async function verifierEnLigne(code) {
  const res = await fetch('/api/check-code', { method: 'POST', headers: { 'x-app-code': code } })
  if (res.status === 204) return 'ok'
  if (res.status === 401) return 'refuse'
  return 'indisponible'
}

/** @returns {Promise<{ok: boolean, message?: string}>} */
async function essayer(saisi) {
  if (codeCorrespond(saisi, currentCode())) return { ok: true }
  // Code inconnu sur cet appareil, ou change depuis : seul le serveur peut dire.
  if (!navigator.onLine) {
    return {
      ok: false,
      message: currentCode()
        ? 'Code incorrect.'
        : 'Première ouverture sur cet appareil : il faut du réseau pour vérifier le code.',
    }
  }
  try {
    const r = await verifierEnLigne(saisi)
    if (r === 'ok') {
      setCode(saisi)
      return { ok: true }
    }
    if (r === 'refuse') return { ok: false, message: 'Code incorrect.' }
    return { ok: false, message: 'Vérification impossible pour le moment. Réessayez dans un instant.' }
  } catch {
    return { ok: false, message: 'Pas de réseau pour vérifier le code.' }
  }
}

export function verrouiller() {
  if (document.querySelector('.lock-screen')) return
  const el = document.createElement('div')
  el.className = 'lock-screen'
  el.innerHTML = `
    <form class="lock-card">
      <img src="/logo.jpg" alt="Atout Flair" class="lock-logo" />
      <h1>Atout Flair</h1>
      <p class="muted small">Entrez le code d'accès pour ouvrir l'application.</p>
      <input class="lock-input" type="password" name="code" autocomplete="current-password"
             autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="Code d'accès" />
      <p class="lock-error" aria-live="polite"></p>
      <button type="submit" class="btn primary wide">Déverrouiller</button>
    </form>`
  document.body.appendChild(el)
  document.body.classList.add('verrouille')
  const champ = el.querySelector('.lock-input')
  const erreur = el.querySelector('.lock-error')
  const bouton = el.querySelector('button')
  champ.focus()
  el.querySelector('form').addEventListener('submit', async (ev) => {
    ev.preventDefault()
    bouton.disabled = true
    erreur.textContent = ''
    const { ok, message } = await essayer(champ.value)
    bouton.disabled = false
    if (ok) {
      el.remove()
      document.body.classList.remove('verrouille')
      return
    }
    erreur.textContent = message
    champ.value = ''
    champ.focus()
  })
}

/** Verrouille tout de suite, puis a chaque retour apres le delai de grace. */
export function installerVerrou() {
  verrouiller()
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      masqueDepuis = Date.now()
      return
    }
    if (masqueDepuis && Date.now() - masqueDepuis > GRACE_MS) verrouiller()
    masqueDepuis = null
  })
}
