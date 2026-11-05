/**
 * Auxy Partners - Moteur de covenants prévisionnels
 *
 * Projette année par année le cash-flow disponible pour le service de la
 * dette (CFADS), la trésorerie, la dette nette et les ratios bancaires
 * usuels, puis les compare aux covenants.
 *
 * Module PUR (aucune dépendance DOM) — testé dans tests/covenantengine.test.mjs.
 *
 * Définitions (reprises dans l'export) :
 * - CFADS = EBITDA − IS décaissé − capex − variation de BFR ;
 * - DSCR = CFADS / (intérêts + amortissement contractuel), hors remboursement
 *   in fine si l'option « in fine refinancé » est retenue ;
 * - levier net = (CRD fin d'année − trésorerie fin d'année) / EBITDA ;
 * - ICR = EBITDA / intérêts ;
 * - marge DSCR = baisse de CFADS supportable avant bris = 1 − covenant / DSCR ;
 * - marge levier = baisse d'EBITDA supportable avant bris = 1 − levier / covenant.
 */

import { Financial } from './financial.js';
import { LoanEngine } from './loanengine.js';

/**
 * Ligne de dette du module Covenants (k€).
 * @typedef {Object} CovDebt
 * @property {string} label
 * @property {number} amount
 * @property {number} rate Taux annuel (%)
 * @property {number} durationYears Durée (années, décimales admises)
 * @property {string} amortType 'constant' | 'degressif' | 'infine' | 'custom' | 'balloon'
 * @property {string} frequency
 * @property {string} [rateType] 'fixed' (défaut) | 'floating' — rate = marge si variable
 * @property {number} [hedgePct] Part couverte par swap (% de l'encours), taux variable
 * @property {number[]} [customProfile] % du nominal amorti par année ('custom')
 * @property {number} [balloonPct] % remboursé à l'échéance ('balloon')
 */

/**
 * Marché commun aux dettes à taux variable.
 * @typedef {Object} CovMarket
 * @property {number[]} [indexPath] Euribor par année (%)
 * @property {number} [swapRate] Taux du swap de couverture (%)
 * @property {number | null} [floor] Floor de l'index (0 par défaut, null = aucun)
 * @property {number} [indexShock] Choc parallèle sur l'index (points de %), stress
 */

/**
 * Profil annuel d'une dette.
 * @typedef {Object} AnnualDebtRow
 * @property {number} service Intérêts + capital (in fine inclus)
 * @property {number} interest
 * @property {number} principal Capital amorti (in fine inclus)
 * @property {number} bullet Part du capital remboursée in fine
 * @property {number} crd CRD fin d'année
 */

/**
 * Hypothèses de projection.
 * @typedef {Object} CovInput
 * @property {number} years
 * @property {number[]} ebitda
 * @property {number[]} [tax] IS décaissé
 * @property {number[]} [capex]
 * @property {number[]} [wcChange] Variation de BFR (positive = consommation de cash)
 * @property {number} [openingCash] Trésorerie d'ouverture
 * @property {CovDebt[]} debts
 * @property {number} covenantDscr
 * @property {number} covenantLeverage
 * @property {string} [dscrBasis] 'cfads' (défaut) | 'ebitda'
 * @property {boolean} [excludeBullet] Remboursements in fine exclus du DSCR (refinancés)
 * @property {CovMarket} [market]
 * @property {number} [ebitdaShock] Choc sur l'EBITDA (%, négatif = baisse), stress
 */

export const CovenantEngine = {

    /**
     * Échéancier d'une dette agrégé par année depuis son tirage.
     * @param {CovDebt} debt
     * @param {number} years
     * @param {CovMarket} [market]
     * @returns {AnnualDebtRow[]}
     */
    debtAnnualProfile(debt, years, market = {}) {
        // Taux variable ou profil d'amortissement libre / ballon : moteur générique
        if (debt.rateType === 'floating' || debt.amortType === 'custom' || debt.amortType === 'balloon') {
            const floating = debt.rateType === 'floating';
            const shock = market.indexShock || 0;
            const path = (market.indexPath && market.indexPath.length ? market.indexPath : [0]).map((/** @type {number} */ v) => v + shock);
            return LoanEngine.annualProfile({
                principal: debt.amount,
                durationMonths: Math.max(1, Math.round(debt.durationYears * 12)),
                frequency: debt.frequency,
                amortType: debt.amortType,
                customProfile: debt.customProfile,
                balloonPct: debt.balloonPct,
                rateType: floating ? 'floating' : 'fixed',
                fixedRate: debt.rate,
                margin: debt.rate,
                indexPath: path,
                floor: market.floor === undefined ? 0 : market.floor,
                // années glissantes : 30/360 pour rester comparables aux dettes à taux fixe
                dayCount: '30/360',
                hedge: floating && (debt.hedgePct || 0) > 0 ? { type: 'swap', pct: debt.hedgePct, swapRate: market.swapRate || 0 } : { type: 'none' }
            }, years);
        }
        const params = {
            principal: debt.amount,
            annualRate: debt.rate,
            durationMonths: Math.max(1, Math.round(debt.durationYears * 12)),
            frequency: debt.frequency
        };
        let result;
        if (debt.amortType === 'infine') result = Financial.inFine(params);
        else if (debt.amortType === 'degressif') result = Financial.amortissableDegressif(params);
        else result = Financial.amortissableConstant(params);

        const ppy = Financial.getPeriodsPerYear(debt.frequency);
        const schedule = result.schedule || [];
        const isInFine = debt.amortType === 'infine';
        /** @type {AnnualDebtRow[]} */
        const profile = [];
        for (let y = 1; y <= years; y++) {
            const rows = schedule.slice((y - 1) * ppy, y * ppy);
            const interest = rows.reduce((s, r) => s + r.interest, 0);
            const principal = rows.reduce((s, r) => s + r.principal, 0);
            const bullet = isInFine ? principal : 0;
            const lastRow = rows[rows.length - 1];
            const crd = rows.length === 0 ? 0 : Math.max(0, lastRow.balance);
            profile.push({ service: interest + principal, interest, principal, bullet, crd });
        }
        return profile;
    },

    /**
     * @param {CovInput} input
     */
    project({ years, ebitda, tax = [], capex = [], wcChange = [], openingCash = 0, debts, covenantDscr, covenantLeverage, dscrBasis = 'cfads', excludeBullet = true, market = {}, ebitdaShock = 0 }) {
        const profiles = debts.map(d => ({ debt: d, profile: this.debtAnnualProfile(d, years, market) }));
        const shockFactor = 1 + (ebitdaShock || 0) / 100;
        const rows = [];
        let cash = openingCash || 0;
        let refinanced = 0; // in fine supposés refinancés : la dette reste au bilan

        for (let y = 0; y < years; y++) {
            // Le choc d'EBITDA se répercute intégralement sur le CFADS (IS, capex
            // et BFR inchangés) : vision prudente pour un stress bancaire
            const e = (ebitda[y] || 0) * shockFactor;
            const t = tax[y] || 0;
            const cx = capex[y] || 0;
            const wc = wcChange[y] || 0;
            const cfads = e - t - cx - wc;


            const interest = profiles.reduce((s, p) => s + p.profile[y].interest, 0);
            const principal = profiles.reduce((s, p) => s + p.profile[y].principal, 0);
            const bullet = profiles.reduce((s, p) => s + p.profile[y].bullet, 0);
            if (excludeBullet) refinanced += bullet;
            const crd = profiles.reduce((s, p) => s + p.profile[y].crd, 0) + refinanced;

            // Service testé : le remboursement in fine est, par convention bancaire,
            // supposé refinancé — il ne pèse ni sur le DSCR ni sur la trésorerie.
            const testedPrincipal = excludeBullet ? principal - bullet : principal;
            const service = interest + testedPrincipal;
            const numerator = dscrBasis === 'ebitda' ? e : cfads;
            const dscr = service > 0 ? numerator / service : null;

            cash = cash + cfads - service;
            const netDebt = crd - Math.max(0, cash);
            const leverage = e > 0 ? Math.max(0, netDebt) / e : null;
            const icr = interest > 0 ? e / interest : null;

            const headroomDscr = (dscr != null && dscr > 0 && covenantDscr > 0) ? (1 - covenantDscr / dscr) * 100 : null;
            const headroomLev = (leverage != null && covenantLeverage > 0) ? (1 - leverage / covenantLeverage) * 100 : null;
            const breach = (dscr != null && dscr < covenantDscr)
                || (leverage != null && leverage > covenantLeverage)
                || (e <= 0 && crd > 0);
            const minHeadroom = Math.min(headroomDscr ?? Infinity, headroomLev ?? Infinity);
            const status = breach ? 'breach' : (minHeadroom < 10 ? 'warning' : 'ok');

            rows.push({
                year: y + 1, ebitda: e, tax: t, capex: cx, wcChange: wc, cfads,
                service, interest, principal: testedPrincipal, bullet, crd,
                cash, netDebt, dscr, leverage, icr, headroomDscr, headroomLev, status
            });
        }

        const withService = rows.filter(r => r.dscr != null);
        const minDscrRow = withService.length ? withService.reduce((a, b) => (/** @type {number} */ (a.dscr) <= /** @type {number} */ (b.dscr) ? a : b)) : null;
        const withLev = rows.filter(r => r.leverage != null);
        const maxLevRow = withLev.length ? withLev.reduce((a, b) => (/** @type {number} */ (a.leverage) >= /** @type {number} */ (b.leverage) ? a : b)) : null;
        const globalStatus = rows.some(r => r.status === 'breach') ? 'breach' : (rows.some(r => r.status === 'warning') ? 'warning' : 'ok');

        return { years, rows, minDscrRow, maxLevRow, globalStatus, profiles };
    },

    /**
     * Stress inversé : baisse d'EBITDA (%, uniforme sur l'horizon) qui
     * déclenche le premier bris de covenant. 0 si déjà en bris, null si aucun
     * bris même à −95 %.
     * @param {CovInput} input
     * @returns {number | null}
     */
    breakevenEbitdaDrop(input) {
        const breaches = (/** @type {number} */ shock) => this.project({ ...input, ebitdaShock: shock }).rows.some(r => r.status === 'breach');
        if (breaches(0)) return 0;
        if (!breaches(-95)) return null;
        let lo = 0, hi = -95; // lo conforme, hi en bris
        for (let i = 0; i < 40; i++) {
            const mid = (lo + hi) / 2;
            if (breaches(mid)) hi = mid; else lo = mid;
        }
        return -hi;
    },

    /**
     * Stress inversé de taux : hausse de l'index (points de %) qui déclenche le
     * premier bris. null si aucune dette variable non couverte ou aucun bris à +10 pts.
     * @param {CovInput} input
     * @returns {number | null}
     */
    breakevenIndexRise(input) {
        const market = input.market || {};
        const exposed = input.debts.some(d => d.rateType === 'floating' && (d.hedgePct || 0) < 100);
        if (!exposed) return null;
        const breaches = (/** @type {number} */ shock) => this.project({ ...input, market: { ...market, indexShock: shock } }).rows.some(r => r.status === 'breach');
        if (breaches(0)) return 0;
        if (!breaches(10)) return null;
        let lo = 0, hi = 10;
        for (let i = 0; i < 40; i++) {
            const mid = (lo + hi) / 2;
            if (breaches(mid)) hi = mid; else lo = mid;
        }
        return hi;
    }
};
