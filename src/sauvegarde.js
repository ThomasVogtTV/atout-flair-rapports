// Sauvegarde en ligne automatique des rapports, photos comprises (voir
// api/sauvegarde.js).
//
// Des qu'il y a du reseau, chaque rapport modifie depuis son dernier depot
// repart - et lui seul. Chaque photo est designee par l'empreinte de son
// contenu : une photo deja deposee ne se renvoie pas, une photo annotee a
// nouveau part sous sa nouvelle empreinte et l'ancienne est effacee.
//
// Ce que le telephone sait de ses depots tient dans localStorage : s'il est
// vide, tout repart une fois, sans dommage.

import * as db from './db.js'
import * as S from './state.js'
// Le code d'acces, lu la ou mailer.js le range. Sans importer mailer.js : il
// touche a l'ecran des son chargement, et ce module doit pouvoir tourner sans
// ecran (tests).
const currentCode = () => localStorage.getItem('af-code') ?? ''

const ETAT_KEY = 'af-sauvegarde'
const DATE_KEY = 'af-sauvegarde-date'

function lireEtat() {
  try {
    const e = JSON.parse(localStorage.getItem(ETAT_KEY) ?? '{}')
    return e && typeof e === 'object' ? e : {}
  } catch {
    return {}
  }
}
const ecrireEtat = (e) => localStorage.setItem(ETAT_KEY, JSON.stringify(e))

export const derniereSauvegarde = () => Number(localStorage.getItem(DATE_KEY)) || 0
export const rapportsSauvegardes = () => Object.keys(lireEtat()).length

// Un rapport envoye ou remis change sans toujours toucher a sa date de
// modification : les trois dates comptent.
const version = (r) => Math.max(r.updatedAt || 0, r.sentAt || 0, r.remisAt || 0)

async function empreinte(texte) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texte))
  return [...new Uint8Array(h)]
    .slice(0, 12)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function appel(methode, { corps, query } = {}) {
  const url = `/api/sauvegarde${query ? `?${new URLSearchParams(query)}` : ''}`
  const res = await fetch(url, {
    method: methode,
    headers: { 'x-app-code': currentCode(), ...(corps ? { 'Content-Type': 'application/json' } : {}) },
    body: corps ? JSON.stringify(corps) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data.error || `Erreur ${res.status}`), { statut: res.status })
  return data
}

async function deposerRapport(id, etat) {
  const r = await db.get('reports', id)
  if (!r) return
  const deja = new Set(etat[id]?.fichiers ?? [])
  const fichiers = new Set()
  const photos = []
  for (const p of r.photos ?? []) {
    const hOriginal = p.original ? await empreinte(p.original) : null
    const hImage = p.dataUrl ? (p.dataUrl === p.original ? hOriginal : await empreinte(p.dataUrl)) : null
    for (const [h, image] of [
      [hOriginal, p.original],
      [hImage, p.dataUrl],
    ]) {
      if (!h || fichiers.has(h)) continue
      fichiers.add(h)
      if (!deja.has(h)) await appel('POST', { corps: { action: 'photo', rapportId: id, cle: h, dataUrl: image } })
    }
    const { original: _o, dataUrl: _d, ...reste } = p
    photos.push({ ...reste, hOriginal, hImage })
  }
  await appel('POST', {
    corps: { action: 'rapport', rapport: { ...r, photos }, obsoletes: [...deja].filter((h) => !fichiers.has(h)) },
  })
  etat[id] = { version: version(r), fichiers: [...fichiers] }
  ecrireEtat(etat)
}

async function passe() {
  // Ce qui a ete efface sur l'appareil s'efface en ligne aussi.
  const suppr = S.sauvegardesASupprimer()
  if (suppr.length) {
    await appel('POST', { corps: { action: 'supprimer', ids: suppr } })
    S.oublierSuppressionsSauvegarde(suppr)
    const etat = lireEtat()
    for (const id of suppr) delete etat[id]
    ecrireEtat(etat)
  }

  const etat = lireEtat()
  for (const r of await S.listReports()) {
    if ((etat[r.id]?.version ?? 0) >= version(r)) continue
    try {
      await deposerRapport(r.id, etat)
    } catch (err) {
      // Un rapport trop lourd pour un seul envoi ne doit pas bloquer les
      // autres, ni etre retente en boucle tant qu'il ne change pas.
      if (err.statut !== 413) throw err
      etat[r.id] = { ...(etat[r.id] ?? {}), version: version(r) }
      ecrireEtat(etat)
    }
  }
  localStorage.setItem(DATE_KEY, String(Date.now()))
  return true
}

let enCours = null

/**
 * Depose ce qui a change depuis le dernier passage.
 * @returns {Promise<true|string>} vrai, ou le motif de l'echec
 */
export function sauvegarder() {
  if (!navigator.onLine) return Promise.resolve('Pas de réseau pour le moment.')
  if (!currentCode()) return Promise.resolve('Aucun code d’accès sur cet appareil.')
  enCours ??= passe()
    .catch((err) => {
      console.error('Sauvegarde en ligne impossible', err)
      return err.message || 'Sauvegarde en ligne impossible.'
    })
    .finally(() => {
      enCours = null
    })
  return enCours
}

/** Les rapports sauvegardes en ligne qui manquent sur ce telephone. */
export async function listerSauvegardes() {
  const { sauvegardes } = await appel('GET', { query: { liste: '1' } })
  const presents = new Set(await db.keys('reports'))
  return (sauvegardes ?? []).filter((s) => !presents.has(s.id))
}

/**
 * Ramene des rapports sur ce telephone, photos comprises.
 * @returns {Promise<number>} nombre de rapports recuperes
 */
export async function restaurer(ids) {
  const etat = lireEtat()
  let n = 0
  for (const id of ids) {
    const { rapport } = await appel('GET', { query: { rapport: id } })
    const images = new Map()
    for (const p of rapport.photos ?? []) {
      for (const h of [p.hOriginal, p.hImage]) {
        if (h && !images.has(h)) images.set(h, (await appel('GET', { query: { photo: `${id}/${h}` } })).dataUrl)
      }
      p.original = images.get(p.hOriginal) ?? images.get(p.hImage) ?? null
      p.dataUrl = images.get(p.hImage) ?? p.original
      delete p.hOriginal
      delete p.hImage
    }
    await S.ecrireRapport(rapport)
    // Deja en ligne a l'identique : rien a redeposer.
    etat[id] = { version: version(rapport), fichiers: [...images.keys()] }
    ecrireEtat(etat)
    n++
  }
  // Les numeros recuperes comptent pour la suite de la numerotation.
  await S.repriseCompteur()
  return n
}
