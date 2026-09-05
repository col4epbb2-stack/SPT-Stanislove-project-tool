// Feuille « Data curve » du classeur : les listes qui alimentent les menus
// déroulants des 3 feuilles d'activités. Reprises telles quelles (dédoublonnées
// — la colonne CHAMP répétait « AGM » sur 12 lignes) ; elles ne servent que de
// complément aux valeurs déjà présentes dans les activités (valeursDistinctes),
// comme dans les autres modules de saisie.

export const REFERENTIEL_COURBE_EN_S = {
  projets: ["AGM : ISM AGM", "IM : Campagne TIG + Touch-up peinture", "Visite capacité hors arrêt AGM", "Visite capacité hors arrêt TRM", "Visite capacité hors arrêt IM", "TRM: ISM TRMPFQ", "Campagne Risers prioritaire AGM", "Campagne Risers prioritaire TRM", "AGM: GAAM COMPRESSEUR GAZ LIFT", "AGM: Campagne TIG AGM-Traitement AVIS", "TRM: Campagne Traitement AVIS", "IM: Campagne traitement avis", "AGM: Intégrité PF à l'arrêt", "AGM: Travaux surface Surfer landing AGM7", "AGM: Remplacement Surfer Landing AGM11", "Projet protection cathodique AGM", "Upgrade comptage AGM", "Installation clôture PG2", "Refection route PG2-PO", "AGM: Divers DDM Classe 2", "DDM GA-TOR-RFM-2024-000039 - Utilisation DS-302 pour produire TRM2 ou TNEM", "DDM-230 066 - Motorisation vannes manuelles entree DS 201", "DDM-GA-AGM-RFM-2023-000022", "DDM-GA-TOR-RFM-0024-000058-Ajout echangeur eau-huile", "DDM Classe 1 AGM", "DDM Classe 1 TRM", "DDM Classe 1 IM", "Conversion en ESP BDNM012", "CFR: Air instrument TRM2", "Projet protection cathodique IM", "CFR: TC Gas to air instrument", "CFR : ANET gas to air instrument", "CFR : PO gas to air instrument", "CFR : AGM4-AGM8-AGM13 gas to air instrument", "CFR : TRM Flare network revamping", "AGM: Campagne peinture 2025", "TRM: Campagne peinture 2025", "BDNM: Préparation raccordement BDNM12", "Travaux Métal (FMC)", "Echafaudage (AGM/TRM/IM)", "Projet Methane Permanent Monitoring TRM2 /TNEM", "remise en conformité plancher TRMPFK", "SURFER LANDING LIGHT sur AGM11", "Remplacement tronçon de ligne riser 6’’ huile BDM", "Réseau incendie de TRMPFK", "INSTALLATION DU STAND PIPE DU DS 101"],
  projetsBis: ["Campagne peinture AGM & TRM", "Campagne TIG et traitement des Avis (AGM-TRM-MDJ)", "Conversion ESP BDBM012", "DDM Intégrité", "GAAM Compresseur Faz lift + GAAM EPC", "Gas to Air Instrument", "Idle Platforms", "Installation clôture PG2", "Protection cathodique AGM+IM", "Refection route PG2-PO", "Remplacement tronçon de ligne riser 6’’ huile BDM", "Réouverture AGM40 avec Gazlift", "REVAMPING COMPTAGE POGG", "Surfer Landing 1 réparation AGM12 et 2 Light access (AGM11+ à déterminer)", "Travaux contrat METAL", "Upgrade comptage départ champ CLZ POGG"],
  plateformes: ["BDNM", "BDM"],
  champs: ["AGM", "ILE MANDJI", "TORPILLE"],
  services: ["Arrêt et Métal", "CMG", "Construction", "DCC", "ICP", "Ingénierie", "Projet", "Qualité"],
  phases: ["PHASE 1: Ingénierie", "PHASE 2: Réalisation", "PHASE 3: Démarrage et clôture", "PHASE 3: Démobilisation", "PHASE 3: Reception des travaux", "PHASE 3:  Clôture"],
  taches: ["Etudes", "Appro (CPY+ CTR)", "Travaux atelier", "Travaux site avant arret", "Travaux site pendant l'arret", "Démarrage", "Travaux post arret", "travaux site", "reception des travaux", "Démobilisation", "Préparation SOW et AO"],
  typesAvis: ["TOP 10", "4ST", "3ST", "1ST"],
  typesDdm: ["A", "B", "C", "D"],
  typesSor: ["E", "F", "G", "H"],
}
