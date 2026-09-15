// Combien de temps l'equipe garde les donnees personnelles, et ce qui depasse
// deja ces durees. Ce sont les durees annoncees par la declaration de
// confidentialite (confidentialite/index.html) : les changer ici, c'est les
// changer la-bas aussi.
//
// Rien ne s'efface : l'administrateur a demande qu'aucune donnee ne soit
// supprimee jusqu'a nouvel ordre. Le Bureau montre seulement ce qui partirait
// (page Donnees), pour qu'il le verifie avant de decider.

import { lireSauvegardes, lireJournal, moisEnvois, lireEnvoisDuMois, lireAgenda, lireArchivesAgenda, lireCarnet } from './equipe.js'
import { lireIncidents } from './incidents.js'
import { cleNom, contactsVivants } from './carnet.js'

const JOUR = 86_400_000
const AN = 365.25 * JOUR

export const EFFACEMENT_ACTIF = false

export const DUREES = [
  { cle: 'rapports', libelle: 'Rapports et photos en ligne', duree: '10 ans', ms: 10 * AN },
  { cle: 'journal', libelle: 'Journal des envois', duree: '10 ans', ms: 10 * AN },
  { cle: 'facturation', libelle: 'Envois de l’export de facturation', duree: '10 ans', ms: 10 * AN },
  { cle: 'agenda', libelle: 'Rendez-vous passés', duree: '2 ans', ms: 2 * AN },
  { cle: 'carnet', libelle: 'Clients sans activité', duree: '5 ans', ms: 5 * AN },
  { cle: 'incidents', libelle: 'Incidents techniques', duree: '90 jours', ms: 90 * JOUR },
]
const PAR_CLE = Object.fromEntries(DUREES.map((d) => [d.cle, d]))

// Midi en temps universel : un jour du calendrier ne bascule pas sur la veille.
const jourDe = (iso) => Date.parse(`${iso}T12:00:00Z`)

/** Une categorie : combien en tout, combien au-dela de sa duree, et depuis quand. */
function categorie(cle, dates, maintenant) {
  const d = PAR_CLE[cle]
  const limite = maintenant - d.ms
  const valides = dates.filter((t) => Number.isFinite(t) && t > 0)
  return {
    cle,
    libelle: d.libelle,
    duree: d.duree,
    total: dates.length,
    aEffacer: valides.filter((t) => t < limite).length,
    plusAncien: valides.length ? valides.reduce((a, b) => Math.min(a, b)) : null,
  }
}

/** Ce que les durees effaceraient aujourd'hui, sans rien toucher. */
export async function bilanConservation({ maintenant = Date.now() } = {}) {
  const [sauvegardes, journal, mois, agenda, archives, carnet, incidents] = await Promise.all([
    lireSauvegardes(),
    lireJournal(10_000),
    moisEnvois(),
    lireAgenda(),
    lireArchivesAgenda(),
    lireCarnet(),
    lireIncidents(),
  ])
  const envois = (await Promise.all(mois.map(lireEnvoisDuMois))).flat()
  const rdvs = [...agenda.values(), ...archives.values()]

  // La derniere activite d'un client : sa fiche modifiee, ou un rendez-vous a son nom.
  const derniereVisite = new Map()
  for (const r of rdvs) {
    if (!r.client?.nom) continue
    const cle = cleNom(r.client)
    const t = jourDe(r.date)
    if (t > (derniereVisite.get(cle) ?? 0)) derniereVisite.set(cle, t)
  }

  return {
    effacementActif: EFFACEMENT_ACTIF,
    categories: [
      // Un rapport d'appartement part avec son immeuble : seuls les rapports de tete comptent.
      categorie('rapports', sauvegardes.filter((s) => !s.parentId).map((s) => Number(s.maj)), maintenant),
      categorie('journal', journal.map((j) => Number(j.date)), maintenant),
      categorie('facturation', envois.map((j) => Number(j.date)), maintenant),
      categorie('agenda', rdvs.map((r) => jourDe(r.date)).filter((t) => t < maintenant), maintenant),
      categorie(
        'carnet',
        contactsVivants(carnet).map((c) => Math.max(Number(c.maj) || 0, derniereVisite.get(cleNom(c)) ?? 0)),
        maintenant
      ),
      categorie('incidents', incidents.map((i) => Number(i.derniere)), maintenant),
    ],
  }
}
