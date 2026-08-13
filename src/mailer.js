// Envoi du rapport. Si le reseau manque (cave, sous-sol, hotel sans wifi),
// l'envoi est mis en file dans IndexedDB et repart tout seul des le retour du reseau.

import * as db from './db.js'
import { uid } from './state.js'

const ENDPOINT = '/api/send'

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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(job.payload),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
  return res.json().catch(() => ({}))
}

/**
 * @returns {Promise<boolean>} true si l'envoi a ete mis en file d'attente
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
    return true
  }
  try {
    await post(job)
    return false
  } catch (err) {
    console.warn('Envoi impossible, mise en file', err)
    await db.put('queue', job)
    return true
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
