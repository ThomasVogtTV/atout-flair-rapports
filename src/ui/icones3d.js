// Icones de l'en-tete de l'accueil, dessinees pour l'app en SVG, dans le style
// des illustrations des types de rapport (voir illustrations.js) : un relief
// doux (une epaisseur decalee sous chaque forme, un degrade, un reflet), et
// les couleurs de la maison - petrole, ardoise, prune, avec l'or et la terre
// cuite en touches.
//
// Elles s'affichent a une trentaine de pixels : chaque dessin tient en une
// forme franche et un seul detail qui dit sa fonction.
// Les identifiants de degrades portent un prefixe par icone.

const CARNET = `
<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="ic-ca-couv" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2d93a2"/>
      <stop offset="1" stop-color="#0e4c57"/>
    </linearGradient>
    <linearGradient id="ic-ca-pages" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#fdf9f1"/>
      <stop offset="1" stop-color="#dfd4c1"/>
    </linearGradient>
  </defs>
  <ellipse cx="25" cy="43.6" rx="14" ry="2.1" fill="#000" opacity="0.22"/>
  <!-- la tranche des pages, et ses onglets de couleur -->
  <rect x="13" y="8" width="26" height="34" rx="3.5" fill="url(#ic-ca-pages)"/>
  <rect x="37" y="12" width="4.6" height="6" rx="1.4" fill="#dc8356"/>
  <rect x="37" y="20" width="4.6" height="6" rx="1.4" fill="#f0b24a"/>
  <rect x="37" y="28" width="4.6" height="6" rx="1.4" fill="#8e9bd0"/>
  <!-- la couverture, son dos et son reflet -->
  <rect x="8" y="5" width="28" height="35" rx="4" fill="url(#ic-ca-couv)"/>
  <path d="M12 5 H14.6 V40 H12 A4 4 0 0 1 8 36 V9 A4 4 0 0 1 12 5 Z" fill="#0a3b44"/>
  <rect x="16" y="6.6" width="17" height="1.8" rx="0.9" fill="#fff" opacity="0.25"/>
  <!-- un contact en relief sur la couverture -->
  <circle cx="25" cy="18.2" r="4.3" fill="#fff" opacity="0.95"/>
  <path d="M17.6 30.6 C18.1 25.7 21.1 23.7 25 23.7 C28.9 23.7 31.9 25.7 32.4 30.6 Z" fill="#fff" opacity="0.95"/>
  <!-- l'elastique -->
  <rect x="33.2" y="5" width="1.8" height="35" fill="#dc8356"/>
</svg>`

const ENVOIS = `
<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="ic-en-corps" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fffaf2"/>
      <stop offset="1" stop-color="#e4d9c6"/>
    </linearGradient>
    <linearGradient id="ic-en-rabat" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2d93a2"/>
      <stop offset="1" stop-color="#10505c"/>
    </linearGradient>
    <linearGradient id="ic-en-badge" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f8cd74"/>
      <stop offset="1" stop-color="#d7862a"/>
    </linearGradient>
  </defs>
  <ellipse cx="23" cy="42.4" rx="16" ry="2.1" fill="#000" opacity="0.22"/>
  <!-- epaisseur, puis le corps de l'enveloppe -->
  <rect x="6.2" y="12.8" width="34" height="25" rx="4.5" fill="#bfb199"/>
  <rect x="4.5" y="10.5" width="34" height="25" rx="4.5" fill="url(#ic-en-corps)"/>
  <path d="M7 33 L18.2 23.6 M36 33 L24.8 23.6" stroke="#d3c6b0" stroke-width="1.4" stroke-linecap="round" fill="none"/>
  <!-- le rabat petrole -->
  <path d="M5.4 13.4 Q5.4 10.5 8.6 10.5 H34.4 Q37.6 10.5 37.6 13.4 L23.7 24.8 Q21.5 26.6 19.3 24.8 Z" fill="url(#ic-en-rabat)"/>
  <path d="M10 12.2 H33" stroke="#fff" stroke-opacity="0.35" stroke-width="1.2" stroke-linecap="round"/>
  <!-- la pastille dor&eacute;e : parti -->
  <circle cx="37" cy="33.5" r="8.2" fill="#fff"/>
  <circle cx="37" cy="33.5" r="6.9" fill="url(#ic-en-badge)"/>
  <path d="M33.3 33.5 H40.4 M37.6 30.5 L40.6 33.5 L37.6 36.5" stroke="#fff" stroke-width="2.1" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`

const ADMIN = `
<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="ic-ad-bouclier" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7887bd"/>
      <stop offset="1" stop-color="#2a3354"/>
    </linearGradient>
    <linearGradient id="ic-ad-or" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffdb8f"/>
      <stop offset="1" stop-color="#df9733"/>
    </linearGradient>
  </defs>
  <ellipse cx="25" cy="44" rx="12" ry="2" fill="#000" opacity="0.22"/>
  <!-- epaisseur, puis la face du bouclier -->
  <path d="M25.5 6.6 L40 11.6 V23 C40 32.5 33.8 39.5 25.5 43.5 C17.2 39.5 11 32.5 11 23 V11.6 Z" fill="#1c2440"/>
  <path d="M24 4.5 L38.5 9.5 V21.5 C38.5 31 32.3 38 24 42 C15.7 38 9.5 31 9.5 21.5 V9.5 Z" fill="url(#ic-ad-bouclier)"/>
  <path d="M24 8.3 L35 12.1 V21.6 C35 29 30.3 34.6 24 37.9 C17.7 34.6 13 29 13 21.6 V12.1 Z" fill="none" stroke="#fff" stroke-opacity="0.28" stroke-width="1.3"/>
  <path d="M11.5 10.6 L24 6.4 V18.5 C19 19 14.5 20.6 11.5 22.6 Z" fill="#fff" opacity="0.12"/>
  <!-- la serrure doree : les codes d'acces -->
  <circle cx="24" cy="19.6" r="4.7" fill="url(#ic-ad-or)"/>
  <path d="M21.5 22.4 H26.5 L27.8 30.6 H20.2 Z" fill="url(#ic-ad-or)"/>
  <circle cx="24" cy="19.6" r="1.8" fill="#2a3354"/>
  <rect x="23.15" y="20.6" width="1.7" height="5.4" rx="0.85" fill="#2a3354"/>
</svg>`

// Contour d'un engrenage : dents trapezoidales, arcs entre elles.
function engrenage(cx, cy, rExt, rInt, dents) {
  const pas = (Math.PI * 2) / dents
  const pt = (r, a) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`
  let d = ''
  for (let i = 0; i < dents; i++) {
    const a = i * pas - Math.PI / 2
    d += `${i ? 'L' : 'M'} ${pt(rInt, a - pas * 0.27)} L ${pt(rExt, a - pas * 0.15)} L ${pt(rExt, a + pas * 0.15)} L ${pt(rInt, a + pas * 0.27)} `
    d += `A ${rInt} ${rInt} 0 0 1 ${pt(rInt, a + pas * 0.73)} `
  }
  return `${d}Z`
}

const ROUE = engrenage(24, 22.5, 17, 13.2, 8)

const REGLAGES = `
<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="ic-re-roue" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#b886b3"/>
      <stop offset="1" stop-color="#5a3657"/>
    </linearGradient>
    <linearGradient id="ic-re-moyeu" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fffaf2"/>
      <stop offset="1" stop-color="#e4d9c6"/>
    </linearGradient>
  </defs>
  <ellipse cx="25" cy="43.6" rx="14.5" ry="2.1" fill="#000" opacity="0.22"/>
  <!-- epaisseur, puis la roue -->
  <path d="${ROUE}" transform="translate(1.4 2.2)" fill="#3b2139"/>
  <path d="${ROUE}" fill="url(#ic-re-roue)"/>
  <circle cx="24" cy="22.5" r="10.4" fill="none" stroke="#fff" stroke-opacity="0.2" stroke-width="1.3"/>
  <!-- le moyeu -->
  <circle cx="24.8" cy="23.6" r="6.4" fill="#3b2139"/>
  <circle cx="24" cy="22.5" r="6.4" fill="url(#ic-re-moyeu)"/>
  <circle cx="24" cy="22.5" r="2.8" fill="#5a3657"/>
</svg>`

/** Les icones de l'en-tete, par nom de bouton. */
export const ICONES_3D = {
  carnet: CARNET,
  envois: ENVOIS,
  admin: ADMIN,
  reglages: REGLAGES,
}
