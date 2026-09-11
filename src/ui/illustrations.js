// Illustrations en 3D isometrique des types de rapport, dessinees a la main en
// SVG : nettes sur tous les ecrans, legeres, disponibles hors ligne, et aux
// couleurs de la maison (le petrole du toit est celui du PDF).
//
// Projection isometrique : un point (a, b, h) du monde se pose a l'ecran en
//   x = 66 + (a - b) * 0.866
//   y = 62 + (a + b) * 0.5 - h
// Les facades sont dessinees a plat dans leur propre repere, puis couchees dans
// leur plan par une matrice : on y place porte et fenetres en coordonnees
// simples (largeur, hauteur) au lieu de calculer chaque coin.
// Les identifiants de degrades portent un prefixe par illustration, pour ne
// pas se melanger quand plusieurs sont dans la meme page.

const MAISON = `
<svg viewBox="22 18 94 94" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <!-- Toit en tuiles de terre cuite : un petrole sur la tuile petrole se
         confondait avec le fond. -->
    <linearGradient id="mai-toit" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#dc8356"/>
      <stop offset="1" stop-color="#8f4126"/>
    </linearGradient>
    <!-- Facades couchees par une matrice qui retourne la hauteur : le haut de
         la vitre est donc en y = 1. -->
    <linearGradient id="mai-vitre" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#fff3c9"/>
      <stop offset="1" stop-color="#f0b24a"/>
    </linearGradient>
    <radialGradient id="mai-ombre" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#000" stop-opacity="0.38"/>
      <stop offset="1" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="mai-buisson" cx="0.35" cy="0.3" r="0.8">
      <stop offset="0" stop-color="#86c9a1"/>
      <stop offset="1" stop-color="#256148"/>
    </radialGradient>
  </defs>

  <!-- ombre portee sous le socle -->
  <ellipse cx="68" cy="105" rx="44" ry="7.5" fill="url(#mai-ombre)"/>

  <!-- socle de pelouse : deux tranches, puis le dessus -->
  <polygon points="25.3,77 72.93,104 72.93,109 25.3,82" fill="#9dbdc1"/>
  <polygon points="72.93,104 111.03,82 111.03,87 72.93,109" fill="#7a9fa4"/>
  <polygon points="64.27,55 111.03,82 72.93,104 25.3,77" fill="#dcebec"/>
  <!-- allee jusqu'a la porte -->
  <polygon points="47.8,81.5 53,84.5 46.1,88.5 40.9,85.5" fill="#f7f4ed"/>

  <!-- facade avec la porte (plan b = 30), eclairee -->
  <g transform="matrix(0.866 0.5 0 -1 40 77)">
    <rect width="38" height="24" fill="#f8f3ea"/>
    <rect y="23.1" width="38" height="0.9" fill="#d9cfbf"/>
    <rect x="8" width="8" height="14" rx="1" fill="#0f5460"/>
    <rect x="9" y="1" width="6" height="12" rx="0.6" fill="#146b79"/>
    <circle cx="14.1" cy="7" r="0.75" fill="#f0b24a"/>
    <rect x="21.5" y="7.5" width="11" height="10" fill="#e6ded0"/>
    <rect x="22.5" y="8.5" width="9" height="8" fill="url(#mai-vitre)"/>
    <rect x="26.6" y="8.5" width="0.8" height="8" fill="#e6ded0"/>
    <rect x="22.5" y="12.1" width="9" height="0.8" fill="#e6ded0"/>
  </g>

  <!-- pignon (plan a = 38), a l'ombre -->
  <g transform="matrix(-0.866 0.5 0 -1 98.9 81)">
    <rect width="30" height="24" fill="#ddd3c3"/>
    <polygon points="0,24 30,24 15,42" fill="#ddd3c3"/>
    <rect y="23.1" width="30" height="0.9" fill="#c9bca8"/>
    <rect x="8.5" y="7.5" width="13" height="10" fill="#cbbfab"/>
    <rect x="9.5" y="8.5" width="11" height="8" fill="url(#mai-vitre)"/>
    <rect x="14.6" y="8.5" width="0.8" height="8" fill="#cbbfab"/>
    <circle cx="15" cy="30" r="2.9" fill="#cbbfab"/>
    <circle cx="15" cy="30" r="2.1" fill="url(#mai-vitre)"/>
  </g>

  <!-- tranche du toit cote pignon : le ^ de la couverture -->
  <polygon points="88.52,48 104.1,60.6 104.1,63.6 88.52,51" fill="#5f2818"/>
  <polygon points="88.52,48 72.93,78.6 72.93,81.6 88.52,51" fill="#73321e"/>
  <!-- pan avant, et sa tranche basse -->
  <polygon points="50.41,26 88.52,48 72.93,78.6 34.82,56.6" fill="url(#mai-toit)"/>
  <polygon points="34.82,56.6 72.93,78.6 72.93,81.6 34.82,59.6" fill="#5a2517"/>
  <!-- faitage, pris dans la lumiere -->
  <line x1="50.41" y1="26" x2="88.52" y2="48" stroke="#f6b590" stroke-width="1.4" stroke-linecap="round"/>

  <!-- cheminee -->
  <polygon points="66.87,37.5 71.2,40 71.2,55.6 66.87,53.1" fill="#ece2d2"/>
  <polygon points="71.2,40 74.66,38 74.66,48.8 71.2,55.6" fill="#c8bba5"/>
  <polygon points="70.33,35.5 74.66,38 71.2,40 66.87,37.5" fill="#5a2517"/>

  <!-- buissons, devant la maison -->
  <circle cx="33" cy="72" r="6" fill="url(#mai-buisson)"/>
  <circle cx="104.5" cy="77.5" r="6.2" fill="url(#mai-buisson)"/>
  <circle cx="97.5" cy="81" r="4.4" fill="url(#mai-buisson)"/>
</svg>`

// --- briques communes a l'immeuble et a l'hotel ------------------------------

// Une fenetre dans une facade couchee : cadre, puis vitre - allumee (chaude)
// ou eteinte (le reflet froid d'une vitre le soir). Coordonnees de facade.
const fenetre = (p, x, y, w, h, allumee, cadre) =>
  `<rect x="${x - 0.6}" y="${y - 0.6}" width="${w + 1.2}" height="${h + 1.2}" fill="${cadre}"/>` +
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${p}-${allumee ? 'vitre' : 'nuit'})"/>`

// Une rangee de fenetres par etage ; `motif` dit lesquelles sont allumees,
// pour que la facade vive sans avoir l'air tiree au sort a chaque dessin.
function etages(p, { xs, w, h, planchers, motif, cadre }) {
  return planchers
    .map((y, i) => xs.map((x, j) => fenetre(p, x, y, w, h, motif[(i + j) % motif.length], cadre)).join(''))
    .join('')
}

// Les degrades de vitres et de buissons, prefixes par illustration.
const degradesCommuns = (p) => `
    <linearGradient id="${p}-vitre" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#fff3c9"/>
      <stop offset="1" stop-color="#f0b24a"/>
    </linearGradient>
    <linearGradient id="${p}-nuit" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="#8fa1c7"/>
      <stop offset="0.55" stop-color="#4a5a82"/>
      <stop offset="1" stop-color="#2c3656"/>
    </linearGradient>
    <radialGradient id="${p}-ombre" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#000" stop-opacity="0.38"/>
      <stop offset="1" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${p}-buisson" cx="0.35" cy="0.3" r="0.8">
      <stop offset="0" stop-color="#86c9a1"/>
      <stop offset="1" stop-color="#256148"/>
    </radialGradient>`

// --- l'immeuble : cinq etages sur son socle, toit plat -----------------------
// Projection decalee (x0 = 68, y0 = 73) : il est plus haut que la maison.
// Emprise a 0..30, b 0..24, hauteur 50 ; facade gauche (b = 24) eclairee,
// facade droite (a = 30) a l'ombre.
function dessinerImmeuble() {
  const p = 'imm'
  const cadreG = '#e3ded3'
  const cadreD = '#c6c0b4'
  const facadeG = `
    <rect width="30" height="50" fill="#f5f2eb"/>
    ${[10, 20, 30, 40].map((y) => `<rect y="${y - 0.4}" width="30" height="0.8" fill="#e2ddd2"/>`).join('')}
    <rect y="48.8" width="30" height="1.2" fill="#cfc9bd"/>
    ${etages(p, { xs: [3.5, 12.5, 21.5], w: 5, h: 5.5, planchers: [12.5, 22.5, 32.5, 42.5], motif: [true, false, true, true, false], cadre: cadreG })}
    ${fenetre(p, 3, 2.5, 5, 5.5, true, cadreG)}
    ${fenetre(p, 22, 2.5, 5, 5.5, false, cadreG)}
    <rect x="11" width="8" height="8.4" fill="#3f4c73"/>
    <rect x="12" y="0.8" width="6" height="6.8" fill="url(#${p}-vitre)"/>
    <rect x="14.6" y="0.8" width="0.8" height="6.8" fill="#3f4c73"/>
    <rect x="10" y="8.6" width="10" height="1.5" fill="#2c3656"/>`
  const facadeD = `
    <rect width="24" height="50" fill="#d7d2c7"/>
    ${[10, 20, 30, 40].map((y) => `<rect y="${y - 0.4}" width="24" height="0.8" fill="#c7c1b5"/>`).join('')}
    <rect y="48.8" width="24" height="1.2" fill="#b9b2a5"/>
    ${etages(p, { xs: [3, 10, 17], w: 4.5, h: 5.5, planchers: [2.5, 12.5, 22.5, 32.5, 42.5], motif: [false, true, true, false, true, false], cadre: cadreD })}`

  return `
<svg viewBox="22 18 94 94" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>${degradesCommuns(p)}</defs>
  <ellipse cx="70" cy="108" rx="40" ry="5.5" fill="url(#${p}-ombre)"/>

  <!-- socle -->
  <polygon points="36.82,85 73.2,106 73.2,111 36.82,90" fill="#b1b9cf"/>
  <polygon points="73.2,106 104.37,88 104.37,93 73.2,111" fill="#959eb8"/>
  <polygon points="68,67 104.37,88 73.2,106 36.82,85" fill="#e4e8f1"/>
  <polygon points="56.74,90.5 63.67,94.5 58.47,97.5 51.55,93.5" fill="#f7f6f2"/>

  <!-- facades -->
  <g transform="matrix(0.866 0.5 0 -1 47.22 85)">${facadeG}</g>
  <g transform="matrix(-0.866 0.5 0 -1 93.98 88)">${facadeD}</g>

  <!-- toit plat : l'acrotere, puis la dalle en retrait -->
  <polygon points="68,23 93.98,38 73.2,50 47.22,35" fill="#cdd3e4"/>
  <polygon points="68,26.5 90.52,39.5 73.2,49.5 50.68,36.5" fill="#8e98b8"/>
  <!-- local technique sur le toit -->
  <g transform="matrix(0.866 0.5 0 -1 73.2 39.5)"><rect width="7" height="7.5" fill="#eceae4"/></g>
  <g transform="matrix(-0.866 0.5 0 -1 84.45 40)"><rect width="6" height="7.5" fill="#c9c4b9"/></g>
  <polygon points="78.39,29 84.45,32.5 79.26,35.5 73.2,32" fill="#3f4c73"/>

  <!-- arbres -->
  <circle cx="41.5" cy="80" r="5.2" fill="url(#${p}-buisson)"/>
  <circle cx="97" cy="85" r="5.4" fill="url(#${p}-buisson)"/>
  <circle cx="91" cy="89" r="3.8" fill="url(#${p}-buisson)"/>
</svg>`
}

// --- l'hotel : trois etages, balcons, hall vitre, enseigne etoilee ----------
// Projection (x0 = 66, y0 = 70). Emprise a 0..36, b 0..22, hauteur 34.
function dessinerHotel() {
  const p = 'hot'
  const cadreG = '#eadccd'
  const cadreD = '#cdbdad'
  // Garde-corps des balcons, poses devant le bas des fenetres.
  const balcons = (xs, planchers) =>
    planchers
      .map((y) => xs.map((x) => `<rect x="${x - 1}" y="${y + 1}" width="7.5" height="1.8" rx="0.3" fill="#8e5f89"/>`).join(''))
      .join('')
  const facadeG = `
    <rect width="36" height="34" fill="#fbf3ea"/>
    ${[12, 23].map((y) => `<rect y="${y - 0.4}" width="36" height="0.8" fill="#eadccd"/>`).join('')}
    <rect y="32.8" width="36" height="1.2" fill="#d6c4b3"/>
    ${fenetre(p, 2, 1.5, 10, 8.5, true, cadreG)}
    ${fenetre(p, 24, 1.5, 10, 8.5, true, cadreG)}
    <rect x="14" width="8" height="9.4" fill="#4a2c48"/>
    <rect x="15" y="0.8" width="6" height="7.8" fill="url(#${p}-vitre)"/>
    <rect x="12.5" y="9.6" width="11" height="2.6" fill="#6b4468"/>
    <rect x="12.5" y="9.6" width="11" height="0.8" fill="#8e5f89"/>
    ${etages(p, { xs: [3, 11, 19, 27], w: 5.5, h: 6, planchers: [14.5, 25.5], motif: [true, false, true, true, false, true, false], cadre: cadreG })}
    ${balcons([3, 11, 19, 27], [14.5, 25.5])}`
  const facadeD = `
    <rect width="22" height="34" fill="#ddd0c3"/>
    ${[12, 23].map((y) => `<rect y="${y - 0.4}" width="22" height="0.8" fill="#cbbcad"/>`).join('')}
    <rect y="32.8" width="22" height="1.2" fill="#bba998"/>
    ${fenetre(p, 3, 1.5, 16, 8.5, true, cadreD)}
    ${etages(p, { xs: [3, 9.5, 16], w: 4, h: 6, planchers: [14.5, 25.5], motif: [false, true, true, false], cadre: cadreD })}`
  // Enseigne sur le toit : un panneau prune cercle d'or, trois etoiles.
  const etoile = '0,2.4 -0.588,0.809 -2.28,0.742 -0.951,-0.309 -1.41,-1.94 0,-1 1.41,-1.94 0.951,-0.309 2.28,0.742 0.588,0.809'
  const enseigne = `
    <rect x="3" width="1" height="3" fill="#4a2c48"/>
    <rect x="16" width="1" height="3" fill="#4a2c48"/>
    <rect y="2.5" width="20" height="10" rx="1" fill="#f0b24a"/>
    <rect x="0.8" y="3.3" width="18.4" height="8.4" rx="0.7" fill="#4a2c48"/>
    ${[5, 10, 15].map((x) => `<polygon points="${etoile}" transform="translate(${x} 7.5)" fill="#f7c661"/>`).join('')}`

  return `
<svg viewBox="22 18 94 94" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>${degradesCommuns(p)}</defs>
  <ellipse cx="72" cy="107" rx="40" ry="5.5" fill="url(#${p}-ombre)"/>

  <!-- socle -->
  <polygon points="36.56,81 78.12,105 78.12,110 36.56,86" fill="#cdb8c8"/>
  <polygon points="78.12,105 107.57,88 107.57,93 78.12,110" fill="#b097ab"/>
  <polygon points="66,64 107.57,88 78.12,105 36.56,81" fill="#f0e7ec"/>
  <polygon points="59.07,88 66,92 60.8,95 53.88,91" fill="#fbf8f4"/>

  <!-- facades -->
  <g transform="matrix(0.866 0.5 0 -1 46.95 81)">${facadeG}</g>
  <g transform="matrix(-0.866 0.5 0 -1 97.18 88)">${facadeD}</g>

  <!-- toit plat -->
  <polygon points="66,36 97.18,54 78.12,65 46.95,47" fill="#eddde8"/>
  <polygon points="66,39.5 93.71,55.5 78.12,64.5 50.41,48.5" fill="#b596ae"/>
  <!-- enseigne, couchee dans le plan b = 16 -->
  <g transform="matrix(0.866 0.5 0 -1 59.07 49.5)">${enseigne}</g>

  <!-- buissons -->
  <circle cx="41" cy="77" r="5.2" fill="url(#${p}-buisson)"/>
  <circle cx="101" cy="85" r="5.4" fill="url(#${p}-buisson)"/>
  <circle cx="94.5" cy="89" r="3.8" fill="url(#${p}-buisson)"/>
</svg>`
}

/** Illustration par type de rapport ; un type sans illustration garde son icone. */
export const ILLUSTRATIONS = {
  detection: MAISON,
  immeuble: dessinerImmeuble(),
  hotel: dessinerHotel(),
}
