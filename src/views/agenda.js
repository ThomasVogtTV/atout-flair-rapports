// Ecran "Agenda" : les rendez-vous de l'equipe, jour par jour. Et, sur
// l'accueil, ceux du jour - on ouvre l'app le matin pour savoir ou l'on va.

import { esc } from '../ui/dom.js'
import { ICONS, sectionIcon } from '../ui/icons.js'
import { todayISO } from '../state.js'
import { aVenir, recents, libelleJour, nomClient, adresseRdv, typeRdv } from '../agenda-outils.js'

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

export function agendaView(view) {
  const a = view.agenda
  const jour = todayISO()
  const invite = a?.role === 'invite'
  const avenir = a ? aVenir(a.rdvs ?? [], jour) : []
  const passes = a ? recents(a.rdvs ?? [], jour) : []
  const qui = a ? pasAMoi(a) : () => false

  // Groupes par jour, dans l'ordre.
  const parJour = new Map()
  for (const r of avenir) parJour.set(r.date, [...(parJour.get(r.date) ?? []), r])
  const groupes = [...parJour]
    .map(
      ([date, rdvs]) => `
      <h3 class="agenda-jour${date === jour ? ' aujourdhui' : ''}">${esc(libelleJour(date, jour))}</h3>
      <ul class="report-list">${rdvs.map((r) => rdvLigneHTML(r, { montrerQui: qui(r) })).join('')}</ul>`
    )
    .join('')

  const vide = !a
    ? navigator.onLine
      ? "Chargement de l'agenda…"
      : "Hors ligne : l'agenda s'affichera au retour du réseau."
    : invite
      ? 'Aucun rendez-vous prévu pour vous.'
      : 'Aucun rendez-vous à venir. « + Ajouter » pour en noter un.'

  return `
    <header class="top editor-top">
      <button class="icon-btn back" data-act="home">‹</button>
      <div class="top-title">
        <h1>Agenda</h1>
        <p class="muted">${avenir.length} rendez-vous à venir</p>
      </div>
      ${invite ? '' : `<span class="top-actions"><button class="btn ghost btn-mini" data-act="ajouter-rdv">+ Ajouter</button></span>`}
    </header>
    <section class="pad">
      ${a && !navigator.onLine ? '<p class="muted small agenda-horsligne">Hors ligne : dernière version enregistrée sur ce téléphone.</p>' : ''}
      ${groupes || `<p class="empty">${esc(vide)}</p>`}
      ${
        passes.length
          ? `<h3 class="agenda-jour passe">Ces deux dernières semaines</h3>
             <ul class="report-list passes">${passes.map((r) => rdvLigneHTML(r, { montrerQui: qui(r) })).join('')}</ul>`
          : ''
      }
    </section>`
}
