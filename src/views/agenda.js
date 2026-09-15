// L'agenda : les rendez-vous de l'equipe, en mois ou en semaine. Et, sur
// l'accueil de Terrain, ceux du jour - on ouvre l'app le matin pour savoir ou
// l'on va.
//
// Deux vues, parce qu'elles ne repondent pas a la meme question : le mois dit
// "quand suis-je pris ?", la semaine dit "qui fait quoi jeudi matin ?". La
// seconde devient la vue de travail des que l'equipe grandit.
//
// Le calendrier et le jour choisi se dessinent separement (agendaCalendrierHTML,
// agendaJourHTML) : Terrain les empile, le planning du Bureau les pose cote a
// cote.

import { esc } from '../ui/dom.js'
import { ICONS } from '../ui/icons.js'
import { todayISO } from '../state.js'
import {
  aVenir,
  libelleJour,
  libelleDuree,
  dureeDe,
  nomClient,
  adresseRdv,
  typeRdv,
  trierRdv,
  grilleMois,
  libelleMois,
  moisDe,
  plusJours,
  lundiDe,
  grilleSemaine,
  libelleSemaine,
  plageJournee,
  disposerJour,
  personnesDe,
  tonPersonne,
  LETTRES_JOURS,
  enHeure,
  estAnnule,
  estFait,
  libelleStatut,
  aMoi,
} from '../agenda-outils.js'

/**
 * Une ligne de rendez-vous : l'heure et la duree en tete, le type, le client
 * et l'adresse. `montrerQui` ajoute a qui il est attribue - utile quand ce
 * n'est pas soi.
 */
export function rdvLigneHTML(r, { montrerQui = false } = {}) {
  const t = typeRdv(r.type)
  const detail = [adresseRdv(r) || t.choix, montrerQui && r.pour?.nom ? `pour ${r.pour.nom}` : ''].filter(Boolean).join(' · ')
  // L'etat prime sur le reste : un rendez-vous annule ou fait n'appelle plus
  // aucun geste, la pastille le dit et la ligne s'efface un peu.
  const etat = libelleStatut(r)
  const marque = etat
    ? `<span class="pill ${estFait(r) ? 'fait' : 'annule'}">${etat}</span>`
    : r.rapportId
      ? '<span class="pill done">Commencé</span>'
      : `<span class="contact-go">${ICONS.chevron}</span>`
  return `
    <li class="rapport-ligne rdv-ligne${r.rapportId ? ' fait' : ''}${estAnnule(r) ? ' annule' : ''}" data-rdv="${esc(r.id)}">
      <span class="rdv-heure">
        <b>${r.heure ? esc(r.heure) : '–'}</b>
        ${r.heure ? `<i>${esc(libelleDuree(dureeDe(r)))}</i>` : ''}
      </span>
      <span class="rapport-type icon-${t.id}">${ICONS[t.id] ?? ''}</span>
      <span class="rapport-corps">
        <span class="rapport-nom">${esc(nomClient(r.client) || 'Client')}</span>
        <span class="rapport-detail">${esc(detail)}</span>
      </span>
      ${marque}
    </li>`
}

// Le nom d'un collegue ne s'affiche que s'il ne s'agit pas de soi.
const pasAMoi = (agenda) => (r) => agenda.role !== 'invite' && r.pour?.id && r.pour.id !== agenda.moi?.id

/**
 * Sur l'accueil de Terrain : mes rendez-vous du jour. Rien les autres jours - le
 * prochain se lit deja dans le poste, juste au-dessus - ni quand l'agenda est
 * vide : une rubrique vide ne sert qu'a encombrer.
 */
export function rdvAccueilHTML(view) {
  const a = view.agenda
  if (!a?.rdvs?.length) return ''
  const jour = todayISO()
  const duJour = aVenir(a.rdvs, jour).filter((r) => r.date === jour && (!view.agendaPerso || aMoi(a)(r)))
  if (!duJour.length) return ''
  const montres = duJour.slice(0, 4)
  const qui = pasAMoi(a)
  return `
    <h2 class="section-title">
      <span class="section-title-main">Aujourd'hui</span>
      <span class="section-title-trailer">
        ${duJour.length > 4 ? `<span class="count-pill"><b>${duJour.length}</b></span>` : ''}
        <button class="link" data-act="open-agenda">Agenda</button>
      </span>
    </h2>
    <ul class="report-list">${montres.map((r) => rdvLigneHTML(r, { montrerQui: qui(r) })).join('')}</ul>`
}

// --- le calendrier du mois ---------------------------------------------------

/**
 * Le calendrier du mois, comme sur un telephone : un point de la couleur du
 * type sous chaque jour qui a un rendez-vous, aujourd'hui cercle, le jour
 * choisi plein.
 */
function moisHTML({ mois, jour, aujourdhui, parJour }) {
  const cases = grilleMois(mois)
    .map((c) => {
      const du = parJour.get(c.iso) ?? []
      const classes = [
        'cal-case',
        c.dansMois ? '' : 'hors',
        c.iso === aujourdhui ? 'aujourdhui' : '',
        c.iso === jour ? 'choisi' : '',
        du.length ? 'occupe' : '',
      ]
        .filter(Boolean)
        .join(' ')
      const points = du
        .slice(0, 3)
        .map((r) => `<i class="cal-point t-${r.type}"></i>`)
        .join('')
      const titre = `${libelleJour(c.iso, aujourdhui)}${du.length ? ` : ${du.length} rendez-vous` : ''}`
      return `<button type="button" class="${classes}" data-agenda-jour="${c.iso}" aria-label="${esc(titre)}">
        <span class="cal-num">${c.jour}</span>
        <span class="cal-points">${points}${du.length > 3 ? '<i class="cal-plus">+</i>' : ''}</span>
      </button>`
    })
    .join('')

  return `
    <div class="card calendrier">
      <div class="cal-tete">
        <button type="button" class="icon-btn cal-nav" data-agenda-mois="-1" aria-label="Mois précédent">‹</button>
        <strong class="cal-titre">${esc(libelleMois(mois))}</strong>
        <button type="button" class="icon-btn cal-nav" data-agenda-mois="1" aria-label="Mois suivant">›</button>
      </div>
      <div class="cal-semaine">${LETTRES_JOURS.map((j) => `<span>${j}</span>`).join('')}</div>
      <div class="cal-grille">${cases}</div>
    </div>`
}

// --- le semainier ------------------------------------------------------------

const pourcent = (n) => `${Math.round(n * 1000) / 10}%`

/**
 * Un bloc du semainier : place a son heure, haut comme sa duree.
 *
 * Sept colonnes sur un telephone, c'est etroit : un nom coupe en "Ré Du" ne
 * renseigne personne. Un bloc qui partage sa colonne, ou qui dure moins d'une
 * demi-heure, ne garde donc que son heure et sa couleur - le reste se lit dans
 * la fiche, a une pression de la.
 */
function blocHTML(place, total, debutPlage) {
  const { rdv: r, debut, fin, colonne, colonnes } = place
  const t = typeRdv(r.type)
  const large = 100 / colonnes
  const serre = colonnes > 1 ? ' serre' : ''
  const court = fin - debut < 40 ? ' court' : ''
  const etat = estAnnule(r) ? ' annule' : estFait(r) ? ' termine' : ''
  const style = [
    `top:${pourcent((debut - debutPlage) / total)}`,
    `height:${pourcent((fin - debut) / total)}`,
    `left:calc(${pourcent((colonne * large) / 100)} + 1px)`,
    `width:calc(${pourcent(large / 100)} - 2px)`,
  ].join(';')
  const titre = [
    `${r.heure} – ${enHeure(fin)}`,
    nomClient(r.client) || 'Client',
    r.pour?.nom,
    libelleStatut(r),
  ]
    .filter(Boolean)
    .join(' · ')
  return `<button type="button" class="sem-bloc ton-${tonPersonne(r.pour?.id)}${serre}${court}${etat}${
    r.rapportId && !etat ? ' fait' : ''
  }" style="${style}" data-rdv="${esc(r.id)}" title="${esc(titre)}" aria-label="${esc(titre)}"><b class="sem-h">${esc(r.heure)}</b><span class="sem-n">${esc(
    nomClient(r.client) || t.choix
  )}</span></button>`
}

/**
 * La semaine en grille : sept colonnes, les heures en hauteur. Deux rendez-vous
 * a la meme heure se partagent la colonne au lieu de se cacher - c'est la que
 * l'on voit la double reservation.
 */
function semaineHTML({ lundi, jour, aujourdhui, rdvs, ajoutable }) {
  const jours = grilleSemaine(lundi)
  const finSem = plusJours(lundi, 6)
  const semaine = rdvs.filter((r) => r.date >= lundi && r.date <= finSem)
  const { debut, fin } = plageJournee(semaine)
  const total = fin - debut
  const nHeures = Math.round(total / 60)

  const entetes = jours
    .map(
      (j) =>
        `<button type="button" class="sem-jour${j.iso === aujourdhui ? ' aujourdhui' : ''}${
          j.iso === jour ? ' choisi' : ''
        }" data-agenda-jour="${j.iso}" aria-label="${esc(libelleJour(j.iso, aujourdhui))}"><i>${j.lettre}</i><b>${j.jour}</b></button>`
    )
    .join('')

  // Les rendez-vous sans heure : une bande au-dessus de la grille, comme dans
  // tous les agendas. La bande n'existe que s'il y en a.
  const sansHeure = semaine.filter((r) => !r.heure)
  const bande = sansHeure.length
    ? '<div class="sem-lab-jour">jour</div>' +
      jours
        .map((j) => {
          const du = sansHeure.filter((r) => r.date === j.iso)
          const puces = du
            .map(
              (r) =>
                `<button type="button" class="sem-puce ton-${tonPersonne(r.pour?.id)}${estAnnule(r) ? ' annule' : ''}" data-rdv="${esc(
                  r.id
                )}" title="${esc(nomClient(r.client))}">${esc(nomClient(r.client) || '—')}</button>`
            )
            .join('')
          return `<div class="sem-entier">${puces}</div>`
        })
        .join('')
    : ''

  const heures = Array.from({ length: nHeures }, (_, i) => {
    const h = String(debut / 60 + i).padStart(2, '0')
    return `<span class="sem-heure" style="top:${pourcent(i / nHeures)}">${h}h</span>`
  }).join('')

  const colonnes = jours
    .map((j) => {
      const places = disposerJour(semaine.filter((r) => r.date === j.iso))
      const creneaux = ajoutable
        ? Array.from({ length: nHeures }, (_, i) => {
            const heure = `${String(debut / 60 + i).padStart(2, '0')}:00`
            return `<button type="button" class="sem-creneau" style="top:${pourcent(i / nHeures)};height:${pourcent(
              1 / nHeures
            )}" data-agenda-creneau="${j.iso}|${heure}" aria-label="Ajouter un rendez-vous à ${heure}"></button>`
          }).join('')
        : ''
      const classes = ['sem-col', j.iso === aujourdhui ? 'aujourdhui' : '', j.iso === jour ? 'choisi' : ''].filter(Boolean).join(' ')
      return `<div class="${classes}">${creneaux}${places.map((p) => blocHTML(p, total, debut)).join('')}</div>`
    })
    .join('')

  return `
    <div class="card semainier" style="--n:${nHeures}">
      <div class="cal-tete">
        <button type="button" class="icon-btn cal-nav" data-agenda-semaine="-1" aria-label="Semaine précédente">‹</button>
        <strong class="cal-titre">${esc(libelleSemaine(lundi))}</strong>
        <button type="button" class="icon-btn cal-nav" data-agenda-semaine="1" aria-label="Semaine suivante">›</button>
      </div>
      <div class="sem-defile">
        <div class="sem-grille">
          <div class="sem-coin"></div>
          ${entetes}
          ${bande}
          <div class="sem-heures">${heures}</div>
          ${colonnes}
        </div>
      </div>
    </div>`
}

// --- l'ecran -----------------------------------------------------------------

/** Les pastilles de couleur qui disent qui est qui dans le semainier. */
const legendeHTML = (gens) =>
  gens.length < 2
    ? ''
    : `<p class="sem-legende">${gens.map((p) => `<span class="sem-nom ton-${tonPersonne(p.id)}">${esc(p.nom)}</span>`).join('')}</p>`

/** Le filtre "qui" : n'apparait que s'il y a du monde a filtrer. */
const filtreQuiHTML = (gens, choisi) =>
  gens.length < 2
    ? ''
    : `<div class="report-filters agenda-qui">
        <button type="button" class="chip chip-sm${choisi ? '' : ' on'}" data-agenda-qui="">Tout le monde</button>
        ${gens
          .map(
            (p) =>
              `<button type="button" class="chip chip-sm ton-${tonPersonne(p.id)}${choisi === p.id ? ' on' : ''}" data-agenda-qui="${esc(
                p.id
              )}">${esc(p.nom)}</button>`
          )
          .join('')}
      </div>`

/** Ce que l'agenda montre, selon le jour, la vue et le filtre choisis. */
function lecture(view) {
  const a = view.agenda
  const aujourdhui = todayISO()
  const jour = view.agendaJour ?? aujourdhui
  // Terrain ne montre que les rendez-vous de celui qui tient le telephone.
  const tous = (a?.rdvs ?? []).filter((r) => !view.agendaPerso || aMoi(a)(r))
  const gens = personnesDe(tous)
  const filtre = gens.some((p) => p.id === view.agendaQui) ? view.agendaQui : ''
  const rdvs = tous.filter((r) => !filtre || r.pour?.id === filtre)
  const parJour = new Map()
  for (const r of rdvs) parJour.set(r.date, [...(parJour.get(r.date) ?? []), r])
  return {
    a,
    aujourdhui,
    jour,
    mois: view.agendaMois ?? moisDe(jour),
    lundi: view.agendaSemaine ?? lundiDe(jour),
    semaine: view.agendaVue === 'semaine',
    invite: a?.role === 'invite',
    qui: a ? pasAMoi(a) : () => false,
    gens,
    filtre,
    rdvs,
    parJour,
  }
}

/** Combien de rendez-vous restent a venir. */
export const rdvsAVenir = (view) =>
  view.agenda ? aVenir(view.agenda.rdvs ?? [], todayISO()).filter((r) => !view.agendaPerso || aMoi(view.agenda)(r)).length : 0

/** Mois ou semaine, le filtre par personne et la legende des couleurs. */
export function agendaCalendrierHTML(view) {
  const l = lecture(view)
  const ailleurs = l.jour !== l.aujourdhui || (l.semaine ? l.lundi !== lundiDe(l.aujourdhui) : l.mois !== moisDe(l.aujourdhui))
  return `
    <div class="agenda-vues">
      <button type="button" class="chip chip-sm${l.semaine ? '' : ' on'}" data-agenda-vue="mois">Mois</button>
      <button type="button" class="chip chip-sm${l.semaine ? ' on' : ''}" data-agenda-vue="semaine">Semaine</button>
    </div>
    ${filtreQuiHTML(l.gens, l.filtre)}
    ${
      l.semaine
        ? semaineHTML({ lundi: l.lundi, jour: l.jour, aujourdhui: l.aujourdhui, rdvs: l.rdvs, ajoutable: !l.invite })
        : moisHTML({ mois: l.mois, jour: l.jour, aujourdhui: l.aujourdhui, parJour: l.parJour })
    }
    ${l.semaine ? legendeHTML(l.gens) : ''}
    ${ailleurs ? `<button type="button" class="link cal-auj" data-agenda-jour="${l.aujourdhui}">Revenir à aujourd'hui</button>` : ''}`
}

/** Le jour choisi : ses rendez-vous, et de quoi en ajouter un. */
export function agendaJourHTML(view) {
  const l = lecture(view)
  const duJour = trierRdv(l.parJour.get(l.jour) ?? [])
  const vide = !l.a
    ? navigator.onLine
      ? "Chargement de l'agenda…"
      : "Hors ligne : l'agenda s'affichera au retour du réseau."
    : 'Aucun rendez-vous ce jour-là.'
  return `
    <h3 class="agenda-jour${l.jour === l.aujourdhui ? ' aujourdhui' : ''}">${esc(libelleJour(l.jour, l.aujourdhui))}</h3>
    ${
      duJour.length
        ? `<ul class="report-list">${duJour.map((r) => rdvLigneHTML(r, { montrerQui: l.qui(r) })).join('')}</ul>`
        : `<p class="empty">${esc(vide)}</p>`
    }
    ${l.invite ? '' : '<button type="button" class="btn ghost wide agenda-ajouter" data-act="ajouter-rdv">+ Ajouter un rendez-vous ce jour-là</button>'}`
}

/** L'ecran Agenda de Terrain. */
export function agendaView(view) {
  const l = lecture(view)
  return `
    <header class="top editor-top">
      <button class="icon-btn back" data-act="home" aria-label="Retour">${ICONS.retour}</button>
      <div class="top-title">
        <h1>${view.agendaPerso ? 'Mon agenda' : 'Agenda'}</h1>
        <p class="muted">${rdvsAVenir(view)} rendez-vous à venir</p>
      </div>
      ${l.invite ? '' : `<span class="top-actions"><button class="btn ghost btn-mini" data-act="ajouter-rdv">+ Ajouter</button></span>`}
    </header>
    <section class="pad">
      ${l.a && !navigator.onLine ? '<p class="muted small agenda-horsligne">Hors ligne : dernière version enregistrée sur ce téléphone.</p>' : ''}
      ${agendaCalendrierHTML(view)}
      ${agendaJourHTML(view)}
    </section>`
}
