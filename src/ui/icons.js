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
  moon: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><path ${ICON_FILL} d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z"/><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z"/></svg>`,
  folder: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><path ${ICON_FILL} d="M4 7a1.2 1.2 0 0 1 1.2-1.2h4.3l1.8 2H18.8A1.2 1.2 0 0 1 20 9v8.2a1.2 1.2 0 0 1-1.2 1.2H5.2A1.2 1.2 0 0 1 4 17.2Z"/><path d="M4 7a1.2 1.2 0 0 1 1.2-1.2h4.3l1.8 2H18.8A1.2 1.2 0 0 1 20 9v8.2a1.2 1.2 0 0 1-1.2 1.2H5.2A1.2 1.2 0 0 1 4 17.2Z"/></svg>`,
  mail: `<svg viewBox="0 0 24 24" ${ICON_STROKE}><rect ${ICON_FILL} x="3" y="5.5" width="18" height="13" rx="2"/><rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="m3.6 7 8.4 6 8.4-6"/></svg>`,
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
