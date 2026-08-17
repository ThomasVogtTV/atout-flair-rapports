import './style.css'
import { boot } from './app.js'

boot()

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  // Vrai si cette page a demarre sous un service worker deja en place : un
  // changement de controleur signifie alors qu'une nouvelle version vient de
  // prendre la main (a la premiere installation, il n'y a rien a remplacer).
  const avaitUnControleur = !!navigator.serviceWorker.controller
  let recharge = false

  // Une app installee sur le telephone n'est presque jamais fermee : reprise
  // depuis l'arriere-plan, elle continue de faire tourner le code du jour ou
  // elle a ete ouverte, parfois des semaines plus tot. On recharge donc de
  // nous-memes quand une mise a jour prend la main - mais depuis l'accueil
  // seulement, jamais au milieu d'un rapport en cours de saisie.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (recharge || !avaitUnControleur) return
    if (document.body.dataset.screen !== 'home') return
    recharge = true
    location.reload()
  })

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('SW non enregistré', err))
  })
}
