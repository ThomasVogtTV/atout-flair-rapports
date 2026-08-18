import './style.css'
import { boot } from './app.js'

boot()

// La base locale est la seule copie des rapports en cours, du carnet de mandants
// et de la signature du technicien. Par defaut un navigateur la classe
// "best-effort" : il peut la vider sans prevenir quand le telephone manque de
// place. On demande donc qu'elle soit conservee. La demande ne montre aucune
// fenetre a l'utilisateur - elle est accordee d'office a une app installee sur
// l'ecran d'accueil, et refusee sans bruit sinon.
if (navigator.storage?.persist) {
  navigator.storage
    .persisted()
    .then((deja) => (deja ? true : navigator.storage.persist()))
    .then((ok) => {
      if (!ok) console.warn("Stockage local non protege : le navigateur peut le vider s'il manque de place.")
    })
    .catch(() => {})
}

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
