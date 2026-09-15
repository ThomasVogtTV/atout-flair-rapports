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

// L'administration : un badge d'acces ardoise, au cordon, avec sa photo et son
// sceau dore de chef d'equipe - c'est lui qui donne et retire les acces. Un
// objet plutot qu'un personnage, comme les autres portes de l'accueil.
const ADMIN = `
<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="ic-ad-carte" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7887bd"/>
      <stop offset="1" stop-color="#2a3354"/>
    </linearGradient>
    <linearGradient id="ic-ad-photo" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fffaf2"/>
      <stop offset="1" stop-color="#e6dcc9"/>
    </linearGradient>
    <linearGradient id="ic-ad-or" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffdb8f"/>
      <stop offset="1" stop-color="#df9733"/>
    </linearGradient>
  </defs>
  <ellipse cx="24" cy="43.6" rx="13.5" ry="2.1" fill="#000" opacity="0.22"/>
  <!-- le cordon et son clip -->
  <path d="M20.5 9.5 C20.5 6 22 4 24 4 C26 4 27.5 6 27.5 9.5" fill="none" stroke="#1c2440" stroke-width="2.4" stroke-linecap="round"/>
  <rect x="20.5" y="7.6" width="7" height="4.4" rx="2.2" fill="#8b96c4"/>
  <!-- epaisseur, puis le badge -->
  <rect x="10.4" y="10.4" width="27" height="33" rx="5" fill="#1c2440"/>
  <rect x="9" y="9" width="27" height="33" rx="5" fill="url(#ic-ad-carte)"/>
  <rect x="12.5" y="12.5" width="20" height="1.6" rx="0.8" fill="#fff" opacity="0.22"/>
  <!-- la photo -->
  <circle cx="22.5" cy="21.7" r="7.4" fill="url(#ic-ad-photo)"/>
  <circle cx="22.5" cy="19.4" r="2.9" fill="#aa9c86"/>
  <path d="M16.6 27.3 C17.1 22.8 19.4 20.9 22.5 20.9 C25.6 20.9 27.9 22.8 28.4 27.3 Z" fill="#aa9c86"/>
  <!-- les lignes d'identite -->
  <rect x="12.5" y="33.4" width="16" height="1.7" rx="0.85" fill="#fff" opacity="0.3"/>
  <rect x="12.5" y="37.4" width="11" height="1.7" rx="0.85" fill="#fff" opacity="0.22"/>
  <!-- le sceau du chef, epingle au coin -->
  <circle cx="32.5" cy="33.6" r="7.6" fill="#fff"/>
  <circle cx="32.5" cy="33.6" r="6.3" fill="url(#ic-ad-or)"/>
  <polygon points="0,2.4 -0.588,0.809 -2.28,0.742 -0.951,-0.309 -1.41,-1.94 0,-1 1.41,-1.94 0.951,-0.309 2.28,0.742 0.588,0.809" transform="translate(32.5 33.7) scale(1.7 -1.7)" fill="#fffaf2"/>
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

// Les rapports : une feuille au bandeau petrole, posee sur une autre, et le
// sceau de terre cuite qui dit qu'elle est signee.
const RAPPORTS = `
<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="ic-ra-page" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fffaf2"/>
      <stop offset="1" stop-color="#e6dcc9"/>
    </linearGradient>
    <linearGradient id="ic-ra-bande" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2d93a2"/>
      <stop offset="1" stop-color="#0e4c57"/>
    </linearGradient>
    <radialGradient id="ic-ra-sceau" cx="0.35" cy="0.3" r="0.8">
      <stop offset="0" stop-color="#eea27a"/>
      <stop offset="1" stop-color="#b3552f"/>
    </radialGradient>
  </defs>
  <ellipse cx="24" cy="43.8" rx="15" ry="2.1" fill="#000" opacity="0.22"/>
  <!-- la feuille de dessous, un peu de travers -->
  <rect x="11.5" y="6.5" width="25" height="32" rx="3.5" transform="rotate(-8 24 23)" fill="#cbbda3"/>
  <!-- epaisseur, puis la feuille de dessus -->
  <rect x="12.7" y="8.9" width="25" height="32" rx="3.5" fill="#bfb199"/>
  <rect x="11" y="7" width="25" height="32" rx="3.5" fill="url(#ic-ra-page)"/>
  <!-- le bandeau du rapport -->
  <path d="M14.5 7 H32.5 A3.5 3.5 0 0 1 36 10.5 V14.8 H11 V10.5 A3.5 3.5 0 0 1 14.5 7 Z" fill="url(#ic-ra-bande)"/>
  <rect x="14.5" y="9.7" width="11" height="1.8" rx="0.9" fill="#fff" opacity="0.5"/>
  <!-- les lignes du texte -->
  <rect x="14.5" y="19.2" width="17" height="1.9" rx="0.95" fill="#cdbfa8"/>
  <rect x="14.5" y="23.6" width="12.5" height="1.9" rx="0.95" fill="#cdbfa8"/>
  <rect x="14.5" y="28" width="15" height="1.9" rx="0.95" fill="#cdbfa8"/>
  <!-- le sceau -->
  <circle cx="33.6" cy="34.2" r="7.8" fill="#fff"/>
  <circle cx="33.6" cy="34.2" r="6.5" fill="url(#ic-ra-sceau)"/>
  <path d="M30.6 34.3 L32.8 36.5 L36.8 32" stroke="#fff" stroke-width="2.1" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`

// L'agenda : la page du calendrier, son bandeau petrole et ses anneaux, et le
// jour du rendez-vous en or parmi les autres.
const AGENDA = `
<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="ic-ag-page" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fffaf2"/>
      <stop offset="1" stop-color="#e6dcc9"/>
    </linearGradient>
    <linearGradient id="ic-ag-bande" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2d93a2"/>
      <stop offset="1" stop-color="#0e4c57"/>
    </linearGradient>
    <linearGradient id="ic-ag-or" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f8cd74"/>
      <stop offset="1" stop-color="#d7862a"/>
    </linearGradient>
  </defs>
  <ellipse cx="24.5" cy="43.6" rx="16" ry="2.1" fill="#000" opacity="0.22"/>
  <!-- epaisseur, puis la page -->
  <rect x="7.6" y="11.4" width="34" height="30" rx="5" fill="#bfb199"/>
  <rect x="6" y="9.6" width="34" height="30" rx="5" fill="url(#ic-ag-page)"/>
  <path d="M11 9.6 H35 A5 5 0 0 1 40 14.6 V18.6 H6 V14.6 A5 5 0 0 1 11 9.6 Z" fill="url(#ic-ag-bande)"/>
  <rect x="10" y="12" width="13" height="1.7" rx="0.85" fill="#fff" opacity="0.3"/>
  <!-- les anneaux -->
  <rect x="13.2" y="6" width="3.4" height="8.2" rx="1.7" fill="#2f3a44"/>
  <rect x="29.4" y="6" width="3.4" height="8.2" rx="1.7" fill="#2f3a44"/>
  <rect x="13.9" y="6.8" width="1.1" height="5" rx="0.55" fill="#fff" opacity="0.35"/>
  <rect x="30.1" y="6.8" width="1.1" height="5" rx="0.55" fill="#fff" opacity="0.35"/>
  <!-- les jours -->
  <g fill="#d9cdb8">
    <rect x="9.6" y="22.4" width="5.6" height="4.6" rx="1.3"/>
    <rect x="17.4" y="22.4" width="5.6" height="4.6" rx="1.3"/>
    <rect x="25.2" y="22.4" width="5.6" height="4.6" rx="1.3"/>
    <rect x="33" y="22.4" width="4.2" height="4.6" rx="1.3"/>
    <rect x="9.6" y="30.2" width="5.6" height="4.6" rx="1.3"/>
    <rect x="17.4" y="30.2" width="5.6" height="4.6" rx="1.3"/>
    <rect x="33" y="30.2" width="4.2" height="4.6" rx="1.3"/>
  </g>
  <!-- le jour du rendez-vous -->
  <rect x="24.4" y="29.4" width="7.2" height="6.2" rx="1.8" fill="url(#ic-ag-or)"/>
  <rect x="25.6" y="30.3" width="4.8" height="1.2" rx="0.6" fill="#fff" opacity="0.5"/>
</svg>`

// L'equipe, pour le Bureau : deux badges d'acces en eventail, prune derriere,
// petrole devant - les memes badges que celui de l'administration.
const EQUIPE = `
<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="ic-eq-arriere" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#b886b3"/>
      <stop offset="1" stop-color="#5a3657"/>
    </linearGradient>
    <linearGradient id="ic-eq-avant" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2d93a2"/>
      <stop offset="1" stop-color="#0e4c57"/>
    </linearGradient>
    <linearGradient id="ic-eq-photo" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fffaf2"/>
      <stop offset="1" stop-color="#e6dcc9"/>
    </linearGradient>
  </defs>
  <ellipse cx="24" cy="43.6" rx="16" ry="2.1" fill="#000" opacity="0.22"/>
  <!-- le badge de derriere, penche -->
  <g transform="rotate(-12 15 24)">
    <rect x="5.8" y="10.4" width="21" height="27" rx="4.5" fill="#3b2139"/>
    <rect x="4.5" y="9" width="21" height="27" rx="4.5" fill="url(#ic-eq-arriere)"/>
    <circle cx="15" cy="18.6" r="5.6" fill="url(#ic-eq-photo)"/>
    <circle cx="15" cy="17" r="2.2" fill="#aa9c86"/>
    <path d="M10.6 22.8 C11 19.6 12.7 18.3 15 18.3 C17.3 18.3 19 19.6 19.4 22.8 Z" fill="#aa9c86"/>
    <rect x="8" y="27.6" width="11" height="1.5" rx="0.75" fill="#fff" opacity="0.3"/>
  </g>
  <!-- le badge de devant -->
  <g transform="rotate(7 31 25)">
    <rect x="21.4" y="12.4" width="22" height="28" rx="4.8" fill="#0a3b44"/>
    <rect x="20" y="11" width="22" height="28" rx="4.8" fill="url(#ic-eq-avant)"/>
    <rect x="23.5" y="13.8" width="15" height="1.5" rx="0.75" fill="#fff" opacity="0.25"/>
    <circle cx="31" cy="21.4" r="6" fill="url(#ic-eq-photo)"/>
    <circle cx="31" cy="19.6" r="2.4" fill="#aa9c86"/>
    <path d="M26.3 26.2 C26.7 22.7 28.5 21.3 31 21.3 C33.5 21.3 35.3 22.7 35.7 26.2 Z" fill="#aa9c86"/>
    <rect x="24" y="30.6" width="13" height="1.6" rx="0.8" fill="#fff" opacity="0.32"/>
    <rect x="24" y="34" width="8.5" height="1.6" rx="0.8" fill="#fff" opacity="0.22"/>
  </g>
</svg>`

// Les rapports d'invites a relire : la page au bandeau ardoise, et la loupe
// doree de la relecture posee dessus.
const VALIDER = `
<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="ic-va-page" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fffaf2"/>
      <stop offset="1" stop-color="#e6dcc9"/>
    </linearGradient>
    <linearGradient id="ic-va-bande" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7887bd"/>
      <stop offset="1" stop-color="#2a3354"/>
    </linearGradient>
    <linearGradient id="ic-va-or" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffdb8f"/>
      <stop offset="1" stop-color="#c9811f"/>
    </linearGradient>
    <radialGradient id="ic-va-verre" cx="0.35" cy="0.3" r="0.85">
      <stop offset="0" stop-color="#eef8f9"/>
      <stop offset="1" stop-color="#8fc3ca"/>
    </radialGradient>
  </defs>
  <ellipse cx="24" cy="43.8" rx="15.5" ry="2.1" fill="#000" opacity="0.22"/>
  <!-- epaisseur, puis la page -->
  <rect x="9.7" y="6.9" width="25" height="33" rx="3.5" fill="#bfb199"/>
  <rect x="8" y="5" width="25" height="33" rx="3.5" fill="url(#ic-va-page)"/>
  <path d="M11.5 5 H29.5 A3.5 3.5 0 0 1 33 8.5 V12.6 H8 V8.5 A3.5 3.5 0 0 1 11.5 5 Z" fill="url(#ic-va-bande)"/>
  <rect x="11.5" y="7.7" width="10" height="1.8" rx="0.9" fill="#fff" opacity="0.45"/>
  <!-- les lignes du texte -->
  <rect x="11.5" y="17" width="16" height="1.9" rx="0.95" fill="#cdbfa8"/>
  <rect x="11.5" y="21.4" width="12" height="1.9" rx="0.95" fill="#cdbfa8"/>
  <rect x="11.5" y="25.8" width="14" height="1.9" rx="0.95" fill="#cdbfa8"/>
  <!-- la loupe : le manche, la monture doree, le verre et son reflet -->
  <path d="M37 37 L41.6 41.6" stroke="#6b4417" stroke-width="5.2" stroke-linecap="round"/>
  <path d="M37 37 L41.2 41.2" stroke="#e3a445" stroke-width="3.4" stroke-linecap="round"/>
  <circle cx="32" cy="32.4" r="9.2" fill="#6b4417" opacity="0.4"/>
  <circle cx="31" cy="31" r="9" fill="url(#ic-va-or)"/>
  <circle cx="31" cy="31" r="6.5" fill="url(#ic-va-verre)"/>
  <path d="M27.3 29.3 A4.4 4.4 0 0 1 30.4 26.6" stroke="#fff" stroke-width="1.6" stroke-linecap="round" fill="none" opacity="0.9"/>
</svg>`

// Les incidents techniques : le panneau de danger en terre cuite, et son point
// d'exclamation creme.
const INCIDENTS = `
<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="ic-in-panneau" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#eea27a"/>
      <stop offset="1" stop-color="#a8472a"/>
    </linearGradient>
    <linearGradient id="ic-in-signe" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fffaf2"/>
      <stop offset="1" stop-color="#e6dcc9"/>
    </linearGradient>
  </defs>
  <ellipse cx="24" cy="43.6" rx="16" ry="2.1" fill="#000" opacity="0.22"/>
  <!-- epaisseur, puis le panneau -->
  <path d="M26.9 8.4 L42.6 36.4 A3.6 3.6 0 0 1 39.5 41.8 H8.1 A3.6 3.6 0 0 1 5 36.4 L20.7 8.4 A3.6 3.6 0 0 1 26.9 8.4 Z" transform="translate(1.2 1.6)" fill="#6e2a17"/>
  <path d="M26.9 8.4 L42.6 36.4 A3.6 3.6 0 0 1 39.5 41.8 H8.1 A3.6 3.6 0 0 1 5 36.4 L20.7 8.4 A3.6 3.6 0 0 1 26.9 8.4 Z" fill="url(#ic-in-panneau)"/>
  <path d="M19.6 13.4 L22.2 8.9" stroke="#fff" stroke-opacity="0.45" stroke-width="1.6" stroke-linecap="round"/>
  <!-- le point d'exclamation -->
  <rect x="21.6" y="17" width="4.4" height="13.4" rx="2.2" fill="url(#ic-in-signe)"/>
  <circle cx="23.8" cy="35.3" r="2.5" fill="url(#ic-in-signe)"/>
</svg>`

/** Les icones dessinees de l'app, par nom de porte. */
export const ICONES_3D = {
  carnet: CARNET,
  envois: ENVOIS,
  admin: ADMIN,
  reglages: REGLAGES,
  rapports: RAPPORTS,
  agenda: AGENDA,
  equipe: EQUIPE,
  valider: VALIDER,
  incidents: INCIDENTS,
}
