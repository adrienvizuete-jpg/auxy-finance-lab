/**
 * Auxy Partners - Définitions en info-bulle
 *
 * Les en-têtes de ligne portaient de longues légendes ; les termes de
 * financement (DSCR, CFADS, LTV…) restaient sans définition. Chaque libellé
 * qui commence par un terme connu reçoit sa définition en info-bulle
 * (soulignement pointillé), sans modifier les modules.
 */

const TERMS = /** @type {Array<[RegExp, string]>} */ ([
    [/^DSCR/i, 'DSCR : flux disponible pour le service de la dette (CFADS) ÷ service de la dette (capital + intérêts) de la période.'],
    [/^ICR/i, 'ICR : EBITDA ÷ charges d’intérêts.'],
    [/^LTV/i, 'LTV : encours de dette ÷ valeur du bien financé.'],
    [/^CFADS/i, 'CFADS : EBITDA − IS décaissé − capex − variation de BFR.'],
    [/^Levier net/i, 'Levier net : (dette financière − trésorerie) ÷ EBITDA.'],
    [/^Ratio Levier Net/i, 'Levier net : (dette financière − trésorerie) ÷ EBITDA.'],
    [/^DFN/i, 'DFN : dette financière nette = dettes financières − trésorerie.'],
    [/^Marge DSCR/i, 'Marge DSCR : baisse de CFADS supportable avant le covenant = 1 − covenant ÷ DSCR.'],
    [/^TAEG/i, 'TAEG : taux actuariel incluant intérêts, frais et assurance (méthode réglementaire).'],
    [/^TEG/i, 'TEG : taux effectif global, proportionnel au taux de période (frais inclus).'],
    [/^(WAL|Durée de vie moyenne)/i, 'Durée de vie moyenne : moyenne des échéances de remboursement pondérée par le capital remboursé.'],
    [/^CRD/i, 'CRD : capital restant dû.'],
    [/^Equity cure/i, 'Equity cure : apport des actionnaires qui rétablit les ratios en cas de bris.'],
    [/^Cash sweep/i, 'Cash sweep : part de l’excess cash-flow affectée au remboursement anticipé.'],
    [/^(VE|Valeur d.entreprise)\b/i, 'VE : valeur d’entreprise retenue pour le financement.'],
    [/^Point mort/i, 'Point mort : date à partir de laquelle le cumul des économies reste positif.'],
    [/^Valeur actuelle des économies/i, 'Économies actualisées au taux retenu, coûts de sortie et frais déduits.']
]);

const SELECTOR = '.kpi-label, .form-label, .result-label, .kpi-sticky-label, thead th, tbody td:first-child';

/** @param {ParentNode} root */
export function enhanceGlossary(root) {
    root.querySelectorAll(SELECTOR).forEach(node => {
        const el = /** @type {HTMLElement} */ (node);
        if (el.dataset.def !== undefined || el.title || el.querySelector('input, select, button')) return;
        const text = (el.textContent || '').trim();
        const hit = TERMS.find(([re]) => re.test(text));
        el.dataset.def = '';
        if (!hit) return;
        el.title = hit[1];
        el.classList.add('has-def');
    });
}
