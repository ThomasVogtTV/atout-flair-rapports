// Copie de la base de l'equipe, chaque nuit, dans le stockage prive.
//
// La base (Upstash) ne garde aucune copie d'elle-meme sur son plan gratuit :
// une fausse manoeuvre, et l'equipe perdait d'un coup ses codes, son agenda, son
// carnet commun et le journal des envois. Vercel appelle cette adresse chaque
// nuit (voir "crons" dans vercel.json) : elle depose base/AAAA-MM-JJ.json et
// efface la copie d'il y a trente jours.
//
// Aucun secret a garder : appelee par n'importe qui, elle ne fait jamais plus
// d'une copie par vingt heures, et ne renvoie rien de ce qu'elle copie.

import { baseConfiguree, exporterBase, reserverCopie, libererCopie, noterCopie } from './_lib/equipe.js'
import { stockageConfigure, ecrireFichier, supprimerFichiers } from './_lib/stockage.js'
import { jourSuisse } from './_lib/agenda.js'

const GARDE_JOURS = 30
export const cheminCopie = (jour) => `base/${jour}.json`

export default async function handler(req, res) {
  if (!baseConfiguree() || !stockageConfigure()) {
    return res.status(503).json({ error: 'Base ou stockage non configuré' })
  }
  let reserve = false
  try {
    reserve = await reserverCopie()
    if (!reserve) return res.status(200).json({ ok: true, deja: true })
    const maintenant = Date.now()
    const jour = jourSuisse(maintenant)
    await ecrireFichier(cheminCopie(jour), JSON.stringify(await exporterBase()), 'application/json')
    await supprimerFichiers([cheminCopie(jourSuisse(maintenant - GARDE_JOURS * 86_400_000))])
    await noterCopie(maintenant)
    return res.status(200).json({ ok: true, jour })
  } catch (err) {
    console.error('Copie de la base', err)
    // Ratee : la nuit suivante ne doit pas attendre vingt heures pour reessayer.
    if (reserve) await libererCopie().catch(() => {})
    return res.status(500).json({ error: 'Copie de la base impossible' })
  }
}
