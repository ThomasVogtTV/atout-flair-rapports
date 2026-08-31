// Envoi du rapport, et suivi de ce qu'il devient.
//
// Un envoi peut echouer pour trois raisons tres differentes, qu'il ne faut
// surtout pas confondre :
//
//   - pas de reseau        : la cave, le sous-sol, l'hotel sans wifi. Le
//                            rapport part tout seul des le retour du reseau.
//   - le serveur refuse    : Infomaniak dit non (mot de passe, expediteur,
//                            quota, destinataire invalide). Reessayer a
//                            l'identique ne changera rien tant qu'on n'a pas
//                            corrige quelque chose - et il faut donc montrer
//                            son explication, pas la cacher.
//   - la boite pas branchee: aucune configuration cote serveur.
//
// L'ancienne version les traitait tous comme "pas de reseau" : un rapport
// refuse par Infomaniak etait annonce "en attente, il partira automatiquement",
// et le motif finissait dans la console. C'est ainsi qu'un envoi pouvait
// disparaitre sans que personne ne s'en apercoive.

import * as db from './db.js'
import { uid } from './state.js'
import { askAppCode } from './ui/dialogs.js'
import { hideLoading } from './ui/dom.js'

const ENDPOINT = '/api/send'
const CODE_KEY = 'af-code'

// Code d'acces partage, conserve par appareil. Il empeche que l'adresse du site
// suffise a envoyer des mails depuis la boite de l'entreprise, et n'apparait pas
// dans le code envoye au navigateur.
function storedCode() {
  return localStorage.getItem(CODE_KEY) ?? ''
}

const forgetCode = () => localStorage.removeItem(CODE_KEY)
export const currentCode = () => storedCode()
export const setCode = (v) => {
  const c = (v ?? '').trim()
  if (c) localStorage.setItem(CODE_KEY, c)
  else localStorage.removeItem(CODE_KEY)
}

class BadCodeError extends Error {}
/** La boite mail n'est pas encore configuree cote serveur : inutile de reessayer. */
class NotConfiguredError extends Error {}
/** Le serveur de mail a refuse. Le message porte l'explication d'Infomaniak. */
class ServerRefusedError extends Error {}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

// Les messages bruts d'un serveur SMTP sont illisibles ("535 5.7.8 Error:
// authentication failed"). On les traduit quand on les reconnait, en gardant
// l'original dessous pour le jour ou il faudra le montrer a l'hebergeur.
function expliquer(brut) {
  const m = String(brut ?? '')
  const bas = m.toLowerCase()
  if (/invalid login|authentication failed|535|auth/.test(bas))
    return "Mot de passe refusé par Infomaniak. Vérifiez SMTP_PASS, ou créez un mot de passe d'application si la double authentification est active."
  if (/from|sender|not allowed|550 5\.7/.test(bas))
    return "Infomaniak refuse cette adresse d'expéditeur. MAIL_FROM doit rester info@atout-flair.ch."
  if (/no recipients|recipient|550 5\.1|user unknown/.test(bas))
    return "Adresse du destinataire refusée : elle n'existe pas ou comporte une faute."
  if (/quota|too many|rate/.test(bas)) return 'Quota Infomaniak atteint. Réessayez plus tard.'
  if (/timeout|etimedout|econnrefused|enotfound/.test(bas))
    return "Le serveur de mail n'a pas répondu. Ce peut être temporaire."
  if (/413|payload|too large/.test(bas)) return 'Rapport trop lourd pour être envoyé automatiquement.'
  return m || 'Refus du serveur de mail, sans explication.'
}

// `demander` : autorise l'ouverture du dialogue du code. Vrai quand c'est
// l'utilisateur qui vient d'appuyer sur Envoyer ou Reessayer, faux pour la
// vidange automatique de la file - sinon le simple fait d'ouvrir l'app, ou de
// retrouver du reseau en pleine saisie, faisait surgir une question de nulle
// part par-dessus l'ecran en cours.
async function post(job, { code = storedCode(), retried = false, demander = true } = {}) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-app-code': code },
    body: JSON.stringify(job.payload),
  })
  if (res.status === 503) throw new NotConfiguredError('Envoi automatique pas encore activé')
  if (res.status === 401) {
    forgetCode()
    // Premier refus : on demande le code dans un vrai dialogue, qui explique de
    // quoi il s'agit, puis on retente une seule fois.
    if (demander && !retried) {
      // Le voile "Envoi en cours..." s'efface : on ne pose pas une question
      // par-dessus un ecran qui dit que le travail est en cours.
      hideLoading()
      const asked = await askAppCode({ refuse: !!code })
      if (asked) {
        localStorage.setItem(CODE_KEY, asked)
        return post(job, { code: asked, retried: true })
      }
    }
    throw new BadCodeError(
      demander
        ? "Code d'accès refusé. Vérifiez les majuscules, ou demandez-le à Thomas."
        : "Code d'envoi refusé. Corrigez-le dans « Carnet et réglages », puis réessayez ici."
    )
  }
  if (!res.ok) {
    const texte = await res.text().catch(() => '')
    let motif = texte
    try {
      motif = JSON.parse(texte).error ?? texte
    } catch {
      /* reponse non JSON : on garde le texte brut */
    }
    throw new ServerRefusedError(expliquer(motif))
  }
  return res.json().catch(() => ({}))
}

/**
 * Envoie un rapport, ou le met en file s'il ne peut pas partir maintenant.
 *
 * @returns {Promise<{etat: 'envoye'|'attente'|'echec'|'non-configure', motif?: string}>}
 *   attente        - le reseau manque, ca repartira tout seul
 *   echec          - le serveur a refuse ; motif porte l'explication
 *   non-configure  - aucune boite branchee, rien ne partira jamais
 */
export async function sendReport(report, payload, blob) {
  const job = {
    id: uid(),
    reportId: report.id,
    reportRef: report.ref,
    destinataire: payload.to,
    createdAt: Date.now(),
    essais: 0,
    dernierEssai: null,
    motif: null,
    payload: { ...payload, pdfBase64: await blobToBase64(blob) },
  }

  if (!navigator.onLine) {
    job.etat = 'attente'
    job.motif = 'Hors ligne au moment de l’envoi.'
    await db.put('queue', job)
    return { etat: 'attente' }
  }

  try {
    await post(job)
    return { etat: 'envoye' }
  } catch (err) {
    if (err instanceof NotConfiguredError) return { etat: 'non-configure' }

    job.essais = 1
    job.dernierEssai = Date.now()
    job.motif = err.message

    // Un refus du serveur n'est pas une panne de reseau : le dire franchement,
    // et garder l'envoi de cote pour qu'il puisse etre repris a la main.
    const bloquant = err instanceof ServerRefusedError || err instanceof BadCodeError
    job.etat = bloquant ? 'echec' : 'attente'
    await db.put('queue', job)
    return { etat: job.etat, motif: err.message }
  }
}

// --- la file ---------------------------------------------------------------

export const listQueue = async () =>
  (await db.all('queue')).sort((a, b) => b.createdAt - a.createdAt)

export const pendingCount = async () =>
  (await db.all('queue')).filter((j) => j.etat !== 'echec').length

export const failedCount = async () =>
  (await db.all('queue')).filter((j) => j.etat === 'echec').length

export const deleteJob = (id) => db.del('queue', id)

/** Marque le rapport correspondant comme envoye, et retire l'envoi de la file. */
async function marquerEnvoye(job) {
  await db.del('queue', job.id)
  const report = await db.get('reports', job.reportId)
  if (report) {
    report.status = 'sent'
    report.sentAt = Date.now()
    await db.put('reports', report)
  }
}

/**
 * Retente un envoi precis, a la demande. Contrairement a la vidange complete,
 * on retente meme un envoi en echec : c'est tout l'interet du bouton, apres
 * avoir corrige un mot de passe ou une adresse.
 * @returns {Promise<{ok: boolean, motif?: string}>}
 */
export async function retryJob(id) {
  const job = await db.get('queue', id)
  if (!job) return { ok: false, motif: 'Envoi introuvable.' }
  if (!navigator.onLine) return { ok: false, motif: 'Pas de réseau pour l’instant.' }
  try {
    await post(job)
    await marquerEnvoye(job)
    return { ok: true }
  } catch (err) {
    job.essais = (job.essais ?? 0) + 1
    job.dernierEssai = Date.now()
    job.motif = err instanceof NotConfiguredError ? 'Boîte mail non configurée côté serveur.' : err.message
    job.etat = err instanceof ServerRefusedError || err instanceof BadCodeError || err instanceof NotConfiguredError ? 'echec' : 'attente'
    await db.put('queue', job)
    return { ok: false, motif: job.motif }
  }
}

/**
 * Vide la file automatiquement (retour du reseau, demarrage). Ne touche pas aux
 * envois deja en echec : ils attendent une correction, les repasser en boucle
 * ne ferait que multiplier les refus chez l'hebergeur.
 * @returns {Promise<{envoyes: number, echecs: number}>}
 */
export async function flushQueue() {
  if (!navigator.onLine) return { envoyes: 0, echecs: 0 }
  const jobs = (await db.all('queue')).filter((j) => j.etat !== 'echec')
  let envoyes = 0
  let echecs = 0
  for (const job of jobs) {
    try {
      // Sans dialogue : la vidange se declenche toute seule (demarrage, retour
      // du reseau). Un code manquant fait passer l'envoi en "a corriger", et
      // l'ecran Envois le dit - c'est la que l'utilisateur le reprendra.
      await post(job, { demander: false })
      await marquerEnvoye(job)
      envoyes++
    } catch (err) {
      job.essais = (job.essais ?? 0) + 1
      job.dernierEssai = Date.now()
      job.motif = err instanceof NotConfiguredError ? 'Boîte mail non configurée côté serveur.' : err.message
      const bloquant =
        err instanceof ServerRefusedError || err instanceof BadCodeError || err instanceof NotConfiguredError
      job.etat = bloquant ? 'echec' : 'attente'
      await db.put('queue', job)
      if (bloquant) echecs++
      // Un refus du serveur vaudra pour tous les envois suivants : inutile de
      // les enchainer. Une panne de reseau, elle, arrete aussi la boucle.
      break
    }
  }
  return { envoyes, echecs }
}
