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
// Boite mail de l'entreprise : info@atout-flair.ch. Il reste a fournir
// SMTP_HOST / SMTP_PORT / SMTP_PASS chez l'hebergeur du domaine.
//
// Tant que ces variables ne sont pas definies, l'API repond 503 et l'app bascule
// automatiquement sur la file d'attente / le partage manuel.

// Rappel : la plateforme plafonne le corps d'une requete a 4,5 Mo. Le client
// reduit les photos pour rester sous cette limite et bascule sur le partage
// manuel si un rapport reste trop lourd (voir PDF_MAX dans src/app.js).

const MAILBOX = 'info@atout-flair.ch'
const required = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS']

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Méthode non autorisée' })
  }

  const missing = required.filter((k) => !process.env[k])
  if (missing.length) {
    return res.status(503).json({ error: `Boîte mail non configurée (${missing.join(', ')})` })
  }

  const { to, cc, subject, body, filename, pdfBase64 } = req.body ?? {}
  if (!to || !pdfBase64) return res.status(400).json({ error: 'Destinataire ou PDF manquant' })

  try {
    const nodemailer = (await import('nodemailer')).default
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })

    const info = await transport.sendMail({
      from: process.env.MAIL_FROM || `Atout Flair <${MAILBOX}>`,
      to,
      cc: cc || undefined,
      bcc: process.env.MAIL_BCC || undefined,
      replyTo: process.env.MAIL_REPLY_TO || MAILBOX,
      subject: subject || 'Rapport de détection',
      text: body || '',
      attachments: [
        {
          filename: filename || 'rapport.pdf',
          content: Buffer.from(pdfBase64, 'base64'),
          contentType: 'application/pdf',
        },
      ],
    })

    return res.status(200).json({ ok: true, messageId: info.messageId })
  } catch (err) {
    console.error('Envoi impossible', err)
    return res.status(502).json({ error: String(err?.message ?? err) })
  }
}
