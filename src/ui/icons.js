// Icones de l'app (traits fins, 1.6px, coherentes avec le style epure).

const ICON_STROKE = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"'
const ICON_FILL = 'fill="currentColor" fill-opacity="0.16" stroke="none"'

export const ICONS = {
  detection: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><path ${ICON_FILL} d="M10 20v-5a2 2 0 0 1 4 0v5z"/><path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9"/><path d="M10 20v-5a2 2 0 0 1 4 0v5"/></svg>`,
  immeuble: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><rect ${ICON_FILL} x="5" y="3.5" width="14" height="17" rx="1.2"/><rect x="5" y="3.5" width="14" height="17" rx="1.2"/><path d="M8.5 7.5h1M14.5 7.5h1M8.5 11.5h1M14.5 11.5h1M8.5 15.5h1M14.5 15.5h1"/><path d="M10 20.5v-3.2a2 2 0 0 1 4 0v3.2"/></svg>`,
  hotel: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><path ${ICON_FILL} d="M3.5 14.5v-3a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3z"/><path d="M3.5 19v-9"/><path d="M3.5 14.5h17V19"/><path d="M3.5 14.5v-3a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3"/><path d="M13.5 11h5a2 2 0 0 1 2 2v1.5"/></svg>`,
  chevron: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><path d="m9 5 7 7-7 7"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><circle ${ICON_FILL} cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="8.5"/><path d="M12 8.2v7.6M8.2 12h7.6"/></svg>`,
  person: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><circle ${ICON_FILL} cx="12" cy="8.2" r="3.4"/><circle cx="12" cy="8.2" r="3.4"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/></svg>`,
  pin: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><path ${ICON_FILL} d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21Z"/><path d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.2"/></svg>`,
  room: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><rect ${ICON_FILL} x="6" y="3" width="12" height="18" rx="1"/><rect x="6" y="3" width="12" height="18" rx="1"/><circle cx="14.5" cy="12.3" r="0.9" fill="currentColor" stroke="none"/><path d="M4.3 21h15.4"/></svg>`,
  camera: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><path ${ICON_FILL} d="M4 8.5a1.5 1.5 0 0 1 1.5-1.5h2l1-2h7l1 2h2A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5v-9Z"/><path d="M4 8.5a1.5 1.5 0 0 1 1.5-1.5h2l1-2h7l1 2h2A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5v-9Z"/><circle cx="12" cy="12.6" r="3.3"/></svg>`,
  note: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><path ${ICON_FILL} d="M6 3.5h9l3 3v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1Z"/><path d="M6 3.5h9l3 3v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1Z"/><path d="M8.5 12h7M8.5 15.5h4.5"/></svg>`,
  pen: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><path ${ICON_FILL} d="m14 5.5 4.5 4.5-9 9L5 20l1-4.5z"/><path d="m14 5.5 4.5 4.5-9 9L5 20l1-4.5z"/><path d="m13 6.5 4 4"/></svg>`,
  sun: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><circle ${ICON_FILL} cx="12" cy="12" r="4.2"/><circle cx="12" cy="12" r="4.2"/><path d="M12 3v2.2M12 18.8V21M4.4 12H2.6M21.4 12h-1.8M5.8 5.8l1.3 1.3M16.9 16.9l1.3 1.3M18.2 5.8l-1.3 1.3M7.1 16.9l-1.3 1.3"/></svg>`,
  folder: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><path ${ICON_FILL} d="M4 7a1.2 1.2 0 0 1 1.2-1.2h4.3l1.8 2H18.8A1.2 1.2 0 0 1 20 9v8.2a1.2 1.2 0 0 1-1.2 1.2H5.2A1.2 1.2 0 0 1 4 17.2Z"/><path d="M4 7a1.2 1.2 0 0 1 1.2-1.2h4.3l1.8 2H18.8A1.2 1.2 0 0 1 20 9v8.2a1.2 1.2 0 0 1-1.2 1.2H5.2A1.2 1.2 0 0 1 4 17.2Z"/></svg>`,
  mail: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><rect ${ICON_FILL} x="3" y="5.5" width="18" height="13" rx="2"/><rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="m3.6 7 8.4 6 8.4-6"/></svg>`,
  loupe: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><circle ${ICON_FILL} cx="11" cy="11" r="6.5"/><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>`,
  // Engrenage : ce qui se regle une fois et ne bouge plus.
  reglages: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><circle ${ICON_FILL} cx="12" cy="12" r="3.3"/><circle cx="12" cy="12" r="3.3"/><path d="M19.2 14.6a1.5 1.5 0 0 0 .3 1.65l.05.06a1.8 1.8 0 1 1-2.55 2.55l-.06-.06a1.5 1.5 0 0 0-1.65-.3 1.5 1.5 0 0 0-.9 1.37v.17a1.8 1.8 0 1 1-3.6 0v-.09a1.5 1.5 0 0 0-.98-1.37 1.5 1.5 0 0 0-1.65.3l-.06.06a1.8 1.8 0 1 1-2.55-2.55l.06-.06a1.5 1.5 0 0 0 .3-1.65 1.5 1.5 0 0 0-1.37-.9h-.17a1.8 1.8 0 1 1 0-3.6h.09a1.5 1.5 0 0 0 1.37-.98 1.5 1.5 0 0 0-.3-1.65l-.06-.06a1.8 1.8 0 1 1 2.55-2.55l.06.06a1.5 1.5 0 0 0 1.65.3h.07a1.5 1.5 0 0 0 .9-1.37v-.17a1.8 1.8 0 1 1 3.6 0v.09a1.5 1.5 0 0 0 .9 1.37 1.5 1.5 0 0 0 1.65-.3l.06-.06a1.8 1.8 0 1 1 2.55 2.55l-.06.06a1.5 1.5 0 0 0-.3 1.65v.07a1.5 1.5 0 0 0 1.37.9h.17a1.8 1.8 0 1 1 0 3.6h-.09a1.5 1.5 0 0 0-1.37.9Z"/></svg>`,
  // Deux anneaux enlaces : deux entreprises cote a cote sur un meme rapport.
  collab: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><circle ${ICON_FILL} cx="9.2" cy="12" r="5"/><circle cx="9.2" cy="12" r="5"/><circle cx="14.8" cy="12" r="5"/></svg>`,
  phone: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><path ${ICON_FILL} d="M6 4h3l1.5 4-2 1.3a10 10 0 0 0 6.2 6.2l1.3-2 4 1.5v3a1.5 1.5 0 0 1-1.5 1.5A15.5 15.5 0 0 1 4.5 5.5 1.5 1.5 0 0 1 6 4Z"/><path d="M6 4h3l1.5 4-2 1.3a10 10 0 0 0 6.2 6.2l1.3-2 4 1.5v3a1.5 1.5 0 0 1-1.5 1.5A15.5 15.5 0 0 1 4.5 5.5 1.5 1.5 0 0 1 6 4Z"/></svg>`,
  calendrier: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><rect ${ICON_FILL} x="4" y="5.5" width="16" height="15" rx="2.2"/><rect x="4" y="5.5" width="16" height="15" rx="2.2"/><path d="M4 10.2h16M8.5 3.5v4M15.5 3.5v4"/><circle cx="12" cy="15.2" r="1.2" fill="currentColor" stroke="none"/></svg>`,
  // Etoile des favoris : pleine quand le client est coche (voir .contact-etoile.on).
  etoile: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/></svg>`,
  // --- les glyphes de l'interface : navigation, gestes, etats -------------
  retour: `<svg viewBox="0 0 24 24" ${ICON_STROKE} stroke-width="2"><path d="M15 5l-7 7 7 7"/></svg>`,
  suivant: `<svg viewBox="0 0 24 24" ${ICON_STROKE} stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`,
  precedent: `<svg viewBox="0 0 24 24" ${ICON_STROKE} stroke-width="2"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>`,
  coche: `<svg viewBox="0 0 24 24" ${ICON_STROKE} stroke-width="2.4"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`,
  ajout: `<svg viewBox="0 0 24 24" ${ICON_STROKE} stroke-width="2.2"><path d="M12 5v14M5 12h14"/></svg>`,
  poubelle: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><path d="M4.5 7h15M10 4h4M6.5 7l.9 12a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-12M10 11v6M14 11v6"/></svg>`,
  oeil: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/></svg>`,
  plusmenu: `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="5.5" cy="12" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="18.5" cy="12" r="1.9"/></svg>`,
  copie: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/></svg>`,
  envoyer: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><path d="M21 3 10.5 13.5M21 3l-6.5 18-4-7.5L3 9.5z"/></svg>`,
  alerte: `<svg viewBox="0 0 24 24" ${ICON_STROKE} stroke-width="1.9"><path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17.2v.1"/></svg>`,
  horloge: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>`,
  cadenas: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>`,
  contacts: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><rect ${ICON_FILL} x="4" y="3.5" width="16" height="17" rx="2.2"/><rect x="4" y="3.5" width="16" height="17" rx="2.2"/><circle cx="12" cy="10" r="2.4"/><path d="M7.7 16.3a4.3 4.3 0 0 1 8.6 0"/></svg>`,
}

export function sectionIcon(key, tone) {
  return `<span class="section-icon icon-${tone}">${ICONS[key]}</span>`
}

// Les teintes des trois types vivent sur l'accueil, portees par les classes
// card-<type> / icon-<type> de style.css : c'est la qu'on choisit, et donc la
// que la couleur sert a reconnaitre. Dans un rapport ouvert, les rubriques
// suivent leur propre ordre de couleurs (mandant, lieu, lignes, photos...) -
// y rappeler le type ne creait qu'un doublon avec la rubrique voisine.
