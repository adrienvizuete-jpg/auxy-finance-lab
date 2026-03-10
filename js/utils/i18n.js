/**
 * Auxy Partners - Traduction des labels financiers
 */

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
    deferralType: 'Type de différé'
};

export const RESULT_LABELS = {
    monthlyPayment: 'Mensualit\u00e9',
    monthlyPaymentExInsurance: 'Mensualit\u00e9 hors assurance',
    totalInterest: 'Total int\u00e9r\u00eats',
    totalInsurance: 'Total assurance',
    totalCost: 'Co\u00fbt total',
    totalPayment: 'Total rembours\u00e9',
    taeg: 'TAEG',
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
    totalDebt: 'Dette totale'
};

export const TYPE_LABELS = {
    constant: 'Amortissable Constant',
    degressif: 'Amortissable D\u00e9gressif',
    infine: 'In Fine',
    creditbail: 'Cr\u00e9dit-Bail',
    revolving: 'Revolving',
    relais: 'Pr\u00eat Relais',
    mezzanine: 'Dette Mezzanine',
    structured: 'Financement Structur\u00e9',
    tranching: 'Tranching (LBO)'
};

/**
 * Traduit un label camelCase en fran\u00e7ais
 */
export function t(key, dict = null) {
    if (dict) return dict[key] || key;
    return PARAM_LABELS[key] || RESULT_LABELS[key] || key;
}

/**
 * Formate une valeur selon son type d\u00e9tect\u00e9
 */
export function formatValue(key, value) {
    if (key === 'insuranceMode') return value === 'crd' ? 'Capital restant dû' : 'Capital emprunté';
    if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
    if (typeof value !== 'number') return String(value);

    // Detect percentages
    if (key.toLowerCase().includes('rate') || key.toLowerCase().includes('taeg') || key.toLowerCase().includes('ltv') || key.toLowerCase().includes('kicker') || key.toLowerCase().includes('utilization') || key.toLowerCase().includes('growth') || key === 'allInCost' || key === 'effectiveRate') {
        return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) + ' %';
    }
    // Detect months - only keys that represent a duration in months
    if (key === 'durationMonths') {
        return value + ' mois';
    }
    // Default: currency
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(value);
}
