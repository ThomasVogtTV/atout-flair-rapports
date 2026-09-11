// Agenda de l'equipe, cote telephone : lire, ecrire, et passer un rendez-vous
// a l'agenda du telephone. L'agenda vit en ligne (voir api/agenda.js) ; la
// derniere version lue reste sur l'appareil, pour s'afficher sans reseau.
// Ajouter ou modifier un rendez-vous demande du reseau : c'est l'agenda de
// toute l'equipe, il n'a qu'une seule version.

import { currentCode } from './mailer.js'
import { fichierIcs, lienGoogleAgenda } from './agenda-outils.js'

const CACHE_KEY = 'af-agenda'

/** La derniere version de l'agenda lue sur ce telephone, ou null. */
export function agendaEnCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null')
  } catch {
    return null
  }
}

function retenir(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data))
  } catch {
    // Pas de place : l'agenda s'affichera seulement avec du reseau.
  }
}

async function appel(methode, corps) {
  const res = await fetch('/api/agenda', {
    method: methode,
    headers: { 'x-app-code': currentCode(), ...(corps ? { 'Content-Type': 'application/json' } : {}) },
    body: corps ? JSON.stringify(corps) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`)
  return data
}

const SANS_RESEAU = "Pas de réseau : l'agenda de l'équipe se modifie avec du réseau."

/** L'agenda a jour si le reseau le permet, sinon la derniere version gardee. */
export async function chargerAgenda() {
  if (!navigator.onLine || !currentCode()) return agendaEnCache()
  try {
    const data = await appel('GET')
    retenir(data)
    return data
  } catch {
    return agendaEnCache()
  }
}

export async function enregistrerRdv(rdv) {
  if (!navigator.onLine) throw new Error(SANS_RESEAU)
  const { rdv: enregistre } = await appel('POST', { action: 'enregistrer', rdv })
  return enregistre
}

export async function supprimerRdv(id) {
  if (!navigator.onLine) throw new Error(SANS_RESEAU)
  await appel('POST', { action: 'supprimer', id })
}

/** Le rapport du rendez-vous est lance. Sans reseau, tant pis : ce n'est qu'un repere. */
export async function marquerCommence(id, rapportId) {
  if (!navigator.onLine) return
  try {
    await appel('POST', { action: 'commencer', id, rapportId })
  } catch {
    // Le rapport existe de toute facon ; seul le repere dans l'agenda manque.
  }
}

const surIphone = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

/**
 * Passe le rendez-vous a l'agenda du telephone, qui se chargera du rappel :
 * un fichier .ics sur iPhone (le Calendrier propose de l'ajouter), Google
 * Agenda ailleurs.
 */
export function ajouterAuCalendrier(rdv) {
  if (!surIphone()) {
    window.open(lienGoogleAgenda(rdv), '_blank', 'noopener')
    return
  }
  const url = URL.createObjectURL(new Blob([fichierIcs(rdv)], { type: 'text/calendar;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'rendez-vous-atout-flair.ics'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}
