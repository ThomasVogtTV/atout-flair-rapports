// Terrain : le carnet de clients - ce qu'un invite peut en voir, sa
// synchronisation avec celui de l'equipe, les residents d'un immeuble.

import { root, toast } from '../ui/dom.js'
import { listeContactsHTML } from '../views/contacts.js'
import { estInvite } from '../lock.js'
import { synchroniserCarnet } from '../carnet-sync.js'
import * as S from '../state.js'
import { view } from './etat.js'
import { render } from './rendu.js'

// Le carnet n'est pas montre aux invites : sous-traitants et interimaires
// n'ont pas a emporter la liste des clients. Pour eux, ni liste, ni choix,
// ni propositions pendant la frappe.
export const contactsVisibles = async () => (estInvite() ? [] : S.listContacts())

// Apres une synchronisation : l'ecran ouvert se remet a jour sans perdre ce
// qu'on est en train de faire.
async function carnetSynchronise() {
  view.contacts = await contactsVisibles()
  if (view.screen === 'contacts') {
    const zone = root.querySelector('.carnet-liste')
    // Recherche en cours : seule la liste change, le champ garde son curseur.
    if (zone && document.activeElement?.matches?.('[data-recherche-contact]')) zone.outerHTML = listeContactsHTML(view)
    else render()
  } else if (view.screen === 'fiche' && view.fiche) {
    const fiche = view.contacts.find((c) => c.id === view.fiche.id)
    if (fiche) {
      view.fiche = fiche
      render()
    }
  }
}

export const syncCarnet = () => synchroniserCarnet().then((ok) => ok && carnetSynchronise())

// Une rafale d'ecritures (residents d'un immeuble, restauration) ne fait
// qu'un seul envoi.
let syncTimer = null
export function planifierSyncCarnet() {
  clearTimeout(syncTimer)
  syncTimer = setTimeout(syncCarnet, 1500)
}

export async function refreshContacts() {
  view.contacts = await contactsVisibles()
  render()
}

export async function copier(texte) {
  try {
    await navigator.clipboard.writeText(texte)
  } catch {
    // Le presse-papiers est refuse hors contexte securise, ou sans geste
    // reconnu : on retombe sur la vieille methode, qui marche partout.
    const zone = document.createElement('textarea')
    zone.value = texte
    zone.style.position = 'fixed'
    zone.style.opacity = '0'
    document.body.appendChild(zone)
    zone.select()
    document.execCommand('copy')
    zone.remove()
  }
  toast('Coordonnées copiées')
}

/**
 * Verse les residents d'un immeuble dans le carnet : chaque ligne nommee
 * devient un contact, a l'adresse de l'immeuble et avec son numero
 * d'appartement. Sans cela il faudrait les ressaisir un par un a la prochaine
 * intervention dans le meme batiment.
 */
export async function residentsAuCarnet() {
  if (estInvite()) return toast('Le carnet n’est pas disponible en session invité.')
  const r = view.report
  const nouveaux = r.rows
    .filter((row) => (row.resident || '').trim())
    .map((row) => ({
      type: 'locataire',
      nom: row.resident.trim(),
      prenom: '',
      adresse: [r.lieu.adresse, row.numero && `app. ${row.numero}`].filter(Boolean).join(', '),
      npaLieu: r.lieu.npaLieu ?? '',
      email: '',
      tel: '',
    }))
  const { ajoutes, connus } = await S.ajouterContacts(nouveaux)
  view.contacts = await contactsVisibles()
  toast(
    ajoutes
      ? `${ajoutes} résident${ajoutes > 1 ? 's' : ''} ajouté${ajoutes > 1 ? 's' : ''} au carnet${connus ? `, ${connus} déjà connu${connus > 1 ? 's' : ''}` : ''}`
      : 'Tous ces résidents sont déjà dans le carnet'
  )
}
