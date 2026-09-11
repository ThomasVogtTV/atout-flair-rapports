// Ecran "Agenda" : les rendez-vous de l'equipe, jour par jour. Et, sur
// l'accueil, ceux du jour - on ouvre l'app le matin pour savoir ou l'on va.

import { esc } from '../ui/dom.js'
import { ICONS, sectionIcon } from '../ui/icons.js'
import { todayISO } from '../state.js'
import { aVenir, libelleJour, nomClient, adresseRdv, typeRdv, trierRdv, grilleMois, libelleMois, moisDe } from '../agenda-outils.js'

/**
 * Une ligne de rendez-vous : l'heure en tete, le type, le client et l'adresse.
 * `montrerQui` ajoute a qui il est attribue - utile quand ce n'est pas soi.
 */
export function rdvLigneHTML(r, { montrerQui = false } = {}) {
  const t = typeRdv(r.type)
  const detail = [adresseRdv(r) || t.choix, montrerQui && r.pour?.nom ? `pour ${r.pour.nom}` : ''].filter(Boolean).join(' · ')
  return `
    <li class="rapport-ligne rdv-ligne${r.rapportId ? ' fait' : ''}" data-rdv="${esc(r.id)}">
      <span class="rdv-heure">${r.heure ? esc(r.heure) : '–'}</span>
      <span class="rapport-type icon-${t.id}">${ICONS[t.id] ?? ''}</span>
      <span class="rapport-corps">
        <span class="rapport-nom">${esc(nomClient(r.client) || 'Client')}</span>
        <span class="rapport-detail">${esc(detail)}</span>
      </span>
      ${r.rapportId ? '<span class="pill done">Commencé</span>' : `<span class="contact-go">${ICONS.chevron}</span>`}
    </li>`
}

// Le nom d'un collegue ne s'affiche que s'il ne s'agit pas de soi.
const pasAMoi = (agenda) => (r) => agenda.role !== 'invite' && r.pour?.id && r.pour.id !== agenda.moi?.id

/**
 * Sur l'accueil : les rendez-vous du jour, ou a defaut le prochain. Rien du
 * tout quand l'agenda est vide - une rubrique vide ne sert qu'a encombrer.
 */
export function rdvAccueilHTML(view) {
  const a = view.agenda
  if (!a?.rdvs?.length) return ''
  const jour = todayISO()
  const avenir = aVenir(a.rdvs, jour)
  const duJour = avenir.filter((r) => r.date === jour)
  const montres = duJour.length ? duJour.slice(0, 4) : avenir.slice(0, 1)
  if (!montres.length) return ''
  const titre = duJour.length ? "Aujourd'hui" : `Prochain rendez-vous · ${libelleJour(montres[0].date, jour)}`
  const qui = pasAMoi(a)
  return `
    <h2 class="section-title">
      <span class="section-title-main">${sectionIcon('calendrier', 'amber')}${esc(titre)}</span>
      <span class="section-title-trailer">
        ${duJour.length > 4 ? `<span class="count-pill"><b>${duJour.length}</b></span>` : ''}
        <button class="link" data-act="open-agenda">Agenda</button>
      </span>
    </h2>
    <ul class="report-list">${montres.map((r) => rdvLigneHTML(r, { montrerQui: qui(r) })).join('')}</ul>`
}

const JOURS_SEMAINE = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

/**
 * Le calendrier du mois, comme sur un telephone : un point de la couleur du
 * type sous chaque jour qui a un rendez-vous, aujourd'hui cercle, le jour
 * choisi plein. Dessous, les rendez-vous de ce jour-la.
 */
export function agendaView(view) {
  const a = view.agenda
  const aujourdhui = todayISO()
  const jour = view.agendaJour ?? aujourdhui
  const mois = view.agendaMois ?? moisDe(jour)
  const invite = a?.role === 'invite'
  const qui = a ? pasAMoi(a) : () => false

  const parJour = new Map()
  for (const r of a?.rdvs ?? []) parJour.set(r.date, [...(parJour.get(r.date) ?? []), r])

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

  const duJour = trierRdv(parJour.get(jour) ?? [])
  const vide = !a
    ? navigator.onLine
      ? "Chargement de l'agenda…"
      : "Hors ligne : l'agenda s'affichera au retour du réseau."
    : 'Aucun rendez-vous ce jour-là.'
  const ailleurs = mois !== moisDe(aujourdhui) || jour !== aujourdhui
  const avenir = a ? aVenir(a.rdvs ?? [], aujourdhui).length : 0

  return `
    <header class="top editor-top">
      <button class="icon-btn back" data-act="home">‹</button>
      <div class="top-title">
        <h1>Agenda</h1>
        <p class="muted">${avenir} rendez-vous à venir</p>
      </div>
      ${invite ? '' : `<span class="top-actions"><button class="btn ghost btn-mini" data-act="ajouter-rdv">+ Ajouter</button></span>`}
    </header>
    <section class="pad">
      ${a && !navigator.onLine ? '<p class="muted small agenda-horsligne">Hors ligne : dernière version enregistrée sur ce téléphone.</p>' : ''}
      <div class="card calendrier">
        <div class="cal-tete">
          <button type="button" class="icon-btn cal-nav" data-agenda-mois="-1" aria-label="Mois précédent">‹</button>
          <strong class="cal-titre">${esc(libelleMois(mois))}</strong>
          <button type="button" class="icon-btn cal-nav" data-agenda-mois="1" aria-label="Mois suivant">›</button>
        </div>
        <div class="cal-semaine">${JOURS_SEMAINE.map((j) => `<span>${j}</span>`).join('')}</div>
        <div class="cal-grille">${cases}</div>
        ${ailleurs ? `<button type="button" class="link cal-auj" data-agenda-jour="${aujourdhui}">Revenir à aujourd'hui</button>` : ''}
      </div>

      <h3 class="agenda-jour${jour === aujourdhui ? ' aujourdhui' : ''}">${esc(libelleJour(jour, aujourdhui))}</h3>
      ${
        duJour.length
          ? `<ul class="report-list">${duJour.map((r) => rdvLigneHTML(r, { montrerQui: qui(r) })).join('')}</ul>`
          : `<p class="empty">${esc(vide)}</p>`
      }
      ${invite ? '' : '<button type="button" class="btn ghost wide agenda-ajouter" data-act="ajouter-rdv">+ Ajouter un rendez-vous ce jour-là</button>'}
    </section>`
}
