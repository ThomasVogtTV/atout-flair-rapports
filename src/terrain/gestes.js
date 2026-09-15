// Terrain : les gestes de l'ecran - taper, choisir, toucher. Chaque geste est
// reconnu ici, dans l'ordre ou il doit l'etre (un element peut en contenir un
// autre), puis confie au module qui sait le faire.

import { typeOf } from '../templates.js'
import { openAnnotator } from '../photo.js'
import { openSignaturePad } from '../signature.js'
import { retryJob, deleteJob } from '../mailer.js'
import { root, toast, showLoading, hideLoading } from '../ui/dom.js'
import { confirmLeave } from '../ui/dialogs.js'
import { setTheme } from '../ui/theme.js'
import { listeRapportsHTML } from '../views/home.js'
import { listeContactsHTML } from '../views/contacts.js'
import { applySameAddress, applySameName, LIEU_ADDR_KEYS } from '../views/editor.js'
import { openContactDialog } from '../contact-dialog.js'
import { choisirContact } from '../contact-picker.js'
import { previewPdf, openSendDialog, shareOrDownload } from '../send.js'
import { seDeconnecter, estInvite, estAdmin } from '../lock.js'
import { decalerMois, lundiDe, decalerSemaine } from '../agenda-outils.js'
import { viderVignettes } from '../ui/vignettes.js'
import { reserverNumeros } from '../numeros.js'
import { sauvegarder, listerSauvegardes, restaurer } from '../sauvegarde.js'
import { choisirRestauration } from '../restauration.js'
import { ouvrirMenuRapport } from '../rapport-menu.js'
import { montrerSceau } from '../ui/sceau.js'
import { signaler } from '../incidents.js'
import * as S from '../state.js'
import { view } from './etat.js'
import { render } from './rendu.js'
import { goHome, openEnvois, openContacts, openFiche, openReglages } from './navigation.js'
import { oublierSession } from './session.js'
import { scheduleSave, flushSave, get, set, openReport, createReport, rowOf, mirrorLieuFields, rafraichirSuggestions, refreshCounters, rafraichirEtapes, planifierEtapes, allerEtape, insertNewRow, clearDefaultRemarques, removeRowAnimated, remplirMandant, createChild } from './rapport.js'
import { VUE_AGENDA, openAgenda, editerRdv, commencerRdv, proposerControle, montrerRdv } from './agenda.js'
import { contactsVisibles, refreshContacts, copier, residentsAuCarnet } from './carnet.js'
import { pickFile, capture, poserLogoPartenaire, movePhoto } from './photos.js'
import { planifierSauvegarde } from './sauvegardes.js'

// La liste des rapports se redessine seule pendant la frappe : un render()
// complet remplacerait le champ de recherche et le curseur avec lui.
function rafraichirListeRapports() {
  const zone = root.querySelector('.report-list')
  if (!zone) return
  // Le bouton "Voir les N autres" suit la liste : il reste sinon affiche sous
  // une recherche qui montre deja tout ce qui correspond.
  zone.nextElementSibling?.matches('[data-toggle-reports]') && zone.nextElementSibling.remove()
  zone.outerHTML = listeRapportsHTML(view)
}

root.addEventListener('input', (ev) => {
  const el = ev.target
  if (el.dataset.recherche !== undefined) {
    view.recherche = el.value
    return rafraichirListeRapports()
  }
  // Recherche du carnet : seule la liste se redessine, le champ garde le curseur.
  if (el.dataset.rechercheContact !== undefined) {
    view.carnetRecherche = el.value
    const zone = root.querySelector('.carnet-liste')
    if (zone) zone.outerHTML = listeContactsHTML(view)
    return
  }
  if (el.dataset.path) {
    set(el.dataset.path, el.value)
    // Cases "meme adresse / meme nom que le mandant" cochees : les champs du
    // lieu restent en phase pendant la saisie, sans re-rendu complet pour
    // ne pas faire perdre le focus/curseur du champ mandant en cours.
    if (view.report.lieu.sameAsMandant && (el.dataset.path === 'mandant.adresse' || el.dataset.path === 'mandant.npaLieu')) {
      applySameAddress(view.report)
      mirrorLieuFields(LIEU_ADDR_KEYS)
    }
    if (view.report.lieu.sameNameAsMandant && (el.dataset.path === 'mandant.nom' || el.dataset.path === 'mandant.prenom')) {
      applySameName(view.report)
      mirrorLieuFields(['locataire'])
    }
    // Les propositions du carnet suivent la frappe, sans redessiner tout
    // l'ecran : un re-rendu ferait perdre le curseur du champ en cours.
    if (el.dataset.path === 'mandant.nom') rafraichirSuggestions()
    scheduleSave()
    planifierEtapes()
  } else if (el.dataset.rowField) {
    const row = rowOf(el)
    if (!row) return
    const champ = el.dataset.rowField
    row[champ] = el.value
    // Plus besoin de rafraichir le compteur a la frappe : toutes les lignes du
    // rapport comptent, remplies ou non, et leur nombre ne change qu'a l'ajout
    // ou a la suppression d'une ligne.
    // Les puces de noms de piece ont fait leur travail des que le champ porte
    // quelque chose : elles laissent la place au reste de la carte.
    if (champ === 'nom' && el.value) el.closest('.row-card')?.querySelector('.quick-rooms')?.remove()
    scheduleSave()
    planifierEtapes()
  }
})

root.addEventListener('change', async (ev) => {
  const el = ev.target

  if (el.dataset.sameAddr !== undefined) {
    view.report.lieu.sameAsMandant = el.checked
    if (el.checked) applySameAddress(view.report)
    await S.saveReport(view.report)
    render()
    return
  }

  if (el.dataset.sameName !== undefined) {
    view.report.lieu.sameNameAsMandant = el.checked
    if (el.checked) applySameName(view.report)
    await S.saveReport(view.report)
    render()
    return
  }

  // Le nom du partenaire est presque toujours tape apres avoir depose son logo :
  // sans cette reprise, la puce gardee sur l'appareil restait anonyme, et il
  // fallait retaper le nom a chaque rapport.
  if (el.dataset.path === 'partenaire.nom') {
    await S.rememberPartenaire(view.report.partenaire)
    view.partenaires = await S.listPartenaires()
    return
  }

  // Le carnet remplit le reste des coordonnees des que le nom correspond -
  // le nom saisi seul, ou le nom complet propose par la liste du carnet.
  if (el.dataset.path !== 'mandant.nom') return
  const typed = el.value.trim().toLowerCase()
  const match = view.contacts.find(
    (c) => S.fullName(c).toLowerCase() === typed || (c.nom || '').trim().toLowerCase() === typed
  )
  if (!match) return
  view.report.mandant = {
    type: match.type ?? '',
    nom: match.nom,
    prenom: match.prenom ?? '',
    adresse: match.adresse,
    npaLieu: match.npaLieu,
    email: match.email,
    tel: match.tel,
  }
  if (view.report.lieu.sameAsMandant) applySameAddress(view.report)
  if (view.report.lieu.sameNameAsMandant) applySameName(view.report)
  await S.saveReport(view.report)
  render()
})

// Une action choisie hors de l'ecran (le menu du rapport) emprunte le meme
// chemin qu'un bouton de l'ecran : un bouton ephemere, clique puis retire.
function declencher(act) {
  const bouton = document.createElement('button')
  bouton.type = 'button'
  bouton.dataset.act = act
  bouton.hidden = true
  root.appendChild(bouton)
  bouton.click()
  bouton.remove()
}

root.addEventListener('click', async (ev) => {
  const el = ev.target

  const newType = el.closest('[data-new]')?.dataset.new
  if (newType) return createReport(newType)

  // Les etapes du rapport : une pastille de la frise, un manque du bilan, ou
  // les boutons Precedent / Suivant de la barre du bas.
  const etapeCible = el.closest('[data-etape]')?.dataset.etape
  if (etapeCible !== undefined && view.screen === 'editor') return allerEtape(Number(etapeCible))
  const pasEtape = el.closest('[data-etape-pas]')?.dataset.etapePas
  if (pasEtape && view.screen === 'editor') return allerEtape((view.etape ?? 0) + Number(pasEtape))

  if (el.closest('[data-toggle-reports]')) {
    view.reportsOpen = !view.reportsOpen
    return render()
  }

  const filter = el.closest('[data-filter]')?.dataset.filter
  if (filter) {
    view.filter = filter
    return render()
  }

  const delId = el.closest('[data-del]')?.dataset.del
  if (delId) {
    ev.stopPropagation()
    // Un immeuble emporte ses rapports de detection : on le dit avant, pas
    // apres. Le compte vient de la vue, deja chargee.
    const enfants = (view.reports ?? []).find((r) => r.id === delId)
      ? (await S.listReports()).filter((r) => r.parentId === delId).length
      : 0
    const question = enfants
      ? `Supprimer ce rapport et ${enfants === 1 ? 'le rapport de détection qui en dépend' : `les ${enfants} rapports de détection qui en dépendent`} ?`
      : 'Supprimer ce rapport ?'
    if (confirm(question)) {
      await S.deleteReport(delId)
      goHome()
    }
    return
  }

  const openId = el.closest('[data-open]')?.dataset.open
  if (openId) {
    // Un rapport ouvert depuis la fiche d'un client y ramene au retour.
    if (view.screen === 'fiche') view.retour = view.fiche.id
    return openReport(openId)
  }

  // Le calendrier : un jour touche (il peut etre du mois voisin, le calendrier
  // suit), ou les fleches d'un mois a l'autre.
  const jourAgenda = el.closest('[data-agenda-jour]')?.dataset.agendaJour
  if (jourAgenda) {
    view.agendaJour = jourAgenda
    view.agendaMois = jourAgenda.slice(0, 7)
    view.agendaSemaine = lundiDe(jourAgenda)
    return render()
  }
  const pasMois = el.closest('[data-agenda-mois]')?.dataset.agendaMois
  if (pasMois) {
    view.agendaMois = decalerMois(view.agendaMois ?? S.todayISO().slice(0, 7), Number(pasMois))
    return render()
  }
  const pasSemaine = el.closest('[data-agenda-semaine]')?.dataset.agendaSemaine
  if (pasSemaine) {
    view.agendaSemaine = decalerSemaine(view.agendaSemaine ?? lundiDe(view.agendaJour ?? S.todayISO()), Number(pasSemaine))
    return render()
  }
  // Mois ou semaine : le choix se retient d'une ouverture a l'autre.
  const vueAgenda = el.closest('[data-agenda-vue]')?.dataset.agendaVue
  if (vueAgenda) {
    view.agendaVue = vueAgenda
    view.agendaSemaine = lundiDe(view.agendaJour ?? S.todayISO())
    try {
      localStorage.setItem(VUE_AGENDA, vueAgenda)
    } catch {
      // Pas de place : la vue repartira du mois a la prochaine ouverture.
    }
    return render()
  }
  // Le prochain rendez-vous de l'accueil : son rapport, sans passer par la fiche.
  const rdvACommencer = el.closest('[data-rdv-commencer]')?.dataset.rdvCommencer
  if (rdvACommencer) {
    const rdv = view.agenda?.rdvs?.find((r) => r.id === rdvACommencer)
    if (rdv) commencerRdv(rdv)
    return
  }

  // Un rendez-vous de l'agenda (ou de l'accueil) : sa fiche.
  const rdvId = el.closest('[data-rdv]')?.dataset.rdv
  if (rdvId) {
    const rdv = view.agenda?.rdvs?.find((r) => r.id === rdvId)
    if (rdv) montrerRdv(rdv)
    return
  }

  // Une case vide du semainier : on y pose un rendez-vous a cette heure-la.
  const creneau = el.closest('[data-agenda-creneau]')?.dataset.agendaCreneau
  if (creneau) {
    const [date, heure] = creneau.split('|')
    view.agendaJour = date
    view.agendaSemaine = lundiDe(date)
    return editerRdv(null, { date, heure })
  }

  // L'etoile d'une ligne du carnet : marque un client habituel sans ouvrir sa
  // fiche. Teste avant la ligne, qui la contient.
  const favoriId = el.closest('[data-favori]')?.dataset.favori
  if (favoriId) {
    const c = await S.basculerFavori(favoriId)
    view.contacts = await contactsVisibles()
    if (c) toast(c.favori ? 'Ajouté aux favoris' : 'Retiré des favoris')
    return render()
  }

  const ficheId = el.closest('[data-fiche]')?.dataset.fiche
  if (ficheId) return openFiche(ficheId)

  const carnetFiltre = el.closest('[data-carnet-filtre]')?.dataset.carnetFiltre
  if (carnetFiltre) {
    view.carnetFiltre = carnetFiltre
    return render()
  }

  const nouveauPour = el.closest('[data-new-pour]')?.dataset.newPour
  if (nouveauPour && view.fiche) {
    view.retour = view.fiche.id
    return createReport(nouveauPour, view.fiche)
  }

  const chip = el.closest('.chip')
  if (chip && chip.closest('[data-mandant-type]')) {
    const value = chip.dataset.val
    view.report.mandant.type = view.report.mandant.type === value ? '' : value
    // Une gerance n'a pas de prenom : le nom repris pour le locataire change.
    if (view.report.lieu.sameNameAsMandant) applySameName(view.report)
    scheduleSave()
    return render()
  }

  // --- puce de nom de piece rapide (remplit sans ouvrir le clavier)
  const quickRoom = el.closest('[data-quick-room]')?.dataset.quickRoom
  if (quickRoom) {
    const card = el.closest('.row-card')
    const row = rowOf(el)
    row.nom = quickRoom
    card.querySelector('.row-name').value = quickRoom
    card.querySelector('.quick-rooms')?.remove()
    refreshCounters()
    scheduleSave()
    return
  }

  // --- une proposition du carnet remplit tout le bloc mandant
  const fillId = el.closest('[data-fill-contact]')?.dataset.fillContact
  if (fillId) {
    const c = view.contacts.find((x) => x.id === fillId)
    if (c) await remplirMandant(c)
    return
  }

  // --- puce de constat : s'ajoute a ce qui est deja ecrit, les puces restant
  // affichees. Un constat en appelle souvent un second ("marquage franc, puis
  // punaises visibles") ; la minuscule apres la virgule fait une phrase et non
  // deux morceaux colles.
  const quickInfo = el.closest('[data-quick-info]')?.dataset.quickInfo
  if (quickInfo) {
    const card = el.closest('.row-card')
    const row = rowOf(el)
    const champ = typeOf(view.report).layout === 'pieces' ? 'info' : 'infos'
    const actuel = (row[champ] ?? '').trim()
    if (!actuel.toLowerCase().includes(quickInfo.toLowerCase())) {
      row[champ] = actuel ? `${actuel}, ${quickInfo[0].toLowerCase()}${quickInfo.slice(1)}` : quickInfo
      card.querySelector(`[data-row-field="${champ}"]`).value = row[champ]
      scheduleSave()
    }
    return
  }

  // --- puce de recommandation : s'ajoute a la suite des remarques, une par
  // ligne. Les puces restent affichees, on en empile plusieurs ; un texte deja
  // present n'est pas redonne, pour qu'un double appui ne fasse pas de doublon.
  const quickNote = el.closest('[data-quick-note]')?.dataset.quickNote
  if (quickNote) {
    const ta = root.querySelector('[data-path="remarques"]')
    const actuel = ta.value.trim()
    if (!actuel.includes(quickNote)) {
      ta.value = actuel ? `${actuel}\n${quickNote}` : quickNote
      set('remarques', ta.value)
      scheduleSave()
      planifierEtapes()
    }
    return
  }

  // --- choix du theme, dans les reglages
  const themeBtn = el.closest('[data-theme-choice] .seg-btn')
  if (themeBtn) {
    setTheme(themeBtn.dataset.val)
    return render()
  }

  // --- segments Oui / Non / ?
  const segBtn = el.closest('.seg-btn')
  if (segBtn) {
    const segRow = segBtn.closest('[data-seg-row]')
    const segPath = segBtn.closest('[data-seg]')
    const value = segBtn.dataset.val
    if (segRow) {
      const row = view.report.rows.find((r) => r.id === segRow.dataset.segRow)
      row.contamine = row.contamine === value ? '' : value
      segRow.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('on', b.dataset.val === row.contamine))
      segRow.closest('.row-card').dataset.status = row.contamine || ''
      refreshCounters()
      clearDefaultRemarques()
      rafraichirEtapes()
      // "Non" clot la piece : rien a decrire, rien a photographier, on passe a
      // la suivante - la carte se replie d'elle-meme et la suivante remonte
      // sous le pouce. "Contaminée" et "?" laissent la carte ouverte : il reste
      // justement quelque chose a y ecrire.
      if (row.contamine === 'non' && !row.info && !row.infos && !view.report.photos.some((p) => p.rowId === row.id)) {
        view.repliees.add(row.id)
        scheduleSave()
        return render()
      }
    } else if (segPath) {
      const current = get(segPath.dataset.seg)
      const next = current === value ? '' : value
      set(segPath.dataset.seg, next)
      segPath.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('on', b.dataset.val === next))
    }
    scheduleSave()
    return
  }

  const delRow = el.closest('[data-del-row]')?.dataset.delRow
  if (delRow) return removeRowAnimated(delRow)

  // Replier / deplier une piece. Teste apres la suppression : la croix est
  // posee dans l'en-tete repliee, qui porte elle-meme le geste de depliage.
  // Le badge est exclu : c'est la poignee de glissement, et le clic qui suit
  // un deplacement aurait replie la carte qu'on vient de ranger.
  const foldId = el.closest('[data-grip]') ? null : el.closest('[data-fold]')?.dataset.fold
  if (foldId) {
    if (!view.repliees.delete(foldId)) view.repliees.add(foldId)
    return render()
  }

  const foldSection = el.closest('[data-fold-section]')?.dataset.foldSection
  if (foldSection) {
    if (!view.sectionsRepliees.delete(foldSection)) view.sectionsRepliees.add(foldSection)
    return render()
  }

  const delPhoto = el.closest('[data-del-photo]')?.dataset.delPhoto
  if (delPhoto) {
    view.report.photos = view.report.photos.filter((p) => p.id !== delPhoto)
    await S.saveReport(view.report)
    return render()
  }

  const move = el.closest('[data-move-photo]')
  if (move) return movePhoto(move.dataset.movePhoto, Number(move.dataset.dir))

  const thumb = el.closest('[data-photo-id]')
  if (thumb && !el.closest('[data-del-photo]')) {
    const photo = view.report.photos.find((p) => p.id === thumb.dataset.photoId)
    const result = await openAnnotator(photo.original ?? photo.dataUrl, { shapes: photo.shapes })
    if (result) {
      photo.dataUrl = result.dataUrl
      photo.shapes = result.shapes
      await S.saveReport(view.report)
      render()
    }
    return
  }

  const photoBtn = el.closest('[data-photo]')
  if (photoBtn) return capture(photoBtn.dataset.photo)

  // --- logo du partenaire : la case s'ouvre au tap, une puce reprend un
  // partenaire deja utilise sans avoir a rechercher son fichier.
  if (el.closest('[data-depose-logo]')) return poserLogoPartenaire(await pickFile())

  const partId = el.closest('[data-partenaire]')?.dataset.partenaire
  if (partId) {
    const p = (view.partenaires ?? []).find((x) => x.id === partId)
    if (!p) return
    view.report.partenaire = { nom: p.nom ?? '', logo: p.logo }
    await S.saveReport(view.report)
    await S.rememberPartenaire(view.report.partenaire)
    view.partenaires = await S.listPartenaires()
    return render()
  }

  const addChild = el.closest('[data-add-child]')?.dataset.addChild
  if (addChild) return createChild(addChild)

  const openChild = el.closest('[data-open-child]')?.dataset.openChild
  if (openChild) return openReport(openChild)

  // --- ecran des envois
  const retryId = el.closest('[data-retry]')?.dataset.retry
  if (retryId) {
    showLoading('Nouvel essai…')
    const { ok, motif } = await retryJob(retryId)
    hideLoading()
    toast(ok ? 'Rapport envoyé.' : motif)
    return openEnvois()
  }

  if (el.closest('[data-retry-all]')) {
    showLoading('Envoi en cours…')
    // "Tout réessayer" relance aussi les echecs : c'est le geste qu'on fait
    // apres avoir corrige un mot de passe ou une adresse.
    for (const job of view.queue) await retryJob(job.id)
    hideLoading()
    return openEnvois()
  }

  const dropEnvoi = el.closest('[data-drop-envoi]')?.dataset.dropEnvoi
  if (dropEnvoi) {
    if (!confirm("Retirer cet envoi de la liste ? Le rapport, lui, reste dans « Mes rapports » et pourra être renvoyé.")) return
    await deleteJob(dropEnvoi)
    return openEnvois()
  }

  const act = el.closest('[data-act]')?.dataset.act
  if (!act) return
  if (act === 'copier-mandant' || act === 'copier-contact') {
    const texte = S.mandantEnTexte((act === 'copier-mandant' ? view.report?.mandant : view.fiche) ?? {})
    if (!texte) return toast('Aucune coordonnée à copier')
    return copier(texte)
  }
  if (act === 'modifier-contact') {
    const id = view.fiche?.id
    return openContactDialog(view.fiche, () => openFiche(id))
  }
  if (act === 'favori-fiche') {
    const c = await S.basculerFavori(view.fiche?.id)
    if (!c) return
    view.fiche = c
    view.contacts = await contactsVisibles()
    toast(c.favori ? 'Ajouté aux favoris' : 'Retiré des favoris')
    return render()
  }
  if (act === 'supprimer-contact') {
    const c = view.fiche
    // Retirer un client du carnet de l'equipe revient a l'administrateur (le
    // serveur ignore de toute facon la suppression d'un autre).
    if (!c || !estAdmin()) return
    const nom = S.fullName(c) || 'ce contact'
    if (!confirm(`Supprimer « ${nom} » du carnet ?\nIl disparaîtra aussi du carnet de l’équipe. Ses rapports, eux, restent.`)) return
    await S.deleteContact(c.id)
    toast('Contact supprimé')
    return openContacts()
  }
  if (act === 'choisir-contact') {
    const c = await choisirContact(view.contacts ?? [], view.reports ?? [])
    if (c) await remplirMandant(c)
    return
  }
  if (act === 'drop-partenaire') {
    // Le partenaire quitte ce rapport, mais reste dans la liste de l'appareil :
    // on le retire d'une intervention, on ne le renie pas.
    view.report.partenaire = { nom: '', logo: null }
    await S.saveReport(view.report)
    return render()
  }
  if (act === 'dupliquer') {
    const copie = S.duplicateReport(view.report)
    await S.saveReport(copie)
    reserverNumeros()
    toast('Rapport dupliqué : le lieu et les pièces sont repris, les constats sont à refaire.')
    return openReport(copie.id)
  }
  if (act === 'terminer') {
    // Un rapport remis a la main fait entrer son client au carnet, comme un
    // rapport parti par mail.
    const rapport = view.report
    if (!estInvite()) await S.rememberContact(rapport.mandant)
    await S.terminerReport(rapport)
    montrerSceau({ titre: 'Rapport terminé', ref: rapport.ref })
    // Le cachet a le temps de se poser avant la question du controle de suivi.
    if (S.contaminatedCount(rapport)) await new Promise((r) => setTimeout(r, 900))
    await proposerControle(rapport)
    return goHome()
  }
  if (act === 'rouvrir') {
    // On ne quitte pas l'ecran : on rouvre justement pour corriger quelque
    // chose, et repartir a l'accueil obligerait a revenir aussitot.
    await S.rouvrirReport(view.report)
    toast('Rapport rouvert.')
    return render()
  }
  if (act === 'menu-rapport') {
    const choix = await ouvrirMenuRapport({ fini: !S.enCours(view.report), sousRapport: !!view.report?.parentId, invite: estInvite() })
    if (choix) declencher(choix)
    return
  }
  if (act === 'open-contacts') return openContacts()
  if (act === 'open-agenda') return openAgenda()
  if (act === 'ajouter-rdv') return editerRdv()
  if (act === 'open-reglages') return openReglages()
  if (act === 'deconnexion') {
    if (!confirm('Se déconnecter ? Le code sera redemandé tout de suite, et à chaque ouverture tant que « Se souvenir de moi » ne sera pas coché.')) return
    oublierSession()
    seDeconnecter()
    return goHome()
  }
  if (act === 'open-envois') return openEnvois()
  if (act === 'add-contact') return openContactDialog(undefined, refreshContacts)
  if (act === 'home') {
    // Un rapport deja envoye/en file n'a plus rien a "annuler" : on ne
    // demande que pour un brouillon, qu'il vienne d'etre cree ou repris.
    // Le carnet de contacts n'a pas de rapport ouvert, rien a confirmer.
    if (view.screen === 'editor' && S.enCours(view.report)) {
      const choice = await confirmLeave()
      if (choice === 'cancel') return
      if (choice === 'delete') await S.deleteReport(view.report.id)
    }
    if (view.screen === 'editor') {
      if (view.report?.parentId) return openReport(view.report.parentId)
      // Le retour ramene la ou l'on etait : la fiche du client, l'agenda d'ou
      // l'on a commence le rendez-vous, les envois... L'accueil par defaut.
      const RETOURS = { agenda: openAgenda, envois: openEnvois, contacts: openContacts, reglages: openReglages }
      const vers = view.retour ? () => openFiche(view.retour) : RETOURS[view.depuis]
      if (vers) {
        await flushSave()
        viderVignettes()
        planifierSauvegarde()
        return vers()
      }
    }
    return goHome()
  }
  if (act === 'add-row') return insertNewRow()
  if (act === 'residents-carnet') return residentsAuCarnet()
  if (act === 'save-contact') {
    if (estInvite()) return
    await S.rememberContact(view.report.mandant)
    view.contacts = await contactsVisibles()
    toast('Mandant ajouté au carnet')
    return
  }
  if (act === 'sign') {
    // Le nom propose est celui du locataire ou du mandant, mais il reste
    // modifiable : c'est souvent quelqu'un d'autre qui ouvre la porte.
    view.report.signataire ??= { nom: '' }
    if (!view.report.signataire.nom) {
      view.report.signataire.nom = view.report.lieu?.locataire || S.fullName(view.report.mandant) || ''
    }
    const sig = await openSignaturePad(view.report.signature, { title: 'Signature sur place' })
    if (sig !== undefined) {
      view.report.signature = sig
      await S.saveReport(view.report)
      render()
    }
    return
  }
  if (act === 'sign-tech') {
    const tech = (view.report.technicien ??= { nom: S.TECHNICIEN_NOM_DEFAUT, signature: null })
    const sig = await openSignaturePad(tech.signature, { title: 'Signature du technicien' })
    if (sig !== undefined) {
      tech.signature = sig
      await S.saveReport(view.report)
      // Premiere signature de technicien enregistree sur l'appareil : elle
      // devient le defaut sans rien demander, c'est le geste attendu. Une
      // modification ulterieure reste locale au rapport (collegue de passage)
      // et ne se generalise que par "Enregistrer par defaut".
      const current = await S.loadTechnicien()
      if (sig && !current.signature) {
        await S.saveTechnicien(tech)
        toast('Signature enregistrée par défaut')
      }
      render()
    }
    return
  }
  if (act === 'tech-default') {
    await S.saveTechnicien(view.report.technicien ?? {})
    toast('Technicien enregistré par défaut')
    return
  }
  if (act === 'sauvegarder-en-ligne') {
    showLoading('Sauvegarde en ligne…')
    const r = await sauvegarder()
    hideLoading()
    toast(r === true ? 'Sauvegarde en ligne à jour.' : r)
    return render()
  }
  if (act === 'restaurer-en-ligne') {
    if (!navigator.onLine) return toast('Il faut du réseau pour récupérer la sauvegarde.')
    showLoading('Recherche des sauvegardes…')
    let liste
    try {
      liste = await listerSauvegardes()
    } catch (err) {
      hideLoading()
      return toast(err.message)
    }
    hideLoading()
    if (!liste.length) return toast('Rien à récupérer : tout ce qui est sauvegardé est déjà sur ce téléphone.')
    const ids = await choisirRestauration(liste)
    if (!ids?.length) return
    showLoading('Récupération des rapports et des photos…')
    try {
      const n = await restaurer(ids)
      hideLoading()
      toast(`${n} rapport${n > 1 ? 's' : ''} récupéré${n > 1 ? 's' : ''}.`)
    } catch (err) {
      hideLoading()
      toast(`Récupération interrompue : ${err.message}`)
    }
    return goHome()
  }
  if (act === 'export-backup') {
    showLoading('Préparation de la sauvegarde…')
    try {
      const data = await S.exportBackup()
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
      hideLoading()
      await shareOrDownload(blob, S.backupFilename())
      S.markBackup()
      toast(`${data.reports.length} rapport(s) et ${data.contacts.length} contact(s) sauvegardés.`)
      if (view.screen === 'reglages') render()
    } catch (err) {
      hideLoading()
      console.error('Sauvegarde impossible', err)
      signaler(err, 'Fichier de sauvegarde')
      toast('Sauvegarde impossible.')
    }
    return
  }
  if (act === 'import-backup') {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      try {
        const data = JSON.parse(await file.text())
        const n = (data.reports ?? []).length
        if (!confirm(`Restaurer cette sauvegarde ?\n${n} rapport(s) et ${(data.contacts ?? []).length} contact(s) seront ajoutés à ceux déjà présents. Rien ne sera effacé.`)) return
        showLoading('Restauration…')
        const bilan = await S.importBackup(data)
        hideLoading()
        toast(`${bilan.reports} rapport(s) et ${bilan.contacts} contact(s) restaurés.`)
        await refreshContacts()
      } catch (err) {
        hideLoading()
        console.error('Restauration impossible', err)
        toast(err?.message === 'Fichier de sauvegarde non reconnu' ? err.message : 'Fichier illisible.')
      }
    }
    input.click()
    return
  }
  if (act === 'preview') return previewPdf(view.report, view.children)
  if (act === 'send') {
    // Le mandant rejoint le carnet au moment de l'envoi : c'est la qu'il est
    // complet et verifie. L'enregistrer a la frappe creerait un contact par
    // lettre tapee ; ne jamais l'enregistrer oblige a le ressaisir a chaque
    // intervention pour la meme regie.
    if (!estInvite()) await S.rememberContact(view.report.mandant)
    view.contacts = await contactsVisibles()
    const rapport = view.report
    return openSendDialog(rapport, view.children, () => proposerControle(rapport).then(goHome))
  }
})
