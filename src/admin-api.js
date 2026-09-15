// L'adresse /api/admin vue du navigateur : l'equipe, les rapports d'invites a
// valider, le journal et son export. Le Bureau s'en sert pour tout ; Terrain
// n'en lit que les alertes de l'administrateur.

import { currentCode } from './mailer.js'

export async function adminAppel(methode, corps, query) {
  const res = await fetch(`/api/admin${query ? `?${new URLSearchParams(query)}` : ''}`, {
    method: methode,
    headers: { 'x-app-code': currentCode(), ...(corps ? { 'Content-Type': 'application/json' } : {}) },
    body: corps ? JSON.stringify(corps) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data.error || `Erreur ${res.status}`), { base: data.base })
  return data
}

/** Une date de fin choisie au calendrier vaut jusqu'au soir de ce jour-la. */
export const finDeJournee = (jour) => {
  const [a, m, j] = jour.split('-').map(Number)
  return new Date(a, m - 1, j, 23, 59, 59, 999).getTime()
}
