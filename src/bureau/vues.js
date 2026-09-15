// Bureau : le cadre - la navigation, l'en-tete de chaque page - et les pages.
// Les morceaux eux-memes (calendrier, semainier, tournee, equipe, journal) sont
// ceux de src/views/, partages avec Terrain.

import { esc } from '../ui/dom.js'
import { ICONS } from '../ui/icons.js'
import { identite } from '../lock.js'
import { ilYA } from '../views/envois.js'
import { agendaCalendrierHTML, agendaJourHTML, rdvsAVenir } from '../views/agenda.js'
import { tableauAdminHTML } from '../views/tableau.js'
import { AIDE_BASE, codeRevele, equipeHTML, validationsHTML, rapportsEquipeHTML, journalHTML } from '../views/admin.js'

export const ECRANS = ['planning', 'equipe', 'valider', 'rapports', 'envois']

const PAGES = {
  planning: { titre: 'Planning', icone: ICONS.calendrier },
  equipe: { titre: 'Équipe', icone: ICONS.collab },
  valider: { titre: 'À valider', icone: ICONS.note },
  rapports: { titre: 'Rapports', icone: ICONS.folder },
  envois: { titre: 'Envois', icone: ICONS.mail },
}

function navHTML(view, ident) {
  const aValider = view.admin?.validations?.length ?? 0
  return `
    <nav class="bureau-nav" aria-label="Bureau">
      <div class="bureau-marque">
        <span class="bureau-marque-nom">Atout Flair</span>
        <span class="bureau-marque-app">Bureau</span>
      </div>
      <ul class="bureau-liens">
        ${ECRANS.map(
          (e) => `
          <li>
            <button type="button" class="bureau-lien${view.ecran === e ? ' on' : ''}" data-bureau-ecran="${e}"${
              view.ecran === e ? ' aria-current="page"' : ''
            }>${PAGES[e].icone}<span>${PAGES[e].titre}</span>${
              e === 'valider' && aValider ? `<b class="bureau-compte">${aValider}</b>` : ''
            }</button>
          </li>`
        ).join('')}
      </ul>
      <div class="bureau-pied">
        <a class="bureau-terrain" href="/">${ICONS.phone}<span>Terrain</span></a>
        <span class="bureau-session">${esc(ident.id ? ident.nom : 'Administrateur')}</span>
        <button type="button" class="bureau-sortie" data-act="deconnexion">Se déconnecter</button>
      </div>
    </nav>`
}

const teteHTML = (titre, sous = '', actions = '') => `
  <header class="bureau-tete">
    <div class="bureau-titre">
      <h1>${esc(titre)}</h1>
      ${sous ? `<p class="muted">${esc(sous)}</p>` : ''}
    </div>
    ${actions ? `<div class="bureau-actions">${actions}</div>` : ''}
  </header>`

/** Ce que les pages de l'equipe montrent tant que l'equipe n'est pas lue. */
function etatEquipe(view) {
  const a = view.admin
  if (!a) return '<p class="muted">Chargement…</p>'
  if (a.erreur) return `<div class="card"><p>${esc(a.erreur)}</p>${a.base === false ? AIDE_BASE : ''}</div>`
  return ''
}

function planningHTML(view) {
  const n = rdvsAVenir(view)
  return `
    ${teteHTML('Planning', `${n} rendez-vous à venir`, '<button class="btn primary" data-act="ajouter-rdv">+ Rendez-vous</button>')}
    <div class="planning">
      <div class="planning-calendrier">${agendaCalendrierHTML(view)}</div>
      <div class="planning-jour">
        ${agendaJourHTML(view)}
        ${tableauAdminHTML(view, { jour: view.agendaJour })}
      </div>
    </div>`
}

function equipePageHTML(view) {
  const a = view.admin
  return `
    ${teteHTML('Équipe', a?.copie ? `Base copiée ${ilYA(a.copie)}` : '')}
    <div class="bureau-colonne">
      ${etatEquipe(view) || `${codeRevele(view.adminCodeRevele)}${equipeHTML(view, { titre: false })}`}
    </div>`
}

function validerPageHTML(view) {
  const validations = view.admin?.validations ?? []
  return `
    ${teteHTML('À valider')}
    <div class="bureau-colonne">
      ${
        etatEquipe(view) ||
        (validations.length ? validationsHTML(validations, { titre: false }) : '<p class="empty">Aucun rapport d’invité à valider.</p>')
      }
    </div>`
}

function rapportsPageHTML(view) {
  const r = view.adminRapports
  const n = (r?.liste ?? []).filter((s) => !s.parentId).length
  return `
    ${teteHTML('Rapports de l’équipe', n ? `${n} rapport${n > 1 ? 's' : ''} sauvegardé${n > 1 ? 's' : ''} en ligne` : '')}
    <div class="bureau-colonne">
      ${!r || r.chargement ? '<p class="muted">Chargement…</p>' : rapportsEquipeHTML(view, { titre: false })}
    </div>`
}

function envoisPageHTML(view) {
  return `
    ${teteHTML('Envois')}
    <div class="bureau-colonne">${etatEquipe(view) || journalHTML(view, { titre: false })}</div>`
}

const RENDUS = {
  planning: planningHTML,
  equipe: equipePageHTML,
  valider: validerPageHTML,
  rapports: rapportsPageHTML,
  envois: envoisPageHTML,
}

// Un employe ou un invite qui ouvre le Bureau : pas de porte fermee sans issue.
const reserveHTML = () => `
  <div class="bureau-reserve">
    <div class="card">
      <h1>Bureau</h1>
      <p class="muted">Réservé aux administrateurs.</p>
      <a class="btn primary wide" href="/">Ouvrir Terrain</a>
      <button type="button" class="btn ghost wide" data-act="deconnexion">Changer de session</button>
    </div>
  </div>`

export function bureauView(view) {
  const ident = identite()
  // Pas encore de session : l'ecran du code est pose par-dessus.
  if (!ident) return '<div class="bureau-attente"></div>'
  if (ident.role !== 'admin') return reserveHTML()
  return `
    <div class="bureau">
      ${navHTML(view, ident)}
      <section class="bureau-page">${(RENDUS[view.ecran] ?? planningHTML)(view)}</section>
    </div>`
}
