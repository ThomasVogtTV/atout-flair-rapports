// Ecran d'accueil. Il repond, dans cet ordre, aux trois questions qu'on se pose
// en rouvrant l'app sur le terrain : je commence ? je continue ? je cherche ?
//
// "Nouveau rapport" passe devant "En cours" : neuf fois sur dix on ouvre l'app
// devant une porte, pour commencer une detection - reprendre un brouillon est
// l'exception, et elle reste a portee juste dessous.
//
// Il parle la meme langue que l'ecran de saisie : des rubriques (petite icone,
// intitule en capitales, filet qui file jusqu'au bord) plutot que des volets
// repliables qui n'existaient qu'ici. Une seule grammaire pour toute l'app.

import { TYPE_LIST, typeOf } from '../templates.js'
import * as S from '../state.js'
import { fullName } from '../state.js'
import { esc } from '../ui/dom.js'
import { estAdmin, estInvite, identite } from '../lock.js'
import { derniereSauvegarde } from '../sauvegarde.js'
import { ICONS, sectionIcon } from '../ui/icons.js'
import { ILLUSTRATIONS } from '../ui/illustrations.js'
import { ICONES_3D } from '../ui/icones3d.js'

// Nombre de rapports montres tant qu'on n'a pas demande a tout voir : de quoi
// retrouver ce qu'on vient de faire sans derouler des mois d'archives.
const APERCU = 3

// "Rapport de détection" -> "Détection" : le mot "rapport" est deja dans le
// titre de la rubrique, seule la nature du rapport distingue les filtres. Les
// grandes cartes du choix, elles, portent un nom plus parlant (voir `choix`
// dans templates.js) - trop long pour une puce de filtre ou une ligne de liste.
const shortLabel = (t) => {
  const s = t.label.replace(/^Rapport (de |d'|d’)/i, '')
  return s[0].toUpperCase() + s.slice(1)
}

// Les filtres : les trois types, plus ce qui est fini - c'est ainsi qu'on
// cherche un rapport ("le rapport d'immeuble de mardi", "celui que j'ai deja
// rendu"), pas en se souvenant d'un dossier ou il serait range.
//
// "Envoyés" ne repondait qu'a l'envoi automatique : un rapport remis a la main
// n'y entrait jamais, et le filtre restait vide sur un telephone qui avait
// pourtant rendu trente rapports.
const FILTERS = [
  { key: 'tous', label: 'Tous', match: () => true },
  ...TYPE_LIST.map((t) => ({ key: t.id, label: shortLabel(t), match: (r) => r.type === t.id })),
  { key: 'termines', label: 'Terminés', match: (r) => S.estTermine(r) },
]

/**
 * Quand le rapport a ete touche pour la derniere fois.
 *
 * La liste n'en disait rien : dix-sept lignes sans une date, ou l'on cherchait
 * "celui de mardi" en ouvrant les rapports un par un. Une date absolue plutot
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

// L'etat ne s'affiche que lorsqu'il apprend quelque chose. "Brouillon" est
// l'etat de presque tous les rapports : repete a chaque ligne, il occupait la
// meilleure place de la liste pour ne rien dire. Ce qui compte, c'est de voir
// d'un coup ce qui est deja parti.
const etatPill = (r) =>
  r.status === 'sent'
    ? `<span class="pill sent">Envoyé</span>`
    : r.status === 'done'
      ? `<span class="pill done">Terminé</span>`
      : r.status === 'queued'
        ? `<span class="pill queued">En attente</span>`
        : ''

/**
 * Une ligne de la liste des rapports.
 *
 * Elle affichait "Sans nom" en gros sur presque chaque ligne - le nom du
 * locataire manque tant que la saisie n'est pas faite - et reléguait le type en
 * gris dessous. La colonne la plus lisible ne portait donc rien, et la seule
 * chose qui distinguait deux rapports etait la plus pale.
 *
 * Le type passe en pastille a gauche, reconnaissable a son icone sans qu'on
 * lise ; le titre prend la premiere chose reellement identifiante - le
 * locataire, le mandant, l'adresse, et le numero de rapport en dernier recours.
 */
export function reportRowHTML(r, { suppr = true } = {}) {
  const t = typeOf(r)
  const ou = r.lieu?.adresseIntervention || r.lieu?.adresse || ''
  const qui = r.lieu?.locataire || fullName(r.mandant) || ou || `Rapport ${r.ref}`
  const detail = [ou === qui ? '' : ou, quand(r.updatedAt)].filter(Boolean).join(' · ')
  return `
    <li class="rapport-ligne${S.estTermine(r) ? ' fini' : ''}" data-open="${r.id}">
      <span class="rapport-type icon-${t.id}">${ICONS[t.id] ?? ''}</span>
      <span class="rapport-corps">
        <span class="rapport-nom">${esc(qui)}</span>
        <span class="rapport-detail">${esc(detail)}</span>
      </span>
      ${etatPill(r)}
      ${suppr ? `<button class="icon-btn rapport-suppr" data-del="${r.id}" title="Supprimer">✕</button>` : ''}
    </li>`
}

// --- je continue ? ---------------------------------------------------------

// Nombre de brouillons montres en tete. Trois : de quoi couvrir une tournee en
// cours sans transformer la rubrique en seconde liste.
const EN_COURS = 3

// Les rapports encore ouverts. Il n'en montrait qu'un - le plus recent - alors
// qu'une tournee en laisse volontiers trois derriere elle : les deux autres se
// retrouvaient noyes dans "Mes rapports", au milieu de ce qui est deja parti.
function enCoursHTML(reports) {
  const tous = reports.filter(S.enCours)
  const brouillons = tous.slice(0, EN_COURS)
  if (!brouillons.length) return ''
  // Meme silhouette et meme pastille que les lignes de "Mes rapports" : ce sont
  // les memes objets, ils ne se peignent pas de deux facons a dix centimetres
  // d'ecart. La pastille porte le type - maison, immeuble, lit - plutot qu'un
  // stylo repete trois fois : la rubrique dit deja qu'ils sont en cours, et le
  // type, lui, ne se lisait nulle part.
  const ligne = (r) => {
    const t = typeOf(r)
    const qui = r.lieu?.locataire || fullName(r.mandant) || `Rapport ${r.ref}`
    const ou = r.lieu?.adresseIntervention || r.lieu?.adresse || ''
    // Ou en est la visite : les pieces deja tranchees sur l'ensemble. Voir
    // resumeDe dans state.js.
    const av = r.avancement
    const progres = av?.total
      ? `<span class="lead-progres">
           <span class="lead-barre"><span style="--p:${Math.round((av.fait / av.total) * 100)}%"></span></span>
           <span class="lead-progres-txt">${av.fait}/${av.total} ${esc(t.rowLabel)}${av.total > 1 ? 's' : ''}</span>
         </span>`
      : ''
    return `
    <button type="button" class="lead-row" data-open="${r.id}">
      <span class="rapport-type icon-${t.id}">${ICONS[t.id] ?? ''}</span>
      <span class="lead-body">
        <span class="lead-name">${esc(qui)}</span>
        <span class="lead-where">${esc([ou, quand(r.updatedAt)].filter(Boolean).join(' · '))}</span>
        ${progres}
      </span>
      <span class="lead-go">${ICONS.chevron}</span>
    </button>`
  }
  return `
    <h2 class="section-title"><span class="section-title-main">${sectionIcon('note', 'accent')}En cours</span>
      ${tous.length > 1 ? `<span class="count-pill"><b>${tous.length}</b></span>` : ''}
    </h2>
    <div class="lead-list">${brouillons.map(ligne).join('')}</div>`
}

// --- je commence ? ---------------------------------------------------------

// Les trois types pesent autant les uns que les autres - immeubles et hotels
// reviennent au moins aussi souvent qu'un particulier. Trois tuiles egales,
// chacune pleine de sa couleur : petrole, ardoise, prune.
function nouveauHTML() {
  // L'illustration en 3D quand le type en a une, sinon son icone.
  const tuiles = TYPE_LIST.map(
    (t) => `
    <button type="button" class="type-tuile card-${t.id}" data-new="${t.id}">
      ${
        ILLUSTRATIONS[t.id]
          ? `<span class="type-tuile-illu">${ILLUSTRATIONS[t.id]}</span>`
          : `<span class="type-tuile-icone">${ICONS[t.id] ?? ''}</span>`
      }
      <span class="type-tuile-plus" aria-hidden="true">+</span>
      <span class="type-tuile-nom">${esc(t.choix)}</span>
    </button>`
  ).join('')

  return `
    <h2 class="section-title"><span class="section-title-main">${sectionIcon('plus', 'accent')}Nouveau rapport</span></h2>
    <div class="types-pleins">${tuiles}</div>`
}

// --- je cherche ? ----------------------------------------------------------

// Un filtre ne s'affiche que s'il a de quoi montrer ; et la barre entiere
// disparait quand il ne resterait qu'un seul choix a cote de "Tous".
function filterBarHTML(reports, active) {
  const shown = FILTERS.filter((f) => f.key === 'tous' || reports.some(f.match))
  if (shown.length < 3) return ''
  return `<div class="report-filters">${shown
    .map(
      (f) => `<button type="button" class="chip chip-sm${f.key === active ? ' on' : ''}" data-filter="${f.key}">
        ${esc(f.label)}<span class="chip-count">${reports.filter(f.match).length}</span>
      </button>`
    )
    .join('')}</div>`
}

/**
 * Le champ de recherche. Il n'apparait qu'au-dela d'une poignee de rapports :
 * une loupe sur une liste de trois lignes ne sert a rien qu'a l'encombrer.
 *
 * Les filtres ne trient que par type. Passe deux cents rapports, retrouver "la
 * regie du Lac, avenue de la Gare, en mars" demandait de tout derouler.
 */
function rechercheHTML(recherche) {
  return `
    <div class="recherche">
      <span class="recherche-loupe">${ICONS.loupe}</span>
      <input data-recherche type="search" value="${esc(recherche)}" enterkeyhint="search"
             autocapitalize="none" autocorrect="off" spellcheck="false"
             placeholder="Nom, adresse ou n° de rapport" />
    </div>`
}

function mesRapportsHTML(view) {
  const reports = view.reports
  const recherche = (view.recherche ?? '').trim()
  const tout = view.reportsOpen || !!recherche
  // Le filtre actif peut avoir perdu son dernier rapport (suppression, envoi) :
  // on retombe alors sur "Tous" plutot que d'afficher une liste vide inexplicable.
  const filter = FILTERS.find((f) => f.key === view.filter && (f.key === 'tous' || reports.some(f.match))) ?? FILTERS[0]
  // L'apercu ne repete pas les brouillons deja poses en tete d'ecran : le meme
  // rapport apparaissait deux fois, a deux centimetres d'intervalle. La liste
  // deroulee, elle, reste complete - c'est la liste, elle doit tout contenir.
  const enTete = new Set(reports.filter(S.enCours).slice(0, EN_COURS).map((r) => r.id))
  const apercu = reports.filter((r) => !enTete.has(r.id)).slice(0, APERCU)
  // Une recherche en cours cherche partout : elle ignore l'apercu, et elle
  // ignore le filtre de type, qui n'aurait plus de sens quand on tape une rue.
  const listed = recherche
    ? reports.filter((r) => S.matchRapport(r, recherche))
    : tout
      ? reports.filter(filter.match)
      : apercu
  const reste = reports.length - listed.length - (tout ? 0 : enTete.size)

  const items = listed.length
    ? listed.map(reportRowHTML).join('')
    : `<li class="empty">${
        recherche
          ? `Aucun rapport ne correspond à « ${esc(recherche)} ».`
          : reports.length
            ? 'Aucun rapport dans cette sélection.'
            : 'Créez un rapport ci-dessus, il apparaîtra ici.'
      }</li>`

  return `
    <h2 class="section-title"><span class="section-title-main">${sectionIcon('folder', 'neutral')}Mes rapports</span>
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
  const enTete = new Set(reports.filter(S.enCours).slice(0, EN_COURS).map((r) => r.id))
  const listed = recherche
    ? reports.filter((r) => S.matchRapport(r, recherche))
    : tout
      ? reports.filter(filter.match)
      : reports.filter((r) => !enTete.has(r.id)).slice(0, APERCU)
  const items = listed.length
    ? listed.map(reportRowHTML).join('')
    : `<li class="empty">${
        recherche
          ? `Aucun rapport ne correspond à « ${esc(recherche)} ».`
          : reports.length
            ? 'Aucun rapport dans cette sélection.'
            : 'Créez un rapport ci-dessus, il apparaîtra ici.'
      }</li>`
  // Le bouton fait partie de la liste : redessine avec elle, il ne reste pas
  // affiche pendant une recherche, qui montre deja tout ce qui correspond.
  const reste = reports.length - listed.length - (tout ? 0 : enTete.size)
  return `<ul class="report-list">${items}</ul>
    ${!tout && reste > 0 ? `<button class="btn ghost wide" data-toggle-reports>Voir les ${reste} autres</button>` : ''}`
}

/**
 * Le haut de l'accueil.
 *
 * Il portait une affiche : le nom de l'app en gros, deja ecrit dans la barre
 * juste au-dessus, et un slogan - "Saisie, photos, signature et envoi sur
 * place" - qu'on lit une fois et plus jamais. Cela coutait un tiers du premier
 * ecran avant le moindre travail.
 *
 * Il porte maintenant ce qu'on vient y chercher en ouvrant l'app le matin : le
 * jour, et ce qui reste sur les bras. La photo et la signature de la maison
 * restent - c'est l'identite - mais elles tiennent en moins de place.
 */
// Qui tient le telephone : l'administrateur ou un employe, et lequel. Discret,
// mais visible a chaque ouverture - un telephone prete ou echange entre deux
// techniciens ne doit pas envoyer des rapports au nom du mauvais. Rien tant que
// le serveur n'a pas encore dit qui est connecte.
function sessionHTML() {
  const ident = identite()
  if (!ident) return ''
  const admin = ident.role === 'admin'
  const invite = ident.role === 'invite'
  const jusqua = invite && ident.fin
    ? ` · jusqu'au ${new Date(ident.fin).toLocaleDateString('fr-CH', { day: 'numeric', month: 'long' })}`
    : ''
  const texte = admin
    ? 'Session administrateur'
    : invite
      ? `Session invité · ${ident.nom}${jusqua}`
      : `Session employé · ${ident.nom}`
  return `<span class="hero-session${admin ? ' admin' : invite ? ' invite' : ''}">${esc(texte)}</span>`
}

function heroHTML(view) {
  const maintenant = new Date()
  const jour = maintenant.toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long' })

  // Trois chiffres, ceux qu'on vient chercher le matin : ce qui reste sur les
  // bras, et ce que le mois a deja produit.
  const debutMois = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1).getTime()
  const brouillons = view.reports.filter(S.enCours).length
  const crees = view.reports.filter((r) => (r.createdAt ?? 0) >= debutMois).length
  const remis = view.reports.filter((r) => S.estTermine(r) && (r.sentAt ?? r.remisAt ?? r.updatedAt ?? 0) >= debutMois).length

  // Le rappel de sauvegarde n'a de sens que si l'appareil porte quelque chose a
  // perdre - et il doit apparaitre la ou l'on passe, pas seulement dans les
  // reglages, ou l'on ne va justement jamais.
  const jours = S.backupAge()
  // La sauvegarde en ligne, recente, suffit : le rappel ne sonne plus que si
  // elle n'a pas pu passer depuis une semaine.
  const enLigneRecente = Date.now() - derniereSauvegarde() < 7 * 86_400_000
  const sauvegardeEnRetard = view.reports.length > 0 && !enLigneRecente && (jours === null || jours > 30)
  // La place restante ne s'annonce qu'au moment ou elle devient un probleme :
  // une jauge permanente sur l'accueil serait du bruit trois cent jours par an.
  const memoirePleine = (view.stockage?.part ?? 0) > S.STOCKAGE_ALERTE
  // Seul ce qui reclame un geste porte la couleur d'alerte.
  const alertes = [
    view.enEchec && { t: `${view.enEchec} envoi${view.enEchec > 1 ? 's' : ''} à corriger`, alerte: true },
    !view.enEchec && view.enAttente && { t: `${view.enAttente} envoi${view.enAttente > 1 ? 's' : ''} en attente` },
    memoirePleine && { t: 'Mémoire presque pleine', alerte: true },
    sauvegardeEnRetard && { t: 'Sauvegarde à faire', alerte: true },
  ].filter(Boolean)

  const tuile = (n, libelle, classe = '') => `<div class="hero-stat${classe}"><b>${n}</b><span>${libelle}</span></div>`
  return `
    <div class="hero-caption reveal" style="--i:0">
      <span class="hero-kicker">Détection canine professionnelle</span>
      <h2>${esc(jour[0].toUpperCase() + jour.slice(1))}</h2>
      ${sessionHTML()}
    </div>
    <div class="hero-stats reveal" style="--i:1">
      ${tuile(brouillons, 'en cours', brouillons ? ' vif' : '')}
      ${tuile(crees, 'créés ce mois')}
      ${tuile(remis, 'remis ce mois')}
    </div>
    ${
      alertes.length
        ? `<div class="hero-alertes reveal" style="--i:1">${alertes
            .map((m) => `<span class="hero-alerte-chip${m.alerte ? ' alerte' : ''}">${esc(m.t)}</span>`)
            .join('')}</div>`
        : ''
    }`
}

// Une icone de l'en-tete, dessinee pour l'app (voir ui/icones3d.js).
const icone3d = (nom) => ICONES_3D[nom]

export function homeView(view) {
  return `
    <header class="top">
      <img src="/logo.jpg" alt="Atout Flair" class="logo" />
      <div class="top-title">
        <h1>Atout Flair</h1>
      </div>
      <!-- Icones dessinees pour l'app, dans l'ordre voulu par Thomas :
           carnet, envois, administration, reglages. -->
      <span class="top-actions">
        ${
          // Pas de carnet pour un invite : la liste des clients reste a l'entreprise.
          estInvite()
            ? ''
            : `<button class="icon-btn contacts-toggle icone-3d" data-act="open-contacts" title="Carnet">${icone3d('carnet')}</button>`
        }
        <button class="icon-btn envois-toggle icone-3d${view.enEchec ? ' en-echec' : ''}" data-act="open-envois"
                data-compte="${view.enEchec || view.enAttente || ''}" title="Envois">${icone3d('envois')}</button>
        ${
          estAdmin()
            ? `<button class="icon-btn contacts-toggle icone-3d" data-act="open-admin" title="Administration">${icone3d('admin')}</button>`
            : ''
        }
        <button class="icon-btn contacts-toggle icone-3d" data-act="open-reglages" title="Réglages">${icone3d('reglages')}</button>
      </span>
    </header>
    ${heroHTML(view)}
    <section class="content-sheet">
      <div class="reveal" style="--i:2">${nouveauHTML()}</div>
      <div class="reveal" style="--i:3">${enCoursHTML(view.reports)}</div>
      <div class="reveal" style="--i:4">${mesRapportsHTML(view)}</div>
    </section>`
}
