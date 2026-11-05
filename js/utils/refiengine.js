/**
 * Auxy Partners - Comparatif de refinancement (avant / après)
 *
 * Compare, à partir de la date d'analyse, le service restant des crédits
 * refinancés à celui d'un nouveau prêt qui les rembourse, coûts de sortie
 * compris (indemnités de remboursement anticipé, coûts de rupture de swap,
 * mainlevées) et frais du nouveau prêt. Résultat : service par exercice,
 * intérêts restants, valeur actuelle des économies et point mort.
 *
 * Module PUR — testé dans tests/refiengine.test.mjs.
 */

import { DebtEngine } from './debtengine.js';
import { LoanEngine } from './loanengine.js';

/**
 * @typedef {Object} RefiLoan Crédit existant refinancé
 * @property {string} label
 * @property {Array<{ mIdx: number, interest: number, principal: number }>} rows Échéancier daté
 * @property {number} crd CRD à la date d'analyse
 * @property {number} [exitCostPct] Indemnité de remboursement anticipé (% du CRD)
 * @property {number} [exitCostFixed] Coûts fixes de sortie (rupture de swap, mainlevée…) (€)
 */

/**
 * @typedef {Object} RefiInput
 * @property {RefiLoan[]} loans
 * @property {number} analysisIdx Index mensuel de la date d'analyse (refinancement)
 * @property {import('./loanengine.js').LoanInput} newLoan Conditions du nouveau prêt (principal ignoré si financeCosts)
 * @property {boolean} [financeCosts] Coûts de sortie et frais financés par le nouveau prêt (sinon payés comptant)
 * @property {number} [extraAmount] Montant additionnel levé (nouveau besoin) (€)
 * @property {number} [discountRate] Taux d'actualisation annuel (%) des économies
 * @property {number} [closingMonth] Mois de clôture (agrégation par exercice)
 */

export const RefiEngine = {
    /** @param {RefiInput} input */
    compare({ loans, analysisIdx, newLoan, financeCosts = true, extraAmount = 0, discountRate = 5, closingMonth = 12 }) {
        const crd = loans.reduce((s, l) => s + Math.max(0, l.crd), 0);
        const exitCosts = loans.reduce((s, l) => s + Math.max(0, l.crd) * (l.exitCostPct || 0) / 100 + (l.exitCostFixed || 0), 0);
        const feePct = newLoan.upfrontFeePct || 0;
        // Frais d'arrangement en % du nouveau nominal : nominal = besoin / (1 − frais)
        const need = crd + extraAmount + (financeCosts ? exitCosts : 0);
        const principal = financeCosts ? need / Math.max(0.01, 1 - feePct / 100) : need;
        const built = LoanEngine.build({ ...newLoan, principal });
        const upfront = built.upfrontFee + built.hedgePremium;
        const cashAtClose = financeCosts ? 0 : exitCosts + upfront; // décaissé par l'entreprise

        /** @type {Map<number, number>} */
        const before = new Map();
        /** @type {Map<number, number>} */
        const after = new Map();
        let interestBefore = 0;
        for (const l of loans) {
            for (const r of l.rows) {
                if (r.mIdx <= analysisIdx) continue;
                before.set(r.mIdx, (before.get(r.mIdx) || 0) + r.interest + r.principal);
                interestBefore += r.interest;
            }
        }
        const step = 12 / ({ monthly: 12, quarterly: 4, semiannual: 2, annual: 1 }[newLoan.frequency || 'monthly'] || 12);
        built.rows.forEach((r, i) => {
            const m = analysisIdx + Math.round((i + 1) * step);
            after.set(m, (after.get(m) || 0) + r.payment + r.hedgeFlow);
        });
        // Montant additionnel : neutralisé dans la comparaison (le « avant » ne le
        // finance pas) — on compare le service de la seule dette refinancée
        const extraShare = principal > 0 ? (extraAmount / principal) : 0;
        const interestAfter = built.totalInterest + built.totalHedge;

        // Économies actualisées (mensuel), coûts de clôture en t0
        const mr = Math.pow(1 + discountRate / 100, 1 / 12) - 1;
        const months = [...new Set([...before.keys(), ...after.keys()])].sort((a, b) => a - b);
        let npv = -cashAtClose;
        let cumul = -cashAtClose;
        /** @type {Array<[number, number]>} */
        const cumulByMonth = [];
        for (const m of months) {
            const saving = (before.get(m) || 0) - (after.get(m) || 0) * (1 - extraShare);
            npv += saving / Math.pow(1 + mr, m - analysisIdx);
            cumul += saving;
            cumulByMonth.push([m, cumul]);
        }
        // Point mort : date à partir de laquelle le cumul des économies reste
        // positif jusqu'au terme (un allongement de durée soulage le service au
        // début mais peut coûter plus cher au total : pas de point mort alors)
        let paybackIdx = null;
        for (let k = cumulByMonth.length - 1; k >= 0 && cumulByMonth[k][1] >= 0; k--) paybackIdx = cumulByMonth[k][0];

        /** @type {Map<number, { before: number, after: number }>} */
        const byYear = new Map();
        for (const m of months) {
            const fy = DebtEngine.fiscalYearOf(m, closingMonth);
            const y = byYear.get(fy) || { before: 0, after: 0 };
            y.before += before.get(m) || 0;
            y.after += (after.get(m) || 0) * (1 - extraShare);
            byYear.set(fy, y);
        }
        const years = [...byYear.entries()].sort((a, b) => a[0] - b[0]).map(([fy, v]) => ({
            label: DebtEngine.fiscalYearLabel(fy, closingMonth), before: v.before, after: v.after, saving: v.before - v.after
        }));

        const totalBefore = interestBefore;
        const totalAfter = interestAfter * (1 - extraShare) + exitCosts + upfront * (1 - extraShare);
        return {
            crd, exitCosts, principal, upfront, cashAtClose,
            newLoan: built,
            interestBefore: totalBefore,
            costAfter: totalAfter,
            grossSaving: totalBefore - totalAfter,
            npvSaving: npv,
            paybackLabel: paybackIdx == null ? null : DebtEngine.indexToLabel(paybackIdx),
            years
        };
    }
};
