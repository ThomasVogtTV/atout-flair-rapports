// L'envoi du mail, commun a l'envoi direct (api/send.js) et au rapport d'un
// invite que l'administrateur valide (api/admin.js). Le journal aussi : les
// deux chemins y ecrivent la meme ligne.
//
// Le dossier commence par "_" : Vercel n'en fait pas une adresse publique.

import { journaliser, noterActivite } from './equipe.js'

export const MAILBOX = 'info@atout-flair.ch'
// APP_CODE est obligatoire : sans lui, l'URL du site suffirait a n'importe qui
// pour envoyer des mails depuis la boite de l'entreprise.
const REQUIS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'APP_CODE']

/**
 * Pourquoi la boite ne peut pas envoyer, ou null si elle le peut.
 *
 * MAIL_OFF est un interrupteur volontaire. Tant que le mot de passe de la boite
 * n'est pas retrouve, chaque envoi finirait sur un refus 535 d'Infomaniak : un
 * rapport en echec, un motif obscur, et le technicien qui recommence pour rien.
 * Coupe franchement, l'app dit la verite et passe le PDF a la messagerie du
 * telephone. Retirer MAIL_OFF dans Vercel remet l'envoi en service.
 */
export function boiteIndisponible() {
  if (process.env.MAIL_OFF === '1') return 'Envoi automatique désactivé'
  const manque = REQUIS.filter((k) => !process.env[k])
  return manque.length ? `Boîte mail non configurée (${manque.join(', ')})` : null
}

let transporter = async (message) => {
  const nodemailer = (await import('nodemailer')).default
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  })
  return transport.sendMail(message)
}
/** Remplace le serveur de mail par une imitation. Tests uniquement. */
export const _brancherMail = (fn) => {
  transporter = fn
}

/** @param {{to, cc, subject, body, filename, pdf: Buffer}} m */
export function envoyerMail({ to, cc, subject, body, filename, pdf }) {
  return transporter({
    from: process.env.MAIL_FROM || `Atout Flair <${MAILBOX}>`,
    to,
    cc: cc || undefined,
    bcc: process.env.MAIL_BCC || undefined,
    replyTo: process.env.MAIL_REPLY_TO || MAILBOX,
    subject: subject || 'Rapport de détection',
    text: body || '',
    attachments: [{ filename: filename || 'rapport.pdf', content: pdf, contentType: 'application/pdf' }],
  })
}

// Le PDF d'un rapport d'invite, le temps que l'administrateur le relise.
export const cheminPdfValidation = (id) => `validations/${id}.pdf`

const court = (v, n = 200) => String(v ?? '').slice(0, n)

/** Ce qu'on retient d'une demande d'envoi : de quoi la rejouer, et la journaliser. */
export function demandeDEnvoi(corps) {
  const m = corps?.meta ?? {}
  return {
    to: court(corps?.to, 300),
    cc: court(corps?.cc, 300),
    subject: court(corps?.subject, 300),
    body: court(corps?.body, 20000),
    filename: court(corps?.filename, 160),
    meta: { ref: court(m.ref, 40), type: court(m.type, 20), adresse: court(m.adresse), rapportId: court(m.rapportId, 64) },
  }
}

/**
 * Ligne du journal de l'onglet Administration. Un journal en panne ne doit
 * jamais faire echouer un envoi reussi : l'erreur est notee, le rapport part
 * quand meme.
 *
 * `validePar` : le rapport d'un invite, parti une fois relu. Il compte dans ses
 * envois, mais ne dit pas qu'il a ouvert l'app a cet instant.
 */
export async function consigner(ident, demande, statut, { erreur, validePar } = {}) {
  try {
    await journaliser({
      qui: ident.nom,
      role: ident.role,
      statut,
      ref: demande.meta?.ref ?? '',
      type: demande.meta?.type ?? '',
      adresse: demande.meta?.adresse ?? '',
      destinataire: demande.to,
      cc: demande.cc,
      fichier: demande.filename,
      ...(validePar ? { validePar } : {}),
      ...(erreur ? { erreur: court(erreur, 300) } : {}),
    })
    if (statut === 'envoye' && (ident.role === 'admin' || ident.id)) {
      await noterActivite(ident, { envoi: true, vu: !validePar })
    }
  } catch (e) {
    console.error('Journal non ecrit', e)
  }
}
