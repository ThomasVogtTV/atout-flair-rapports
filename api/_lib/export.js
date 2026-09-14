// Export de facturation : les envois d'un mois, tels que la comptabilite les
// relit dans un tableur.
//
// Aucune entree/sortie ici : la regle se teste sans base. Les lignes viennent du
// journal (voir api/_lib/equipe.js) - celles rangees par mois, et celles du
// journal courant pour les envois d'avant ce rangement ; les memes lignes lues
// deux fois ne comptent qu'une fois.

import { jourSuisse } from './agenda.js'

const TYPES = { detection: 'Détection', immeuble: 'Immeuble', hotel: 'Hôtel' }

const ZONE = 'Europe/Zurich'
const dateSuisse = (ms) => new Date(ms).toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: ZONE })
const heureSuisse = (ms) => new Date(ms).toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit', timeZone: ZONE })

/**
 * Les envois partis dans le mois (AAAA-MM, a l'heure de Lausanne), du plus
 * ancien au plus recent, sans doublon. Un rapport parti une seconde fois dans le
 * mois est marque "renvoi" : il ne se facture pas deux fois.
 */
export function envoisDuMois(lignes, mois) {
  const vus = new Set()
  const envois = []
  for (const j of lignes ?? []) {
    const date = Number(j?.date)
    if (j?.statut !== 'envoye' || !date || jourSuisse(date).slice(0, 7) !== mois) continue
    const cle = `${date}|${j.ref}|${j.qui}|${j.destinataire}`
    if (vus.has(cle)) continue
    vus.add(cle)
    envois.push(j)
  }
  envois.sort((a, b) => a.date - b.date)
  const refs = new Set()
  return envois.map((j) => {
    const renvoi = !!j.ref && refs.has(j.ref)
    if (j.ref) refs.add(j.ref)
    return { ...j, renvoi }
  })
}

// Un tableur francais lit les points-virgules, et reconnait les accents grace a
// la marque UTF-8 en tete du fichier.
const BOM = '﻿'

// Une cellule qui commence par = + - @ serait prise pour une formule : un nom de
// client tape sur un telephone ne doit rien pouvoir executer dans le tableur.
function cellule(v) {
  let s = String(v ?? '')
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export const COLONNES = ['Date', 'Heure', 'Référence', 'Type', 'Client', 'Adresse', 'Destinataire', 'Technicien', 'Envoi', 'Relu par']

/** Le fichier CSV de l'export, pret a ouvrir dans le tableur. */
export function enCsv(envois) {
  const lignes = envois.map((j) =>
    [
      dateSuisse(j.date),
      heureSuisse(j.date),
      j.ref,
      TYPES[j.type] ?? j.type,
      j.client,
      j.adresse,
      j.destinataire,
      j.qui,
      j.renvoi ? 'Renvoi' : 'Premier envoi',
      j.validePar,
    ]
      .map(cellule)
      .join(';')
  )
  return `${BOM}${[COLONNES.join(';'), ...lignes].join('\r\n')}\r\n`
}
