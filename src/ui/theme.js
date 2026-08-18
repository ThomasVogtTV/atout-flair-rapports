// Theme clair/sombre. Trois etats, et non deux : sans choix enregistre, l'app
// suit le reglage du telephone (@media prefers-color-scheme, applique par le
// CSS seul). Le bouton bascule d'avant ne connaissait que clair et sombre : une
// fois touche, on ne pouvait plus revenir au mode systeme.

export const THEMES = [
  { key: 'systeme', label: 'Système' },
  { key: 'light', label: 'Clair' },
  { key: 'dark', label: 'Sombre' },
]

/** Choix enregistre : 'systeme' tant que l'utilisateur n'a rien impose. */
export function themeChoice() {
  const v = localStorage.getItem('af-theme')
  return v === 'light' || v === 'dark' ? v : 'systeme'
}

export function setTheme(choice) {
  if (choice === 'systeme') {
    delete document.documentElement.dataset.theme
    localStorage.removeItem('af-theme')
    return
  }
  document.documentElement.dataset.theme = choice
  localStorage.setItem('af-theme', choice)
}
