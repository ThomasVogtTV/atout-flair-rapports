// Bureau : le cadre - la navigation, l'en-tete de chaque page - et les pages.
// Les morceaux eux-memes (calendrier, semainier, tournee, equipe, journal) sont
// ceux de src/views/, partages avec Terrain.
//
// La meme maison que Terrain : les chiens en tete de la navigation, la nuit et
// ses lignes de niveau, les icones dessinees de l'app. Chaque page s'ouvre sur
// son panneau de nuit - la date, le titre, et les quelques chiffres qu'on vient
// y lire - puis le travail se pose sur le papier.

import { esc } from '../ui/dom.js'
import { ICONS } from '../ui/icons.js'
import { ICONES_3D } from '../ui/icones3d.js'
import { LIGNES_FLAIR } from '../ui/motifs.js'
import { identite } from '../lock.js'
import { todayISO } from '../state.js'
import { ilYA } from '../views/envois.js'
import { agendaCalendrierHTML, agendaJourHTML } from '../views/agenda.js'
import { tableauAdminHTML } from '../views/tableau.js'
import { AIDE_BASE, PAGE_JOURNAL, codeRevele, equipeHTML, validationsHTML, rapportsEquipeHTML, journalHTML } from '../views/admin.js'
import { estAnnule, lundiDe, plusJours, personnesDe } from '../agenda-outils.js'

export const ECRANS = ['planning', 'equipe', 'valider', 'rapports', 'envois']

const PAGES = {
  planning: { titre: 'Planning', icone: 'agenda' },
  equipe: { titre: 'Équipe', icone: 'equipe' },
  valider: { titre: 'À valider', icone: 'valider' },
  rapports: { titre: 'Rapports', icone: 'rapports' },
  envois: { titre: 'Envois', icone: 'envois' },
}

const JOUR_MS = 86_400_000
const s = (n) => (n > 1 ? 's' : '')

// --- le cadre ---------------------------------------------------------------------

function navHTML(view, ident) {
  const aValider = view.admin?.validations?.length ?? 0
  const nom = ident.id ? ident.nom : 'Administrateur'
  return `
    <nav class="bureau-nav" aria-label="Bureau">
      ${LIGNES_FLAIR}
      <div class="bureau-scene">
        <img class="bureau-photo" src="/hero-dog.webp" alt="" decoding="async" />
        <div class="bureau-marque">
          <span class="bureau-marque-nom">Atout Flair</span>
          <span class="bureau-marque-app">Bureau</span>
        </div>
      </div>
      <ul class="bureau-liens">
        ${ECRANS.map((e) => {
          const on = view.ecran === e
          const compte = e === 'valider' && aValider ? `<b class="bureau-compte">${aValider}</b>` : ''
          return `
          <li>
            <button type="button" class="bureau-lien${on ? ' on' : ''}" data-bureau-ecran="${e}"${on ? ' aria-current="page"' : ''}>
              <span class="bureau-lien-ico">${ICONES_3D[PAGES[e].icone]}${compte}</span>
              <span class="bureau-lien-nom">${PAGES[e].titre}</span>
            </button>
          </li>`
        }).join('')}
      </ul>
      <div class="bureau-pied">
        <a class="bureau-terrain" href="/">${ICONS.phone}<span>Terrain</span>${ICONS.suivant}</a>
        <div class="bureau-moi">
          <span class="bureau-avatar" aria-hidden="true">${esc(nom.trim().charAt(0).toUpperCase() || 'A')}</span>
          <span class="bureau-moi-nom"><b>${esc(nom)}</b><i>${ident.id ? 'Administrateur' : 'Accès principal'}</i></span>
          <button type="button" class="bureau-sortie" data-act="deconnexion" title="Se déconnecter" aria-label="Se déconnecter">${ICONS.sortie}</button>
        </div>
      </div>
    </nav>`
}

const aujourdhuiLong = () => new Date().toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long' })

/**
 * Le panneau de nuit en tete de page : la date, le titre, et les chiffres de la
 * page. Un chiffre vaut `null` tant qu'il n'est pas lu ; `alerte` le rougit et
 * `or` le dore, des qu'il n'est plus nul.
 */
function teteHTML({ titre, sous = '', chiffres = [], actions = '' }) {
  const chiffre = (c) => `
        <div class="chiffre${c.n && c.alerte ? ' alerte' : ''}${c.n && c.or ? ' or' : ''}">
          <dt>${esc(c.mot)}</dt>
          <dd>${c.n ?? '–'}</dd>
        </div>`
  return `
    <header class="bureau-tete reveal" style="--i:0">
      ${LIGNES_FLAIR}
      <div class="bureau-titre">
        <span class="bureau-sur">${esc(aujourdhuiLong())}</span>
        <h1>${esc(titre)}</h1>
        ${sous ? `<p>${esc(sous)}</p>` : ''}
      </div>
      ${chiffres.length ? `<dl class="bureau-chiffres">${chiffres.map(chiffre).join('')}</dl>` : ''}
      ${actions ? `<div class="bureau-actions">${actions}</div>` : ''}
    </header>`
}

// Des lignes qui respirent le temps que la liste arrive.
const attenteHTML = (n = 4) => `<ul class="report-list" aria-busy="true" aria-label="Chargement">${'<li class="squelette"></li>'.repeat(n)}</ul>`

// Une page sans rien a faire : l'icone de la page, en grand, et une phrase.
const videHTML = (icone, texte) => `
  <div class="bureau-vide">
    <span class="bureau-vide-ico">${ICONES_3D[icone]}</span>
    <p>${esc(texte)}</p>
  </div>`

/** Ce que les pages de l'equipe montrent tant que l'equipe n'est pas lue. */
function etatEquipe(view) {
  const a = view.admin
  if (!a) return attenteHTML()
  if (a.erreur) return `<div class="card bureau-erreur"><p>${esc(a.erreur)}</p>${a.base === false ? AIDE_BASE : ''}</div>`
  return ''
}

const equipeLue = (view) => Boolean(view.admin && !view.admin.erreur)

// --- les pages ----------------------------------------------------------------------

function planningHTML(view) {
  const lu = Boolean(view.agenda)
  const jour = todayISO()
  const lundi = lundiDe(jour)
  const dimanche = plusJours(lundi, 6)
  const rdvs = (view.agenda?.rdvs ?? []).filter((r) => !estAnnule(r))
  const semaine = rdvs.filter((r) => r.date >= lundi && r.date <= dimanche)
  const gens = personnesDe(semaine).length
  return `
    ${teteHTML({
      titre: 'Planning',
      chiffres: [
        { mot: "aujourd'hui", n: lu ? rdvs.filter((r) => r.date === jour).length : null },
        { mot: 'cette semaine', n: lu ? semaine.length : null },
        { mot: 'sur le terrain', n: lu ? gens : null },
      ],
      actions: `<button class="btn accent" data-act="ajouter-rdv">${ICONS.ajout}Rendez-vous</button>`,
    })}
    <div class="planning">
      <div class="planning-calendrier reveal" style="--i:1">${agendaCalendrierHTML(view)}</div>
      <div class="planning-jour reveal" style="--i:2">
        ${agendaJourHTML(view)}
        ${tableauAdminHTML(view, { jour: view.agendaJour })}
      </div>
    </div>`
}

function equipePageHTML(view) {
  const a = view.admin
  const lu = equipeLue(view)
  const actifs = (a?.employes ?? []).filter((e) => e.actif && !e.expire)
  const employes = actifs.filter((e) => !e.invite).length
  const invites = actifs.filter((e) => e.invite).length
  const debutJour = new Date().setHours(0, 0, 0, 0)
  const vus = actifs.filter((e) => e.vu >= debutJour).length
  return `
    ${teteHTML({
      titre: 'Équipe',
      sous: a?.copie ? `Base copiée ${ilYA(a.copie)}` : '',
      chiffres: [
        { mot: `employé${s(employes)}`, n: lu ? employes : null },
        { mot: `invité${s(invites)}`, n: lu ? invites : null },
        { mot: `vu${s(vus)} aujourd'hui`, n: lu ? vus : null },
      ],
    })}
    <div class="bureau-equipe reveal" style="--i:1">
      ${etatEquipe(view) || `${codeRevele(view.adminCodeRevele)}${equipeHTML(view, { titre: false })}`}
    </div>`
}

function validerPageHTML(view) {
  const validations = view.admin?.validations ?? []
  return `
    ${teteHTML({
      titre: 'À valider',
      chiffres: [{ mot: 'en attente', n: equipeLue(view) ? validations.length : null, or: true }],
    })}
    <div class="bureau-colonne reveal" style="--i:1">
      ${
        etatEquipe(view) ||
        (validations.length ? validationsHTML(validations, { titre: false }) : videHTML('valider', 'Aucun rapport d’invité à valider.'))
      }
    </div>`
}

const ETATS_FINIS = ['sent', 'done', 'queued', 'validation']

function rapportsPageHTML(view) {
  const r = view.adminRapports
  const lu = Boolean(r?.liste)
  const liste = (r?.liste ?? []).filter((x) => !x.parentId)
  const enCours = liste.filter((x) => !ETATS_FINIS.includes(x.status)).length
  const envoyes = liste.filter((x) => x.status === 'sent').length
  return `
    ${teteHTML({
      titre: 'Rapports de l’équipe',
      chiffres: [
        { mot: 'en ligne', n: lu ? liste.length : null },
        { mot: 'en cours', n: lu ? enCours : null },
        { mot: `envoyé${s(envoyes)}`, n: lu ? envoyes : null },
      ],
    })}
    <div class="bureau-colonne reveal" style="--i:1">
      ${
        !r || r.chargement
          ? attenteHTML()
          : liste.length || r.erreur
            ? rapportsEquipeHTML(view, { titre: false })
            : videHTML('rapports', 'Aucun rapport sauvegardé en ligne pour l’instant.')
      }
    </div>`
}

function envoisPageHTML(view) {
  const a = view.admin
  const lu = Boolean(a?.journal)
  const depuis = Date.now() - 7 * JOUR_MS
  const journal = a?.journal ?? []
  const semaine = journal.filter((j) => j.date >= depuis)
  const envoyes = semaine.filter((j) => !['echec', 'a-valider', 'refuse'].includes(j.statut)).length
  const echecs = semaine.filter((j) => j.statut === 'echec').length
  // Le journal arrive par pages : si la derniere page lue tient encore dans la
  // semaine, il y en a peut-etre d'autres - le compte est un minimum.
  const complet = a?.journalComplet ?? (journal.length < PAGE_JOURNAL || (journal.at(-1)?.date ?? 0) < depuis)
  const compte = (n) => (lu ? `${n}${complet ? '' : '+'}` : null)
  return `
    ${teteHTML({
      titre: 'Envois',
      chiffres: [
        { mot: `envoyé${s(envoyes)} · 7 jours`, n: compte(envoyes) },
        { mot: `échec${s(echecs)} · 7 jours`, n: lu ? echecs : null, alerte: true },
      ],
    })}
    <div class="bureau-colonne reveal" style="--i:1">${etatEquipe(view) || journalHTML(view, { titre: false })}</div>`
}

const RENDUS = {
  planning: planningHTML,
  equipe: equipePageHTML,
  valider: validerPageHTML,
  rapports: rapportsPageHTML,
  envois: envoisPageHTML,
}

// Un employe ou un invite qui ouvre le Bureau : pas de porte fermee sans issue.
// L'ecran reprend celui du code d'acces - les chiens, et la nuit qui monte.
const reserveHTML = () => `
  <div class="bureau-reserve">
    <div class="bureau-reserve-carte">
      <span class="bureau-marque-app">Atout Flair</span>
      <h1>Bureau</h1>
      <p>Réservé aux administrateurs.</p>
      <a class="btn accent wide" href="/">${ICONS.phone}Ouvrir Terrain</a>
      <button type="button" class="btn quiet wide" data-act="deconnexion">Changer de session</button>
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
