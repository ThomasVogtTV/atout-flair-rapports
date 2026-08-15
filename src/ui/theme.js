// Theme clair/sombre : localStorage retient un choix explicite ; sans choix,
// le mode systeme (@media prefers-color-scheme) s'applique via le CSS seul.

export function currentTheme() {
  return (
    document.documentElement.dataset.theme ??
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  )
}

export function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark'
  document.documentElement.dataset.theme = next
  localStorage.setItem('af-theme', next)
}
