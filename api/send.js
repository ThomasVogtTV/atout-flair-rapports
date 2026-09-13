// Fonction serveur (Vercel) : envoie le rapport PDF par mail.
//
// Variables d'environnement a definir dans Vercel avant la mise en service :
//   SMTP_HOST      ex. mail.infomaniak.com
//   SMTP_PORT      587 (STARTTLS) ou 465 (SSL)
//   SMTP_USER      adresse d'envoi complete
//   SMTP_PASS      mot de passe de la boite
//   MAIL_FROM      defaut : "Atout Flair <info@atout-flair.ch>"
//   MAIL_REPLY_TO  defaut : info@atout-flair.ch
//   MAIL_BCC       (optionnel) copie systematique pour l'archivage
//
// Tant que ces variables ne sont pas definies, l'API repond 503 et l'app bascule
// automatiquement sur la file d'attente / le partage manuel.
//
// Un invite ne parle pas directement au client : son rapport attend la
// validation de l'administrateur (rubrique "A valider" de l'onglet
// Administration), et l'adresse lui dit ou en sont ses demandes (GET).
//
// POST {to, cc, subject, body, filename, pdfBase64, meta}  envoie, ou transmet pour validation
// GET                                                       les demandes de l'invite

// Rappel : la plateforme plafonne le corps d'une requete a 4,5 Mo. Le client
// reduit les photos pour rester sous cette limite et bascule sur le partage
// manuel si un rapport reste trop lourd (voir PDF_MAX dans src/send.js).

import { identifier, baseConfiguree, lireValidation, lireValidations, ecrireValidation, nouvelId } from './_lib/equipe.js'
import { boiteIndisponible, envoyerMail, demandeDEnvoi, consigner, cheminPdfValidation } from './_lib/mail.js'
import { stockageConfigure, ecrireFichier } from './_lib/stockage.js'

const ID_OK = /^[\w-]{1,64}$/

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Méthode non autorisée' })
  }

  // Comparaison sur les valeurs nettoyees des deux cotes. Un en-tete HTTP ne peut
  // pas porter de retour a la ligne, mais la variable d'environnement, si : ajoutee
  // en ligne de commande avec `echo`, APP_CODE garde un retour a la ligne final, et
  // plus aucun appareil ne peut alors correspondre. L'envoi est refuse pour tout le
  // monde, definitivement, et l'app ne sait dire que "code refuse". Meme chose pour
  // l'espace que le clavier du telephone ajoute apres un mot.
  //
  // Et sans tenir compte de la casse : le champ du telephone coupe la majuscule
  // automatique (sinon le clavier en mettait une a chaque debut de mot), si bien
  // que "StessyOberly" demandait deux appuis sur Maj et arrivait presque toujours
  // en minuscules - refuse. Pour un code partage qui barre l'acces a la boite
  // mail, et non un mot de passe, la casse ne protegeait rien et bloquait tout.
  // La comparaison elle-meme vit dans _lib/equipe.js : code administrateur
  // (APP_CODE), ou code d'un employe actif. Le code dit aussi QUI envoie, ce que
  // le journal de l'onglet Administration retient - et si c'est un invite.
  let ident = null
  try {
    ident = await identifier(req.headers['x-app-code'])
  } catch (err) {
    // Base injoignable : ce n'est pas un mauvais code. Un 401 ferait oublier son
    // code au telephone et redemander une saisie pour rien.
    console.error('Identification impossible', err)
    return res.status(503).json({ error: 'Vérification du code impossible pour le moment' })
  }
  if (!ident) {
    return res.status(401).json({ error: "Code d'accès invalide" })
  }

  if (req.method === 'GET') return suivre(ident, res)

  const { to, cc, subject, body, filename, pdfBase64 } = req.body ?? {}

  if (ident.role === 'invite') {
    if (!to || !pdfBase64) return res.status(400).json({ error: 'Destinataire ou PDF manquant' })
    return transmettre(ident, req.body, res)
  }

  const indisponible = boiteIndisponible()
  if (indisponible) return res.status(503).json({ error: indisponible })
  if (!to || !pdfBase64) return res.status(400).json({ error: 'Destinataire ou PDF manquant' })

  const demande = demandeDEnvoi(req.body)
  try {
    const info = await envoyerMail({ to, cc, subject, body, filename, pdf: Buffer.from(pdfBase64, 'base64') })
    await consigner(ident, demande, 'envoye')
    return res.status(200).json({ ok: true, messageId: info.messageId })
  } catch (err) {
    console.error('Envoi impossible', err)
    await consigner(ident, demande, 'echec', { erreur: String(err?.message ?? err) })
    return res.status(502).json({ error: String(err?.message ?? err) })
  }
}

/**
 * Le rapport d'un invite : rien ne part chez le client. La demande et son PDF
 * attendent l'administrateur, qui les relit, puis les envoie ou les refuse.
 */
async function transmettre(ident, corps, res) {
  if (!baseConfiguree() || !stockageConfigure()) {
    return res.status(503).json({ error: 'Validation des rapports non configurée' })
  }
  const demande = demandeDEnvoi(corps)
  // L'identifiant vient du telephone (celui de l'envoi dans sa file) : une
  // demande rejouee apres une reponse perdue en route ne s'empile pas en double.
  const envoiId = corps?.meta?.envoiId
  const id = ID_OK.test(envoiId ?? '') ? envoiId : nouvelId()
  if (await lireValidation(id)) return res.status(202).json({ ok: true, validation: true, id })

  await ecrireFichier(cheminPdfValidation(id), Buffer.from(String(corps.pdfBase64), 'base64'), 'application/pdf')
  await ecrireValidation({ id, statut: 'attente', date: Date.now(), par: { id: ident.id, nom: ident.nom }, ...demande })
  await consigner(ident, demande, 'a-valider')
  return res.status(202).json({ ok: true, validation: true, id })
}

/** Ou en sont les demandes d'un invite : en attente, envoyees, ou refusees et pourquoi. */
async function suivre(ident, res) {
  if (ident.role !== 'invite' || !baseConfiguree()) return res.status(200).json({ validations: [] })
  const miennes = (await lireValidations())
    .filter((v) => v.par?.id === ident.id)
    .map((v) => ({ id: v.id, statut: v.statut, motif: v.motif ?? '', date: v.date, traite: v.traite ?? null, rapportId: v.meta?.rapportId ?? '' }))
  return res.status(200).json({ validations: miennes })
}
