// Le filet retient-il quelque chose ?
//
// Une suite verte ne prouve rien tant qu'on ne l'a pas vue rougir. On casse
// donc l'app, un defaut a la fois - chacun etant un defaut qu'on a reellement
// eu - et l'on verifie que la suite le voit. Un defaut qui passe est un trou.
//
// Les fichiers sont en CRLF : une mutation ne peut porter que sur une ligne.
//
// A relancer apres avoir ajoute des tests : `npm run test:mutations`.

import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const MUTATIONS = [
  {
    nom: 'le PDF refiltre les pieces vides',
    fichier: 'src/state.js',
    de: 'export const filledRows = (report) => report.rows',
    a: 'export const filledRows = (report) => report.rows.filter((r) => r.nom || r.numero || r.resident)',
  },
  {
    nom: 'supprimer un immeuble laisse ses sous-rapports',
    fichier: 'src/state.js',
    de: "  for (const enfant of enfants) await db.del('reports', enfant.id)",
    a: '  // supprime',
  },
  {
    nom: 'supprimer un sous-rapport laisse la ligne pointer dans le vide',
    fichier: 'src/state.js',
    de: '      ligne.sousRapportId = null',
    a: '      ligne.sousRapportId = ligne.sousRapportId',
  },
  {
    nom: 'le compteur ne se reprend pas sur la base',
    fichier: 'src/state.js',
    de: '  const juste = Math.max(compteur, plusHaut)',
    a: '  const juste = compteur',
  },
  {
    nom: 'la reprise du compteur ne remet pas localStorage a niveau',
    fichier: 'src/state.js',
    de: '  if (juste > enregistre) localStorage.setItem(REF_KEY, String(juste))',
    a: '  // pas de mise a niveau',
  },
  {
    nom: 'le compteur perd sa copie en memoire',
    fichier: 'src/state.js',
    de: "  const n = Math.max(Number(localStorage.getItem(REF_KEY) ?? '0'), compteurMemoire) + 1",
    a: "  const n = Number(localStorage.getItem(REF_KEY) ?? '0') + 1",
  },
  {
    nom: 'terminer un rapport ne change pas son etat',
    fichier: 'src/state.js',
    de: "  report.status = 'done'",
    a: '  report.status = report.status',
  },
  {
    nom: 'une ecriture refusee ne previent personne',
    fichier: 'src/state.js',
    de: '    signalEcriture?.(memoirePleine(err))',
    a: '    // silence',
  },
  {
    nom: 'le nom de fichier garde ses accents',
    fichier: 'src/state.js',
    de: '  const parts = [who, `${slug(t.label)} du ${date}`]',
    a: '  const parts = [who, `${t.label} du ${date}`]',
  },
  {
    nom: 'les lettres hors WinAnsi disparaissent au lieu de se transcrire',
    fichier: 'src/pdf.js',
    de: '            HORS_WINANSI[c] ??',
    a: "            ('' || undefined) ??",
  },
  {
    nom: 'une photo de telephone reprend toute la page',
    fichier: 'src/pdf.js',
    de: 'const PHOTOS_PAR_PAGE = 4',
    a: 'const PHOTOS_PAR_PAGE = 1',
  },
  {
    nom: "l'en-tete du tableau se resserre sur ses intitules",
    fichier: 'src/pdf.js',
    de: '  const headH = 27',
    a: '  const headH = 19',
  },
  {
    nom: 'le filet de separation remonte dans les intitules',
    fichier: 'src/pdf.js',
    de: '  const filet = 15',
    a: '  const filet = 21',
  },
  {
    // Le defaut d'origine : mesurer sur une largeur, ecrire sur une autre. Il
    // se rejoue en touchant le point de mesure, pas la constante partagee -
    // changer celle-ci deplacerait les deux ensemble, sans rien casser.
    //
    // L'ecart doit depasser douze points : en deca, les 12 pt de marge d'une
    // rangee absorbent la ligne excedentaire et il n'y a tout simplement pas de
    // defaut a voir. Mesure faite en balayant les quarante-deux longueurs de
    // constat, a +4 (aucun debordement), +12 et +30 (debordements).
    nom: 'la mesure du texte reprend une largeur differente du rendu',
    fichier: 'src/pdf.js',
    de: '    const lines = Math.max(1, sh.countLines(row.info, { size: 8.2, maxW: infoW }))',
    a: '    const lines = Math.max(1, sh.countLines(row.info, { size: 8.2, maxW: infoW + 12 }))',
  },
  {
    nom: 'le numero de rapport repasse en rouge',
    fichier: 'src/pdf.js',
    de: 'const ACCENT = rgb(0.055, 0.486, 0.576)',
    a: 'const ACCENT = rgb(0.753, 0.165, 0.165)',
  },
  {
    nom: 'le verdict ne distingue plus contamine de sain',
    fichier: 'src/pdf.js',
    de: 'const GREEN = rgb(0.122, 0.478, 0.302)',
    a: 'const GREEN = rgb(0.753, 0.165, 0.165)',
  },
]

const suite = () => {
  try {
    execFileSync('npm', ['test'], { stdio: 'pipe', shell: true })
    return { vert: true }
  } catch (err) {
    const sortie = `${err.stdout ?? ''}${err.stderr ?? ''}`
    const rates = [...sortie.matchAll(/^✖ (?!failing)(.+?) \(/gm)].map((m) => m[1])
    return { vert: false, rates: [...new Set(rates)] }
  }
}

console.log('Etat de depart…')
const depart = suite()
if (!depart.vert) {
  console.error('La suite est deja rouge :', depart.rates)
  process.exit(1)
}
console.log('  suite verte, on peut casser.\n')

let trous = 0
for (const m of MUTATIONS) {
  const avant = readFileSync(m.fichier, 'utf8')
  if (!avant.includes(m.de)) {
    console.log(`?     ${m.nom}\n      -> point de mutation introuvable dans ${m.fichier}`)
    trous++
    continue
  }
  writeFileSync(m.fichier, avant.replace(m.de, m.a))
  const r = suite()
  writeFileSync(m.fichier, avant)

  if (r.vert) {
    console.log(`TROU  ${m.nom}\n      -> aucun test ne le voit`)
    trous++
  } else {
    console.log(`vu    ${m.nom}\n      -> ${r.rates.slice(0, 3).join(' | ')}`)
  }
}

console.log(`\n${MUTATIONS.length - trous}/${MUTATIONS.length} defauts attrapes.`)
const fin = suite()
console.log(fin.vert ? 'Sources rendues intactes.' : 'ATTENTION : la suite est rouge apres coup.')
process.exit(trous ? 1 : 0)
