// Ecran "Envois" : ou en est chaque rapport parti par mail.
//
// Il repond a la seule question qui compte apres avoir appuye sur Envoyer :
// est-ce que c'est parti ? Trois reponses possibles, trois rubriques, et pour
// celles qui ont echoue, le motif en toutes lettres plutot qu'un message
// rassurant et faux.

import { frDate } from '../state.js'
import { esc } from '../ui/dom.js'
import { sectionIcon } from '../ui/icons.js'

// "il y a 3 minutes" plutot qu'une heure exacte : ce qu'on veut savoir d'un
// envoi, c'est s'il vient de partir ou s'il traine depuis hier.
function ilYA(ts) {
  if (!ts) return ''
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 60) return "à l'instant"
  const min = Math.round(s / 60)
  if (min < 60) return `il y a ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `il y a ${h} h`
  const j = Math.round(h / 24)
  return j <= 1 ? 'hier' : `il y a ${j} jours`
}

function ligneAttente(job) {
  return `
    <li class="envoi-row" data-envoi="${job.id}">
      <div class="envoi-main">
        <strong>${esc(job.destinataire || 'Destinataire inconnu')}</strong>
        <span class="muted">${esc(job.reportRef ?? '')} · ${esc(ilYA(job.createdAt))}${
          job.essais ? ` · ${job.essais} essai${job.essais > 1 ? 's' : ''}` : ''
        }</span>
      </div>
      <div class="envoi-side">
        <button class="btn ghost btn-mini" data-retry="${job.id}">Réessayer</button>
      </div>
    </li>`
}

function ligneEchec(job) {
  return `
    <li class="envoi-row echec" data-envoi="${job.id}">
      <div class="envoi-main">
        <strong>${esc(job.destinataire || 'Destinataire inconnu')}</strong>
        <span class="muted">${esc(job.reportRef ?? '')} · ${esc(ilYA(job.dernierEssai ?? job.createdAt))} · ${job.essais ?? 1} essai${
          (job.essais ?? 1) > 1 ? 's' : ''
        }</span>
        <span class="envoi-motif">${esc(job.motif ?? 'Refus sans explication.')}</span>
      </div>
      <div class="envoi-side">
        <button class="btn ghost btn-mini" data-retry="${job.id}">Réessayer</button>
        <button class="icon-btn" data-drop-envoi="${job.id}" title="Retirer de la liste">✕</button>
      </div>
    </li>`
}

function ligneEnvoye(r) {
  return `
    <li class="envoi-row" data-open="${r.id}">
      <div class="envoi-main">
        <strong>${esc(r.mandant?.email || r.lieu?.locataire || 'Rapport envoyé')}</strong>
        <span class="muted">${esc(r.ref)} · ${esc(ilYA(r.sentAt))}</span>
      </div>
      <div class="envoi-side"><span class="pill sent">Envoyé</span></div>
    </li>`
}

export function envoisView(view) {
  const jobs = view.queue ?? []
  const attente = jobs.filter((j) => j.etat !== 'echec')
  const echecs = jobs.filter((j) => j.etat === 'echec')
  const envoyes = (view.reports ?? []).filter((r) => r.status === 'sent').slice(0, 10)

  const bloc = (icone, ton, titre, compte, contenu, action = '') => `
    <h2 class="section-title"><span class="section-title-main">${sectionIcon(icone, ton)}${titre}</span>
      <span class="section-title-trailer">
        ${compte ? `<span class="count-pill${ton === 'red' ? ' cont' : ''}"><b>${compte}</b></span>` : ''}
        ${action}
      </span>
    </h2>
    ${contenu}`

  return `
    <header class="top editor-top">
      <button class="icon-btn back" data-act="home">‹</button>
      <div class="top-title">
        <h1>Envois</h1>
        <p class="muted">${
          echecs.length
            ? `${echecs.length} à corriger`
            : attente.length
              ? `${attente.length} en attente`
              : 'Tout est parti'
        }</p>
      </div>
    </header>
    <section class="pad">
      ${
        echecs.length
          ? bloc(
              'note',
              'red',
              'À corriger',
              echecs.length,
              `<ul class="report-list">${echecs.map(ligneEchec).join('')}</ul>`,
              `<button class="link" data-retry-all>Tout réessayer</button>`
            )
          : ''
      }

      ${bloc(
        'folder',
        'amber',
        'En attente',
        attente.length,
        attente.length
          ? `<ul class="report-list">${attente.map(ligneAttente).join('')}</ul>`
          : `<p class="empty">Rien en attente. Les envois partent dès qu'il y a du réseau.</p>`,
        attente.length ? `<button class="link" data-retry-all>Envoyer maintenant</button>` : ''
      )}

      ${bloc(
        'pen',
        'green',
        'Envoyés',
        envoyes.length,
        envoyes.length
          ? `<ul class="report-list">${envoyes.map(ligneEnvoye).join('')}</ul>`
          : `<p class="empty">Aucun rapport envoyé pour l'instant.</p>`
      )}
    </section>`
}
