// Onglet Administration : l'equipe, le journal des envois, et les rapports des
// invites a valider. Reserve au code administrateur (APP_CODE) - un employe
// recoit un 403, meme avec un code valide.
//
// GET                                   equipe, journal, demandes a valider
// GET  ?pdf=<id>                        le PDF d'une demande, pour le relire
// POST {action: 'valider', id}          le rapport part chez le client
// POST {action: 'refuser', id, motif}   il ne part pas ; l'invite lit le motif

import {
  identifierRequete,
  TropDEssais,
  baseConfiguree,
  listerEmployes,
  lireJournal,
  creerEmploye,
  nouveauCode,
  changerStatut,
  supprimerEmploye,
  changerFin,
  lireValidations,
  lireValidation,
  ecrireValidation,
  retirerValidation,
  Erreur400,
  derniereCopie,
} from './_lib/equipe.js'
import { boiteIndisponible, envoyerMail, consigner, cheminPdfValidation } from './_lib/mail.js'
import { stockageConfigure, lireFichier, supprimerFichiers } from './_lib/stockage.js'

const ID_OK = /^[\w-]{1,64}$/
// Une demande traitee reste lisible par l'invite le temps qu'il la voie passer,
// puis s'efface d'elle-meme.
const GARDE_TRAITEES = 60 * 24 * 60 * 60 * 1000

export default async function handler(req, res) {
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
  if (ident.role !== 'admin') return res.status(403).json({ error: 'Réservé à l’administrateur' })
  if (!baseConfiguree()) return res.status(503).json({ error: 'Base de données non configurée', base: false })

  try {
    if (req.method === 'GET') {
      if (req.query?.pdf) return lirePdf(req.query.pdf, res)
      // Les envois plus anciens du journal, page apres page.
      if (req.query?.journal !== undefined) {
        const depuis = Math.max(0, Math.floor(Number(req.query.journal)) || 0)
        return res.status(200).json({ journal: await lireJournal(300, depuis) })
      }
      const [equipe, journal, validations, copie] = await Promise.all([listerEmployes(), lireJournal(300), aValider(), derniereCopie()])
      return res.status(200).json({ base: true, ...equipe, journal, validations, copie })
    }
    if (req.method === 'POST') {
      const { action, id, nom, fin, motif } = req.body ?? {}
      if (action === 'creer') return res.status(200).json(await creerEmploye(nom, { fin }))
      if (action === 'changer-fin') {
        await changerFin(id, fin)
        return res.status(200).json({ ok: true })
      }
      if (action === 'nouveau-code') return res.status(200).json(await nouveauCode(id))
      if (action === 'revoquer' || action === 'reactiver') {
        await changerStatut(id, action === 'reactiver')
        return res.status(200).json({ ok: true })
      }
      if (action === 'supprimer') {
        await supprimerEmploye(id)
        return res.status(200).json({ ok: true })
      }
      if (action === 'valider') return valider(id, res)
      if (action === 'refuser') return refuser(id, motif, res)
      return res.status(400).json({ error: 'Action inconnue' })
    }
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Méthode non autorisée' })
  } catch (err) {
    if (err instanceof Erreur400) return res.status(400).json({ error: err.message })
    console.error('Administration', err)
    return res.status(500).json({ error: 'Erreur de la base de données' })
  }
}

/** Les demandes qui attendent, la plus ancienne d'abord. Les vieilles traitees s'effacent. */
async function aValider() {
  const toutes = await lireValidations()
  const limite = Date.now() - GARDE_TRAITEES
  for (const v of toutes) if (v.statut !== 'attente' && (v.traite ?? 0) < limite) await retirerValidation(v.id)
  return toutes.filter((v) => v.statut === 'attente').sort((a, b) => a.date - b.date)
}

async function demandeEnAttente(id, res) {
  const v = ID_OK.test(String(id ?? '')) ? await lireValidation(String(id)) : null
  if (!v) {
    res.status(404).json({ error: 'Demande introuvable' })
    return null
  }
  if (v.statut !== 'attente') {
    res.status(409).json({ error: 'Cette demande a déjà été traitée' })
    return null
  }
  return v
}

// L'invite au nom duquel le rapport part : c'est son travail, le journal le dit.
const auteur = (v) => ({ role: 'invite', id: v.par?.id, nom: v.par?.nom || 'Invité' })

async function lirePdf(id, res) {
  if (!ID_OK.test(String(id))) return res.status(400).json({ error: 'Demande invalide' })
  if (!stockageConfigure()) return res.status(503).json({ error: 'Stockage non configuré' })
  const f = await lireFichier(cheminPdfValidation(id))
  if (!f) return res.status(404).json({ error: 'PDF introuvable' })
  return res.status(200).json({ pdfBase64: f.contenu.toString('base64') })
}

async function valider(id, res) {
  const v = await demandeEnAttente(id, res)
  if (!v) return
  const indisponible = boiteIndisponible()
  if (indisponible) return res.status(503).json({ error: indisponible })
  const f = stockageConfigure() ? await lireFichier(cheminPdfValidation(v.id)) : null
  if (!f) return res.status(404).json({ error: 'PDF introuvable' })

  try {
    await envoyerMail({ ...v, pdf: f.contenu })
  } catch (err) {
    console.error('Envoi impossible', err)
    await consigner(auteur(v), v, 'echec', { erreur: String(err?.message ?? err), validePar: 'Administrateur' })
    return res.status(502).json({ error: String(err?.message ?? err) })
  }
  await ecrireValidation({ ...v, statut: 'envoye', traite: Date.now() })
  await supprimerFichiers([cheminPdfValidation(v.id)])
  await consigner(auteur(v), v, 'envoye', { validePar: 'Administrateur' })
  return res.status(200).json({ ok: true })
}

async function refuser(id, motif, res) {
  const v = await demandeEnAttente(id, res)
  if (!v) return
  const propre = String(motif ?? '').trim().slice(0, 300)
  await ecrireValidation({ ...v, statut: 'refuse', motif: propre, traite: Date.now() })
  if (stockageConfigure()) await supprimerFichiers([cheminPdfValidation(v.id)])
  await consigner(auteur(v), v, 'refuse', { erreur: propre || undefined, validePar: 'Administrateur' })
  return res.status(200).json({ ok: true })
}
