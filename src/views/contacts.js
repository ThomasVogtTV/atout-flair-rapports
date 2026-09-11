// Ecran "Carnet" : les clients deja rencontres - regies, proprietaires,
// locataires, particuliers - et la fiche de chacun. L'ajout et la
// modification passent par le formulaire de `src/contact-dialog.js`.
//
// Le carnet se remplit tout seul : a l'envoi et a la fin de chaque rapport,
// et une fois pour toutes avec les rapports deja faits (voir reprendreClients).
// On y vient donc surtout pour retrouver quelqu'un : recherche et filtres en
// tete, liste alphabetique, et le nombre de rapports de chacun.

import { TYPE_LIST } from '../templates.js'
import { fullName, matchContact, activiteParNom, activiteDe, rapportsDuContact } from '../state.js'
import { esc } from '../ui/dom.js'
import { MANDANT_TYPES, mandantTypeLabel } from '../ui/chips.js'
import { ICONS, sectionIcon } from '../ui/icons.js'
import { reportRowHTML } from './home.js'

const sansAccent = (s) => (s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '')

// Deux lettres, comme sur un telephone : "Régie Duval" -> RD, "Favre" -> FA.
function initiales(c) {
  const mots = sansAccent(fullName(c)).split(/[\s-]+/).filter(Boolean)
  if (!mots.length) return '?'
  const s = mots.length > 1 ? mots[0][0] + mots[1][0] : mots[0].slice(0, 2)
  return s.toUpperCase()
}

const lettreDe = (c) => {
  const l = sansAccent(fullName(c)).trim()[0]?.toUpperCase() ?? ''
  return /[A-Z]/.test(l) ? l : '#'
}

const leJour = (ts) => new Date(ts).toLocaleDateString('fr-CH')

/**
 * Une ligne de client : pastille aux initiales (sa couleur dit le type), nom,
 * type et localite, et combien de rapports on a deja faits pour lui.
 *
 * @param {object} c le contact
 * @param {{n: number}} activite voir activiteDe
 * @param {{attr?: string}} opts attribut porte par la ligne (fiche ou choix)
 */
export function contactLigneHTML(c, activite, { attr = 'data-fiche' } = {}) {
  const detail = [mandantTypeLabel(c.type), c.npaLieu || c.adresse].filter(Boolean).join(' · ') || 'Coordonnées à compléter'
  return `
    <li class="rapport-ligne contact-ligne" ${attr}="${c.id}">
      <span class="contact-avatar t-${c.type || 'aucun'}">${esc(initiales(c))}</span>
      <span class="rapport-corps">
        <span class="rapport-nom">${esc(fullName(c) || 'Sans nom')}</span>
        <span class="rapport-detail">${esc(detail)}</span>
      </span>
      ${activite.n ? `<span class="contact-activite">${activite.n} rapport${activite.n > 1 ? 's' : ''}</span>` : ''}
      <span class="contact-go">${ICONS.chevron}</span>
    </li>`
}

// Les filtres ne montrent que les types presents, et disparaissent quand il
// n'y en a qu'un : une puce "Tous" a cote d'une seule autre ne trie rien.
function typesPresents(contacts) {
  return MANDANT_TYPES.filter((t) => contacts.some((c) => c.type === t.key))
}

function filtreActif(view) {
  const presents = typesPresents(view.contacts ?? [])
  return presents.some((t) => t.key === view.carnetFiltre) ? view.carnetFiltre : 'tous'
}

function filtresHTML(view) {
  const contacts = view.contacts ?? []
  const presents = typesPresents(contacts)
  if (presents.length < 2) return ''
  const actif = filtreActif(view)
  return `<div class="report-filters">${[{ key: 'tous', label: 'Tous' }, ...presents]
    .map((f) => {
      const n = f.key === 'tous' ? contacts.length : contacts.filter((c) => c.type === f.key).length
      return `<button type="button" class="chip chip-sm${f.key === actif ? ' on' : ''}" data-carnet-filtre="${f.key}">
        ${esc(f.label)}<span class="chip-count">${n}</span>
      </button>`
    })
    .join('')}</div>`
}

/**
 * La liste seule : la recherche la redessine a chaque frappe sans toucher au
 * champ, qui perdrait sinon le curseur.
 */
export function listeContactsHTML(view) {
  const contacts = view.contacts ?? []
  const recherche = (view.carnetRecherche ?? '').trim()
  const filtre = filtreActif(view)
  const liste = contacts.filter((c) => (filtre === 'tous' || c.type === filtre) && matchContact(c, recherche))

  if (!liste.length) {
    const vide = !contacts.length
      ? "Le carnet est vide. Chaque client s'y ajoute tout seul à l'envoi ou à la fin de son rapport, ou avec « + Ajouter »."
      : recherche
        ? `Aucun contact ne correspond à « ${esc(recherche)} ».`
        : 'Aucun contact dans cette catégorie.'
    return `<ul class="report-list carnet-liste"><li class="empty">${vide}</li></ul>`
  }

  const index = activiteParNom(view.reports ?? [])
  let lettre = ''
  const items = liste
    .map((c) => {
      const l = lettreDe(c)
      const tete = l !== lettre ? `<li class="carnet-lettre">${l}</li>` : ''
      lettre = l
      return tete + contactLigneHTML(c, activiteDe(c, index))
    })
    .join('')
  return `<ul class="report-list carnet-liste">${items}</ul>`
}

export function contactsView(view) {
  const n = (view.contacts ?? []).length
  return `
    <header class="top editor-top">
      <button class="icon-btn back" data-act="home">‹</button>
      <div class="top-title">
        <h1>Carnet</h1>
        <p class="muted">${n} contact${n > 1 ? 's' : ''}</p>
      </div>
      <span class="top-actions">
        <button class="btn ghost btn-mini" data-act="add-contact">+ Ajouter</button>
      </span>
    </header>
    <section class="pad">
      ${
        n
          ? `<div class="recherche">
               <span class="recherche-loupe">${ICONS.loupe}</span>
               <input data-recherche-contact type="search" value="${esc(view.carnetRecherche ?? '')}" enterkeyhint="search"
                      autocapitalize="none" autocorrect="off" spellcheck="false"
                      placeholder="Nom, rue, localité, téléphone" />
             </div>`
          : ''
      }
      ${filtresHTML(view)}
      ${listeContactsHTML(view)}
    </section>`
}

/**
 * La fiche d'un client : de quoi le joindre d'un geste, ses coordonnees, un
 * nouveau rapport deja rempli a son nom, et tout ce qu'on a fait pour lui.
 */
export function ficheContactView(view) {
  const c = view.fiche
  const rapports = rapportsDuContact(c, view.reports ?? [])
  const adresse = [c.adresse, c.npaLieu].filter(Boolean).join(', ')
  const tel = (c.tel || '').replace(/[^\d+]/g, '')
  const email = (c.email || '').trim()

  const boutons = [
    tel && `<a class="fiche-btn" href="tel:${esc(tel)}">${ICONS.phone}Appeler</a>`,
    email && `<a class="fiche-btn" href="mailto:${esc(email)}">${ICONS.mail}Écrire</a>`,
    adresse &&
      `<a class="fiche-btn" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adresse)}" target="_blank" rel="noopener">${ICONS.pin}Itinéraire</a>`,
    `<button type="button" class="fiche-btn" data-act="copier-contact">${ICONS.note}Copier</button>`,
  ]
    .filter(Boolean)
    .join('')

  const coord = [
    ['Adresse', c.adresse],
    ['NPA / Lieu', c.npaLieu],
    ['Email', c.email],
    ['Téléphone', c.tel],
  ].filter(([, v]) => (v || '').trim())

  const bilan = rapports.length
    ? `${rapports.length} rapport${rapports.length > 1 ? 's' : ''} · dernier le ${leJour(rapports[0].updatedAt)}`
    : 'Aucun rapport pour l’instant'

  return `
    <header class="top editor-top">
      <button class="icon-btn back" data-act="open-contacts">‹</button>
      <div class="top-title">
        <h1>Fiche client</h1>
        <p class="muted">${esc(mandantTypeLabel(c.type) || 'Carnet')}</p>
      </div>
    </header>
    <section class="pad">
      <div class="card fiche-tete">
        <span class="contact-avatar t-${c.type || 'aucun'}">${esc(initiales(c))}</span>
        <div class="fiche-ident">
          <strong class="fiche-nom">${esc(fullName(c) || 'Sans nom')}</strong>
          <span class="muted small">${esc(bilan)}</span>
        </div>
      </div>
      <div class="fiche-actions">${boutons}</div>

      <h2 class="section-title">
        <span class="section-title-main">${sectionIcon('person', 'amber')}Coordonnées</span>
        <span class="section-title-trailer"><button class="link" data-act="modifier-contact">Modifier</button></span>
      </h2>
      <div class="card fiche-coord">
        ${
          coord.length
            ? coord.map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join('')
            : '<p class="muted small">Aucune coordonnée enregistrée. « Modifier » pour les compléter.</p>'
        }
      </div>

      <h2 class="section-title"><span class="section-title-main">${sectionIcon('plus', 'accent')}Nouveau rapport pour ce client</span></h2>
      <div class="type-chips">${TYPE_LIST.map(
        (t) => `
        <button type="button" class="type-chip card-${t.id}" data-new-pour="${t.id}">
          <span class="type-chip-icon icon-${t.id}">${ICONS[t.id] ?? ''}</span>
          <span class="type-chip-name">${esc(t.choix)}</span>
        </button>`
      ).join('')}</div>

      <h2 class="section-title">
        <span class="section-title-main">${sectionIcon('folder', 'neutral')}Historique</span>
        ${rapports.length ? `<span class="count-pill"><b>${rapports.length}</b></span>` : ''}
      </h2>
      <ul class="report-list">${
        rapports.length
          ? rapports.map((r) => reportRowHTML(r, { suppr: false })).join('')
          : '<li class="empty">Les rapports faits pour ce client apparaîtront ici.</li>'
      }</ul>
    </section>`
}
