// Les incidents techniques : ce qui a casse chez quelqu'un, sans qu'il ait a le
// raconter. Terrain et le Bureau envoient leurs erreurs inattendues (voir
// src/incidents.js), les fonctions du serveur y ajoutent les leurs.
// L'administrateur les lit dans le Bureau, et son accueil de Terrain l'en
// previent.
//
// Une meme erreur ne fait qu'une ligne : sa signature (l'appli, le message, le
// haut de la pile) regroupe les repetitions, qui ne font que monter son compte.
// Au-dela de INCIDENTS_MAX erreurs differentes, les plus anciennes s'effacent.

import { createHash } from 'node:crypto'
import { baseConfiguree, commandeBase as r, empreinteAdresse } from './equipe.js'

const INCIDENTS = 'af:incidents'
export const INCIDENTS_MAX = 200

// Par adresse de reseau : de quoi laisser passer une vraie rafale d'erreurs,
// pas de quoi remplir la base.
export const SIGNALEMENTS_MAX = 30
const SIGNALEMENTS_FENETRE = 10 * 60

const APPS = new Set(['terrain', 'bureau', 'serveur'])
const court = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n)
const lireJson = (s) => {
  try {
    return s ? JSON.parse(s) : null
  } catch {
    return null
  }
}

export class TropDeSignalements extends Error {}

/** Ce qu'un appareil envoie, ramene a du texte court. Null s'il n'y a rien a garder. */
export function nettoyer(brut) {
  const message = court(brut?.message, 300)
  if (!message) return null
  return {
    app: APPS.has(brut.app) ? brut.app : 'terrain',
    message,
    source: court(brut.source, 200),
    pile: String(brut.pile ?? '').slice(0, 2000),
    version: court(brut.version, 80),
    ecran: court(brut.ecran, 40),
    appareil: court(brut.appareil, 160),
  }
}

/**
 * La signature d'une erreur. Sans les numeros de ligne ni les noms des fichiers
 * compiles, qui changent a chaque mise en ligne : la meme erreur garde sa ligne
 * d'une version a l'autre.
 */
export function signature(i) {
  const haut = i.pile
    .split('\n')
    .slice(0, 3)
    .join('\n')
    .replace(/-[\w]{8}\.js/g, '.js')
    .replace(/:\d+(:\d+)?/g, '')
  return createHash('sha256').update(`${i.app}|${i.message}|${haut}`).digest('hex').slice(0, 16)
}

/** Tous les incidents, le plus recent d'abord. */
export async function lireIncidents() {
  const plat = (await r('HGETALL', INCIDENTS)) ?? []
  const liste = []
  for (let k = 1; k < plat.length; k += 2) {
    const x = lireJson(plat[k])
    if (x) liste.push(x)
  }
  return liste.sort((a, b) => b.derniere - a.derniere)
}

/** Ce qu'il faut pour une alerte : quand, et combien de fois. */
export const incidentsLegers = (liste) => liste.map(({ sig, derniere, nombre }) => ({ sig, derniere, nombre }))

/**
 * Consigne un incident. `qui` : le nom de la personne, quand l'appareil a pu la
 * dire.
 * @returns {Promise<string|null>} sa signature, ou null si rien n'a ete garde
 */
export async function noterIncident(brut, { qui = null, maintenant = Date.now() } = {}) {
  if (!baseConfiguree()) return null
  const i = nettoyer(brut)
  if (!i) return null
  const sig = signature(i)
  const avant = lireJson(await r('HGET', INCIDENTS, sig))
  const noms = (avant?.qui ?? []).filter((n) => n !== qui)
  if (qui) noms.push(court(qui, 60))
  const ligne = {
    ...i,
    sig,
    premiere: avant?.premiere ?? maintenant,
    derniere: maintenant,
    nombre: (avant?.nombre ?? 0) + 1,
    qui: noms.slice(-5),
  }
  await r('HSET', INCIDENTS, sig, JSON.stringify(ligne))
  if (!avant) await elaguer()
  return sig
}

async function elaguer() {
  const tous = await lireIncidents()
  if (tous.length <= INCIDENTS_MAX) return
  await r('HDEL', INCIDENTS, ...tous.slice(INCIDENTS_MAX).map((x) => x.sig))
}

/** L'incident est traite : il s'efface. S'il revient, il repart de un. */
export const reglerIncident = (sig) => r('HDEL', INCIDENTS, sig)
export const reglerTousIncidents = () => r('DEL', INCIDENTS)

/**
 * Le frein des signalements, par adresse de reseau. Un compteur injoignable ne
 * freine personne.
 * @throws {TropDeSignalements}
 */
export async function freinerSignalements(req) {
  const cle = `af:signalements:${empreinteAdresse(req)}`
  if (Number(await r('GET', cle).catch(() => 0)) >= SIGNALEMENTS_MAX) throw new TropDeSignalements()
  try {
    await r('SET', cle, '0', 'NX', 'EX', SIGNALEMENTS_FENETRE)
    await r('INCR', cle)
  } catch {
    // Compteur indisponible : le signalement passe quand meme.
  }
}

/**
 * Une erreur d'une fonction du serveur, consignee comme celles des appareils -
 * sans jamais faire echouer la reponse qu'on etait en train de rendre.
 */
export async function signalerServeur(ou, err) {
  try {
    await noterIncident({ app: 'serveur', message: `${ou} : ${err?.message ?? err}`, source: `api/${ou}`, pile: err?.stack ?? '' })
  } catch {
    // La base elle-meme ne repond pas : il ne reste que la console de Vercel.
  }
}
