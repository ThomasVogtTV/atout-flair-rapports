// Ecran d'un rapport ouvert : mandant, lieu d'intervention, lignes
// (pieces / appartements / chambres), photos libres, remarques, signature.

import { typeOf, accordE, CONSTATS, RECOMMANDATIONS } from '../templates.js'
import * as S from '../state.js'
import { esc } from '../ui/dom.js'
import { sectionIcon } from '../ui/icons.js'
import { mandantPicker } from '../ui/chips.js'

// Champs d'adresse du bloc "Lieu d'intervention" : un seul champ combine
// pour le rapport de detection, deux champs separes (comme le mandant)
// pour immeuble/hotel.
export const LIEU_ADDR_KEYS = ['adresseIntervention', 'adresse', 'npaLieu']

export function applySameAddress(report) {
  const t = typeOf(report)
  if (t.layout === 'pieces') {
    report.lieu.adresseIntervention = [report.mandant.adresse, report.mandant.npaLieu].filter(Boolean).join(', ')
  } else {
    report.lieu.adresse = report.mandant.adresse
    report.lieu.npaLieu = report.mandant.npaLieu
  }
}

// Le mandant est souvent l'occupant lui-meme (proprietaire, particulier) :
// meme geste que pour l'adresse, une case a cocher plutot qu'une seconde saisie
// du meme nom.
export function applySameName(report) {
  report.lieu.locataire = S.fullName(report.mandant)
}

function fieldInput(f, value, disabled) {
  const id = `lieu.${f.key}`
  if (f.type === 'ouinon') {
    return `<div class="seg" data-seg="${id}">
      ${['Oui', 'Non']
        .map((v) => `<button type="button" class="seg-btn${value === v ? ' on' : ''}" data-val="${v}">${v}</button>`)
        .join('')}
    </div>`
  }
  const type = f.type === 'date' ? 'date' : f.type === 'time' ? 'time' : 'text'
  return `<input type="${type}" data-path="${id}" value="${esc(value ?? '')}"${disabled ? ' disabled' : ''} />`
}

// Puces de constat sous le champ "Informations" d'une ligne. Elles restent
// affichees en permanence : un constat s'ajoute souvent a un autre, et des
// puces qui disparaissent au premier choix obligent a taper le second a la main.
function constatChips() {
  return `<div class="quick-rooms quick-constats">${CONSTATS.map(
    (c) => `<button type="button" class="chip chip-sm" data-quick-info="${esc(c)}">${esc(c)}</button>`
  ).join('')}</div>`
}

function photoStrip(photos) {
  if (!photos.length) return ''
  return `<div class="photos">${photos
    .map(
      (p) => `<div class="thumb" data-photo-id="${p.id}">
        <img src="${p.dataUrl}" alt="" />
        <button class="thumb-del" data-del-photo="${p.id}">✕</button>
      </div>`
    )
    .join('')}</div>`
}

// Carte d'une piece : badge numerote colore par statut, labels persistants,
// puces de noms courants tant que le champ est vide (le champ texte reste
// disponible pour les cas hors-liste).
function pieceCardHTML(r, t, row, index) {
  const photos = r.photos.filter((p) => p.rowId === row.id)
  const status = row.contamine || ''
  return `
  <div class="row-card" data-row="${row.id}" data-status="${status}">
    <div class="row-head">
      <span class="piece-badge" data-grip title="Glisser pour changer la place">${index + 1}</span>
      <label class="piece-name-wrap">
        <span class="field-label">Nom de la pièce</span>
        <input class="row-name piece-name" data-row-field="nom" value="${esc(row.nom)}" placeholder="Nom de la pièce" />
      </label>
      <button class="icon-btn" data-del-row="${row.id}" title="Supprimer">✕</button>
    </div>
    ${
      row.nom
        ? ''
        : `<div class="quick-rooms">${t.suggestions
            .map((s) => `<button type="button" class="chip chip-sm" data-quick-room="${esc(s)}">${esc(s)}</button>`)
            .join('')}</div>`
    }
    <div class="seg tri" data-seg-row="${row.id}">
      <button type="button" class="seg-btn oui${status === 'oui' ? ' on' : ''}" data-val="oui">Contaminée</button>
      <button type="button" class="seg-btn non${status === 'non' ? ' on' : ''}" data-val="non">Non</button>
      <button type="button" class="seg-btn inconnu${status === 'inconnu' ? ' on' : ''}" data-val="inconnu">?</button>
    </div>
    <label class="field-info"><span class="field-label">Informations</span>
      <input data-row-field="info" value="${esc(row.info)}" placeholder="Marquage, punaises visibles…" />
    </label>
    ${constatChips()}
    ${photoStrip(photos)}
    <button class="btn ghost wide" data-photo="${row.id}">+ Photo de cette pièce</button>
  </div>`
}

function lineCardHTML(r, t, row, index, children) {
  const isHotel = t.id === 'hotel'
  const photos = r.photos.filter((p) => p.rowId === row.id)
  const child = children.find((c) => c.id === row.sousRapportId)
  const status = row.contamine || ''
  return `
  <div class="row-card" data-row="${row.id}" data-status="${status}">
    <div class="row-head">
      <span class="piece-badge" data-grip title="Glisser pour changer la place">${index + 1}</span>
      <label class="piece-name-wrap">
        <span class="field-label">${isHotel ? 'N° de chambre' : "N° d'appartement"}</span>
        <input class="row-name piece-name" data-row-field="numero" value="${esc(row.numero)}" placeholder="${isHotel ? 'ex. 101' : 'ex. 12'}" />
      </label>
      <button class="icon-btn" data-del-row="${row.id}" title="Supprimer">✕</button>
    </div>
    <!-- L'etage et la date tenaient sur la ligne du numero, avec la poignee et
         la croix : trois champs pour 200 px, ou "Étage" s'affichait "Éta" et la
         date "31/08/". Ils descendent d'un cran, apparies. -->
    <div class="grid2">
      <label>Étage<input data-row-field="etage" list="etages-list" value="${esc(row.etage)}" placeholder="1er" /></label>
      <label>Date<input type="date" data-row-field="date" value="${esc(row.date)}" /></label>
    </div>
    <label class="field-info"><span class="field-label">${isHotel ? 'Occupation' : 'Résident'}</span>
      <input data-row-field="resident" value="${esc(row.resident)}" placeholder="${isHotel ? 'ex. occupée, libre, en travaux…' : 'Nom du résident'}" />
    </label>
    <div class="seg" data-seg-row="${row.id}">
      <button type="button" class="seg-btn oui${status === 'oui' ? ' on' : ''}" data-val="oui">Contaminé</button>
      <button type="button" class="seg-btn non${status === 'non' ? ' on' : ''}" data-val="non">Non</button>
    </div>
    <label class="field-info"><span class="field-label">Constatations</span>
      <input data-row-field="infos" value="${esc(row.infos)}" placeholder="Marquage, punaises visibles…" />
    </label>
    ${constatChips()}
    ${photoStrip(photos)}
    <div class="row-actions">
      <button class="btn ghost" data-photo="${row.id}">+ Photo</button>
      ${
        isHotel
          ? ''
          : child
            ? `<button class="btn ghost" data-open-child="${child.id}">Rapport de détection ✓</button>`
            : `<button class="btn ghost" data-add-child="${row.id}">+ Rapport de détection</button>`
      }
    </div>
  </div>`
}

/** Carte d'une ligne, dans la forme qui correspond au type du rapport. */
export function rowCardHTML(view, row, index) {
  const t = typeOf(view.report)
  return t.layout === 'pieces'
    ? pieceCardHTML(view.report, t, row, index)
    : lineCardHTML(view.report, t, row, index, view.children)
}

// Les deux compteurs de la rubrique. Le libelle et son accord sortent du type
// de rapport : un immeuble compte des appartements contamines, pas des
// "lignes contaminees". Exporte car l'app les redessine a chaque changement,
// sans re-rendre l'ecran - c'est la seule facon que le pluriel suive.
export function counterPills(r, t) {
  const total = S.filledRows(r).length
  const cont = S.contaminatedCount(r)
  const e = accordE(t)
  return `
      <span class="count-pill"><b id="cnt-total">${total}</b> ${esc(total > 1 ? t.rowLabelPlural : t.rowLabel)}</span>
      <span class="count-pill${cont ? ' cont' : ''}"><b id="cnt-cont">${cont}</b> contaminé${e}${cont > 1 ? 's' : ''}</span>`
}

function piecesSection(view, r, t) {
  return `
    <h2 class="section-title"><span class="section-title-main">${sectionIcon('room', 'accent')}Pièces</span>
      <span class="section-title-trailer">
        <span class="counter-pills">${counterPills(r, t)}</span>
        <button class="link" data-act="add-row">+ Ajouter</button>
      </span>
    </h2>
    <div class="rows">${r.rows.map((row, i) => rowCardHTML(view, row, i)).join('')}</div>
    <button class="btn ghost wide" data-act="add-row">+ Ajouter une pièce</button>`
}

function lignesSection(view, r, t) {
  const etages = t.columns.find((c) => c.key === 'etage')?.suggestions ?? []
  return `
    <h2 class="section-title"><span class="section-title-main">${sectionIcon('room', 'accent')}${esc(t.rowLabelPlural[0].toUpperCase() + t.rowLabelPlural.slice(1))}</span>
      <span class="section-title-trailer">
        <span class="counter-pills">${counterPills(r, t)}</span>
        <button class="link" data-act="add-row">+ Ajouter</button>
      </span>
    </h2>
    <datalist id="etages-list">${etages.map((s) => `<option value="${esc(s)}"></option>`).join('')}</datalist>
    <div class="rows">${r.rows.map((row, i) => rowCardHTML(view, row, i)).join('')}</div>
    <button class="btn ghost wide" data-act="add-row">+ Ajouter une ligne</button>`
}

// Signature de la personne presente. Son nom est un champ a part entiere : sur
// place, ce n'est pas toujours le locataire ni le mandant qui ouvre la porte -
// concierge, voisin, fils, employe d'hotel. Le rapport doit porter le nom de
// celui qui a reellement signe.
function signatureSection(r) {
  const propose = r.signataire?.nom ?? ''
  return `
    <h2 class="section-title"><span class="section-title-main">${sectionIcon('pen', 'neutral')}Signature sur place</span></h2>
    <div class="card grid2">
      <label class="full">Nom du signataire
        <input data-path="signataire.nom" value="${esc(propose)}"
               placeholder="${esc(S.fullName(r.mandant) || 'Personne présente')}" autocomplete="off" />
      </label>
      <div class="full tech-sig">
        ${r.signature ? `<img class="sig-preview" src="${r.signature}" alt="Signature" />` : `<p class="muted small">Non signé</p>`}
        <button class="btn ghost wide" data-act="sign">${r.signature ? 'Refaire la signature' : 'Faire signer'}</button>
      </div>
    </div>`
}

// Logo du desinsectiseur avec qui l'intervention est menee. Il s'imprime en
// tete du rapport, a cote de celui d'Atout-Flair, sous la mention "en
// collaboration avec" - les deux entreprises cote a cote, et aucun doute sur
// qui a fait quoi.
//
// Rien n'est repris d'office d'un rapport a l'autre : la plupart des detections
// se font seules, et un logo tiers pose par defaut ferait cosigner un rapport a
// quelqu'un qui n'etait pas la. Les partenaires deja utilises restent en
// revanche a portee de tap, sous la case.
function partenaireSection(view, r) {
  const p = r.partenaire ?? {}
  const connus = (view.partenaires ?? []).filter((x) => x.logo !== p.logo)
  return `
    <h2 class="section-title"><span class="section-title-main">${sectionIcon('collab', 'green')}En collaboration avec</span>
      ${p.logo || (p.nom || '').trim() ? `<button class="link" data-act="drop-partenaire">Retirer</button>` : ''}
    </h2>
    <div class="card">
      <div class="depose${p.logo ? ' rempli' : ''}" data-depose-logo
           title="${p.logo ? 'Toucher pour remplacer le logo' : 'Glisser ou toucher pour choisir un logo'}">
        ${
          p.logo
            ? `<img class="logo-partenaire" src="${p.logo}" alt="${esc(p.nom || 'Logo du partenaire')}" />`
            : `<span class="depose-mot">Glissez le logo ici</span>
               <span class="depose-sous">ou touchez pour le choisir</span>`
        }
      </div>
      <label class="depose-nom">Nom de l'entreprise
        <input data-path="partenaire.nom" value="${esc(p.nom ?? '')}" placeholder="ex. Desinfecta Sàrl" autocomplete="off" />
      </label>
      ${
        connus.length
          ? `<span class="field-label depose-titre">Déjà utilisés</span>
             <div class="quick-rooms partenaires-connus">${connus
               .map(
                 (c) => `<button type="button" class="chip chip-logo" data-partenaire="${c.id}" title="${esc(c.nom || 'Partenaire')}">
                   <img src="${c.logo}" alt="" />${c.nom ? `<span>${esc(c.nom)}</span>` : ''}
                 </button>`
               )
               .join('')}</div>`
          : ''
      }
    </div>`
}

// Nom et signature deja remplis a l'ouverture du rapport (technicien par
// defaut de l'appareil). Les modifier ici ne vaut que pour ce rapport - le cas
// du collegue envoye faire la detection ; "Enregistrer par defaut" change le
// reglage de l'appareil pour les rapports suivants.
function technicienSection(r) {
  const tech = r.technicien ?? {}
  return `
    <h2 class="section-title"><span class="section-title-main">${sectionIcon('person', 'accent')}Le technicien</span>
      <button class="link" data-act="tech-default">Enregistrer par défaut</button>
    </h2>
    <div class="card grid2">
      <label class="full">Nom
        <input data-path="technicien.nom" value="${esc(tech.nom ?? '')}" autocomplete="off" />
      </label>
      <div class="full tech-sig">
        ${
          tech.signature
            ? `<img class="sig-preview" src="${tech.signature}" alt="Signature du technicien" />`
            : `<p class="muted small">Aucune signature enregistrée sur cet appareil</p>`
        }
        <button class="btn ghost wide" data-act="sign-tech">${tech.signature ? 'Refaire ma signature' : 'Ajouter ma signature'}</button>
      </div>
    </div>`
}

// Suggestions du carnet pendant la frappe : le carnet ne sert a rien s'il faut
// se souvenir du nom exact pour en profiter. Un tap remplit tout le bloc.
function contactSuggestions(view, r) {
  const props = S.matchContacts(r.mandant.nom, view.contacts ?? [])
  return `<div class="quick-rooms full suggestions-carnet"${props.length ? '' : ' hidden'}>${props
    .map(
      (c) => `<button type="button" class="chip chip-sm" data-fill-contact="${c.id}">
        ${esc(S.fullName(c))}${c.npaLieu ? `<span class="chip-count">${esc(c.npaLieu)}</span>` : ''}
      </button>`
    )
    .join('')}</div>`
}

function mandantSection(view, r, contacts) {
  const contactOptions = contacts.map((c) => `<option value="${esc(S.fullName(c))}"></option>`).join('')
  // Une gerance est une societe : pas de prenom, et le nom prend la ligne.
  const societe = r.mandant.type === 'gerance'
  return `
    <h2 class="section-title"><span class="section-title-main">${sectionIcon('person', 'amber')}Mandant</span>
      <span class="section-title-trailer">
        <button class="link" data-act="copier-mandant">Copier</button>
      </span>
    </h2>
    <div class="card grid2">
      <div class="full">${mandantPicker(r.mandant.type, { attr: 'data-mandant-type' })}</div>
      <label class="${societe ? 'full' : ''}">Nom
        <input data-path="mandant.nom" list="contacts" value="${esc(r.mandant.nom)}" autocomplete="off" />
        <datalist id="contacts">${contactOptions}</datalist>
      </label>
      ${societe ? '' : `<label>Prénom<input data-path="mandant.prenom" value="${esc(r.mandant.prenom)}" autocomplete="off" /></label>`}
      ${contactSuggestions(view, r)}
      <!-- Deux colonnes : le bloc tient en quatre lignes au lieu de six. Une
           adresse ou une longue localite depasse alors de son champ - elle
           defile a la saisie, et le PDF l'imprime en entier. C'est le prix du
           deroulement plus court, assume. -->
      <label>Adresse<input data-path="mandant.adresse" value="${esc(r.mandant.adresse)}" /></label>
      <label>NPA / Lieu<input data-path="mandant.npaLieu" value="${esc(r.mandant.npaLieu)}" /></label>
      <label>Email<input data-path="mandant.email" value="${esc(r.mandant.email)}" inputmode="email" /></label>
      <label>Téléphone<input data-path="mandant.tel" value="${esc(r.mandant.tel)}" inputmode="tel" /></label>
    </div>`
}

function lieuSection(r, t) {
  const fields = t.lieuFields
    .flat()
    .filter((f) => !f.derived)
    .map((f) => {
      const isAddrField = f.key === 'adresseIntervention' || f.key === 'adresse'
      const isLocataire = f.key === 'locataire'
      const disabled =
        (LIEU_ADDR_KEYS.includes(f.key) && r.lieu.sameAsMandant) || (isLocataire && r.lieu.sameNameAsMandant)
      // Deux colonnes par defaut, pour que le formulaire se deroule court.
      // Seuls les controles qui ne sont pas des champs de texte gardent la ligne
      // entiere (segment Oui/Non, cases "meme adresse") : a 149 px de large,
      // leur libelle passerait a la ligne pour rien.
      const field = `<label class="${f.large ? 'full' : ''}">
        ${esc(f.label)}${fieldInput(f, r.lieu[f.key], disabled)}
      </label>`
      if (isAddrField) {
        return `${field}
        <label class="same-addr">
          <input type="checkbox" data-same-addr${r.lieu.sameAsMandant ? ' checked' : ''} />
          Même adresse que le mandant
        </label>`
      }
      if (isLocataire) {
        return `${field}
        <label class="same-addr">
          <input type="checkbox" data-same-name${r.lieu.sameNameAsMandant ? ' checked' : ''} />
          Même nom que le mandant
        </label>`
      }
      return field
    })
    .join('')

  return `
    <h2 class="section-title"><span class="section-title-main">${sectionIcon('pin', 'violet')}Lieu d'intervention</span></h2>
    <div class="card grid2">${fields}</div>`
}

export function editorView(view) {
  const r = view.report
  const t = typeOf(r)

  return `
    <header class="top editor-top">
      <button class="icon-btn back" data-act="home">‹</button>
      <div class="top-title">
        <h1>${esc(t.label)}</h1>
        <p class="muted">N° ${esc(r.ref)} · ${esc(r.lieu?.adresseIntervention || r.lieu?.adresse || 'Nouveau rapport')}</p>
      </div>
    </header>

    <section class="pad">
      ${mandantSection(view, r, view.contacts)}

      ${lieuSection(r, t)}

      ${t.layout === 'pieces' ? piecesSection(view, r, t) : lignesSection(view, r, t)}

      <h2 class="section-title"><span class="section-title-main">${sectionIcon('camera', 'magenta')}Photos libres</span></h2>
      <div class="card">
        <p class="muted small">Photos non rattachées à une ligne (façade, cave, hall…).</p>
        ${photoStrip(r.photos.filter((p) => !p.rowId))}
        <button class="btn ghost wide" data-photo="">+ Ajouter une photo</button>
      </div>

      <h2 class="section-title"><span class="section-title-main">${sectionIcon('note', 'neutral')}Remarques et recommandations</span></h2>
      <div class="card">
        <textarea data-path="remarques" rows="4" placeholder="Aucun marquage du chien de recherche.">${esc(r.remarques)}</textarea>
        <div class="quick-rooms quick-notes">${RECOMMANDATIONS.map(
          (n) => `<button type="button" class="chip chip-sm" data-quick-note="${esc(n.texte)}">+ ${esc(n.label)}</button>`
        ).join('')}</div>
      </div>

      ${technicienSection(r)}

      ${partenaireSection(view, r)}

      ${t.hasSignature ? signatureSection(r) : ''}
    </section>

    <div class="bottom-bar">
      <button class="btn ghost" data-act="preview">Aperçu PDF</button>
      <button class="btn primary" data-act="send">Envoyer</button>
    </div>`
}
