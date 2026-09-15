// Ecran d'accueil : le poste de travail du technicien.
//
// Il repond, dans cet ordre, a ce qu'on vient chercher en ouvrant l'app sur le
// terrain : ou j'en suis (le prochain rendez-vous, ce qui reclame un geste), je
// commence (le choix du lieu), je continue (les rapports en cours), ou va la
// journee (mes rendez-vous du jour), je cherche (les archives). Le planning de
// l'equipe et l'administration vivent dans le Bureau.
//
// La photo des chiens tient le haut de l'ecran, nette et en entier : c'est
// l'identite de la maison. Elle se fond dans la nuit du poste de controle, ou
// se lit le prochain rendez-vous. Le reste se pose sur le papier, sans rien de
// flou ni de transparent derriere ce qu'on lit.

import { TYPE_LIST, typeOf } from '../templates.js'
import * as S from '../state.js'
import { fullName } from '../state.js'
import { esc } from '../ui/dom.js'
import { estAdmin, identite } from '../lock.js'
import { derniereSauvegarde } from '../sauvegarde.js'
import { ICONS } from '../ui/icons.js'
import { ILLUSTRATIONS } from '../ui/illustrations.js'
import { ICONES_3D } from '../ui/icones3d.js'
import { LIGNES_FLAIR } from '../ui/motifs.js'
import { rdvAccueilHTML } from './agenda.js'
import { aVenir, estFait, libelleJour, nomClient, adresseRdv, aMoi } from '../agenda-outils.js'
import { echecsARegarder, journalVu, incidentsNouveaux, incidentsVus } from '../equipe-alertes.js'

// Nombre de rapports montres tant qu'on n'a pas demande a tout voir : de quoi
// retrouver ce qu'on vient de faire sans derouler des mois d'archives.
const APERCU = 3

// "Rapport de détection" -> "Détection" : seule la nature du rapport distingue
// les filtres. Les tuiles de choix, elles, portent un nom plus parlant (voir
// `choix` dans templates.js) - trop long pour une puce de filtre.
const shortLabel = (t) => {
  const s = t.label.replace(/^Rapport (de |d'|d’)/i, '')
  return s[0].toUpperCase() + s.slice(1)
}

// Les filtres : les trois types, plus ce qui est fini - c'est ainsi qu'on
// cherche un rapport ("le rapport d'immeuble de mardi", "celui que j'ai deja
// rendu"), pas en se souvenant d'un dossier ou il serait range.
const FILTERS = [
  { key: 'tous', label: 'Tous', match: () => true },
  ...TYPE_LIST.map((t) => ({ key: t.id, label: shortLabel(t), match: (r) => r.type === t.id })),
  { key: 'termines', label: 'Terminés', match: (r) => S.estTermine(r) },
]

/**
 * Quand le rapport a ete touche pour la derniere fois. Une date absolue plutot
 * qu'un "il y a trois jours" : on retrouve un rapport par le jour ou l'on y
 * etait, pas par le temps ecoule depuis.
 */
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

function quand(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const jour = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const ecart = Math.round((jour(new Date()) - jour(d)) / 86400000)
  if (ecart <= 0) return "aujourd'hui"
  if (ecart === 1) return 'hier'
  if (ecart < 7) return JOURS[d.getDay()]
  const deux = (n) => String(n).padStart(2, '0')
  const court = `${deux(d.getDate())}.${deux(d.getMonth() + 1)}`
  return d.getFullYear() === new Date().getFullYear() ? court : `${court}.${d.getFullYear()}`
}

/**
 * L'etat d'un rapport, tel qu'on le dit. Un rapport rouvert apres un envoi n'est
 * plus "en cours" comme un autre : il a deja ete remis une fois, et devra
 * repartir.
 */
export function etatRapport(r) {
  if (r.status === 'sent') return { cle: 'sent', mot: 'Envoyé' }
  if (r.status === 'done') return { cle: 'done', mot: 'Terminé' }
  if (r.status === 'queued') return { cle: 'queued', mot: 'En attente' }
  // Le rapport d'un invite, chez l'administrateur qui le relit.
  if (r.status === 'validation') return { cle: 'queued', mot: 'À valider' }
  // Refuse par l'administrateur, et revenu en cours de saisie.
  if (r.refus) return { cle: 'off', mot: 'Refusé' }
  if (r.sentAt) return { cle: 'amodifier', mot: 'Rouvert' }
  return { cle: 'encours', mot: 'En cours' }
}

/** L'adresse d'intervention, quelle que soit la forme du rapport. */
const lieuDe = (r) => r.lieu?.adresseIntervention || [r.lieu?.adresse, r.lieu?.npaLieu].filter(Boolean).join(', ')

/**
 * Une ligne de la liste des rapports : un document. En tete son numero, sa date
 * et son etat ; puis ce qui l'identifie - le locataire, le mandant, l'adresse,
 * et le numero en dernier recours ; enfin le lieu.
 */
export function reportRowHTML(r, { suppr = true } = {}) {
  const t = typeOf(r)
  const ou = lieuDe(r)
  const qui = r.lieu?.locataire || fullName(r.mandant) || ou || `Rapport ${r.ref}`
  const etat = etatRapport(r)
  return `
    <li class="rapport-ligne dossier-ligne t-${t.id}${S.estTermine(r) ? ' fini' : ''}" data-open="${r.id}">
      <span class="rapport-type icon-${t.id}">${ICONS[t.id] ?? ''}</span>
      <span class="rapport-corps">
        <span class="rapport-meta">
          <span class="mono">${esc(r.ref ?? '')}</span>
          <span class="rapport-quand">${esc(quand(r.updatedAt))}</span>
          <span class="pill ${etat.cle}">${esc(etat.mot)}</span>
        </span>
        <span class="rapport-nom">${esc(qui)}</span>
        ${ou && ou !== qui ? `<span class="rapport-detail">${esc(ou)}</span>` : ''}
      </span>
      ${
        suppr
          ? `<button class="icon-btn rapport-suppr" data-del="${r.id}" title="Supprimer" aria-label="Supprimer le rapport ${esc(r.ref ?? '')}">${ICONS.poubelle}</button>`
          : `<span class="rapport-go" aria-hidden="true">${ICONS.chevron}</span>`
      }
    </li>`
}

// --- je continue ? ---------------------------------------------------------

// Nombre de brouillons montres en tete. Trois : de quoi couvrir une tournee en
// cours sans transformer la rubrique en seconde liste.
const EN_COURS = 3

/**
 * Les rapports encore ouverts, en dossiers : le numero, le type, le client en
 * grand, le lieu, et ou en est la visite - les pieces deja tranchees sur
 * l'ensemble (voir resumeDe dans state.js).
 */
function enCoursHTML(reports) {
  const tous = reports.filter(S.enCours)
  const brouillons = tous.slice(0, EN_COURS)
  if (!brouillons.length) return ''
  const carte = (r) => {
    const t = typeOf(r)
    const qui = r.lieu?.locataire || fullName(r.mandant) || `Rapport ${r.ref}`
    const ou = lieuDe(r)
    const av = r.avancement
    const part = av?.total ? Math.round((av.fait / av.total) * 100) : 0
    return `
    <button type="button" class="dossier t-${t.id}" data-open="${r.id}">
      <span class="dossier-tete">
        <span class="dossier-ref">${esc(r.ref ?? '')}</span>
        <span class="dossier-type">${ICONS[t.id] ?? ''}${esc(shortLabel(t))}</span>
        <span class="dossier-quand">${esc(quand(r.updatedAt))}</span>
      </span>
      <span class="dossier-nom">${esc(qui)}</span>
      <span class="dossier-lieu">${esc(ou || 'Adresse à renseigner')}</span>
      <span class="dossier-go" aria-hidden="true">${ICONS.suivant}</span>
      ${
        av?.total
          ? `<span class="dossier-avancement">
               <span class="barre" role="progressbar" aria-valuenow="${part}" aria-valuemin="0" aria-valuemax="100"><span style="--p:${part}%"></span></span>
               <span class="dossier-compte">${av.fait}/${av.total} ${esc(av.total > 1 ? t.rowLabelPlural : t.rowLabel)}</span>
             </span>`
          : ''
      }
    </button>`
  }
  return `
    <h2 class="section-title">
      <span class="section-title-main">En cours</span>
      ${tous.length > 1 ? `<span class="count-pill"><b>${tous.length}</b></span>` : ''}
    </h2>
    <div class="lead-list">${brouillons.map(carte).join('')}</div>`
}

// --- je commence ? ---------------------------------------------------------

// Les trois types pesent autant les uns que les autres - immeubles et hotels
// reviennent au moins aussi souvent qu'un particulier. Trois tuiles egales,
// chacune pleine de sa couleur, chacune avec son illustration.
export function tuilesTypesHTML({ attr = 'data-new' } = {}) {
  return TYPE_LIST.map(
    (t) => `
    <button type="button" class="type-tuile card-${t.id}" ${attr}="${t.id}" aria-label="Nouveau rapport : ${esc(t.choix)}">
      <span class="type-tuile-plus" aria-hidden="true">${ICONS.ajout}</span>
      <span class="type-tuile-illu">${ILLUSTRATIONS[t.id] ?? ICONS[t.id] ?? ''}</span>
      <span class="type-tuile-nom">${esc(t.choix)}</span>
    </button>`
  ).join('')
}

function nouveauHTML() {
  return `
    <div class="bloc-tete">
      <h2 class="bloc-titre">Nouveau rapport</h2>
    </div>
    <div class="types-pleins">${tuilesTypesHTML()}</div>`
}

// --- je cherche ? ----------------------------------------------------------

// Un filtre ne s'affiche que s'il a de quoi montrer ; et la barre entiere
// disparait quand il ne resterait qu'un seul choix a cote de "Tous".
function filterBarHTML(reports, active) {
  const shown = FILTERS.filter((f) => f.key === 'tous' || reports.some(f.match))
  if (shown.length < 3) return ''
  return `<div class="report-filters">${shown
    .map(
      (f) => `<button type="button" class="chip chip-sm type-${f.key}${f.key === active ? ' on' : ''}" data-filter="${f.key}">
        ${esc(f.label)}<span class="chip-count">${reports.filter(f.match).length}</span>
      </button>`
    )
    .join('')}</div>`
}

/** Le champ de recherche, au-dela d'une poignee de rapports. */
function rechercheHTML(recherche) {
  return `
    <div class="recherche">
      <span class="recherche-loupe">${ICONS.loupe}</span>
      <input data-recherche type="search" value="${esc(recherche)}" enterkeyhint="search"
             autocapitalize="none" autocorrect="off" spellcheck="false"
             aria-label="Rechercher un rapport"
             placeholder="Nom, adresse ou n° de rapport" />
    </div>`
}

function mesRapportsHTML(view) {
  const reports = view.reports
  const recherche = (view.recherche ?? '').trim()
  const tout = view.reportsOpen || !!recherche
  const filter = FILTERS.find((f) => f.key === view.filter && (f.key === 'tous' || reports.some(f.match))) ?? FILTERS[0]
  return `
    <h2 class="section-title">
      <span class="section-title-main">Mes rapports</span>
      <span class="section-title-trailer">
        <span class="count-pill"><b>${reports.length}</b> gardé${reports.length > 1 ? 's' : ''}</span>
        ${reports.length > APERCU ? `<button class="link" data-toggle-reports>${tout ? 'Réduire' : 'Tout voir'}</button>` : ''}
      </span>
    </h2>
    ${reports.length > APERCU ? rechercheHTML(view.recherche ?? '') : ''}
    ${tout && !recherche ? filterBarHTML(reports, filter.key) : ''}
    ${listeRapportsHTML(view)}`
}

/**
 * La seule liste, calculee a part : la recherche la redessine a chaque frappe
 * sans toucher au reste de l'ecran, sinon le champ perdrait le curseur.
 */
export function listeRapportsHTML(view) {
  const reports = view.reports ?? []
  const recherche = (view.recherche ?? '').trim()
  const tout = view.reportsOpen || !!recherche
  const filter = FILTERS.find((f) => f.key === view.filter && (f.key === 'tous' || reports.some(f.match))) ?? FILTERS[0]
  // L'apercu ne repete pas les brouillons deja poses en tete d'ecran.
  const enTete = new Set(reports.filter(S.enCours).slice(0, EN_COURS).map((r) => r.id))
  const listed = recherche
    ? reports.filter((r) => S.matchRapport(r, recherche))
    : tout
      ? reports.filter(filter.match)
      : reports.filter((r) => !enTete.has(r.id)).slice(0, APERCU)
  const items = listed.length
    ? listed.map((r) => reportRowHTML(r)).join('')
    : `<li class="empty">${
        recherche
          ? `Aucun rapport ne correspond à « ${esc(recherche)} ».`
          : reports.length
            ? 'Aucun rapport dans cette sélection.'
            : 'Vos rapports apparaîtront ici. Commencez par choisir un lieu ci-dessus.'
      }</li>`
  const reste = reports.length - listed.length - (tout ? 0 : enTete.size)
  return `<ul class="report-list">${items}</ul>
    ${!tout && reste > 0 ? `<button class="btn ghost wide" data-toggle-reports>${reste > 1 ? `Voir les ${reste} autres` : 'Voir le dernier'}</button>` : ''}`
}

// --- ou j'en suis ? --------------------------------------------------------

// Qui tient le telephone : l'administrateur ou un employe, et lequel. Discret,
// mais visible a chaque ouverture - un telephone prete entre deux techniciens
// ne doit pas envoyer des rapports au nom du mauvais.
function sessionHTML() {
  const ident = identite()
  if (!ident) return ''
  const invite = ident.role === 'invite'
  const jusqua =
    invite && ident.fin ? ` · jusqu'au ${new Date(ident.fin).toLocaleDateString('fr-CH', { day: 'numeric', month: 'long' })}` : ''
  const texte = ident.role === 'admin' ? (ident.id ? `${ident.nom} · admin` : 'Administrateur') : invite ? `Invité · ${ident.nom}${jusqua}` : ident.nom
  return `<span class="poste-session ${ident.role}">${esc(texte)}</span>`
}

// --- ou je vais ? ----------------------------------------------------------

/**
 * L'outil du poste : le prochain rendez-vous, et les trois gestes qu'on fait en
 * montant dans la voiture - l'itineraire, l'appel au client, le rapport. Le sien
 * seulement : ceux de l'equipe se lisent dans le planning du Bureau. Rien tant
 * que l'agenda n'a jamais ete lu (premiere ouverture hors ligne) : un "rien de
 * prevu" y serait un mensonge.
 */
export function prochainHTML(view) {
  const a = view.agenda
  if (!a) return ''
  const jour = S.todayISO()
  const suivants = aVenir(a.rdvs ?? [], jour).filter((r) => !estFait(r))
  const r = suivants.find(aMoi(a)) ?? null
  const titre = `<span class="prochain-titre">${ICONS.horloge}Prochain rendez-vous</span>`

  if (!r) {
    return `
      <div class="prochain vide">
        ${titre}
        <p class="prochain-rien">Rien de prévu pour l’instant.</p>
        ${a.role === 'invite' ? '' : `<button type="button" class="prochain-btn" data-act="ajouter-rdv">${ICONS.ajout}Planifier</button>`}
      </div>`
  }

  const ou = adresseRdv(r)
  const tel = (r.client?.tel ?? '').replace(/[^\d+]/g, '')
  const pourAutre = r.pour?.id && r.pour.id !== a.moi?.id && r.pour.nom ? ` · ${r.pour.nom}` : ''
  const itineraire = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(ou)}`
  return `
    <div class="prochain">
      ${titre}
      <button type="button" class="prochain-fiche" data-rdv="${esc(r.id)}" aria-label="Voir le rendez-vous">
        <span class="prochain-quand">
          <b class="prochain-heure">${r.heure ? esc(r.heure) : '—'}</b>
          <span class="prochain-jour">${esc(libelleJour(r.date, jour))}</span>
        </span>
        <span class="prochain-corps">
          <span class="prochain-nom">${esc(nomClient(r.client) || 'Client')}</span>
          <span class="prochain-ou">${esc((ou || 'Adresse à renseigner') + pourAutre)}</span>
        </span>
        <span class="prochain-go" aria-hidden="true">${ICONS.chevron}</span>
      </button>
      <div class="prochain-gestes">
        ${ou ? `<a class="prochain-btn" href="${esc(itineraire)}" target="_blank" rel="noopener">${ICONS.pin}Itinéraire</a>` : ''}
        ${tel ? `<a class="prochain-btn" href="tel:${esc(tel)}">${ICONS.phone}Appeler</a>` : ''}
        <button type="button" class="prochain-btn principal" data-rdv-commencer="${esc(r.id)}">${ICONS.suivant}${r.rapportId ? 'Reprendre' : 'Commencer'}</button>
      </div>
    </div>`
}

/**
 * Ce qui reclame un geste sur cet appareil, et rien d'autre : la memoire qui se
 * remplit, la sauvegarde en retard. Les envois ont leur pastille sur le dock ;
 * ce que l'equipe attend de l'administrateur, la sienne sur le bouton du Bureau.
 */
export function alertesHTML(view) {
  // Le rappel de sauvegarde n'a de sens que si l'appareil porte quelque chose a
  // perdre, et que la sauvegarde en ligne n'a pas pu passer depuis une semaine.
  const jours = S.backupAge()
  const enLigneRecente = Date.now() - derniereSauvegarde() < 7 * 86_400_000
  const sauvegardeEnRetard = view.reports.length > 0 && !enLigneRecente && (jours === null || jours > 30)
  const memoirePleine = (view.stockage?.part ?? 0) > S.STOCKAGE_ALERTE
  const alertes = [memoirePleine && 'Mémoire presque pleine', sauvegardeEnRetard && 'Sauvegarde à faire'].filter(Boolean)
  if (!alertes.length) return ''
  return `<div class="poste-alertes">${alertes
    .map((t) => `<button type="button" class="poste-alerte alerte" data-act="open-reglages">${esc(t)}</button>`)
    .join('')}</div>`
}

/**
 * Le passage au Bureau, pour l'administrateur, et ce que l'equipe y attend de
 * lui : les rapports d'invites a relire, les envois rates et les incidents qu'il
 * n'a pas encore vus (voir src/equipe-alertes.js). Une seule pastille, qui ouvre
 * la page ou il y a quelque chose - le detail vit dans le menu du Bureau.
 */
export function bureauHTML(view) {
  if (!estAdmin()) return ''
  const aValider = view.admin?.validations?.length ?? 0
  const rates = echecsARegarder(view.admin?.journal, { vu: journalVu(), moi: identite()?.id ?? 'admin' }).length
  const incidents = incidentsNouveaux(view.admin?.incidents, { vu: incidentsVus() }).length
  const n = aValider + rates + incidents
  const page = aValider ? '#valider' : rates ? '#envois' : incidents ? '#incidents' : ''
  const compte = n ? `<b class="poste-bureau-compte${rates || incidents ? ' alerte' : ''}">${n}</b>` : ICONS.suivant
  return `<a class="poste-bureau" href="/bureau/${page}">${ICONES_3D.admin}<span>Bureau</span>${compte}</a>`
}

/**
 * Le poste de controle : qui tient le telephone, ou il va ensuite, et ce qui
 * reclame un geste. Les alertes ont leur zone : l'equipe se relit en ligne apres
 * l'affichage, et ce qu'elle apporte s'y pose sans redessiner l'accueil.
 *
 * Un administrateur y trouve, face a son nom, le passage au Bureau (voir
 * bureauHTML). Il a sa zone, comme les alertes : l'equipe se relit en ligne apres
 * l'affichage.
 */
function posteHTML(view) {
  return `
    <div class="poste reveal" style="--i:0">
      ${LIGNES_FLAIR}
      <div class="poste-tete">
        ${sessionHTML()}
        <span class="bureau-zone">${bureauHTML(view)}</span>
      </div>
      <div class="prochain-zone">${prochainHTML(view)}</div>
      <div class="alertes-zone">${alertesHTML(view)}</div>
    </div>`
}

export function homeView(view) {
  return `
    <div class="accueil">
      <div class="accueil-scene">
        <img class="accueil-photo" src="/hero-dog.webp" alt="" decoding="sync" fetchpriority="high" />
        <span class="accueil-voile" aria-hidden="true"></span>
        <header class="accueil-barre">
          <div class="marque">
            <span class="marque-nom">Atout Flair</span>
            <span class="marque-metier">Détection canine professionnelle</span>
          </div>
          <span class="accueil-portes">
            <button class="porte" data-act="open-reglages" title="Réglages" aria-label="Réglages">${ICONES_3D.reglages}</button>
          </span>
        </header>
      </div>
      ${posteHTML(view)}
      <section class="accueil-feuille">
        <div class="reveal bloc-nouveau" style="--i:1">${nouveauHTML()}</div>
        <div class="reveal" style="--i:2">${enCoursHTML(view.reports)}</div>
        <div class="reveal rdv-accueil-zone" style="--i:3">${rdvAccueilHTML(view)}</div>
        <div class="reveal" style="--i:4">${mesRapportsHTML(view)}</div>
      </section>
    </div>`
}
