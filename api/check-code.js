// Fonction serveur (Vercel) : dit si un code d'acces est le bon, sans rien
// envoyer. Sert au verrou de l'app, a la premiere ouverture sur un appareil :
// ensuite le code est retenu sur le telephone et la verification se fait hors
// ligne (voir src/lock.js).
//
// Meme regle que api/send.js : valeurs nettoyees, casse indifferente.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Méthode non autorisée' })
  }
  if (!process.env.APP_CODE) {
    return res.status(503).json({ error: "Code d'accès non configuré" })
  }
  const recu = String(req.headers['x-app-code'] ?? '').trim().toLowerCase()
  const attendu = String(process.env.APP_CODE).trim().toLowerCase()
  if (!recu || recu !== attendu) {
    // Une demi-seconde par essai rate : sans effet sur quelqu'un qui se trompe
    // une fois, mais un essai en boucle de noms et de dates devient tres lent.
    await new Promise((r) => setTimeout(r, 500))
    return res.status(401).json({ error: "Code d'accès invalide" })
  }
  return res.status(204).end()
}
