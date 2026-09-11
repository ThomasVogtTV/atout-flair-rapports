// Ecran "Réglages" : ce qui vaut pour l'appareil, et non pour un rapport.
//
// Il vivait au bas du carnet de contacts, sous la liste des regies. Deux choses
// sans rapport partageaient donc un ecran et un bouton : le carnet se consulte
// en pleine intervention, dix fois par semaine ; l'apparence et le code d'envoi
// se reglent une fois sur le telephone et ne se retouchent plus. Chacun a
// desormais sa porte.

import { backupAge, enPoids, STOCKAGE_ALERTE } from '../state.js'
import { esc } from '../ui/dom.js'
import { sectionIcon } from '../ui/icons.js'
import { THEMES, themeChoice } from '../ui/theme.js'
import { currentCode } from '../mailer.js'
import { identite, souvenirJusqua } from '../lock.js'
import { souvenirValide } from '../code.js'
import { derniereSauvegarde, rapportsSauvegardes } from '../sauvegarde.js'

function etatEnLigne() {
  const t = derniereSauvegarde()
  if (!t) return 'Pas encore faite : elle part toute seule dès qu’il y a du réseau.'
  const d = new Date(t)
  const jour = d.toDateString() === new Date().toDateString() ? 'aujourd’hui' : `le ${d.toLocaleDateString('fr-CH')}`
  const heure = d.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' })
  const n = rapportsSauvegardes()
  return `Dernière sauvegarde ${jour} à ${heure} · ${n} rapport${n > 1 ? 's' : ''} en ligne.`
}

// Au-dela d'un mois, la sauvegarde est signalee comme en retard : c'est le
// delai au bout duquel perdre le telephone couterait une tournee entiere.
const SAUVEGARDE_LIMITE = 30

function ageSauvegarde() {
  const j = backupAge()
  if (j === null) return { texte: 'Jamais sauvegardé sur cet appareil.', tard: true }
  if (j === 0) return { texte: "Dernière sauvegarde : aujourd'hui.", tard: false }
  if (j === 1) return { texte: 'Dernière sauvegarde : hier.', tard: false }
  return { texte: `Dernière sauvegarde il y a ${j} jours.`, tard: j > SAUVEGARDE_LIMITE }
}

/**
 * La place que l'app occupe dans l'appareil.
 *
 * Elle vit sous la sauvegarde parce que le remede est le meme : exporter, puis
 * effacer ce qui a ete rendu. Rien ne s'affiche quand le navigateur ne sait pas
 * repondre - une jauge vide inquieterait sans rien apprendre.
 */
function jaugeHTML(place) {
  if (!place) return ''
  const part = Math.min(1, place.part)
  const serre = part > STOCKAGE_ALERTE
  return `
    <p class="etat-place${serre ? ' tard' : ''}">${esc(enPoids(place.usage))} utilisés sur ${esc(enPoids(place.quota))}</p>
    <div class="jauge${serre ? ' tard' : ''}" role="img"
         aria-label="${Math.round(part * 100)} % de la place occupée">
      <span style="width:${Math.max(2, Math.round(part * 100))}%"></span>
    </div>
    ${serre ? `<p class="muted small">Les prochaines photos risquent de ne plus tenir.</p>` : ''}`
}

export function reglagesView(view) {
  const sauvegarde = ageSauvegarde()
  const place = view?.stockage ?? null
  return `
    <header class="top editor-top">
      <button class="icon-btn back" data-act="home">‹</button>
      <div class="top-title">
        <h1>Réglages</h1>
        <p class="muted">Valent pour cet appareil</p>
      </div>
    </header>
    <section class="pad">
      <h2 class="section-title"><span class="section-title-main">${sectionIcon('sun', 'amber')}Apparence</span></h2>
      <div class="card">
        <div class="seg" data-theme-choice>
          ${THEMES.map(
            (t) => `<button type="button" class="seg-btn${themeChoice() === t.key ? ' on' : ''}" data-val="${t.key}">${t.label}</button>`
          ).join('')}
        </div>
        <p class="muted small reglage-note">« Système » suit le réglage du téléphone : sombre le soir s'il l'est.</p>
      </div>

      <h2 class="section-title"><span class="section-title-main">${sectionIcon('mail', 'accent')}Code d'accès</span></h2>
      <div class="card">
        <input data-app-code type="text" autocapitalize="none" autocorrect="off" spellcheck="false"
               value="${esc(currentCode())}" placeholder="Non renseigné sur cet appareil" />
        <p class="muted small reglage-note">Il ouvre l'application et autorise l'envoi des rapports depuis la boîte de
        l'entreprise. Majuscules et minuscules sont indifférentes.</p>
        ${identite()?.nom ? `<p class="muted small">Ce téléphone est au nom de <b>${esc(identite().nom)}</b>.</p>` : ''}
        ${
          souvenirValide(souvenirJusqua())
            ? `<p class="muted small">Code mémorisé sur cet appareil jusqu'au ${esc(
                new Date(souvenirJusqua()).toLocaleDateString('fr-CH', { day: 'numeric', month: 'long' })
              )}.</p>`
            : ''
        }
        <button class="btn ghost wide" data-act="deconnexion">Se déconnecter de cet appareil</button>
      </div>

      <h2 class="section-title"><span class="section-title-main">${sectionIcon('folder', 'accent')}Sauvegarde en ligne</span></h2>
      <div class="card">
        <p class="etat-sauvegarde">${esc(etatEnLigne())}</p>
        <p class="muted small">Automatique : chaque rapport, photos comprises, part dans l'espace privé de
        l'entreprise dès qu'il y a du réseau. Téléphone perdu ou changé : « Récupérer » ramène les rapports.</p>
        <div class="row-actions">
          <button class="btn ghost" data-act="sauvegarder-en-ligne">Sauvegarder maintenant</button>
          <button class="btn ghost" data-act="restaurer-en-ligne">Récupérer</button>
        </div>
      </div>

      <h2 class="section-title"><span class="section-title-main">${sectionIcon('folder', 'neutral')}Fichier de sauvegarde</span></h2>
      <div class="card">
        <p class="etat-sauvegarde${sauvegarde.tard ? ' tard' : ''}">${esc(sauvegarde.texte)}</p>
        <p class="muted small">Un fichier qui rassemble tout ce que contient cet appareil : rapports, carnet,
        signature et réglages. Utile pour changer de téléphone sans réseau, ou garder une copie à part.</p>
        ${jaugeHTML(place)}
        <div class="row-actions">
          <button class="btn ghost" data-act="export-backup">Exporter</button>
          <button class="btn ghost" data-act="import-backup">Restaurer</button>
        </div>
      </div>
    </section>`
}
