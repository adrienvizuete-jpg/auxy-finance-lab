/**
 * Auxy Partners - Traduction des labels financiers
 */

/** @type {Record<string, string>} */
export const PARAM_LABELS = {
    principal: 'Montant emprunt\u00e9',
    annualRate: 'Taux annuel (%)',
    durationMonths: 'Dur\u00e9e (mois)',
    insuranceMonthly: 'Assurance mensuelle (\u20ac)',
    fees: 'Frais de dossier (\u20ac)',
    assetValue: 'Valeur du bien (\u20ac)',
    deposit: 'Apport initial (\u20ac)',
    residualValue: 'Valeur r\u00e9siduelle (\u20ac)',
    creditLine: 'Ligne de cr\u00e9dit (\u20ac)',
    utilization: "Taux d'utilisation (%)",
    commitmentFee: "Commission d'engagement (%)",
    bridgeAmount: 'Montant du pr\u00eat relais (\u20ac)',
    expectedSalePrice: 'Prix de vente estim\u00e9 (\u20ac)',
    capitalizedInterest: 'Int\u00e9r\u00eats capitalis\u00e9s',
    insuranceRate: 'Taux assurance (%)',
    insuranceMode: "Nature de l'assurance",
    cashRate: 'Taux cash (%)',
    pikRate: 'Taux PIK (%)',
    equityKicker: 'Equity kicker (%)',
    totalDebt: 'Dette totale (\u20ac)',
    annualCashflow: 'Cash-flow annuel (\u20ac)',
    growthRate: 'Croissance annuelle (%)',
    frequency: "Fréquence d'amortissement",
    deferralMonths: 'Différé (mois)',
    deferralType: 'Type de différé',
    amortProfile: 'Amortissement après différé',
    // Immobilier
    propertyValue: 'Valeur du bien (\u20ac)',
    acquisitionCost: 'Co\u00fbt d\'acquisition (\u20ac)',
    travauxCost: 'Travaux (\u20ac)',
    fraisNotaire: 'Frais de notaire (\u20ac)',
    fraisDivers: 'Frais divers (\u20ac)',
    grossRent: 'Loyer brut annuel (\u20ac)',
    taxeFonciere: 'Taxe fonci\u00e8re (\u20ac)',
    fraisGestion: 'Frais de gestion (\u20ac)',
    vacancyRate: 'Taux de vacance (%)',
    entretien: 'Entretien (\u20ac)',
    capRate: 'Taux de capitalisation (%)',
    loanAmount: 'Montant du pr\u00eat (\u20ac)'
};

/** @type {Record<string, string>} */
export const RESULT_LABELS = {
    periodicPayment: '\u00c9ch\u00e9ance',
    monthlyPayment: 'Mensualit\u00e9',
    monthlyPaymentExInsurance: 'Mensualit\u00e9 hors assurance',
    totalInterest: 'Total int\u00e9r\u00eats',
    totalInsurance: 'Total assurance',
    totalCost: 'Co\u00fbt total',
    totalPayment: 'Total rembours\u00e9',
    taeg: 'TAEG',
    deferralPayment: '\u00c9ch\u00e9ance pendant le diff\u00e9r\u00e9 (int\u00e9r\u00eats seuls)',
    amortYears: 'Dur\u00e9e d\u2019amortissement apr\u00e8s diff\u00e9r\u00e9',
    firstPayment: '1\u00e8re mensualit\u00e9',
    lastPayment: 'Derni\u00e8re mensualit\u00e9',
    averagePayment: 'Mensualit\u00e9 moyenne',
    finalPayment: '\u00c9ch\u00e9ance finale',
    monthlyRent: 'Loyer mensuel',
    financedAmount: 'Montant financ\u00e9',
    totalRent: 'Total des loyers',
    monthlyCost: 'Co\u00fbt mensuel',
    monthlyInterest: 'Int\u00e9r\u00eats mensuels',
    monthlyCommitment: 'Commission mensuelle',
    totalCommitment: 'Total commissions',
    effectiveRate: 'Taux effectif',
    finalBalance: 'Solde final',
    netProceeds: 'Produit net de vente',
    ltv: 'Ratio LTV',
    monthlyCashPayment: 'Paiement cash mensuel',
    finalRepayment: 'Remboursement final',
    totalCashInterest: 'Total int\u00e9r\u00eats cash',
    totalPikInterest: 'Total int\u00e9r\u00eats PIK',
    equityKickerValue: 'Valeur equity kicker',
    allInCost: 'Co\u00fbt all-in',
    annualDebtService: 'Annuit\u00e9 totale',
    weightedRate: 'Taux moyen pond\u00e9r\u00e9',
    totalDebt: 'Dette totale',
    // Immobilier
    noi: 'NOI',
    dscr: 'DSCR',
    ltc: 'Ratio LTC',
    valuation: 'Valorisation',
    annualDebtServiceImmo: 'Service de dette annuel'
};

/** @type {Record<string, string>} */
export const TYPE_LABELS = {
    constant: 'Amortissable Constant',
    degressif: 'Amortissable D\u00e9gressif',
    infine: 'In Fine',
    bpi: 'Pr\u00eat Bpifrance',
    creditbail: 'Cr\u00e9dit-Bail',
    revolving: 'Revolving',
    relais: 'Pr\u00eat Relais',
    mezzanine: 'Dette Mezzanine',
    structured: 'Financement Structur\u00e9',
    tranching: 'Tranching (LBO)',
    immobilier: 'Immobilier',
    covenants: 'Covenants & DSCR',
    debtprofile: 'Profil de Dette'
};

/**
 * Traduit un label camelCase en fran\u00e7ais
 * @param {string} key Cl\u00e9 du label (camelCase)
 * @param {Record<string, string> | null} [dict] Dictionnaire sp\u00e9cifique (sinon PARAM_LABELS puis RESULT_LABELS)
 * @returns {string}
 */
export function t(key, dict = null) {
    if (dict) return dict[key] || key;
    return PARAM_LABELS[key] || RESULT_LABELS[key] || key;
}

/** Unité de chaque clé connue — plus de format deviné d'après le nom du champ. */
/** @type {Record<string, 'pct' | 'months' | 'eur' | 'keur' | 'x' | 'years' | 'count' | 'enum'>} */
const KEY_FORMATS = {
    // pourcentages
    annualRate: 'pct', rate: 'pct', cashRate: 'pct', pikRate: 'pct', insuranceRate: 'pct', taeg: 'pct', teg: 'pct',
    ltv: 'pct', utilization: 'pct', growthPct: 'pct', allInCost: 'pct', effectiveRate: 'pct', lineCostRate: 'pct',
    commitmentFee: 'pct', equityKicker: 'pct', firstRentPct: 'pct', weightedRate: 'pct', pctFP: 'pct', pctSenior: 'pct',
    taxPct: 'pct', capexPct: 'pct', wcPct: 'pct', carryingCostPct: 'pct', amortized3yPct: 'pct',
    // durées
    durationMonths: 'months', deferralMonths: 'months', finalRecoveryMonth: 'months', effectiveDurationMonths: 'months',
    horizon: 'years', wal: 'years', amortYears: 'years',
    // ratios
    dscrMin: 'x', leverageMax: 'x', covenantDscr: 'x', covenantLeverage: 'x', ratioLevier: 'x',
    // montants en k€ (modules Structuré / Covenants)
    ebitda: 'keur', fondsPropres: 'keur', tresorerieMin: 'keur', openingCash: 'keur', totalEmplois: 'keur',
    totalDetteNonRef: 'keur', detteSenior: 'keur', detteFinClosing: 'keur', dfn: 'keur', veRetenue: 'keur', excesFP: 'keur',
    // compteurs et libellés
    dscrMinYear: 'count', leverageMaxYear: 'count', newCount: 'count',
    frequency: 'enum', deferralType: 'enum', amortType: 'enum', amortProfile: 'enum', paymentTiming: 'enum', pikCompounding: 'enum',
    interestMode: 'enum', globalStatus: 'enum', dscrBasis: 'enum', strategy: 'enum', iraMode: 'enum'
};

/** @type {Record<string, string>} */
const ENUM_LABELS = {
    monthly: 'Mensuelle', quarterly: 'Trimestrielle', semiannual: 'Semestrielle', annual: 'Annuelle',
    partial: 'Partiel (intérêts payés)', total: 'Total (intérêts capitalisés)',
    constant: 'Échéances constantes', degressif: 'Amortissement constant', infine: 'In fine',
    advance: 'Terme à échoir', arrears: 'Terme échu', periodic: 'Intérêts servis', capitalized: 'Intérêts capitalisés',
    ok: 'Conforme', warning: 'Tendu', breach: 'Bris', cfads: 'CFADS', ebitda: 'EBITDA',
    reduceDuration: 'Réduire la durée', reducePayment: 'Réduire les échéances',
    legal: 'Plafond légal', pct: 'Forfait %', months: 'Mois d\u2019intérêts', none: 'Aucune'
};

const nf = (/** @type {number} */ d) => new Intl.NumberFormat('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });

/**
 * Formate une valeur selon l'unité déclarée de sa clé (KEY_FORMATS).
 * Tableaux et objets sont résumés plutôt qu'affichés « [object Object] ».
 * @param {string} key Clé du paramètre/résultat
 * @param {unknown} value Valeur brute (nombre, booléen, chaîne, tableau…)
 * @returns {string}
 */
export function formatValue(key, value) {
    if (value == null || (typeof value === 'number' && !isFinite(value))) return '\u2014';
    if (key === 'insuranceMode') return value === 'crd' ? 'Capital restant dû' : 'Capital emprunté';
    if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
    if (Array.isArray(value)) {
        if (value.every(v => typeof v === 'number')) return value.map(v => nf(0).format(v)).join(' · ');
        return `${value.length} ligne${value.length > 1 ? 's' : ''}`;
    }
    if (typeof value === 'object') return '\u2014';
    const kind = KEY_FORMATS[key];
    if (typeof value !== 'number') return kind === 'enum' ? (ENUM_LABELS[String(value)] || String(value)) : String(value);

    switch (kind) {
        case 'pct': return nf(2).format(value) + ' %';
        case 'months': return nf(0).format(value) + ' mois';
        case 'years': return nf(1).format(value) + ' ans';
        case 'x': return nf(2).format(value) + 'x';
        case 'keur': return nf(0).format(value) + ' k€';
        case 'count': return nf(0).format(value);
        default: return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(value);
    }
}

/**
 * Unité affichable d'une clé (colonne « Unité » des exports Excel).
 * @param {string} key
 * @param {unknown} value
 * @returns {string}
 */
export function unitOf(key, value) {
    if (typeof value !== 'number') return '';
    /** @type {Record<string, string>} */
    const units = { pct: '%', months: 'mois', years: 'ans', x: 'x', keur: 'k€', count: '', enum: '', eur: '€' };
    return units[KEY_FORMATS[key] || 'eur'];
}

/**
 * Valeur brute pour un export Excel : nombre conservé (pourcentages en
 * fraction pour un format « % » natif), libellés traduits.
 * @param {string} key
 * @param {unknown} value
 * @returns {string | number | null}
 */
export function excelValue(key, value) {
    if (value == null || (typeof value === 'number' && !isFinite(value))) return null;
    if (typeof value === 'number') return value;
    return formatValue(key, value);
}
