import type { DeepPartial, Strings } from '@jeyabbalas/data-table';

/** `de` before a word, elided before a vowel: « de tags », « d'attrs ». */
const de = (word: string): string =>
  /^[aeiouàâäéèêëîïôöùûü]/i.test(word) ? `d'${word}` : `de ${word}`;

/**
 * French translation of every user-facing label the table renders on the
 * common interaction paths (filter panel, column-header menu, export dialog,
 * presets, stats line and chart hover text, screen-reader labels and
 * keyboard column layout, and the value inspector and extract panel of
 * nested and JSON columns). Pass this as `messages` to
 * `createDataTable()`. Keys you don't override fall back to English.
 */
export const frenchMessages: DeepPartial<Strings> = {
  common: {
    close: 'Fermer',
    cancel: 'Annuler',
    apply: 'Appliquer',
    confirm: 'Confirmer',
    validate: 'Valider',
    validating: 'Validation…',
    create: 'Créer',
    creating: 'Création…',
    update: 'Mettre à jour',
    updating: 'Mise à jour…',
    yes: 'Oui',
    no: 'Non',
    showAll: 'Tout afficher',
    deleteConfirm: 'Êtes-vous sûr ?',
  },

  filters: {
    panelTitle: 'Filtre',
    panelTitleForColumn: (column) => `Filtre : ${column}`,
    clearButton: 'Effacer',
    clearAllButton: 'Tout effacer',
    applyButton: 'Appliquer',

    activeFiltersLabel: 'Filtres actifs',
    expressionFilterLabel: 'Expression',
    expressionFilterTooltip: 'Ajouter un filtre expression (condition SQL WHERE)',
    presetsButtonLabel: 'Préréglages',
    presetsButtonTooltip: 'Gérer les préréglages de filtres',

    closePanelLabel: 'Fermer le panneau des filtres',

    nullToggle: {
      any: 'Toutes',
      isNull: 'Vide',
      isNotNull: 'Non vide',
    },

    numericOperators: {
      between: 'entre',
      equals: '=',
      notEquals: '≠',
      greaterThan: '>',
      greaterThanOrEqual: '≥',
      lessThan: '<',
      lessThanOrEqual: '≤',
    },
    dateOperators: {
      between: 'entre',
      equals: '=',
      before: 'avant',
      onOrBefore: 'le ou avant',
      after: 'après',
      onOrAfter: 'le ou après',
    },
    stringModes: {
      contains: 'contient',
      startsWith: 'commence par',
      endsWith: 'finit par',
      regex: 'regex',
      exact: 'correspondance exacte',
    },
    uuidModes: {
      contains: 'contient',
      exact: 'correspondance exacte',
    },
    booleanOptions: {
      true: 'Vrai',
      false: 'Faux',
      null: 'Vide',
    },

    placeholders: {
      min: 'min',
      max: 'max',
      value: 'valeur',
      stringFilter: 'Filtrer…',
      uuidFilter: 'UUID…',
      intervalFilter: 'Contient…',
    },

    labels: {
      from: 'Du',
      to: 'Au',
    },

    ariaLabels: {
      nullFilter: (column) => `Filtre des valeurs vides pour ${column}`,
      filterMode: (column) => `Mode de filtre pour ${column}`,
      dateFilterMode: (column) => `Mode de filtre de date pour ${column}`,
      uuidFilterMode: (column) => `Mode de filtre UUID pour ${column}`,
      minValue: (column) => `Valeur minimale pour ${column}`,
      maxValue: (column) => `Valeur maximale pour ${column}`,
      filterValue: (column) => `Valeur de filtre pour ${column}`,
      startDate: (column) => `Date de début pour ${column}`,
      endDate: (column) => `Date de fin pour ${column}`,
      fromTime: (column) => `Heure de début pour ${column}`,
      toTime: (column) => `Heure de fin pour ${column}`,
      uuidValue: (column) => `Valeur UUID pour ${column}`,
      intervalFilter: (column) => `Filtre d'intervalle pour ${column}`,
      removeFilter: (column) => `Supprimer le filtre pour ${column}`,
    },

    validation: {
      regexTooLong: 'Expression régulière trop longue (1000 caractères max)',
      regexUnsupported: 'Lookahead, lookbehind et rétro-références non pris en charge',
      regexInvalid: 'Expression régulière invalide',
      uuidInvalid: 'Format UUID invalide',
    },

    chipDescriptions: {
      anyValue: 'toutes les valeurs',
      rangeSeparator: '–',
      pointPrefix: '=',
      inSet: (list, includeNull) => `dans {${list}}${includeNull ? ' ou vide' : ''}`,
      notInSet: (list, includeNull) => `hors de {${list}}${includeNull ? ' ou vide' : ''}`,
      isNull: 'est vide',
      isNotNull: "n'est pas vide",
      valueListMore: (rest) => `+${rest} de plus`,
      patternModes: {
        contains: 'contient',
        startsWith: 'commence par',
        endsWith: 'finit par',
        regex: 'correspond à',
      },
      sqlColumn: 'SQL',
    },

    sqlFilter: {
      createTitle: 'Nouveau filtre expression',
      editTitle: 'Modifier le filtre expression',
      closeLabel: 'Fermer',
      labelFieldLabel: 'Libellé (facultatif)',
      labelPlaceholder: 'ex. Commandes à forte valeur',
      labelHint: 'Affiché sur la puce du filtre à la place du texte SQL',
      conditionLabel: 'Condition SQL WHERE',
      editorPlaceholder: "Saisir la condition WHERE, ex. age > 18 AND status = 'actif'",
      validationResult: (matchCount) => `${matchCount.toLocaleString()} lignes correspondent`,
      removeButton: 'Supprimer le filtre',
      applyButton: 'Appliquer',
      updateButton: 'Mettre à jour',
      removeConfirmText: 'Êtes-vous sûr ?',
    },
  },

  presets: {
    title: 'Préréglages de filtres',
    closeLabel: 'Fermer le panneau des préréglages',
    namePlaceholder: 'Nom du préréglage',
    descriptionPlaceholder: 'Description (facultatif)',
    saveButton: 'Enregistrer les filtres actuels',
    loadButton: 'Charger',
    deleteButton: 'Supprimer',
    exportButton: 'Tout exporter',
    importButton: 'Importer',
    emptyState: 'Aucun préréglage enregistré',
    deleteConfirmText: 'Supprimer ?',
    meta: (filterCount, dateStr) =>
      `${filterCount} filtre${filterCount !== 1 ? 's' : ''} · ${dateStr}`,
    importPartial: (imported, errors) => `${imported} importé(s), ${errors} erreur(s)`,
    importSuccess: (count) => `${count} préréglage(s) importé(s)`,
    importEmpty: 'Aucun préréglage trouvé dans le fichier',
    importFailed: 'Échec de la lecture du fichier',
  },

  export: {
    title: 'Exporter les données',
    closeLabel: "Fermer la boîte d'export",

    formatLabel: 'Format',
    formats: {
      csv: 'CSV',
      json: 'JSON',
      parquet: 'Parquet',
    },

    scopeLabel: 'Lignes',
    scopes: {
      all: 'Toutes les lignes',
      filtered: 'Lignes filtrées',
      selected: 'Lignes sélectionnées',
    },

    copyButton: 'Copier dans le presse-papiers',
    downloadButton: 'Télécharger',
    cancelButton: 'Annuler',
    copiedFeedback: 'Copié !',
    exportFailedFallback: "Échec de l'export",
    copyFailedFallback: 'Échec de la copie',
    includeSystemColumnsLabel: 'Inclure les colonnes système (par ex. __rowid__)',

    csv: {
      delimiterLabel: 'Séparateur',
      delimiters: {
        comma: 'Virgule (,)',
        tab: 'Tabulation',
        semicolon: 'Point-virgule (;)',
        pipe: 'Barre verticale (|)',
      },
      headersLabel: 'Inclure les en-têtes',
      nullValueLabel: 'Valeur vide',
      nullValuePlaceholder: '(vide)',
    },

    json: {
      formatLabel: 'Format',
      formats: {
        array: 'Tableau JSON',
        ndjson: 'NDJSON (un objet par ligne)',
      },
      prettyLabel: 'Mise en forme',
    },
  },

  derived: {
    newColumnTitle: 'Nouvelle colonne dérivée',
    editTitle: 'Modifier',
    editTitleForColumn: (column) => `Modifier : ${column}`,
    closeLabel: 'Fermer',
    closeEditLabel: "Fermer le panneau d'édition",

    nameLabel: 'Nom de la colonne',
    namePlaceholder: 'ex. prix_total',
    nameRequired: 'Le nom est requis',
    nameDuplicate: (name) => `Une colonne nommée « ${name} » existe déjà`,
    nameReserved: (name) => `Le nom « ${name} » est réservé à l'identifiant de ligne`,

    typeLabel: 'Type de colonne',
    expressionModeLabel: 'Expression SQL',
    vectorModeLabel: 'Saisir les valeurs manuellement',

    expressionLabel: 'Expression SQL',
    expressionRequired: "L'expression est requise",
    expressionPlaceholder: 'Saisir une expression SQL, ex. prix * quantité',
    availableColumnsLabel: 'Colonnes disponibles :',
    typePreview: (type, originalType) => `Type : ${type} (${originalType})`,
    validationFailed: 'Échec de la validation',

    vectorTypeLabel: 'Type de données',
    vectorValuesLabel: 'Valeurs (une par ligne)',
    vectorPlaceholder: 'Saisir une valeur par ligne…',
    vectorInfo: (count, total) => `${count} / ${total} valeurs saisies`,
    vectorCountMismatch: (expected, got) => `${expected} valeurs attendues, ${got} reçues`,
    vectorInvalidBoolean: (lineNum, value) =>
      `Ligne ${lineNum} : « ${value} » n'est pas un booléen valide (true/false/1/0)`,
    vectorInvalidDate: (lineNum, value) =>
      `Ligne ${lineNum} : « ${value} » n'est pas une date valide (AAAA-MM-JJ)`,
    vectorInvalidTimestamp: (lineNum, value) =>
      `Ligne ${lineNum} : « ${value} » n'est pas un horodatage valide (AAAA-MM-JJ HH:MM:SS)`,
    vectorInvalidTime: (lineNum, value) =>
      `Ligne ${lineNum} : « ${value} » n'est pas une heure valide (HH:MM:SS)`,
    vectorInvalidInterval: (lineNum) =>
      `Ligne ${lineNum} : l'intervalle ne peut pas être vide (ex. « 1 day 2 hours »)`,
    vectorInvalidDecimal: (lineNum, value) =>
      `Ligne ${lineNum} : « ${value} » n'est pas un nombre décimal valide`,
    vectorInvalidUUID: (lineNum, value) =>
      `Ligne ${lineNum} : « ${value} » n'est pas un UUID valide`,
    vectorInvalidInteger: (lineNum, value) =>
      `Ligne ${lineNum} : « ${value} » n'est pas un entier valide`,
    vectorInvalidFloat: (lineNum, value) =>
      `Ligne ${lineNum} : « ${value} » n'est pas un flottant valide`,

    createButton: 'Créer',
    createFailed: 'Échec de la création de la colonne',
    updateButton: 'Mettre à jour',
    updateFailed: 'Échec de la mise à jour',
    deleteButton: 'Supprimer la colonne',
    deleteFailed: (message) => `Échec de la suppression : ${message}`,

    infoLabel: 'Infos colonne',
    vectorInfoText: (vectorType, count) => `Colonne vecteur (${vectorType}), ${count} valeurs`,

    addButtonLabel: 'Ajouter une colonne dérivée',
  },

  a11y: {
    gridLabel: 'Tableau de données',

    filtersActive: (n, shown, total) =>
      `${n} ${n === 1 ? 'filtre actif' : 'filtres actifs'}, ${shown.toLocaleString()} sur ${total.toLocaleString()} lignes affichées`,
    noFilters: (total) => `Affichage de toutes les ${total.toLocaleString()} lignes`,
    sortedBy: (descriptions) => `trié par ${descriptions.join(', puis ')}`,
    ascending: 'croissant',
    descending: 'décroissant',

    sortedSuffix: (direction) => `tri ${direction}`,
    sortedMultiSuffix: (direction, priority) => `tri ${direction} (priorité ${priority})`,
    filteredSuffix: 'filtré',
    multiFilteredSuffix: (count) => `${count} filtres`,

    dragHandleLabel: (column) => `Glisser pour réordonner ${column}`,
    dragHandleTitle: 'Réordonner la colonne',

    sortButtonLabel: (column) => `Trier par ${column}`,
    sortAscendingTitle: 'Tri croissant',
    sortDescendingTitle: 'Tri décroissant',
    sortRemoveTitle: 'Retirer le tri',

    pinButtonLabel: (column) => `Épingler ${column}`,
    unpinButtonLabel: (column) => `Désépingler ${column}`,
    pinColumnTitle: 'Épingler la colonne',
    unpinColumnTitle: 'Désépingler la colonne',

    hideButtonLabel: (column) => `Masquer ${column}`,
    hideColumnTitle: 'Masquer la colonne',
    cannotHideLastColumn: 'Impossible de masquer la dernière colonne visible',

    filterButtonLabel: (column) => `Filtrer ${column}`,
    filterColumnTitle: 'Filtrer la colonne',

    editDerivedColumnLabel: 'Modifier la colonne dérivée',
    editDerivedColumnTitle: 'Modifier la colonne dérivée',

    hiddenColumnsLabel: 'Colonnes masquées',
    showColumn: (column) => `Afficher ${column}`,

    resizeHandleLabel: "Redimensionner la colonne (clavier : Maj+F2 sur l'en-tête)",
    loadingRowLabel: (rowNumber) => `Chargement de la ligne ${rowNumber}…`,

    columnLayoutModeEntered: (column) =>
      `${column} : mode disposition de la colonne. Gauche et Droite redimensionnent, Maj avec ` +
      `Gauche et Droite déplace la colonne, Début et Fin donnent la largeur minimale et ` +
      `maximale, Retour arrière rétablit la largeur, Entrée valide, Échap annule.`,
    columnWidthAnnouncement: (column, px) => `${column} : ${px} pixels de large`,
    columnWidthAtMinimum: (column, px) => `${column} : ${px} pixels de large, minimum`,
    columnWidthAtMaximum: (column, px) => `${column} : ${px} pixels de large, maximum`,
    columnMovedAnnouncement: (column, position, total) =>
      `Colonne ${column} déplacée en position ${position} sur ${total}`,
    columnMoveBlockedPinned: (column) =>
      `La colonne ${column} est épinglée et ne peut pas être déplacée`,
    columnLayoutCancelled: (column) =>
      `Disposition ${de(column)} annulée, largeur et position rétablies`,
    columnLayoutCommitted: (column) => `Disposition ${de(column)} validée`,
  },

  statistics: {
    rowWord: (count) => (count === 1 ? 'ligne' : 'lignes'),
    rowCount: (count) => `${count.toLocaleString()} ${count === 1 ? 'ligne' : 'lignes'}`,
    filteredRowCount: (filtered, total) =>
      `${filtered.toLocaleString()} / ${total.toLocaleString()} ${total === 1 ? 'ligne' : 'lignes'}`,
    nullCount: (count) => `${count.toLocaleString()} vide`,
    allNull: 'tout vide',
    allValues: (value) => `toutes les valeurs : ${value}`,
    min: (value) => `min ${value}`,
    median: (value) => `méd ${value}`,
    max: (value) => `max ${value}`,
    nonFiniteCount: (count) => `${count.toLocaleString()} non ${count < 2 ? 'finie' : 'finies'}`,
    percentTrue: (pct) => `${pct} % vrai`,
    allUnique: 'tout unique',
    uniqueCount: (count) => `${count.toLocaleString()} unique`,
    uniquePercent: (count, pct) => `${count.toLocaleString()} unique (${pct} %)`,
    separator: ' · ',
    binLabel: 'Intervalle :',
    categoryLabel: 'Catégorie :',
    selectedLabel: 'Sélection :',
    nullBinLabel: 'vide',
    nonNullCategory: 'non null',
    otherCategory: (count) =>
      `Autres (${count.toLocaleString()} ${count < 2 ? 'valeur' : 'valeurs'})`,
    otherSegmentLabel: 'Autres',
    allUniqueCategory: (count) => `Toutes uniques (${count.toLocaleString()})`,
    selectionRowCount: (count, pct) =>
      `${count.toLocaleString()} ${count < 2 ? 'ligne' : 'lignes'} (${pct})`,
    matchCount: (count) =>
      `${count.toLocaleString()} ${count < 2 ? 'correspond' : 'correspondent'}`,
    valueListSuffix: (total) => `, … (${total.toLocaleString()} valeurs)`,
    chartFailed: 'Échec du chargement',
    noData: 'Aucune donnée',
  },

  values: {
    typeList: (element) => `liste ${de(element)}`,
    typeArray: (element, size) => `tableau de ${size.toLocaleString()} ${element}`,
    typeStruct: (fieldCount) =>
      `structure à ${fieldCount.toLocaleString()} ${fieldCount < 2 ? 'champ' : 'champs'}`,
    typeMap: (key, value) => `dictionnaire ${de(key)} vers ${value}`,
    typeUnion: (memberCount) =>
      `union de ${memberCount.toLocaleString()} ${memberCount < 2 ? 'type' : 'types'}`,
    typeJson: 'JSON',
    typeVariant: 'variant',

    inspectorTitle: (column, rowLabel) => `${column} · ${rowLabel}`,
    rowLabel: (row) => `Ligne ${row.toLocaleString()}`,
    treeLabel: (column) => `Valeur ${de(column)}`,
    itemCount: (count) => `${count.toLocaleString()} ${count < 2 ? 'élément' : 'éléments'}`,
    entryCount: (count) => `${count.toLocaleString()} ${count < 2 ? 'entrée' : 'entrées'}`,
    fieldCount: (count) => `${count.toLocaleString()} ${count < 2 ? 'champ' : 'champs'}`,
    keyCount: (count) => `${count.toLocaleString()} ${count < 2 ? 'clé' : 'clés'}`,
    bucketLabel: (first, last) => `[${first} … ${last}]`,
    moreCharacters: (count) =>
      `${count.toLocaleString()} ${count < 2 ? 'caractère' : 'caractères'} de plus`,
    loading: 'Chargement…',
    loadFailed: 'Impossible de charger cette valeur',
    retry: 'Réessayer',
    truncatedNotice: (shownChars, totalChars) =>
      `Affichage des ${shownChars.toLocaleString()} premiers caractères sur ${totalChars.toLocaleString()}`,
    copyJson: 'Copier le JSON',
    copied: 'Copié',
    copyFailed: 'Échec de la copie',
    tooLargeToCopy: 'Trop volumineux pour être copié',
    closeLabel: "Fermer l'inspecteur de valeur",

    addAsColumn: 'Ajouter comme colonne',
    addLengthAsColumn: 'Ajouter la longueur comme colonne',
    addSizeAsColumn: 'Ajouter la taille comme colonne',
    addTagAsColumn: "Ajouter l'étiquette comme colonne",
    adding: 'Ajout…',
    extractFailed: (error) => `Impossible d'ajouter la colonne : ${error}`,
    columnAdded: (column) => `Colonne ${column} ajoutée`,

    extractButtonLabel: (column) => `Extraire ${de(column)}`,
    extractButtonTitle: 'Extraire un champ comme colonne',
    extractTitle: (column) => `Extraire ${de(column)}`,
    extractCloseLabel: "Fermer le panneau d'extraction",
    extractTreeLabel: (column) => `Parties ${de(column)}`,
    nothingToExtract: "Cette colonne n'a aucune partie à extraire",
    lengthNode: 'longueur',
    sizeNode: 'taille',
    tagNode: 'étiquette',
    elementNode: 'élément',
    mapValueNode: 'valeur',
    positionLabel: (container) => `Position dans ${container}`,
    positionInvalid: 'Saisir un nombre entier, 1 ou plus',
    keyLabel: (container) => `Clé dans ${container}`,
    keyRequired: 'Saisir une clé',
    jsonPathLabel: 'Chemin JSON',
    jsonPathHint:
      'Sous la forme $.a.b[0] : les clés après des points, les index de tableau à partir de 0. Une clé contenant un point, un crochet ou un guillemet se met entre crochets : $["a.b"].',
    jsonPathInvalid: (character) => `Chemin JSON non valide : vérifier le caractère ${character}`,
    readAsLabel: 'Lire comme',
    readAs: {
      string: 'Texte',
      number: 'Nombre',
      boolean: 'Booléen',
      json: 'JSON',
      length: 'Longueur du tableau',
    },
    columnNameLabel: 'Nom de la colonne',
    expressionLabel: 'Expression',
    addColumn: 'Ajouter la colonne',
    panelLoadFailed: "Le panneau n'a pas pu être chargé. Rechargez la page pour réessayer.",
  },
};
