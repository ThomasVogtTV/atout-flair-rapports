// Les etapes d'un rapport : l'ordre dans lequel on le remplit sur le terrain,
// et ce qui manque encore a chacune.
//
// Le rapport se deroulait d'un bloc - mandant, lieu, pieces, photos, remarques,
// technicien, partenaire, signature - sur trois ou quatre ecrans de defilement,
// sans rien qui dise ou l'on en etait. Il se remplit maintenant en cinq etapes,
// dans l'ordre du geste : pour qui, ou, ce que le chien a trouve, ce qu'on en
// conclut, et la cloture.
//
// Une etape "faite" ne bloque rien : on peut sauter de l'une a l'autre, envoyer
// un rapport incomplet si on le decide. Elle dit seulement ce qui reste, pour
// que rien ne parte par oubli. Aucune entree/sortie ici : la regle se teste
// sans ecran ni base.

import { typeOf } from './templates.js'
import { DEFAULT_REMARQUES, fullName } from './state.js'

export const ETAPES = ['client', 'lieu', 'detection', 'constats', 'cloture']

const rempli = (v) => !!String(v ?? '').trim()
const majuscule = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s)

/** L'adresse ou l'on est intervenu, selon la forme du rapport. */
export const adresseDuLieu = (report) => {
  const l = report.lieu ?? {}
  return typeOf(report).layout === 'pieces' ? l.adresseIntervention ?? '' : [l.adresse, l.npaLieu].filter(rempli).join(', ')
}

/**
 * Les cinq etapes d'un rapport, avec leur etat.
 *
 * @returns {{id: string, titre: string, intitule: string, fait: boolean, resume: string, alerte: string|null}[]}
 */
export function etapesDuRapport(report) {
  const t = typeOf(report)
  const lignes = report.rows ?? []
  const tranchees = lignes.filter((r) => r.contamine).length
  const contaminees = lignes.filter((r) => r.contamine === 'oui').length
  const remarques = (report.remarques ?? '').trim()
  const remarquesAFaire = contaminees > 0 && (!remarques || remarques === DEFAULT_REMARQUES)
  const photos = (report.photos ?? []).length
  const adresse = adresseDuLieu(report)
  const signe = !t.hasSignature || !!report.signature
  const pluriel = (n) => (n > 1 ? t.rowLabelPlural : t.rowLabel)

  return [
    {
      id: 'client',
      titre: 'Client',
      intitule: 'Pour qui ?',
      fait: rempli(report.mandant?.nom),
      resume: fullName(report.mandant) || 'Client à renseigner',
      alerte: null,
    },
    {
      id: 'lieu',
      titre: 'Lieu',
      intitule: 'Où ?',
      fait: rempli(adresse),
      resume: adresse || 'Adresse à renseigner',
      alerte: null,
    },
    {
      id: 'detection',
      titre: 'Détection',
      intitule: majuscule(t.rowLabelPlural),
      fait: lignes.length > 0 && tranchees === lignes.length,
      resume: lignes.length ? `${tranchees}/${lignes.length} ${pluriel(lignes.length)}` : `Aucun${t.rowLabel.endsWith('e') ? 'e' : ''} ${t.rowLabel}`,
      alerte: contaminees ? `${contaminees} contaminé${t.rowLabel.endsWith('e') ? 'e' : ''}${contaminees > 1 ? 's' : ''}` : null,
    },
    {
      id: 'constats',
      titre: 'Constats',
      intitule: 'Conclusions',
      fait: rempli(remarques) && !remarquesAFaire,
      resume: [remarquesAFaire ? 'Remarques à compléter' : remarques ? 'Remarques rédigées' : 'Aucune remarque', photos ? `${photos} photo${photos > 1 ? 's' : ''}` : '']
        .filter(Boolean)
        .join(' · '),
      alerte: remarquesAFaire ? 'Remarques à compléter' : null,
    },
    {
      id: 'cloture',
      titre: 'Clôture',
      intitule: 'Signature et envoi',
      fait: rempli(report.technicien?.nom) && signe,
      resume: t.hasSignature ? (report.signature ? 'Signé sur place' : 'Signature à recueillir') : 'Prêt',
      alerte: null,
    },
  ]
}

/** Combien d'etapes sont faites, sur combien. */
export function progression(report) {
  const etapes = etapesDuRapport(report)
  const faites = etapes.filter((e) => e.fait).length
  return { faites, total: etapes.length, part: faites / etapes.length }
}

/**
 * L'etape sur laquelle un rapport s'ouvre. Un rapport neuf commence par le
 * client ; un brouillon repris, a la premiere etape qui reste a faire ; un
 * rapport deja remis, sur sa cloture - c'est la que se lit son bilan.
 */
export function etapeDeReprise(report) {
  if (report.status && report.status !== 'draft') return ETAPES.length - 1
  const i = etapesDuRapport(report).findIndex((e) => !e.fait)
  return i === -1 ? ETAPES.length - 1 : i
}

/**
 * Ce qui manque avant de remettre le rapport, en toutes lettres, et l'etape ou
 * s'en occuper. La cloture l'affiche en liste : on envoie en connaissance de
 * cause, jamais par oubli.
 *
 * @returns {{texte: string, etape: number}[]}
 */
export function manques(report) {
  const t = typeOf(report)
  const lignes = report.rows ?? []
  const sansVerdict = lignes.filter((r) => !r.contamine).length
  const e = etapesDuRapport(report)
  const liste = []
  const manque = (texte, id) => liste.push({ texte, etape: ETAPES.indexOf(id) })
  if (!e[0].fait) manque('Le nom du client', 'client')
  if (!e[1].fait) manque("L'adresse d'intervention", 'lieu')
  if (!lignes.length) manque(`Au moins un${t.rowLabel.endsWith('e') ? 'e' : ''} ${t.rowLabel}`, 'detection')
  else if (sansVerdict) manque(`${sansVerdict} ${sansVerdict > 1 ? t.rowLabelPlural : t.rowLabel} sans verdict`, 'detection')
  if (e[3].alerte) manque('Les remarques, puisque le chien a marqué', 'constats')
  else if (!rempli(report.remarques)) manque('Les remarques', 'constats')
  if (!rempli(report.technicien?.nom)) manque('Le nom du technicien', 'cloture')
  if (t.hasSignature && !report.signature) manque('La signature sur place', 'cloture')
  return liste
}
