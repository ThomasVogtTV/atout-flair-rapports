// Verrou de l'app : le code d'acces est demande a chaque ouverture.
//
// Chaque personne a son code : l'administrateur (APP_CODE) et chaque employe
// (crees depuis l'onglet Administration). C'est aussi le code d'envoi des mails -
// un seul a retenir. La premiere fois sur un appareil, il est verifie aupres du
// serveur ; ensuite il est retenu sur l'appareil et la verification se fait hors
// ligne : l'app doit s'ouvrir dans une cave comme au bureau. Le code n'est donc
// jamais inscrit dans l'app elle-meme, ou n'importe qui pourrait le lire.
//
// Un code accepte hors ligne est reconfirme aupres du serveur des que le reseau
// est la. C'est ce qui rend une revocation effective : un employe dont le code a
// ete retire est arrete a sa prochaine ouverture avec du reseau, meme si son
// telephone connait encore l'ancien code.
//
// "Chaque ouverture" compte aussi le retour d'une app laissee en arriere-plan :
// sur un telephone, on ne la ferme presque jamais. Mais pas un aller-retour de
// quelques minutes - l'appareil photo et la feuille de partage font passer l'app
// en arriere-plan en pleine intervention, et la verrouiller alors la couperait en
// plein geste. D'ou le delai de grace.
//
// "Se souvenir de moi" (coche par defaut) dispense de tout cela sur l'appareil :
// l'app s'ouvre directement, a la reprise comme au demarrage. Le code n'est
// redemande qu'au bout de trente jours, apres "Se deconnecter", ou si le
// serveur le refuse - la revocation d'un employe reste donc effective.

import { currentCode, setCode } from './mailer.js'
import { codeCorrespond, souvenirValide, SOUVENIR_MS } from './code.js'

const GRACE_MS = 5 * 60 * 1000
const ID_KEY = 'af-identite'
const SOUVENIR_KEY = 'af-souvenir'
let masqueDepuis = null

/** Qui utilise cet appareil, tel que le serveur l'a dit a la derniere verification. */
export function identite() {
  try {
    return JSON.parse(localStorage.getItem(ID_KEY) ?? 'null')
  } catch {
    return null
  }
}
export const estAdmin = () => identite()?.role === 'admin'
const retenirIdentite = (ident) =>
  ident ? localStorage.setItem(ID_KEY, JSON.stringify(ident)) : localStorage.removeItem(ID_KEY)

/** Date (ms) jusqu'a laquelle l'appareil est dispense du code, ou null. */
export const souvenirJusqua = () => Number(localStorage.getItem(SOUVENIR_KEY)) || null
const memorise = () => souvenirValide(souvenirJusqua()) && !!currentCode()

/** Oublie la personne sur cet appareil, et redemande le code tout de suite. */
export function seDeconnecter() {
  localStorage.removeItem(SOUVENIR_KEY)
  setCode('')
  retenirIdentite(null)
  verrouiller()
}

async function verifierEnLigne(code) {
  const res = await fetch('/api/check-code', { method: 'POST', headers: { 'x-app-code': code } })
  if (res.status === 401) return { etat: 'refuse' }
  if (!res.ok) return { etat: 'indisponible' }
  const ident = res.status === 204 ? null : await res.json().catch(() => null)
  return { etat: 'ok', ident }
}

async function revalider(code) {
  if (!navigator.onLine) return
  try {
    const r = await verifierEnLigne(code)
    if (r.etat === 'ok') {
      if (r.ident) retenirIdentite(r.ident)
      return
    }
    if (r.etat === 'refuse') {
      setCode('')
      retenirIdentite(null)
      localStorage.removeItem(SOUVENIR_KEY)
      verrouiller("Ce code n'est plus valable. Demandez-en un nouveau.")
    }
  } catch {
    // Reseau capricieux : on reconfirmera a la prochaine ouverture.
  }
}

/** @returns {Promise<{ok: boolean, message?: string}>} */
async function essayer(saisi) {
  if (codeCorrespond(saisi, currentCode())) {
    revalider(saisi)
    return { ok: true }
  }
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
    if (r.etat === 'ok') {
      setCode(saisi)
      retenirIdentite(r.ident)
      return { ok: true }
    }
    if (r.etat === 'refuse') return { ok: false, message: 'Code incorrect.' }
    return { ok: false, message: 'Vérification impossible pour le moment. Réessayez dans un instant.' }
  } catch {
    return { ok: false, message: 'Pas de réseau pour vérifier le code.' }
  }
}

export function verrouiller(message = '') {
  const existant = document.querySelector('.lock-screen')
  if (existant) {
    if (message) existant.querySelector('.lock-error').textContent = message
    return
  }
  const el = document.createElement('div')
  el.className = 'lock-screen'
  el.innerHTML = `
    <form class="lock-card">
      <img src="/logo.jpg" alt="Atout Flair" class="lock-logo" />
      <h1>Atout Flair</h1>
      <p class="muted small">Entrez votre code d'accès pour ouvrir l'application.</p>
      <input class="lock-input" type="password" name="code" autocomplete="current-password"
             autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="Code d'accès" />
      <p class="lock-error" aria-live="polite"></p>
      <label class="lock-souvenir"><input type="checkbox" name="souvenir" checked /> Se souvenir de moi sur cet appareil</label>
      <button type="submit" class="btn primary wide">Déverrouiller</button>
    </form>`
  document.body.appendChild(el)
  document.body.classList.add('verrouille')
  const champ = el.querySelector('.lock-input')
  const erreur = el.querySelector('.lock-error')
  const bouton = el.querySelector('button')
  erreur.textContent = message
  champ.focus()
  el.querySelector('form').addEventListener('submit', async (ev) => {
    ev.preventDefault()
    bouton.disabled = true
    erreur.textContent = ''
    const { ok, message: motif } = await essayer(champ.value)
    bouton.disabled = false
    if (ok) {
      if (el.querySelector('[name="souvenir"]').checked) {
        localStorage.setItem(SOUVENIR_KEY, String(Date.now() + SOUVENIR_MS))
      } else {
        localStorage.removeItem(SOUVENIR_KEY)
      }
      el.remove()
      document.body.classList.remove('verrouille')
      return
    }
    erreur.textContent = motif
    champ.value = ''
    champ.focus()
  })
}

/** Verrouille tout de suite, puis a chaque retour apres le delai de grace. */
export function installerVerrou() {
  // Appareil memorise : pas de code, mais le serveur est quand meme consulte des
  // que le reseau est la - c'est lui qui peut dire qu'un code a ete revoque.
  if (memorise()) revalider(currentCode())
  else verrouiller()
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      masqueDepuis = Date.now()
      return
    }
    if (masqueDepuis && Date.now() - masqueDepuis > GRACE_MS && !memorise()) verrouiller()
    masqueDepuis = null
  })
}
