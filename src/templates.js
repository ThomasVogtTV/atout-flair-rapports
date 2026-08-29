// Definition des trois types de rapport.
// Chaque type decrit son en-tete, les champs du bloc "Lieu d'intervention"
// et les colonnes de sa grille. Le reste de l'app (UI + PDF) se base la-dessus,
// donc ajouter un 4e type revient a ajouter une entree ici.

// Pieces pre-remplies a la creation du rapport : uniquement celles qui
// hebergent de la literie/des assises (chambres, salon) - la ou les
// punaises de lit se trouvent reellement. Cuisine, salle de bain, cave...
// ne sont pas concernees et alourdissaient la liste par defaut pour rien ;
// elles restent disponibles en suggestion si le technicien veut quand meme
// ajouter une piece hors de cette liste.
const DETECTION_DEFAULT_ROOMS = ['Chambre N°1', 'Chambre N°2', 'Chambre N°3', 'Chambre N°4', 'Salon', 'Séjour']
const DETECTION_ROOM_SUGGESTIONS = [
  ...DETECTION_DEFAULT_ROOMS,
  'Bureau', 'Couloir', 'Hall', 'Cuisine', 'Salle de bain', 'Buanderie', 'Balcon', 'Cave', 'Galetas', 'Garage',
]

// Vocabulaire de terrain, a une touche. Les constats remplissent le champ
// "Informations" d'une ligne ; les recommandations s'ajoutent les unes sous les
// autres dans les remarques du rapport, d'ou l'etiquette courte sur la puce et
// la phrase entiere a l'insertion.
//
// C'est ici, et nulle part ailleurs, qu'on corrige ces formulations.
export const CONSTATS = [
  'Aucun marquage',
  'Marquage franc du chien',
  'Punaises vivantes visibles',
  'Traces et déjections',
  'Literie neuve',
  'Pièce encombrée, contrôle à refaire',
]

export const RECOMMANDATIONS = [
  { label: 'Rien trouvé', texte: 'Aucun marquage du chien de recherche. Aucune trace de punaises de lit visible.' },
  { label: 'Traitement', texte: 'Traitement thermique recommandé dans les dix jours.' },
  { label: 'Lavage 60°', texte: 'Literie et textiles à laver à 60 °C.' },
  { label: 'Contrôle', texte: 'Contrôle de suivi à prévoir trois semaines après le traitement.' },
  {
    label: 'Ne rien sortir',
    texte:
      'Ne pas sortir les affaires de la pièce avant le traitement, au risque de propager la contamination au reste du logement.',
  },
]

export const TYPES = {
  detection: {
    id: 'detection',
    label: 'Rapport de détection',
    hint: 'Appartement / maison',
    badge: 'Rapport de détection',
    sectionTitle: 'Détection Canine - Rapport',
    layout: 'pieces',
    // Bloc "Lieu d'intervention et informations" : deux colonnes de champs
    lieuFields: [
      [
        // Dans les trois rapports de reference, ce champ est toujours identique
        // au nom du mandant : pas de saisie separee, valeur reprise automatiquement.
        { key: 'regie', label: 'Régie', derived: 'mandant.nom' },
        { key: 'adresseIntervention', label: 'Adresse intervention' },
        { key: 'locataire', label: 'Locataire' },
        { key: 'dateIntervention', label: 'Date Intervention', type: 'date' },
      ],
      [
        { key: 'bon', label: 'Bon de Commande' },
        { key: 'etagePorte', label: 'Etage/N° porte' },
        { key: 'presenceLocataire', label: 'Présence locataire', type: 'ouinon' },
        { key: 'heureIntervention', label: 'Heure Intervention', type: 'time' },
      ],
    ],
    rowLabel: 'pièce',
    rowLabelPlural: 'pièces',
    defaultRows: DETECTION_DEFAULT_ROOMS,
    suggestions: DETECTION_ROOM_SUGGESTIONS,
    columns: [
      { key: 'nom', label: 'Pièces', width: 0.26, align: 'center' },
      { key: 'contamine', label: 'Contaminée', width: 0.24, type: 'contamine' },
      { key: 'info', label: 'Informations', width: 0.5, align: 'left' },
    ],
    hasCounters: true,
    hasSignature: true,
    hasRemarques: true,
    minRows: 8,
  },

  immeuble: {
    id: 'immeuble',
    label: "Rapport d'immeuble",
    hint: 'Plusieurs appartements',
    badge: "Rapport d'immeuble",
    layout: 'lignes',
    lieuFields: [
      [
        { key: 'gerance', label: 'Gérance', derived: 'mandant.nom' },
        { key: 'adresse', label: 'Adresse' },
        { key: 'npaLieu', label: 'NPA/Lieu' },
        { key: 'bon', label: 'Bon' },
      ],
    ],
    rowLabel: 'appartement',
    rowLabelPlural: 'appartements',
    defaultRows: [],
    columns: [
      { key: 'date', label: 'Date', width: 0.11, type: 'date', align: 'center' },
      { key: 'etage', label: 'Etage', width: 0.08, align: 'center', suggestions: ['Rez inf', 'Rez sup', 'Rez', '1er', '2ème', '3ème', '4ème', '5ème', 'Comble'] },
      { key: 'numero', label: 'N° appart.', width: 0.08, align: 'center' },
      { key: 'resident', label: 'Résident', width: 0.24, align: 'center' },
      { key: 'contamine', label: 'Contaminé', width: 0.11, type: 'contamine', ouiNon: true },
      { key: 'infos', label: 'Infos', width: 0.28, align: 'center' },
      { key: 'sousRapport', label: 'Rapport de détection', width: 0.1, type: 'sousRapport' },
    ],
    hasCounters: false,
    hasSignature: true,
    hasRemarques: true,
    minRows: 12,
  },

  hotel: {
    id: 'hotel',
    label: "Rapport d'hôtel",
    hint: 'Chambres, photos uniquement',
    badge: "Rapport d'hotel",
    layout: 'lignes',
    lieuFields: [
      [
        { key: 'gerance', label: 'Gérance', derived: 'mandant.nom' },
        { key: 'adresse', label: 'Adresse' },
        { key: 'npaLieu', label: 'NPA/Lieu' },
        { key: 'bon', label: 'Bon' },
      ],
    ],
    rowLabel: 'chambre',
    rowLabelPlural: 'chambres',
    defaultRows: [],
    columns: [
      { key: 'date', label: 'Date', width: 0.11, type: 'date', align: 'center' },
      { key: 'etage', label: 'Etage', width: 0.08, align: 'center', suggestions: ['Rez', '1er', '2ème', '3ème', '4ème', '5ème', '6ème'] },
      { key: 'numero', label: 'N° chambre', width: 0.09, align: 'center' },
      { key: 'resident', label: 'Informations', width: 0.24, align: 'center' },
      { key: 'contamine', label: 'Contaminé', width: 0.11, type: 'contamine', ouiNon: true },
      { key: 'infos', label: 'Comp. Informations', width: 0.27, align: 'center' },
      { key: 'photo', label: 'Photo', width: 0.1, type: 'photoFlag' },
    ],
    hasCounters: false,
    hasSignature: true,
    hasRemarques: true,
    minRows: 12,
  },
}

export const TYPE_LIST = [TYPES.detection, TYPES.immeuble, TYPES.hotel]

export function typeOf(report) {
  return TYPES[report.type] ?? TYPES.detection
}

// Libelle utilise pour nommer une photo quand elle est prise depuis une ligne.
export function rowLabelFor(report, row) {
  const t = typeOf(report)
  if (t.layout === 'pieces') return row.nom || ''
  const parts = []
  if (row.numero) parts.push(`N° ${row.numero}`)
  else if (row.resident) parts.push(row.resident)
  if (row.etage) parts.push(row.etage)
  return parts.join(' - ')
}
