// Le tableau de l'administrateur, sur l'accueil, sous les rapports en cours :
// le travail a lancer ou a reprendre passe avant la carte. Reserve a l'admin : un
// technicien a son agenda, il n'a pas a savoir depuis son accueil ce que fait
// le voisin.
//
// Il ne repond qu'a deux questions, celles qu'on se pose le matin quand on tient
// la boite : "qui est ou aujourd'hui ?" - la tournee de chacun, et l'itineraire
// complet en un tap vers les cartes du telephone - et "qui a ouvert l'app, et
// qu'est-ce qui a casse ?".
//
// "Vu" n'est pas une presence : c'est la derniere fois que le serveur a verifie
// le code de la personne (ouverture de l'app avec du reseau) ou recu un envoi
// d'elle. L'app ne tient aucun lien ouvert avec le serveur, et le tableau ne
// pretend donc pas dire qui est connecte a la seconde.
//
// Il defile dans sa propre fenetre : l'equipe peut grandir sans que le tableau
// repousse le reste de l'accueil hors de l'ecran.

import { esc } from '../ui/dom.js'
import { ICONS } from '../ui/icons.js'
import { estAdmin } from '../lock.js'
import { todayISO } from '../state.js'
import { adresseRdv, nomClient, trierRdv, estAnnule, estFait, tonPersonne, aVenir, libelleJour } from '../agenda-outils.js'
import { ilYA } from './envois.js'

// Les envois refuses montres ici. Au-dela, ce n'est plus une nouvelle du jour :
// c'est le journal, dans l'onglet Administration.
const INCIDENTS = 3

// La carte integree parle adresses, pas coordonnees : c'est pour cela qu'elle
// peut se passer d'un geocodage, l'app n'ayant jamais que du texte. La cle est
// posee dans Vercel (VITE_GOOGLE_MAPS_KEY) et se retrouve donc dans le code
// envoye au navigateur : elle doit etre restreinte au domaine du site, sinon
// n'importe qui peut la depenser. Sans cle, le tableau garde sa liste.
const CLE_CARTE = import.meta.env.VITE_GOOGLE_MAPS_KEY ?? ''

// Une tournee raisonnable tient dans une poignee d'etapes ; au-dela, l'adresse
// de la carte devient trop longue pour tenir.
const ETAPES_MAX = 8

// La maison, quand il n'y a rien d'autre a montrer. Recopiee du pied de page des
// rapports (FOOTER_LINE1 dans src/pdf.js) au lieu d'etre importee : pdf.js tire
// le moteur PDF avec lui, 440 Ko qui n'ont rien a faire sur l'accueil.
const BASE = 'Rue des Fontaines 6, 1423 Vaugondry'

const url = encodeURIComponent
const lienCarte = (adresse) => `https://www.google.com/maps/search/?api=1&query=${url(adresse)}`

/**
 * La carte, telle que Google l'integre : le trajet trace d'un arret a l'autre.
 * A un seul arret elle se contente de le montrer - un trajet d'un point a
 * lui-meme n'aurait rien a dessiner - et sans aucun arret elle se pose sur la
 * maison. Elle ne disparait jamais : une fenetre presente un jour sur deux ne
 * se lit plus, on cesse de la regarder.
 */
function carteHTML(arrets) {
  if (!CLE_CARTE) return `<p class="tableau-note">Carte : clé Google Maps non configurée.</p>`
  if (!navigator.onLine) return `<p class="tableau-note">Carte indisponible hors ligne.</p>`
  const ou = arrets.map(adresseRdv).filter(Boolean)
  const src =
    ou.length > 1
      ? (() => {
          const etapes = ou.slice(1, -1).slice(0, ETAPES_MAX)
          return `https://www.google.com/maps/embed/v1/directions?key=${CLE_CARTE}&mode=driving&origin=${url(
            ou[0]
          )}&destination=${url(ou[ou.length - 1])}${etapes.length ? `&waypoints=${etapes.map(url).join('%7C')}` : ''}`
        })()
      : `https://www.google.com/maps/embed/v1/place?key=${CLE_CARTE}&q=${url(ou[0] ?? BASE)}&zoom=${ou.length ? 14 : 11}`
  return `
    <div class="carte">
      <iframe src="${esc(src)}" title="Carte de la tournée du jour" loading="lazy"
              referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>
    </div>`
}

// L'itineraire part sans origine : les cartes le tracent depuis la position du
// moment, ce qu'on veut en montant dans la voiture - pas un trajet depuis un
// bureau ou personne ne se trouve.
function lienItineraire(arrets) {
  const ou = arrets.map(adresseRdv).filter(Boolean)
  if (!ou.length) return ''
  const etapes = ou.slice(0, -1).map(encodeURIComponent).join('%7C')
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(ou[ou.length - 1])}${
    etapes ? `&waypoints=${etapes}` : ''
  }`
}

function arretHTML(r) {
  const ou = adresseRdv(r)
  const dedans = `
    <b class="arret-heure">${r.heure ? esc(r.heure) : '—'}</b>
    <span class="arret-corps">
      <span class="arret-qui">${esc(nomClient(r.client) || 'Client')}</span>
      <span class="arret-ou">${esc(ou || 'Adresse à renseigner')}</span>
    </span>
    ${estFait(r) ? '<span class="arret-fait">Fait</span>' : ou ? `<span class="arret-pin" aria-hidden="true">${ICONS.pin}</span>` : ''}`
  if (!ou) return `<li class="arret sans-lieu"><span class="arret-dedans">${dedans}</span></li>`
  return `
    <li class="arret">
      <a class="arret-dedans" href="${esc(lienCarte(ou))}" target="_blank" rel="noopener"
         aria-label="Ouvrir ${esc(ou)} dans les cartes">${dedans}</a>
    </li>`
}

/** Les rendez-vous du jour, par personne : c'est ainsi qu'on repartit une journee. */
function tourneeHTML(view) {
  const jour = todayISO()
  const tous = view.agenda?.rdvs ?? []
  const duJour = trierRdv(tous.filter((r) => r.date === jour && !estAnnule(r)))

  // Journee vide : la carte reste, posee sur le prochain rendez-vous, ou sur la
  // maison quand l'agenda ne dit plus rien.
  if (!duJour.length) {
    const prochain = aVenir(tous, jour)[0]
    return `
      ${carteHTML(prochain ? [prochain] : [])}
      <p class="tableau-vide">${
        prochain
          ? `Rien aujourd’hui. Prochain : ${esc(libelleJour(prochain.date, jour).toLowerCase())}, ${esc(
              nomClient(prochain.client) || 'client'
            )}.`
          : 'Aucun rendez-vous à venir.'
      }</p>`
  }

  const parPersonne = new Map()
  for (const r of duJour) {
    const cle = r.pour?.id ?? 'sans'
    if (!parPersonne.has(cle)) parPersonne.set(cle, { cle, id: r.pour?.id, nom: r.pour?.nom || 'Non attribué', arrets: [] })
    parPersonne.get(cle).arrets.push(r)
  }
  const gens = [...parPersonne.values()]
  // Une tournee a la fois : deux techniciens sur un meme trait donneraient un
  // trajet que personne ne fait.
  const choisi = parPersonne.get(view.tableauQui) ?? gens[0]

  const onglets =
    gens.length < 2
      ? ''
      : `<div class="tournee-gens">${gens
          .map(
            (p) => `<button type="button" class="tournee-onglet ton-${tonPersonne(p.id)}${
              p.cle === choisi.cle ? ' on' : ''
            }" data-tableau-qui="${esc(p.cle)}">${esc(p.nom)}<i>${p.arrets.length}</i></button>`
          )
          .join('')}</div>`

  const route = lienItineraire(choisi.arrets)
  const n = choisi.arrets.length
  return `
    ${onglets}
    ${carteHTML(choisi.arrets)}
    <div class="tournee-tete">
      <span class="tournee-qui ton-${tonPersonne(choisi.id)}">${esc(choisi.nom)}</span>
      <span class="tournee-compte">${n} arrêt${n > 1 ? 's' : ''}</span>
      ${route ? `<a class="tournee-route" href="${esc(route)}" target="_blank" rel="noopener">${ICONS.pin}Itinéraire</a>` : ''}
    </div>
    <ol class="arrets">${choisi.arrets.map(arretHTML).join('')}</ol>`
}

/** Qui a ouvert l'app, du plus recent au plus ancien, et ce qui a echoue. */
function equipeHTML(view) {
  const a = view.admin
  if (!a || a.chargement) return `<p class="tableau-vide">Lecture de l’équipe…</p>`
  if (a.erreur) return `<p class="tableau-vide">${esc(a.erreur)}</p>`

  const gens = [
    { id: 'admin', nom: 'Administrateur', vu: a.admin?.vu ?? null },
    ...(a.employes ?? []).filter((e) => e.actif && !e.expire),
  ].sort((x, y) => (y.vu ?? 0) - (x.vu ?? 0))

  const equipiers = gens
    .map(
      (p) => `
      <li class="equipier">
        <span class="equipier-pastille ton-${tonPersonne(p.id)}" aria-hidden="true"></span>
        <span class="equipier-nom">${esc(p.nom)}</span>
        <span class="equipier-vu">${p.vu ? esc(ilYA(p.vu)) : 'jamais ouvert'}</span>
      </li>`
    )
    .join('')

  const rates = (a.journal ?? []).filter((j) => j.statut === 'echec').slice(0, INCIDENTS)
  const incidents = rates.length
    ? `<ul class="incidents">${rates
        .map(
          (j) => `
          <li class="incident">
            <span class="incident-tete">${ICONS.alerte}<b>${esc(j.ref || 'Rapport')}</b><i>${esc(ilYA(j.date))}</i></span>
            <span class="incident-motif">${esc(j.erreur || 'Envoi refusé')}</span>
          </li>`
        )
        .join('')}</ul>`
    : ''

  return `<ul class="equipiers">${equipiers}</ul>${incidents}`
}

export function tableauAdminHTML(view) {
  if (!estAdmin()) return ''
  return `
    <section class="tableau" aria-label="Tableau de l’équipe">
      <div class="tableau-defile">
        <div class="tableau-bloc">
          <h3 class="tableau-titre">${ICONS.pin}Tournée du jour</h3>
          ${tourneeHTML(view)}
        </div>
        <div class="tableau-bloc">
          <h3 class="tableau-titre">${ICONS.collab}L’équipe</h3>
          ${equipeHTML(view)}
        </div>
      </div>
    </section>`
}
