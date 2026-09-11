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
    <linearGradient id="mai-toit" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2f95a4"/>
      <stop offset="1" stop-color="#0f4d58"/>
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
  <polygon points="88.52,48 104.1,60.6 104.1,63.6 88.52,51" fill="#0a3942"/>
  <polygon points="88.52,48 72.93,78.6 72.93,81.6 88.52,51" fill="#0c444e"/>
  <!-- pan avant, et sa tranche basse -->
  <polygon points="50.41,26 88.52,48 72.93,78.6 34.82,56.6" fill="url(#mai-toit)"/>
  <polygon points="34.82,56.6 72.93,78.6 72.93,81.6 34.82,59.6" fill="#0a3a42"/>
  <!-- faitage, pris dans la lumiere -->
  <line x1="50.41" y1="26" x2="88.52" y2="48" stroke="#6cc0cd" stroke-width="1.4" stroke-linecap="round"/>

  <!-- cheminee -->
  <polygon points="66.87,37.5 71.2,40 71.2,55.6 66.87,53.1" fill="#ece2d2"/>
  <polygon points="71.2,40 74.66,38 74.66,48.8 71.2,55.6" fill="#c8bba5"/>
  <polygon points="70.33,35.5 74.66,38 71.2,40 66.87,37.5" fill="#0f4d58"/>

  <!-- buissons, devant la maison -->
  <circle cx="33" cy="72" r="6" fill="url(#mai-buisson)"/>
  <circle cx="104.5" cy="77.5" r="6.2" fill="url(#mai-buisson)"/>
  <circle cx="97.5" cy="81" r="4.4" fill="url(#mai-buisson)"/>
</svg>`

/** Illustration par type de rapport ; un type sans illustration garde son icone. */
export const ILLUSTRATIONS = {
  detection: MAISON,
}
