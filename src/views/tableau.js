// Le tableau de l'administrateur, sur l'accueil, sous les rapports en cours :
// la tournee du jour. Reserve a l'admin : un technicien a son agenda, il n'a pas
// a savoir depuis son accueil ce que fait le voisin.
//
// Il ne repond qu'a la question qu'on se pose le matin quand on tient la boite :
// "qui est ou aujourd'hui ?" - la tournee de chacun, et l'itineraire complet en
// un tap vers les cartes du telephone. Qui a ouvert l'app et ce qui a casse
// vivent dans l'onglet Administration : l'accueil n'en garde qu'une alerte dans
// le poste, quand il y a quelque chose a regarder (voir src/equipe-alertes.js).
//
// Un jour sans rendez-vous, le tableau disparait : le prochain se lit deja dans
// le poste, juste au-dessus.

import { esc } from '../ui/dom.js'
import { ICONS } from '../ui/icons.js'
import { estAdmin } from '../lock.js'
import { todayISO } from '../state.js'
import { adresseRdv, nomClient, trierRdv, estAnnule, estFait, tonPersonne } from '../agenda-outils.js'

// La carte integree parle adresses, pas coordonnees : c'est pour cela qu'elle
// peut se passer d'un geocodage, l'app n'ayant jamais que du texte. La cle est
// posee dans Vercel (VITE_GOOGLE_MAPS_KEY) et se retrouve donc dans le code
// envoye au navigateur : elle doit etre restreinte au domaine du site, sinon
// n'importe qui peut la depenser. Sans cle, le tableau garde sa liste.
const CLE_CARTE = import.meta.env.VITE_GOOGLE_MAPS_KEY ?? ''

// Une tournee raisonnable tient dans une poignee d'etapes ; au-dela, l'adresse
// de la carte devient trop longue pour tenir.
const ETAPES_MAX = 8

const url = encodeURIComponent
const lienCarte = (adresse) => `https://www.google.com/maps/search/?api=1&query=${url(adresse)}`

/**
 * La carte, telle que Google l'integre : le trajet trace d'un arret a l'autre.
 * A un seul arret elle se contente de le montrer - un trajet d'un point a
 * lui-meme n'aurait rien a dessiner.
 *
 * Repliee tant qu'on ne la demande pas : les arrets et l'itineraire suffisent
 * pour partir, et la carte prenait a elle seule la moitie de l'accueil. Repliee,
 * elle ne coute rien non plus - l'iframe ne se charge qu'a l'ouverture.
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
      : `https://www.google.com/maps/embed/v1/place?key=${CLE_CARTE}&q=${url(ou[0])}&zoom=14`
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
function tourneeHTML(view, duJour) {
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
  // La carte ne se propose que s'il y a une adresse a y montrer.
  const carte = Boolean(route && view.tableauCarte)
  return `
    ${onglets}
    <div class="tournee-tete">
      <span class="tournee-qui ton-${tonPersonne(choisi.id)}">${esc(choisi.nom)}</span>
      <span class="tournee-compte">${n} arrêt${n > 1 ? 's' : ''}</span>
      ${
        route
          ? `<a class="tournee-geste" href="${esc(route)}" target="_blank" rel="noopener">${ICONS.pin}Itinéraire</a>
             <button type="button" class="tournee-geste${carte ? ' on' : ''}" data-tableau-carte aria-expanded="${carte}">${ICONS.oeil}Carte</button>`
          : ''
      }
    </div>
    ${carte ? carteHTML(choisi.arrets) : ''}
    <ol class="arrets">${choisi.arrets.map(arretHTML).join('')}</ol>`
}

export function tableauAdminHTML(view) {
  if (!estAdmin()) return ''
  const jour = todayISO()
  const duJour = trierRdv((view.agenda?.rdvs ?? []).filter((r) => r.date === jour && !estAnnule(r)))
  if (!duJour.length) return ''
  return `
    <section class="tableau" aria-label="Tournée du jour">
      <h3 class="tableau-titre">${ICONS.pin}Tournée du jour</h3>
      ${tourneeHTML(view, duJour)}
    </section>`
}
