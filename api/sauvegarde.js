// Sauvegarde en ligne des rapports, photos comprises.
//
// Un telephone perdu, casse ou vole emportait tout ce qui n'avait pas ete
// envoye ou exporte a la main. Chaque telephone depose maintenant ses rapports
// ici, tout seul, des qu'il a du reseau :
//   - chaque photo est un fichier nomme par l'empreinte de son contenu : une
//     photo deja deposee ne repart jamais, une photo remplacee est effacee ;
//   - le rapport lui-meme est un fichier JSON sans les images, qui les designe
//     par leur empreinte.
//
// L'index (Redis) ne sert qu'a lister : une ligne legere par rapport, sans la
// liste de ses photos - elle vit dans le rapport lui-meme. Avec une equipe
// entiere, des milliers de rapports passent ainsi en une lecture raisonnable.
//
// Chacun recupere ses propres rapports ; l'administrateur, ceux de tous.
//
// POST {action: 'photo', rapportId, cle, dataUrl}
// POST {action: 'rapport', rapport, obsoletes}
// POST {action: 'supprimer', ids}
// GET  ?liste=1 | ?rapport=<id> | ?photo=<id>/<cle>

import {
  identifierRequete,
  TropDEssais,
  baseConfiguree,
  lireSauvegardes,
  lireSauvegarde,
  indexerSauvegarde,
  retirerSauvegarde,
} from './_lib/equipe.js'
import { stockageConfigure, ecrireFichier, lireFichier, supprimerFichiers, listerFichiers } from './_lib/stockage.js'
import { signalerServeur } from './_lib/incidents.js'

const ID_OK = /^[\w-]{1,64}$/
const CLE_OK = /^[a-f0-9]{16,64}$/
const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/
// Sous le plafond de 4,5 Mo que Vercel impose au corps d'une requete.
const PHOTO_MAX = 4_000_000
const RAPPORT_MAX = 4_000_000

const dossierRapport = (id) => `rapports/${id}/`
const cheminRapport = (id) => `${dossierRapport(id)}rapport.json`
const cheminPhoto = (id, cle) => `${dossierRapport(id)}${cle}`
const qui = (ident) => ({ id: ident.id ?? 'admin', nom: ident.nom, role: ident.role })
const aLui = (ident, entree) => ident.role === 'admin' || entree?.par?.id === (ident.id ?? 'admin')

function titreDe(r) {
  const mandant = [r.mandant?.nom, r.mandant?.type === 'gerance' ? '' : r.mandant?.prenom].filter(Boolean).join(' ')
  return r.lieu?.locataire || mandant || r.lieu?.adresseIntervention || r.lieu?.adresse || ''
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Méthode non autorisée' })
  }

  let ident = null
  try {
    ident = await identifierRequete(req)
  } catch (err) {
    if (err instanceof TropDEssais) return res.status(429).json({ error: err.message })
    console.error('Identification impossible', err)
    return res.status(503).json({ error: 'Base de données injoignable' })
  }
  if (!ident) {
    await new Promise((r) => setTimeout(r, 500))
    return res.status(401).json({ error: "Code d'accès invalide" })
  }
  if (!baseConfiguree() || !stockageConfigure()) {
    return res.status(503).json({ error: 'Sauvegarde en ligne non configurée' })
  }

  try {
    if (req.method === 'GET') {
      const { rapport, photo } = req.query ?? {}

      if (rapport) {
        if (!ID_OK.test(rapport)) return res.status(400).json({ error: 'Rapport invalide' })
        const entree = await lireSauvegarde(rapport)
        if (!entree || !aLui(ident, entree)) return res.status(404).json({ error: 'Sauvegarde introuvable' })
        const f = await lireFichier(cheminRapport(rapport))
        if (!f) return res.status(404).json({ error: 'Sauvegarde introuvable' })
        return res.status(200).json({ rapport: JSON.parse(f.contenu.toString('utf8')) })
      }

      if (photo) {
        const [id, cle] = String(photo).split('/')
        if (!ID_OK.test(id ?? '') || !CLE_OK.test(cle ?? '')) return res.status(400).json({ error: 'Photo invalide' })
        const entree = await lireSauvegarde(id)
        if (!entree || !aLui(ident, entree)) return res.status(404).json({ error: 'Photo introuvable' })
        const f = await lireFichier(cheminPhoto(id, cle))
        if (!f) return res.status(404).json({ error: 'Photo introuvable' })
        return res.status(200).json({ dataUrl: `data:${f.type};base64,${f.contenu.toString('base64')}` })
      }

      // Les lignes indexees avant l'allegement portaient encore la liste de leurs
      // photos : elle ne part plus vers les telephones.
      const sauvegardes = (await lireSauvegardes()).filter((e) => aLui(ident, e)).map(({ fichiers: _f, ...e }) => e)
      return res.status(200).json({ sauvegardes })
    }

    const { action } = req.body ?? {}

    if (action === 'photo') {
      const { rapportId, cle, dataUrl } = req.body
      if (!ID_OK.test(rapportId ?? '') || !CLE_OK.test(cle ?? '')) return res.status(400).json({ error: 'Photo invalide' })
      if (typeof dataUrl !== 'string' || dataUrl.length > PHOTO_MAX) return res.status(413).json({ error: 'Photo trop lourde' })
      const m = DATA_URL.exec(dataUrl)
      if (!m) return res.status(400).json({ error: 'Format de photo non reconnu' })
      const entree = await lireSauvegarde(rapportId)
      if (entree && !aLui(ident, entree)) return res.status(403).json({ error: 'Rapport d’un autre utilisateur' })
      await ecrireFichier(cheminPhoto(rapportId, cle), Buffer.from(m[2], 'base64'), m[1])
      return res.status(200).json({ ok: true })
    }

    if (action === 'rapport') {
      const { rapport, obsoletes } = req.body
      if (!rapport || typeof rapport !== 'object' || !ID_OK.test(rapport.id ?? '')) {
        return res.status(400).json({ error: 'Rapport invalide' })
      }
      const json = JSON.stringify(rapport)
      if (json.length > RAPPORT_MAX) return res.status(413).json({ error: 'Rapport trop lourd' })
      const avant = await lireSauvegarde(rapport.id)
      if (avant && !aLui(ident, avant)) return res.status(403).json({ error: 'Rapport d’un autre utilisateur' })

      const fichiers = new Set(
        (Array.isArray(rapport.photos) ? rapport.photos : [])
          .flatMap((p) => [p?.hOriginal, p?.hImage])
          .filter((h) => typeof h === 'string' && CLE_OK.test(h))
      )
      await ecrireFichier(cheminRapport(rapport.id), json, 'application/json')
      // Les photos remplacees depuis le depot precedent : plus rien ne les designe.
      const partis = (Array.isArray(obsoletes) ? obsoletes : []).filter(
        (h) => typeof h === 'string' && CLE_OK.test(h) && !fichiers.has(h)
      )
      await supprimerFichiers(partis.map((h) => cheminPhoto(rapport.id, h)))

      await indexerSauvegarde({
        id: rapport.id,
        ref: String(rapport.ref ?? ''),
        type: String(rapport.type ?? ''),
        titre: titreDe(rapport),
        parentId: rapport.parentId ?? null,
        status: String(rapport.status ?? ''),
        nPhotos: Array.isArray(rapport.photos) ? rapport.photos.length : 0,
        maj: Date.now(),
        // Le proprietaire reste celui qui l'a depose le premier : un rapport
        // repris par l'administrateur appartient toujours a son technicien.
        par: avant?.par ?? qui(ident),
      })
      return res.status(200).json({ ok: true })
    }

    if (action === 'supprimer') {
      const ids = (Array.isArray(req.body.ids) ? req.body.ids : []).filter((id) => typeof id === 'string' && ID_OK.test(id)).slice(0, 500)
      for (const id of ids) {
        const entree = await lireSauvegarde(id)
        if (!entree || !aLui(ident, entree)) continue
        // Tout ce qui est range sous le rapport, y compris une photo deposee
        // puis jamais rattachee (telephone coupe au mauvais moment).
        await supprimerFichiers(await listerFichiers(dossierRapport(id)))
        await retirerSauvegarde(id)
      }
      return res.status(200).json({ ok: true })
    }

    return res.status(400).json({ error: 'Action inconnue' })
  } catch (err) {
    console.error('Sauvegarde', err)
    await signalerServeur('sauvegarde', err)
    return res.status(500).json({ error: 'Erreur du stockage en ligne' })
  }
}
