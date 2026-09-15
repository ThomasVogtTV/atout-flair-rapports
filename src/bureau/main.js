// Bureau : le planning de toute l'equipe et l'administration, pour l'ordinateur
// du bureau - et le telephone au besoin. Meme serveur, memes codes et memes
// donnees que Terrain, l'app des rapports (voir src/bureau/app.js).

import '@fontsource-variable/fraunces/wght.css'
import '@fontsource-variable/onest/wght.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'
import '../styles/index.css'
import '../styles/bureau.css'
import { installerIncidents } from '../incidents.js'
import { currentCode } from '../mailer.js'
import { demarrer } from './app.js'

installerIncidents('bureau', { code: currentCode })
demarrer()

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  // Le meme service worker que Terrain : il sert les deux applis.
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('SW non enregistré', err))
  })
}
