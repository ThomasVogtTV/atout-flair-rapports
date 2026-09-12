// Les deux fenetres d'un rendez-vous : sa fiche (commencer le rapport, le
// mettre dans l'agenda du telephone, s'y rendre) et le formulaire pour le
// creer ou le modifier.

import { esc, toast } from './ui/dom.js'
import { openOverlay } from './ui/dialogs.js'
import { ICONS } from './ui/icons.js'
import { TYPE_LIST } from './templates.js'
import { uid, todayISO, contactVersMandant } from './state.js'
import {
  typeRdv,
  nomClient,
  adresseRdv,
  libelleJour,
  plageRdv,
  libelleDuree,
  enHeure,
  finDe,
  estAnnule,
  DUREE_DEFAUT,
} from './agenda-outils.js'

// Ou en est le rendez-vous. Un technicien le pose depuis la fiche, en un geste,
// sans rouvrir le formulaire.
const ETATS = [
  { id: 'prevu', label: 'Prévu' },
  { id: 'fait', label: 'Fait' },
  { id: 'annule', label: 'Annulé' },
]

// Les durees proposees. Une detection courante tient en une heure ; un immeuble
// ou un hotel se compte en demi-journees.
const DUREES = [15, 30, 45, 60, 90, 120, 180, 240, 360, 480]

const clientVide = () => ({ type: '', nom: '', prenom: '', adresse: '', npaLieu: '', email: '', tel: '' })

/**
 * La fiche d'un rendez-vous.
 * @returns {Promise<'commencer'|'agenda'|'modifier'|'supprimer'|`statut:${string}`|null>}
 */
export function ouvrirRdv(rdv, { modifiable }) {
  const t = typeRdv(rdv.type)
  const adresse = adresseRdv(rdv)
  const tel = (rdv.client?.tel || '').replace(/[^\d+]/g, '')
  const quand = [libelleJour(rdv.date, todayISO()), plageRdv(rdv), t.choix].join(' · ')

  const overlay = openOverlay(`
    <div class="rdv-tete">
      <span class="rapport-type icon-${t.id}">${ICONS[t.id] ?? ''}</span>
      <div>
        <h2>${esc(nomClient(rdv.client) || 'Client')}</h2>
        <p class="muted small">${esc(quand)}</p>
      </div>
    </div>
    ${adresse ? `<p class="rdv-adresse">${esc(adresse)}</p>` : ''}
    ${rdv.note ? `<p class="rdv-note">${esc(rdv.note)}</p>` : ''}
    ${rdv.pour?.nom ? `<p class="muted small">Pour : ${esc(rdv.pour.nom)}</p>` : ''}
    ${
      modifiable
        ? `<div class="rdv-statuts">${ETATS.map(
            (e) =>
              `<button type="button" class="chip chip-sm${(rdv.statut || 'prevu') === e.id ? ' on' : ''}" data-choix="statut:${e.id}">${
                e.label
              }</button>`
          ).join('')}</div>`
        : ''
    }
    <div class="fiche-actions">
      <button type="button" class="fiche-btn" data-choix="agenda">${ICONS.calendrier}Mon agenda</button>
      ${
        adresse
          ? `<a class="fiche-btn" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adresse)}" target="_blank" rel="noopener">${ICONS.pin}Itinéraire</a>`
          : ''
      }
      ${tel ? `<a class="fiche-btn" href="tel:${esc(tel)}">${ICONS.phone}Appeler</a>` : ''}
    </div>
    ${
      estAnnule(rdv)
        ? ''
        : `<button type="button" class="btn primary wide rdv-commencer" data-choix="commencer">
             ${rdv.rapportId ? 'Ouvrir le rapport' : 'Commencer le rapport'}
           </button>`
    }
    <div class="dialog-actions">
      ${
        modifiable
          ? `<button class="btn ghost danger" data-choix="supprimer">Supprimer</button>
             <button class="btn ghost" data-choix="modifier">Modifier</button>`
          : ''
      }
      <button class="btn ghost" data-choix="">Fermer</button>
    </div>`)

  return new Promise((resolve) => {
    overlay.addEventListener('click', (ev) => {
      if (ev.target === overlay) {
        overlay.remove()
        return resolve(null)
      }
      const b = ev.target.closest('[data-choix]')
      if (!b) return
      overlay.remove()
      resolve(b.dataset.choix || null)
    })
  })
}

/**
 * Creer ou modifier un rendez-vous. L'administrateur choisit pour qui ; les
 * autres notent les leurs.
 *
 * @param {object|null} rdv le rendez-vous a modifier, null pour en creer un
 * @param {{contacts: object[], reports: object[], equipe: object[]|null, admin: boolean, choisirContact: Function}} ctx
 * @returns {Promise<object|null>} le rendez-vous saisi, ou null si l'on renonce
 */
export function formulaireRdv(rdv, { contacts, reports, equipe, admin, choisirContact, date, heure, conflits, modele }) {
  // Un nouveau rendez-vous prend le jour touche dans le calendrier ; un modele
  // (le controle propose apres un rapport positif) le remplit d'avance.
  const r = rdv
    ? structuredClone(rdv)
    : {
        id: uid(),
        date: date || todayISO(),
        heure: heure || '',
        duree: DUREE_DEFAUT,
        type: 'detection',
        client: clientVide(),
        lieu: { adresse: '', npaLieu: '' },
        note: '',
        pour: null,
        ...(modele ?? {}),
      }

  const choixPour = admin
    ? `<label class="full">Pour
         <select data-f="pour">
           <option value="admin">Moi (administrateur)</option>
           ${(equipe ?? [])
             .map((e) => `<option value="${esc(e.id)}"${r.pour?.id === e.id ? ' selected' : ''}>${esc(e.nom)}${e.invite ? ' (invité)' : ''}</option>`)
             .join('')}
         </select>
       </label>`
    : ''

  const overlay = openOverlay(`
    <h2>${rdv ? 'Modifier le rendez-vous' : 'Nouveau rendez-vous'}</h2>
    <div class="grid2 rdv-form">
      <label>Date<input type="date" data-f="date" value="${esc(r.date)}" /></label>
      <label>Heure<input type="time" data-f="heure" value="${esc(r.heure)}" /></label>
      <label class="full">Durée
        <select data-f="duree">
          ${DUREES.map((d) => `<option value="${d}"${d === (r.duree || DUREE_DEFAUT) ? ' selected' : ''}>${libelleDuree(d)}</option>`).join('')}
        </select>
      </label>
      <div class="full">
        <span class="field-label">Type de rapport</span>
        <div class="quick-rooms" data-rdv-type>${TYPE_LIST.map(
          (t) =>
            `<button type="button" class="chip chip-sm type-${t.id}${t.id === r.type ? ' on' : ''}" data-val="${t.id}">${esc(
              t.choix
            )}</button>`
        ).join('')}</div>
      </div>
      ${contacts.length ? '<button type="button" class="btn ghost wide full" data-choisir>Choisir un client du carnet</button>' : ''}
      <label class="full">Client<input data-f="client" value="${esc(nomClient(r.client))}" placeholder="Nom du client ou de la régie" autocomplete="off" /></label>
      <label>Adresse<input data-f="adresse" value="${esc(r.lieu?.adresse || r.client?.adresse || '')}" /></label>
      <label>NPA / Lieu<input data-f="npaLieu" value="${esc(r.lieu?.npaLieu || r.client?.npaLieu || '')}" /></label>
      <label class="full">Note<textarea data-f="note" rows="2" placeholder="Code d'entrée, étage, personne à demander…">${esc(r.note)}</textarea></label>
      ${choixPour}
    </div>
    <div class="dialog-actions">
      <button class="btn ghost" data-close>Annuler</button>
      <button class="btn primary" data-save>Enregistrer</button>
    </div>`)

  const champ = (f) => overlay.querySelector(`[data-f="${f}"]`)

  return new Promise((resolve) => {
    overlay.addEventListener('click', async (ev) => {
      if (ev.target === overlay || ev.target.closest('[data-close]')) {
        overlay.remove()
        return resolve(null)
      }

      const chip = ev.target.closest('[data-rdv-type] .chip')
      if (chip) {
        r.type = chip.dataset.val
        overlay.querySelectorAll('[data-rdv-type] .chip').forEach((b) => b.classList.toggle('on', b === chip))
        return
      }

      // Le client du carnet remplit nom et adresse ; son telephone suit, pour
      // le bouton "Appeler" de la fiche.
      if (ev.target.closest('[data-choisir]')) {
        const c = await choisirContact(contacts, reports)
        if (!c) return
        r.client = contactVersMandant(c)
        champ('client').value = nomClient(r.client)
        champ('adresse').value = r.client.adresse
        champ('npaLieu').value = r.client.npaLieu
        return
      }

      if (ev.target.closest('[data-save]')) {
        const nom = champ('client').value.trim()
        if (!champ('date').value) return toast('Indiquez une date')
        if (!nom) return toast('Indiquez le client')
        // Un nom retape a la main remplace le client venu du carnet.
        if (nom !== nomClient(r.client)) r.client = { ...clientVide(), nom }
        r.date = champ('date').value
        r.heure = champ('heure').value
        r.duree = Number(champ('duree').value) || DUREE_DEFAUT
        r.note = champ('note').value.trim()
        r.lieu = { adresse: champ('adresse').value.trim(), npaLieu: champ('npaLieu').value.trim() }
        if (admin) {
          const v = champ('pour').value
          r.pour = v === 'admin' ? { id: 'admin', nom: 'Administrateur' } : { id: v, nom: (equipe ?? []).find((e) => e.id === v)?.nom ?? '' }
        }
        // La double reservation se voit ici, pas le jour meme sur le pas de la
        // porte. On previent, on n'interdit pas : deux passages au meme moment
        // arrivent, et c'est a celui qui organise d'en decider.
        if (conflits) {
          const choc = conflits(r)[0]
          const qui = choc?.pour?.nom ? ` (${choc.pour.nom})` : ''
          if (
            choc &&
            !confirm(
              `Ce créneau est déjà pris :

${choc.heure} – ${enHeure(finDe(choc))} · ${nomClient(choc.client) || 'client'}${qui}` +
                `

Enregistrer quand même ?`
            )
          ) {
            return
          }
        }
        overlay.remove()
        resolve(r)
      }
    })
  })
}
