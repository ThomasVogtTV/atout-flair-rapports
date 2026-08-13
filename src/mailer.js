// Envoi du rapport. Si le reseau manque (cave, sous-sol, hotel sans wifi),
// l'envoi est mis en file dans IndexedDB et repart tout seul des le retour du reseau.

import * as db from './db.js'
import { uid } from './state.js'

const ENDPOINT = '/api/send'
const CODE_KEY = 'af-code'

// Code d'acces partage : demande une seule fois par appareil, puis conserve.
// Il empeche que l'adresse du site suffise a envoyer des mails depuis la boite
// de l'entreprise. Il n'est pas dans le code source de l'app, seulement ici.
function accessCode() {
  let code = localStorage.getItem(CODE_KEY)
  if (!code) {
    code = window.prompt("Code d'accès de l'application (une seule fois sur cet appareil)")?.trim()
    if (code) localStorage.setItem(CODE_KEY, code)
  }
  return code ?? ''
}

export class BadCodeError extends Error {}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

async function post(job) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-app-code': accessCode() },
    body: JSON.stringify(job.payload),
  })
  if (res.status === 401) {
    // Code faux ou perimé : on l'oublie pour que le prochain envoi le redemande.
    localStorage.removeItem(CODE_KEY)
    throw new BadCodeError("Code d'accès refusé")
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
  return res.json().catch(() => ({}))
}

/**
 * Le rapport n'est jamais perdu : tout echec le met en file d'attente.
 * @returns {Promise<{queued: boolean, badCode: boolean}>}
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
    return { queued: true, badCode: false }
  }
  try {
    await post(job)
    return { queued: false, badCode: false }
  } catch (err) {
    console.warn('Envoi impossible, mise en file', err)
    await db.put('queue', job)
    return { queued: true, badCode: err instanceof BadCodeError }
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
      await post(job)
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
