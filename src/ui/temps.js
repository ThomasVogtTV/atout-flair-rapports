// Le temps, tel qu'on le dit dans l'app : Terrain et le Bureau parlent pareil.

// "il y a 3 minutes" plutot qu'une heure exacte : ce qu'on veut savoir d'un
// envoi, c'est s'il vient de partir ou s'il traine depuis hier.
export function ilYA(ts) {
  if (!ts) return ''
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 60) return "à l'instant"
  const min = Math.round(s / 60)
  if (min < 60) return `il y a ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `il y a ${h} h`
  const j = Math.round(h / 24)
  return j <= 1 ? 'hier' : `il y a ${j} jours`
}
