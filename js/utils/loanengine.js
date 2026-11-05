/**
 * Auxy Partners - Moteur de prêt générique (taux fixe ou variable)
 *
 * Un seul échéancier pour les cas de dette corporate :
 * - taux fixe, ou variable = max(index, floor) + marge (Euribor 3M/12M) ;
 * - trajectoire d'index par année (taux du jour prolongé à défaut) ;
 * - base de calcul 30/360, Exact/360 (usage Euribor) ou Exact/365, sur les
 *   dates réelles d'échéance à partir de la date de tirage ;
 * - amortissement : échéances constantes (recalculées si le taux varie),
 *   amortissement constant, in fine, profil annuel libre (% du nominal par
 *   année, ex. Senior A 10/15/20/25/30) ou ballon (part résiduelle finale) ;
 * - différé d'amortissement (intérêts payés) ;
 * - couverture d'une quote-part de l'encours : swap payeur de taux fixe ou
 *   cap (prime payée à la mise en place) ;
 * - frais d'arrangement (% du nominal) intégrés au TEG / TAEG.
 *
 * Module PUR (aucune dépendance DOM) — testé dans tests/loanengine.test.mjs.
 */

import { Financial } from './financial.js';

/**
 * @typedef {Object} HedgeInput
 * @property {string} [type] 'none' | 'swap' | 'cap'
 * @property {number} [pct] Quote-part de l'encours couverte (%)
 * @property {number} [swapRate] Taux fixe payé sur le swap (%)
 * @property {number} [capStrike] Prix d'exercice du cap (%)
 * @property {number} [capPremiumPct] Prime du cap (% du notionnel couvert initial)
 */

/**
 * @typedef {Object} LoanInput
 * @property {number} principal
 * @property {number} durationMonths
 * @property {string} [frequency] 'monthly' | 'quarterly' | 'semiannual' | 'annual'
 * @property {string} [amortType] 'constant' | 'degressif' | 'infine' | 'custom' | 'balloon'
 * @property {number[]} [customProfile] % du nominal amorti chaque année (amortType 'custom')
 * @property {number} [balloonPct] % du nominal remboursé à l'échéance finale (amortType 'balloon')
 * @property {number} [deferralMonths] Différé d'amortissement (intérêts payés)
 * @property {string} [rateType] 'fixed' | 'floating'
 * @property {number} [fixedRate] Taux fixe (%)
 * @property {number} [margin] Marge sur l'index (%)
 * @property {number | null} [floor] Plancher de l'index (%), 0 par défaut ; null = sans floor
 * @property {number[]} [indexPath] Index par année (%) ; la dernière valeur est prolongée
 * @property {string} [dayCount] '30/360' | 'act/360' | 'act/365'
 * @property {string} [startDate] Date de tirage (AAAA-MM-JJ)
 * @property {HedgeInput} [hedge]
 * @property {number} [upfrontFeePct] Frais d'arrangement (% du nominal)
 */

/**
 * @typedef {Object} LoanRow
 * @property {number} period
 * @property {string} date Date d'échéance (AAAA-MM-JJ)
 * @property {number} monthOffset Mois écoulés depuis le tirage
 * @property {number} indexRate Index retenu (%) — 0 en taux fixe
 * @property {number} rate Taux tout compris de la période (%)
 * @property {number} interest
 * @property {number} hedgeFlow Flux net de couverture (+ = coût pour l'emprunteur)
 * @property {number} principal
 * @property {number} payment Capital + intérêts (hors couverture)
 * @property {number} balance CRD après l'échéance
 */

const DAY_MS = 86400000;

/** @param {string} [iso] */
function parseDate(iso) {
    const d = iso ? new Date(`${iso}T00:00:00Z`) : new Date();
    if (isNaN(d.getTime())) return new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** @param {Date} d @param {number} months */
function addMonths(d, months) {
    const y = d.getUTCFullYear(), m = d.getUTCMonth() + months, day = d.getUTCDate();
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); // fin de mois préservée (31 → 30/28)
    return new Date(Date.UTC(y, m, Math.min(day, last)));
}

/** @param {Date} d */
const iso = d => d.toISOString().slice(0, 10);

export const LoanEngine = {

    /**
     * Index (%) applicable à un mois donné depuis le tirage.
     * @param {number[] | undefined} path
     * @param {number} monthOffset
     */
    indexAt(path, monthOffset) {
        if (!Array.isArray(path) || !path.length) return 0;
        const year = Math.floor(monthOffset / 12);
        const v = path[Math.min(year, path.length - 1)];
        return isFinite(v) ? v : 0;
    },

    /**
     * Fraction d'année d'une période selon la base de calcul.
     * @param {string} dayCount
     * @param {Date} from
     * @param {Date} to
     * @param {number} ppy
     */
    yearFraction(dayCount, from, to, ppy) {
        const days = Math.round((to.getTime() - from.getTime()) / DAY_MS);
        if (dayCount === 'act/360') return days / 360;
        if (dayCount === 'act/365') return days / 365;
        return 1 / ppy; // 30/360 : périodes régulières
    },

    /**
     * Échéancier complet.
     * @param {LoanInput} loan
     */
    build(loan) {
        const {
            principal, durationMonths, frequency = 'monthly', amortType = 'constant',
            customProfile = [], balloonPct = 0, deferralMonths = 0,
            rateType = 'fixed', fixedRate = 0, margin = 0, floor = 0, indexPath = [],
            dayCount = rateType === 'floating' ? 'act/360' : '30/360', startDate,
            hedge = {}, upfrontFeePct = 0
        } = loan;

        const empty = { rows: /** @type {LoanRow[]} */ ([]), totalInterest: 0, totalHedge: 0, totalPayment: 0, upfrontFee: 0, hedgePremium: 0, teg: null, taeg: null, allInRate: null, invalid: true };
        if (!(principal > 0) || !(durationMonths >= 1)) return empty;

        const ppy = Financial.getPeriodsPerYear(frequency);
        const step = 12 / ppy;
        const n = Math.max(1, Math.round(durationMonths / step));
        const deferralPeriods = Math.min(Math.max(0, Math.round(deferralMonths / step)), n - 1);
        const start = parseDate(startDate);

        const hedgeType = hedge.type === 'swap' || hedge.type === 'cap' ? hedge.type : 'none';
        const hedgeShare = rateType === 'floating' && hedgeType !== 'none' ? Math.min(100, Math.max(0, hedge.pct ?? 100)) / 100 : 0;
        const hedgePremium = hedgeType === 'cap' ? principal * hedgeShare * (hedge.capPremiumPct || 0) / 100 : 0;
        const upfrontFee = principal * (upfrontFeePct || 0) / 100;

        // Amortissement planifié (capital dû par période) pour les profils
        // indépendants du taux : dégressif, libre, in fine
        /** @type {number[] | null} */
        let plan = null;
        const amortN = n - deferralPeriods;
        if (amortType === 'degressif') {
            plan = Array.from({ length: n }, (_, k) => (k < deferralPeriods ? 0 : principal / amortN));
        } else if (amortType === 'infine') {
            plan = Array.from({ length: n }, (_, k) => (k === n - 1 ? principal : 0));
        } else if (amortType === 'custom') {
            const total = customProfile.reduce((s, v) => s + (v || 0), 0) || 100;
            plan = Array(n).fill(0);
            const years = Math.ceil(n / ppy);
            for (let y = 0; y < years; y++) {
                const share = principal * (customProfile[y] || 0) / total;
                const periods = [];
                for (let k = y * ppy; k < Math.min(n, (y + 1) * ppy); k++) if (k >= deferralPeriods) periods.push(k);
                if (periods.length) periods.forEach(k => { /** @type {number[]} */ (plan)[k] += share / periods.length; });
                else if (y * ppy < n) plan[Math.min(n - 1, Math.max(deferralPeriods, y * ppy))] += share;
            }
            // tout reliquat (profil < 100 % ou trop court) tombe à l'échéance finale
            const planned = plan.reduce((s, v) => s + v, 0);
            plan[n - 1] += principal - planned;
        }
        const balloon = amortType === 'balloon' ? principal * Math.min(100, Math.max(0, balloonPct)) / 100 : 0;

        /** @type {LoanRow[]} */
        const rows = [];
        let balance = principal;
        let prev = start;
        let totalInterest = 0, totalHedge = 0;

        for (let k = 0; k < n; k++) {
            const monthOffset = (k + 1) * step;
            const date = addMonths(start, monthOffset);
            const yf = this.yearFraction(dayCount, prev, date, ppy);
            // index fixé en début de période (usage : Euribor constaté à J-2 du début)
            const index = rateType === 'floating' ? this.indexAt(indexPath, k * step) : 0;
            const appliedIndex = rateType === 'floating' && floor != null ? Math.max(index, floor) : index;
            const rate = rateType === 'floating' ? appliedIndex + margin : fixedRate;
            const interest = balance * rate / 100 * yf;

            let principalPart;
            if (plan) {
                principalPart = Math.min(balance, plan[k]);
            } else if (k < deferralPeriods) {
                principalPart = 0;
            } else {
                // échéance constante recalculée sur le CRD et le taux courant
                // (ballon : valeur résiduelle visée en fin de prêt)
                const remaining = n - k;
                const r = rate / 100 / ppy;
                const target = amortType === 'balloon' ? balloon : 0;
                const annuity = Math.abs(Financial.pmt(r, remaining, balance, -target));
                principalPart = k === n - 1 ? balance : Math.min(balance, annuity - balance * r);
            }
            if (k === n - 1) principalPart = balance;

            // Couverture sur la quote-part de l'encours de début de période
            let hedgeFlow = 0;
            if (hedgeShare > 0) {
                const notional = balance * hedgeShare;
                if (hedgeType === 'swap') hedgeFlow = notional * ((hedge.swapRate || 0) - index) / 100 * yf;
                else hedgeFlow = -notional * Math.max(0, index - (hedge.capStrike || 0)) / 100 * yf;
            }

            balance = Math.max(0, balance - principalPart);
            totalInterest += interest;
            totalHedge += hedgeFlow;
            rows.push({
                period: k + 1, date: iso(date), monthOffset, indexRate: index, rate,
                interest, hedgeFlow, principal: principalPart, payment: principalPart + interest, balance
            });
            prev = date;
        }

        // Coût tout compris : frais et prime à la mise en place, couverture incluse
        const cashflows = [-principal + upfrontFee + hedgePremium, ...rows.map(r => r.payment + r.hedgeFlow)];
        const { taeg, teg } = Financial._effectiveRates(cashflows, ppy);
        const totalPayment = rows.reduce((s, r) => s + r.payment, 0);

        return {
            rows, totalInterest, totalHedge, totalPayment, upfrontFee, hedgePremium,
            totalCost: totalInterest + totalHedge + upfrontFee + hedgePremium,
            teg, taeg, allInRate: teg, invalid: false
        };
    },

    /**
     * Agrégat annuel (années glissantes depuis le tirage) pour les modules
     * Covenants / Structuré : intérêts (couverture incluse), capital, CRD.
     * @param {LoanInput} loan
     * @param {number} years
     * @returns {Array<{ service: number, interest: number, principal: number, bullet: number, crd: number }>}
     */
    annualProfile(loan, years) {
        const res = this.build(loan);
        const out = [];
        for (let y = 1; y <= years; y++) {
            const rows = res.rows.filter(r => r.monthOffset > (y - 1) * 12 && r.monthOffset <= y * 12);
            const interest = rows.reduce((s, r) => s + r.interest + r.hedgeFlow, 0);
            const principal = rows.reduce((s, r) => s + r.principal, 0);
            const last = rows[rows.length - 1];
            const isLastYear = rows.some(r => r.period === res.rows.length);
            const bullet = loan.amortType === 'infine' || loan.amortType === 'balloon'
                ? (isLastYear ? /** @type {LoanRow} */ (res.rows[res.rows.length - 1]).principal : 0)
                : 0;
            out.push({ service: interest + principal, interest, principal, bullet, crd: rows.length ? last.balance : 0 });
        }
        return out;
    }
};
