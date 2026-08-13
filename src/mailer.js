// Envoi du rapport. Si le reseau manque (cave, sous-sol, hotel sans wifi),
// l'envoi est mis en file dans IndexedDB et repart tout seul des le retour du reseau.

import * as db from './db.js'
import { uid } from './state.js'

const ENDPOINT = '/api/send'
const CODE_KEY = 'af-code'

// Code d'acces partage, conserve par appareil. Il empeche que l'adresse du site
// suffise a envoyer des mails depuis la boite de l'entreprise, et n'apparait pas
// dans le code envoye au navigateur.
// Il n'est demande que si le serveur le refuse : tant qu'aucune boite mail n'est
// branchee, personne ne voit passer cette question.
function storedCode() {
  return localStorage.getItem(CODE_KEY) ?? ''
}

function askCode() {
  const code = window.prompt("Code d'accès de l'application (une seule fois sur cet appareil)")?.trim()
  if (code) localStorage.setItem(CODE_KEY, code)
  return code ?? ''
}

export class BadCodeError extends Error {}
/** La boite mail n'est pas encore configuree cote serveur : inutile de reessayer. */
export class NotConfiguredError extends Error {}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

async function post(job, { code = storedCode(), retried = false } = {}) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-app-code': code },
    body: JSON.stringify(job.payload),
  })
  if (res.status === 503) throw new NotConfiguredError('Envoi automatique pas encore activé')
  if (res.status === 401) {
    localStorage.removeItem(CODE_KEY)
    // Premier refus : on demande le code, puis on retente une seule fois.
    if (!retried) {
      const asked = askCode()
      if (asked) return post(job, { code: asked, retried: true })
    }
    throw new BadCodeError("Code d'accès refusé")
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
  return res.json().catch(() => ({}))
}

/**
 * Le rapport n'est jamais perdu : un echec reseau le met en file d'attente.
 * Seule exception, la boite mail pas encore configuree : la mettre en file
 * ferait attendre un envoi qui ne partira jamais, on le dit franchement.
 * @returns {Promise<{queued: boolean, badCode: boolean, notConfigured: boolean}>}
 */
export async function sendReport(report, payload, blob) {
  const job = {
    id: uid(),
    reportId: report.id,
    createdAt: Date.now(),
    payload: { ...payload, pdfBase64: await blobToBase64(blob) },
  }
  if (!navigator.onLine) {
    await db.put('queue', job)
    return { queued: true, badCode: false, notConfigured: false }
  }
  try {
    await post(job)
    return { queued: false, badCode: false, notConfigured: false }
  } catch (err) {
    if (err instanceof NotConfiguredError) {
      return { queued: false, badCode: false, notConfigured: true }
    }
    console.warn('Envoi impossible, mise en file', err)
    await db.put('queue', job)
    return { queued: true, badCode: err instanceof BadCodeError, notConfigured: false }
  }
}

export async function pendingCount() {
  return (await db.all('queue')).length
}

/** Tente de vider la file. Retourne le nombre d'envois reussis. */
export async function flushQueue() {
  if (!navigator.onLine) return 0
  const jobs = await db.all('queue')
  let sent = 0
  for (const job of jobs) {
    try {
      await post(job) // NotConfiguredError / BadCodeError : on sort de la boucle plus bas
      await db.del('queue', job.id)
      const report = await db.get('reports', job.reportId)
      if (report) {
        report.status = 'sent'
        report.sentAt = Date.now()
        await db.put('reports', report)
      }
      sent++
    } catch (err) {
      console.warn('Toujours pas envoyable', err)
      break
    }
  }
  return sent
}
