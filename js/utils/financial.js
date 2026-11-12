/**
 * Auxy Partners - Financial Calculation Engine
 * All core financial formulas for credit simulation, structured finance, etc.
 */

/**
 * Ligne d'échéancier d'un crédit amortissable (constant / dégressif / in fine /
 * crédit-bail). `totalInsurance` et `deferred` n'existent que sur certains produits.
 * @typedef {Object} AmortRow
 * @property {number} period Numéro de période (1..n)
 * @property {number} payment Échéance totale (assurance incluse)
 * @property {number} principal Part de capital amorti
 * @property {number} interest Part d'intérêts
 * @property {number} insurance Part d'assurance
 * @property {number} balance Capital restant dû après l'échéance
 * @property {number} totalInterest Intérêts cumulés
 * @property {number} [totalInsurance] Assurance cumulée
 * @property {boolean} [deferred] true pendant la phase de différé
 */

/**
 * Paramètres communs des crédits amortissables.
 * @typedef {Object} LoanParams
 * @property {number} principal Capital emprunté
 * @property {number} annualRate Taux nominal annuel (%)
 * @property {number} durationMonths Durée totale (mois)
 * @property {number} [insuranceMonthly] Assurance forfaitaire mensuelle (€)
 * @property {number} [insuranceRate] Taux d'assurance annuel (%) — prioritaire sur le forfait
 * @property {string} [insuranceMode] 'ci' (capital initial) | 'crd' (capital restant dû)
 * @property {number} [fees] Frais de dossier (€)
 * @property {string} [frequency] 'monthly' | 'quarterly' | 'semiannual' | 'annual'
 * @property {number} [deferralMonths] Différé (mois)
 * @property {string} [deferralType] 'partial' (franchise de capital) | 'total' (intérêts capitalisés)
 */

/**
 * Résultat d'une simulation de crédit — les champs varient selon le produit
 * (amortissable constant / dégressif / in fine), d'où les propriétés optionnelles.
 * @typedef {Object} LoanResult
 * @property {number} [periodicPayment] Échéance courante (hors différé)
 * @property {number} [monthlyPayment] Équivalent mensuel de l'échéance
 * @property {number} [monthlyPaymentExInsurance] Équivalent mensuel hors assurance
 * @property {number} [firstPayment] Première échéance (dégressif)
 * @property {number} [lastPayment] Dernière échéance (dégressif)
 * @property {number} [averagePayment] Échéance moyenne (dégressif)
 * @property {number} [finalPayment] Échéance finale (in fine)
 * @property {number} totalInterest Total des intérêts
 * @property {number} [totalInsurance] Total assurance
 * @property {number} totalCost Coût total du crédit
 * @property {number} totalPayment Total remboursé (frais inclus)
 * @property {number | null} taeg TAEG actuariel (%) ou null si non calculable
 * @property {number | null} [teg] TEG proportionnel (%) — usage crédit professionnel
 * @property {number} [effectiveDurationMonths] Durée réellement modélisée (multiple de la périodicité)
 * @property {string} frequency Périodicité des échéances
 * @property {number} [deferralMonths]
 * @property {string} [deferralType]
 * @property {AmortRow[]} schedule Échéancier détaillé
 * @property {boolean} [invalid] true si les paramètres étaient invalides
 */

/**
 * Tranche d'un financement multi-tranches (LBO).
 * @typedef {Object} TrancheInput
 * @property {string} [name] Libellé de la tranche
 * @property {number} amount Montant (€)
 * @property {number} rate Taux annuel (%)
 * @property {number} duration Durée (mois)
 * @property {string} [type] 'infine' | 'degressif' | amortissable constant par défaut
 * @property {string} [frequency] Périodicité des échéances
 */

export const Financial = {

    // =============================================
    // BASIC FINANCIAL FUNCTIONS
    // =============================================

    /**
     * Payment (PMT) - Constant periodic payment
     * @param {number} rate - Periodic interest rate
     * @param {number} nper - Total number of periods
     * @param {number} pv - Present value (principal)
     * @param {number} fv - Future value (default 0)
     * @returns {number} Periodic payment (positive)
     */
    pmt(rate, nper, pv, fv = 0) {
        if (!isFinite(nper) || nper <= 0) return 0; // garde-fou : durée invalide → pas de division par zéro
        if (rate === 0) return -(pv + fv) / nper;
        const q = Math.pow(1 + rate, nper);
        return -(pv * q * rate + fv * rate) / (q - 1);
    },

    /**
     * Interest portion of payment (IPMT)
     * @param {number} rate Taux périodique
     * @param {number} per Période visée (1..nper)
     * @param {number} nper Nombre total de périodes
     * @param {number} pv Valeur actuelle (capital)
     * @param {number} [fv] Valeur future
     * @returns {number}
     */
    ipmt(rate, per, nper, pv, fv = 0) {
        const payment = this.pmt(rate, nper, pv, fv);
        const balance = this.fv(rate, per - 1, payment, pv);
        return balance * rate;
    },

    /**
     * Principal portion of payment (PPMT)
     * @param {number} rate Taux périodique
     * @param {number} per Période visée (1..nper)
     * @param {number} nper Nombre total de périodes
     * @param {number} pv Valeur actuelle (capital)
     * @param {number} [fv] Valeur future
     * @returns {number}
     */
    ppmt(rate, per, nper, pv, fv = 0) {
        return this.pmt(rate, nper, pv, fv) - this.ipmt(rate, per, nper, pv, fv);
    },

    /**
     * Future Value (FV)
     * @param {number} rate Taux périodique
     * @param {number} nper Nombre de périodes
     * @param {number} pmt Paiement périodique
     * @param {number} pv Valeur actuelle
     * @returns {number}
     */
    fv(rate, nper, pmt, pv) {
        if (rate === 0) return -(pv + pmt * nper);
        const q = Math.pow(1 + rate, nper);
        return -(pv * q + pmt * (q - 1) / rate);
    },

    /**
     * Present Value (PV)
     * @param {number} rate Taux périodique
     * @param {number} nper Nombre de périodes
     * @param {number} pmt Paiement périodique
     * @param {number} [fv] Valeur future
     * @returns {number}
     */
    pv(rate, nper, pmt, fv = 0) {
        if (rate === 0) return -(fv + pmt * nper);
        const q = Math.pow(1 + rate, nper);
        return -(fv + pmt * (q - 1) / rate) / q;
    },

    /**
     * Net Present Value (NPV)
     * @param {number} rate Taux d'actualisation périodique
     * @param {number[]} cashflows Flux (le premier est actualisé d'une période)
     * @returns {number}
     */
    npv(rate, cashflows) {
        return cashflows.reduce((acc, cf, i) => acc + cf / Math.pow(1 + rate, i + 1), 0);
    },

    /**
     * Internal Rate of Return (IRR) - Newton's method with multiple guesses
     * @param {number[]} cashflows Flux périodiques (le premier en période 0)
     * @param {number} [guess] Estimation initiale
     * @returns {number} Taux périodique
     * @throws {Error} si aucune estimation ne converge
     */
    irr(cashflows, guess = 0.1) {
        const maxIter = 1000;
        const tolerance = 1e-10;

        /**
         * @param {number} initialGuess
         * @returns {number | null}
         */
        const tryGuess = (initialGuess) => {
            let rate = initialGuess;
            for (let i = 0; i < maxIter; i++) {
                let npv = 0;
                let dnpv = 0;
                for (let j = 0; j < cashflows.length; j++) {
                    const factor = Math.pow(1 + rate, j);
                    npv += cashflows[j] / factor;
                    dnpv -= j * cashflows[j] / (factor * (1 + rate));
                }
                if (Math.abs(dnpv) < 1e-20) return null;
                const newRate = rate - npv / dnpv;
                if (!isFinite(newRate) || newRate <= -1) return null;
                if (Math.abs(newRate - rate) < tolerance) return newRate;
                rate = newRate;
            }
            return null;
        };

        // Try multiple guesses to improve convergence
        const guesses = [guess, 0.01, 0.001, 0.05, 0.2, -0.01];
        for (const g of guesses) {
            const result = tryGuess(g);
            if (result !== null && isFinite(result)) return result;
        }
        throw new Error('IRR did not converge');
    },

    /**
     * Effective Annual Rate from nominal rate
     * @param {number} nominalRate Taux nominal annuel (décimal)
     * @param {number} periodsPerYear Nombre de périodes par an
     * @returns {number}
     */
    effectiveRate(nominalRate, periodsPerYear) {
        return Math.pow(1 + nominalRate / periodsPerYear, periodsPerYear) - 1;
    },

    /**
     * TAEG (Taux Annuel Effectif Global) - EU directive 2008/48/CE
     * Actuarial annualization: (1 + periodic_irr)^ppy - 1
     * @param {number[]} cashflows Flux périodiques (décaissement initial négatif)
     * @param {number} [periodsPerYear] Périodes par an
     * @returns {number} TAEG en %
     */
    taeg(cashflows, periodsPerYear = 12) {
        const periodicRate = this.irr(cashflows);
        return (Math.pow(1 + periodicRate, periodsPerYear) - 1) * 100;
    },

    /**
     * TEG proportionnel (crédit professionnel) : taux de période × nombre de
     * périodes par an — l'indicateur d'usage hors crédit aux particuliers.
     * @param {number[]} cashflows Flux périodiques (décaissement initial négatif)
     * @param {number} [periodsPerYear]
     * @returns {number} TEG en %
     */
    teg(cashflows, periodsPerYear = 12) {
        return this.irr(cashflows) * periodsPerYear * 100;
    },

    /**
     * TAEG actuariel et TEG proportionnel d'une même série de flux (null si
     * le taux de rendement interne ne converge pas).
     * @param {number[]} cashflows
     * @param {number} periodsPerYear
     * @returns {{ taeg: number | null, teg: number | null }}
     */
    _effectiveRates(cashflows, periodsPerYear) {
        try {
            const r = this.irr(cashflows);
            return { taeg: (Math.pow(1 + r, periodsPerYear) - 1) * 100, teg: r * periodsPerYear * 100 };
        } catch {
            return { taeg: null, teg: null };
        }
    },

    // =============================================
    // HELPERS
    // =============================================

    /** @type {Record<string, number>} */
    _frequencyMap: { monthly: 12, quarterly: 4, semiannual: 2, annual: 1 },

    /** @type {Record<string, string>} */
    _frequencyLabels: { monthly: 'Mensualité', quarterly: 'Échéance trim.', semiannual: 'Échéance sem.', annual: 'Annuité' },

    /** @type {Record<string, string>} */
    _periodLabels: { monthly: 'Mois', quarterly: 'Trim.', semiannual: 'Sem.', annual: 'Année' },

    /**
     * @param {string} [frequency]
     * @returns {number} Périodes par an (12 par défaut)
     */
    getPeriodsPerYear(frequency = 'monthly') {
        return this._frequencyMap[frequency] || 12;
    },

    /**
     * @param {string} [frequency]
     * @returns {string} Libellé de l'échéance
     */
    getPaymentLabel(frequency = 'monthly') {
        return this._frequencyLabels[frequency] || 'Mensualité';
    },

    /**
     * @param {string} [frequency]
     * @returns {string} Libellé de la période
     */
    getPeriodLabel(frequency = 'monthly') {
        return this._periodLabels[frequency] || 'Mois';
    },

    /**
     * Garde-fou commun : true si les paramètres permettent un échéancier.
     * Évite Infinity/NaN silencieux sur durée ou principal invalides.
     * @param {number} principal
     * @param {number} durationMonths
     * @returns {boolean}
     */
    _validLoanParams(principal, durationMonths) {
        return isFinite(principal) && principal > 0 && isFinite(durationMonths) && durationMonths >= 1;
    },

    /** Résultat vide normalisé renvoyé quand les paramètres sont invalides
     *  @param {string} [frequency]
     *  @returns {LoanResult} */
    _emptyScheduleResult(frequency = 'monthly') {
        return {
            periodicPayment: 0, monthlyPayment: 0, monthlyPaymentExInsurance: 0,
            firstPayment: 0, lastPayment: 0, averagePayment: 0, finalPayment: 0,
            totalInterest: 0, totalInsurance: 0, totalCost: 0, totalPayment: 0,
            taeg: null, teg: null, frequency, schedule: [], invalid: true
        };
    },

    // =============================================
    // AMORTIZATION SCHEDULES
    // =============================================

    /**
     * Crédit Amortissable - Échéances Constantes
     * Supports frequency (monthly/quarterly/semiannual/annual)
     * Supports deferral (partial: interest-only, total: capitalized interest)
     * @param {LoanParams} params
     * @returns {LoanResult}
     */
    amortissableConstant({ principal, annualRate, durationMonths, insuranceMonthly = 0, insuranceRate = 0, insuranceMode = 'ci', fees = 0, frequency = 'monthly', deferralMonths = 0, deferralType = 'partial' }) {
        if (!this._validLoanParams(principal, durationMonths)) return this._emptyScheduleResult(frequency);
        const ppy = this.getPeriodsPerYear(frequency);
        const periodicRate = annualRate / 100 / ppy;
        const totalPeriods = Math.round(durationMonths / (12 / ppy));
        const deferralPeriods = Math.min(Math.round(deferralMonths / (12 / ppy)), totalPeriods - 1);
        const amortPeriods = totalPeriods - deferralPeriods;

        /** @param {number} bal Capital restant dû courant */
        const getInsurance = (bal) => {
            if (insuranceRate > 0) {
                const base = insuranceMode === 'crd' ? bal : principal;
                return base * insuranceRate / 100 / ppy;
            }
            return insuranceMonthly * (12 / ppy);
        };

        /** @type {AmortRow[]} */
        const schedule = [];
        let balance = principal;
        let totalInterest = 0;
        let totalInsurance = 0;

        // Phase 1: Deferral
        for (let i = 1; i <= deferralPeriods; i++) {
            const interest = balance * periodicRate;
            const ins = getInsurance(balance);
            if (deferralType === 'total') {
                balance += interest; // capitalize
                totalInterest += interest;
                totalInsurance += ins;
                schedule.push({ period: i, payment: ins, principal: 0, interest: 0, insurance: ins, balance, totalInterest, totalInsurance, deferred: true });
            } else {
                totalInterest += interest;
                totalInsurance += ins;
                schedule.push({ period: i, payment: interest + ins, principal: 0, interest, insurance: ins, balance, totalInterest, totalInsurance, deferred: true });
            }
        }

        // Phase 2: Amortization
        const amortBalance = balance;
        const payment = amortPeriods > 0 ? Math.abs(this.pmt(periodicRate, amortPeriods, amortBalance)) : 0;

        for (let i = 1; i <= amortPeriods; i++) {
            const interest = balance * periodicRate;
            const principalPart = payment - interest;
            const ins = getInsurance(balance);
            balance = Math.max(0, balance - principalPart);
            totalInterest += interest;
            totalInsurance += ins;

            schedule.push({
                period: deferralPeriods + i,
                payment: payment + ins,
                principal: principalPart,
                interest,
                insurance: ins,
                balance: Math.max(0, balance),
                totalInterest,
                totalInsurance
            });
        }

        const totalPayment = schedule.reduce((s, r) => s + r.payment, 0) + fees;
        const totalCost = totalPayment - principal;
        const firstAmortRow = schedule.find(r => !r.deferred) || schedule[0];

        // TAEG (actuarial annualization per EU directive)
        const cashflows = [-principal + fees];
        for (const row of schedule) cashflows.push(row.payment);
        const { taeg, teg } = this._effectiveRates(cashflows, ppy);

        return {
            periodicPayment: firstAmortRow ? firstAmortRow.payment : 0,
            monthlyPayment: (firstAmortRow ? firstAmortRow.payment : 0) / (12 / ppy),
            monthlyPaymentExInsurance: payment / (12 / ppy),
            totalInterest,
            totalInsurance,
            totalCost,
            totalPayment,
            taeg,
            teg,
            frequency,
            deferralMonths,
            deferralType,
            effectiveDurationMonths: totalPeriods * (12 / ppy),
            schedule
        };
    },

    /**
     * Prêt Bpifrance (Prêt Croissance, Prêt Vert, cofinancement MLT…) :
     * différé d'amortissement de 1 à 3 ans pendant lequel seuls les intérêts
     * sont payés, puis amortissement sur la durée restante. La durée totale
     * (7 ans le plus souvent, parfois 8 ou 10) INCLUT le différé.
     * amortProfile : 'constant' = échéances constantes (défaut),
     * 'degressif' = capital constant (linéaire).
     * @param {{ principal: number, annualRate: number, durationYears: number, deferralYears: number, frequency?: string, fees?: number, amortProfile?: string }} p
     * @returns {LoanResult & { amortProfile: string, deferralPayment: number, amortYears: number }}
     */
    pretBpifrance({ principal, annualRate, durationYears, deferralYears, frequency = 'quarterly', fees = 0, amortProfile = 'constant' }) {
        const years = Math.max(1, Number(durationYears) || 0);
        // au moins un an d'amortissement après le différé
        const deferral = Math.min(Math.max(0, Number(deferralYears) || 0), years - 1);
        const params = { principal, annualRate, durationMonths: years * 12, fees, frequency, deferralMonths: deferral * 12, deferralType: 'partial' };
        const profile = amortProfile === 'degressif' ? 'degressif' : 'constant';
        const result = profile === 'degressif' ? this.amortissableDegressif(params) : this.amortissableConstant(params);
        const deferredRow = result.schedule.find(r => r.deferred);
        return { ...result, amortProfile: profile, deferralPayment: deferredRow ? deferredRow.payment : 0, amortYears: years - deferral };
    },

    /**
     * Crédit Amortissable - Amortissement Constant (échéances dégressives)
     * Supports frequency + deferral
     * @param {LoanParams} params
     * @returns {LoanResult}
     */
    amortissableDegressif({ principal, annualRate, durationMonths, insuranceMonthly = 0, insuranceRate = 0, insuranceMode = 'ci', fees = 0, frequency = 'monthly', deferralMonths = 0, deferralType = 'partial' }) {
        if (!this._validLoanParams(principal, durationMonths)) return this._emptyScheduleResult(frequency);
        const ppy = this.getPeriodsPerYear(frequency);
        const periodicRate = annualRate / 100 / ppy;
        const totalPeriods = Math.round(durationMonths / (12 / ppy));
        const deferralPeriods = Math.min(Math.round(deferralMonths / (12 / ppy)), totalPeriods - 1);
        const amortPeriods = totalPeriods - deferralPeriods;

        /** @param {number} bal Capital restant dû courant */
        const getInsurance = (bal) => {
            if (insuranceRate > 0) {
                const base = insuranceMode === 'crd' ? bal : principal;
                return base * insuranceRate / 100 / ppy;
            }
            return insuranceMonthly * (12 / ppy);
        };

        /** @type {AmortRow[]} */
        const schedule = [];
        let balance = principal;
        let totalInterest = 0;
        let totalInsurance = 0;

        // Phase 1: Deferral
        for (let i = 1; i <= deferralPeriods; i++) {
            const interest = balance * periodicRate;
            const ins = getInsurance(balance);
            if (deferralType === 'total') {
                balance += interest;
                totalInterest += interest;
                totalInsurance += ins;
                schedule.push({ period: i, payment: ins, principal: 0, interest: 0, insurance: ins, balance, totalInterest, totalInsurance, deferred: true });
            } else {
                totalInterest += interest;
                totalInsurance += ins;
                schedule.push({ period: i, payment: interest + ins, principal: 0, interest, insurance: ins, balance, totalInterest, totalInsurance, deferred: true });
            }
        }

        // Phase 2: Amortization
        const constantPrincipal = amortPeriods > 0 ? balance / amortPeriods : 0;

        for (let i = 1; i <= amortPeriods; i++) {
            const interest = balance * periodicRate;
            const payment = constantPrincipal + interest;
            const ins = getInsurance(balance);
            balance = Math.max(0, balance - constantPrincipal);
            totalInterest += interest;
            totalInsurance += ins;

            schedule.push({
                period: deferralPeriods + i,
                payment: payment + ins,
                principal: constantPrincipal,
                interest,
                insurance: ins,
                balance: Math.max(0, balance),
                totalInterest,
                totalInsurance
            });
        }

        const totalPayment = schedule.reduce((s, r) => s + r.payment, 0) + fees;
        const totalCost = totalPayment - principal;
        const firstAmortIdx = schedule.findIndex(r => !r.deferred);
        const firstPayment = firstAmortIdx >= 0 ? schedule[firstAmortIdx].payment : 0;
        const lastPayment = schedule[schedule.length - 1]?.payment || 0;

        // TAEG
        const cashflows = [-principal + fees];
        for (const row of schedule) cashflows.push(row.payment);
        const { taeg, teg } = this._effectiveRates(cashflows, ppy);

        return {
            firstPayment,
            lastPayment,
            averagePayment: totalPayment / totalPeriods,
            periodicPayment: firstPayment,
            totalInterest,
            totalInsurance,
            totalCost,
            totalPayment,
            taeg,
            teg,
            frequency,
            deferralMonths,
            deferralType,
            effectiveDurationMonths: totalPeriods * (12 / ppy),
            schedule
        };
    },

    /**
     * Crédit In Fine - Intérêts seuls puis remboursement capital
     * Supports frequency
     * @param {LoanParams} params
     * @returns {LoanResult}
     */
    // insuranceMode (LoanParams) est sans effet en in fine : le CRD reste égal
    // au capital initial, les assiettes 'ci' et 'crd' sont donc équivalentes.
    inFine({ principal, annualRate, durationMonths, insuranceMonthly = 0, insuranceRate = 0, fees = 0, frequency = 'monthly' }) {
        if (!this._validLoanParams(principal, durationMonths)) return this._emptyScheduleResult(frequency);
        const ppy = this.getPeriodsPerYear(frequency);
        const periodicRate = annualRate / 100 / ppy;
        const totalPeriods = Math.round(durationMonths / (12 / ppy));
        const periodicInterest = principal * periodicRate;

        const getInsurance = () => {
            if (insuranceRate > 0) {
                return principal * insuranceRate / 100 / ppy;
            }
            return insuranceMonthly * (12 / ppy);
        };
        /** @type {AmortRow[]} */
        const schedule = [];
        let totalInterest = 0;
        let totalInsurance = 0;

        for (let i = 1; i <= totalPeriods; i++) {
            const isLast = i === totalPeriods;
            const bal = isLast ? 0 : principal;
            const principalPart = isLast ? principal : 0;
            const payment = periodicInterest + (isLast ? principal : 0);
            const ins = getInsurance();
            totalInterest += periodicInterest;
            totalInsurance += ins;

            schedule.push({
                period: i,
                payment: payment + ins,
                principal: principalPart,
                interest: periodicInterest,
                insurance: ins,
                balance: bal,
                totalInterest,
                totalInsurance
            });
        }

        const totalPayment = totalInterest + principal + totalInsurance + fees;
        const totalCost = totalPayment - principal;
        const firstInsurance = schedule[0]?.insurance || 0;

        // TAEG
        const cashflows = [-principal + fees];
        for (const row of schedule) cashflows.push(row.payment);
        const { taeg, teg } = this._effectiveRates(cashflows, ppy);

        return {
            periodicPayment: periodicInterest + firstInsurance,
            monthlyPayment: (periodicInterest + firstInsurance) / (12 / ppy),
            finalPayment: principal + periodicInterest + firstInsurance,
            totalInterest,
            totalInsurance,
            totalCost,
            totalPayment,
            taeg,
            teg,
            frequency,
            effectiveDurationMonths: totalPeriods * (12 / ppy),
            schedule
        };
    },

    // =============================================
    // PREPAYMENT ANALYSIS (IRA)
    // =============================================

    /**
     * Analyse de remboursement anticipé avec calcul des IRA
     * strategy: 'reduceDuration' | 'reducePayment'
     * @param {{
     *   schedule: AmortRow[],
     *   principal: number,
     *   annualRate: number,
     *   frequency?: string,
     *   prepaymentPeriod: number,
     *   prepaymentAmount: number,
     *   strategy?: string,
     *   insuranceMonthly?: number,
     *   insuranceRate?: number,
     *   insuranceMode?: string,
     *   iraMode?: string,
     *   iraPct?: number,
     *   iraMonths?: number
     * }} params
     *   iraMode : 'legal' (défaut) = min(3 % du CRD ; 6 mois d'intérêts sur le
     *             capital remboursé), plafond du crédit immobilier aux
     *             particuliers (C. conso.) et usage courant en crédit pro ;
     *             'pct' = iraPct % du capital remboursé (clause forfaitaire) ;
     *             'months' = iraMonths mois d'intérêts sur le capital remboursé ;
     *             'none' = sans indemnité.
     */
    prepaymentAnalysis({ schedule, principal, annualRate, frequency = 'monthly', prepaymentPeriod, prepaymentAmount, strategy = 'reduceDuration', insuranceMonthly = 0, insuranceRate = 0, insuranceMode = 'ci', iraMode = 'legal', iraPct = 3, iraMonths = 6 }) {
        const ppy = this.getPeriodsPerYear(frequency);
        const periodicRate = annualRate / 100 / ppy;

        // Find CRD at prepayment date
        const row = schedule[prepaymentPeriod - 1];
        if (!row) return null;
        const crdAtDate = row.balance;
        if (crdAtDate <= 0) return null;

        const actualPrepayment = Math.min(prepaymentAmount, crdAtDate);
        const isTotal = actualPrepayment >= crdAtDate * 0.999;

        // Composantes : 3 % du CRD avant remboursement, et 6 mois d'intérêts
        // au taux du prêt sur le capital remboursé. La règle retenue dépend
        // de iraMode (le plafond légal est le MINIMUM des deux).
        const ira3pct = crdAtDate * 0.03;
        const ira6mois = actualPrepayment * (annualRate / 100 / 12) * 6;
        let ira;
        if (iraMode === 'none') ira = 0;
        else if (iraMode === 'pct') ira = actualPrepayment * Math.max(0, iraPct) / 100;
        else if (iraMode === 'months') ira = actualPrepayment * (annualRate / 100 / 12) * Math.max(0, iraMonths);
        else ira = Math.min(ira3pct, ira6mois);

        // Before totals
        const beforeTotalInterest = schedule[schedule.length - 1].totalInterest;
        const beforeTotalInsurance = schedule[schedule.length - 1].totalInsurance || 0;
        const beforeDuration = schedule.length;

        // Compute interest paid up to prepayment
        const interestBeforePrepay = row.totalInterest;
        const insuranceBeforePrepay = row.totalInsurance || 0;

        let after = null;
        if (!isTotal) {
            const newCrd = crdAtDate - actualPrepayment;
            const remainingPeriodsOriginal = schedule.length - prepaymentPeriod;

            if (strategy === 'reduceDuration') {
                // Same periodic payment, fewer periods
                const origPayment = schedule.find(r => r.principal > 0)?.payment || schedule[prepaymentPeriod]?.payment || 0;
                const origPaymentExIns = origPayment - (schedule[prepaymentPeriod]?.insurance || 0);
                // How many periods to repay newCrd with same payment?
                let bal = newCrd;
                let periods = 0;
                let extraInterest = 0;
                let extraInsurance = 0;
                while (bal > 0.01 && periods < 1000) {
                    const int = bal * periodicRate;
                    const getIns = () => {
                        if (insuranceRate > 0) {
                            const base = insuranceMode === 'crd' ? bal : principal;
                            return base * insuranceRate / 100 / ppy;
                        }
                        return insuranceMonthly * (12 / ppy);
                    };
                    const ins = getIns();
                    const princ = Math.min(origPaymentExIns - int, bal);
                    if (princ <= 0) break;
                    bal = Math.max(0, bal - princ);
                    extraInterest += int;
                    extraInsurance += ins;
                    periods++;
                }
                after = {
                    totalInterest: interestBeforePrepay + extraInterest,
                    totalInsurance: insuranceBeforePrepay + extraInsurance,
                    duration: prepaymentPeriod + periods,
                    periodicPayment: origPayment
                };
            } else {
                // Same duration, lower payment
                const newPayment = remainingPeriodsOriginal > 0 ? Math.abs(this.pmt(periodicRate, remainingPeriodsOriginal, newCrd)) : 0;
                let bal = newCrd;
                let extraInterest = 0;
                let extraInsurance = 0;
                for (let i = 0; i < remainingPeriodsOriginal; i++) {
                    const int = bal * periodicRate;
                    const getIns = () => {
                        if (insuranceRate > 0) {
                            const base = insuranceMode === 'crd' ? bal : principal;
                            return base * insuranceRate / 100 / ppy;
                        }
                        return insuranceMonthly * (12 / ppy);
                    };
                    const ins = getIns();
                    const princ = newPayment - int;
                    bal = Math.max(0, bal - princ);
                    extraInterest += int;
                    extraInsurance += ins;
                }
                after = {
                    totalInterest: interestBeforePrepay + extraInterest,
                    totalInsurance: insuranceBeforePrepay + extraInsurance,
                    duration: beforeDuration,
                    periodicPayment: newPayment + (schedule[0]?.insurance || 0)
                };
            }
        } else {
            // Total prepayment
            after = {
                totalInterest: interestBeforePrepay,
                totalInsurance: insuranceBeforePrepay,
                duration: prepaymentPeriod,
                periodicPayment: 0
            };
        }

        return {
            prepaymentPeriod,
            crdAtDate,
            prepaymentAmount: actualPrepayment,
            isTotal,
            ira,
            ira3pct,
            ira6mois,
            iraMode,
            totalCostPrepayment: actualPrepayment + ira,
            comparison: {
                before: {
                    totalInterest: beforeTotalInterest,
                    totalInsurance: beforeTotalInsurance,
                    totalCost: beforeTotalInterest + beforeTotalInsurance,
                    duration: beforeDuration
                },
                after: {
                    totalInterest: after.totalInterest,
                    totalInsurance: after.totalInsurance,
                    totalCost: after.totalInterest + after.totalInsurance + ira,
                    duration: after.duration,
                    periodicPayment: after.periodicPayment
                },
                savings: {
                    interest: beforeTotalInterest - after.totalInterest,
                    duration: beforeDuration - after.duration,
                    netSavings: (beforeTotalInterest + beforeTotalInsurance) - (after.totalInterest + after.totalInsurance + ira)
                }
            }
        };
    },

    /**
     * Crédit-Bail (Leasing)
     * - paymentTiming 'arrears' (terme échu) | 'advance' (terme à échoir, usuel
     *   en crédit-bail : chaque loyer est payé en début de période) ;
     * - firstRentPct : premier loyer majoré (% de la valeur du bien) versé à la
     *   signature, en plus de l'éventuel dépôt / apport.
     * @param {{ assetValue: number, deposit: number, annualRate: number, durationMonths: number, residualValue: number, fees?: number, paymentTiming?: string, firstRentPct?: number }} params
     */
    creditBail({ assetValue, deposit, annualRate, durationMonths, residualValue, fees = 0, paymentTiming = 'arrears', firstRentPct = 0 }) {
        const firstRent = assetValue * Math.max(0, firstRentPct) / 100;
        const financed = assetValue - deposit - firstRent;
        const monthlyRate = annualRate / 100 / 12;
        const advance = paymentTiming === 'advance';
        const n = Math.max(1, Math.round(durationMonths));
        const arrearsPayment = Math.abs(this.pmt(monthlyRate, n, financed, -residualValue));
        const payment = advance ? arrearsPayment / (1 + monthlyRate) : arrearsPayment;
        /** @type {AmortRow[]} */
        const schedule = [];
        let balance = financed;
        let totalRent = 0;
        let totalInterest = 0;

        for (let i = 1; i <= n; i++) {
            let interest;
            if (advance) {
                // loyer en début de période, intérêts courus sur le solde restant
                balance -= payment;
                interest = balance * monthlyRate;
                balance += interest;
            } else {
                interest = balance * monthlyRate;
                balance = balance + interest - payment;
            }
            totalRent += payment;
            totalInterest += interest;

            schedule.push({
                period: i,
                payment,
                principal: payment - interest,
                interest,
                insurance: 0,
                balance: Math.max(0, balance),
                totalInterest
            });
        }

        const totalCost = deposit + firstRent + totalRent + residualValue - assetValue + fees;

        // TAEG : le preneur reçoit le financement net des frais, paie les loyers
        // (début ou fin de période) puis la valeur résiduelle (levée d'option)
        const cashflows = [-financed + fees];
        for (let i = 0; i < n; i++) cashflows.push(0);
        for (let i = 1; i <= n; i++) cashflows[advance ? i - 1 : i] += payment;
        cashflows[n] += residualValue;
        const { taeg, teg } = this._effectiveRates(cashflows, 12);

        return {
            monthlyRent: payment,
            firstRent,
            paymentTiming: advance ? 'advance' : 'arrears',
            deposit,
            residualValue,
            financedAmount: financed,
            totalRent,
            totalInterest,
            totalCost,
            totalPayment: deposit + firstRent + totalRent + residualValue + fees,
            taeg,
            teg,
            schedule
        };
    },

    /**
     * Crédit-bail immobilier vs acquisition financée par emprunt (SCI à l'IS) :
     * coût net d'impôt année par année et en valeur actuelle. Approche
     * simplifiée, à valider avec l'expert-comptable :
     * - emprunt : apport + frais d'acquisition à t0 ; déductions = intérêts +
     *   amortissement du bâti (hors terrain) + frais d'acquisition amortis avec le bâti ;
     * - crédit-bail : avance preneur à t0 (non déductible, réduit l'encours) ;
     *   loyers déductibles hors quote-part terrain ; levée d'option (valeur
     *   résiduelle) au terme, non déductible. Les deux schémas aboutissent à
     *   la propriété du bien au terme de la même durée.
     * @param {{ price: number, landPct: number, notaryPct: number, isRate: number, buildingDepYears: number, discountRate: number,
     *   loan: { rate: number, durationYears: number, apportPct: number },
     *   cbi: { rate: number, durationYears: number, avancePct: number, residualPct: number, timing?: string } }} p
     */
    cbiVsLoan({ price, landPct, notaryPct, isRate, buildingDepYears, discountRate, loan, cbi }) {
        // Horizon : jusqu'à la fin de l'amortissement du bâti, pour ne pas perdre
        // l'économie d'IS de l'emprunt après son terme
        const years = Math.max(1, Math.round(Math.max(loan.durationYears, cbi.durationYears, buildingDepYears)));
        const t = isRate / 100;
        const building = price * (1 - landPct / 100);
        const notary = price * notaryPct / 100;
        const depYearly = (building + notary * (1 - landPct / 100)) / Math.max(1, buildingDepYears);

        // Emprunt
        const apport = price * loan.apportPct / 100 + notary;
        const loanSim = this.amortissableConstant({ principal: price * (1 - loan.apportPct / 100), annualRate: loan.rate, durationMonths: Math.round(loan.durationYears * 12) });
        // Crédit-bail (loyers mensuels, terme à échoir par défaut)
        const avance = price * cbi.avancePct / 100;
        const residual = price * cbi.residualPct / 100;
        // Les frais d'acquisition sont portés par le crédit-bailleur et refacturés dans les loyers
        const cbiSim = this.creditBail({ assetValue: price + notary, deposit: avance, annualRate: cbi.rate, durationMonths: Math.round(cbi.durationYears * 12), residualValue: residual, paymentTiming: cbi.timing || 'advance' });

        const rows = [];
        let npvLoan = apport, npvCbi = avance;
        for (let y = 1; y <= years; y++) {
            const lr = loanSim.schedule.slice((y - 1) * 12, y * 12);
            const service = lr.reduce((s, r) => s + r.payment, 0);
            const interest = lr.reduce((s, r) => s + r.interest, 0);
            const dep = y <= buildingDepYears ? depYearly : 0;
            const loanNet = service - t * (interest + dep);
            const cr = cbiSim.schedule.slice((y - 1) * 12, y * 12);
            const rents = cr.reduce((s, r) => s + r.payment, 0);
            const option = y === Math.round(cbi.durationYears) ? residual : 0;
            const cbiNet = rents + option - t * rents * (1 - landPct / 100);
            const df = Math.pow(1 + discountRate / 100, y);
            npvLoan += loanNet / df;
            npvCbi += cbiNet / df;
            rows.push({ year: y, loanService: service, loanTaxSaving: t * (interest + dep), loanNet, cbiRents: rents, cbiOption: option, cbiTaxSaving: t * rents * (1 - landPct / 100), cbiNet });
        }
        return {
            rows, apport, avance, residual,
            loanRate: loan.rate, cbiRent: cbiSim.monthlyRent,
            npvLoan, npvCbi, advantage: npvLoan - npvCbi, cheaper: npvCbi < npvLoan ? 'cbi' : 'loan'
        };
    },

    /**
     * Ligne de Crédit Revolving (RCF)
     * - utilization : % moyen tiré, ou utilizationProfile : % tiré par mois
     *   (12 valeurs, répétées sur la durée) pour un BFR saisonnier ;
     * - commission de non-utilisation sur le non tiré : commitmentFee en %/an,
     *   ou commitmentMode 'ofMargin' = commitmentFee % de la marge (ex. 35 %) ;
     * - commission d'utilisation par paliers (utilizationFees : au-delà de
     *   x % de tirage, +y %/an sur le tiré) ; frais de mise en place (% de la ligne).
     * @param {{ creditLine: number, utilization?: number, utilizationProfile?: number[], annualRate: number, commitmentFee: number,
     *   commitmentMode?: string, margin?: number, utilizationFees?: Array<{ above: number, fee: number }>, upfrontFeePct?: number, durationMonths: number }} params
     */
    revolving({ creditLine, utilization = 0, utilizationProfile = [], annualRate, commitmentFee, commitmentMode = 'flat', margin = 0, utilizationFees = [], upfrontFeePct = 0, durationMonths }) {
        const n = Math.max(1, Math.round(durationMonths || 0));
        const monthlyRate = annualRate / 100 / 12;
        const commitmentPct = commitmentMode === 'ofMargin' ? margin * commitmentFee / 100 : commitmentFee;
        const commitmentMonthly = commitmentPct / 100 / 12;
        const profile = (utilizationProfile || []).filter(v => isFinite(v));
        const tiers = (utilizationFees || []).filter(t => isFinite(t.above) && isFinite(t.fee)).sort((a, b) => a.above - b.above);
        const upfrontFee = creditLine * (upfrontFeePct || 0) / 100;
        const schedule = [];
        let totalInterest = 0;
        let totalCommitment = 0;
        let totalUtilFee = 0;
        let sumUtilized = 0;
        let peak = 0;
        let monthsAtZero = 0;

        for (let i = 1; i <= n; i++) {
            const pct = Math.min(100, Math.max(0, profile.length ? profile[(i - 1) % profile.length] : utilization));
            const utilized = creditLine * pct / 100;
            const unused = creditLine - utilized;
            const interest = utilized * monthlyRate;
            const commitment = unused * commitmentMonthly;
            const tier = tiers.filter(t => pct > t.above).pop();
            const utilFee = tier ? utilized * tier.fee / 100 / 12 : 0;
            totalInterest += interest;
            totalCommitment += commitment;
            totalUtilFee += utilFee;
            sumUtilized += utilized;
            peak = Math.max(peak, utilized);
            if (utilized === 0) monthsAtZero++;

            schedule.push({
                period: i,
                utilized,
                unused,
                interest,
                commitmentFee: commitment,
                utilizationFee: utilFee,
                totalCost: interest + commitment + utilFee,
                totalInterest,
                totalCommitment
            });
        }

        const avgUtilized = sumUtilized / n;
        const totalCost = totalInterest + totalCommitment + totalUtilFee + upfrontFee;
        return {
            monthlyInterest: schedule[0].interest,
            monthlyCommitment: schedule[0].commitmentFee,
            monthlyCost: totalCost / n,
            totalInterest,
            totalCommitment,
            totalUtilizationFee: totalUtilFee,
            upfrontFee,
            totalCost,
            avgUtilized,
            peakUtilized: peak,
            monthsAtZero,
            commitmentRate: commitmentPct,
            // Coût annualisé rapporté au tiré moyen ; sans tirage, seul le coût
            // de la ligne (commission de non-utilisation) a un sens.
            effectiveRate: avgUtilized > 0 ? (totalCost / avgUtilized / n * 12) * 100 : null,
            lineCostRate: creditLine > 0 ? (totalCost / creditLine / n * 12) * 100 : null,
            schedule
        };
    },

    /**
     * Comparatif de financement du poste clients (BFR) : affacturage,
     * mobilisation Dailly / escompte, RCF. Coûts annuels, base Exact/360.
     * @param {{
     *   turnover: number, dso: number, index: number,
     *   factoring: { commissionPct: number, margin: number, reservePct: number, fixedFees?: number },
     *   dailly: { margin: number, advancePct: number, feePerBatch?: number, batchesPerYear?: number },
     *   rcf: { margin: number, commitmentPctOfMargin: number, upfrontFeePct?: number, line?: number, years?: number }
     * }} p turnover = CA TTC confié / mobilisé (€/an), dso en jours, index Euribor (%)
     */
    bfrComparison({ turnover, dso, index, factoring, dailly, rcf }) {
        const receivables = Math.max(0, turnover) * Math.max(0, dso) / 365;
        const dc = 365 / 360;
        const fFin = receivables * (1 - (factoring.reservePct || 0) / 100);
        const fCost = turnover * (factoring.commissionPct || 0) / 100 + fFin * (index + factoring.margin) / 100 * dc + (factoring.fixedFees || 0);
        const dFin = receivables * (dailly.advancePct ?? 100) / 100;
        const dCost = dFin * (index + dailly.margin) / 100 * dc + (dailly.feePerBatch || 0) * (dailly.batchesPerYear || 0);
        const line = Math.max(rcf.line || 0, dFin);
        const rCommit = (line - dFin) * (rcf.margin * (rcf.commitmentPctOfMargin || 0) / 100) / 100;
        const rCost = dFin * (index + rcf.margin) / 100 * dc + rCommit + line * (rcf.upfrontFeePct || 0) / 100 / Math.max(1, rcf.years || 1);
        const row = (/** @type {string} */ name, /** @type {number} */ fin, /** @type {number} */ cost, /** @type {string} */ note) => ({ name, financed: fin, cost, ratePct: fin > 0 ? cost / fin * 100 : null, note });
        return {
            receivables,
            solutions: [
                row('Affacturage', fFin, fCost, 'commission sur le CA cédé + financement ; inclut en général gestion du poste clients et assurance-crédit'),
                row('Dailly / escompte', dFin, dCost, 'mobilisation des créances, pas de délégation de gestion'),
                row('RCF', dFin, rCost, `ligne de ${Math.round(line).toLocaleString('fr-FR')} €, non-utilisation et frais de mise en place inclus`)
            ]
        };
    },

    /**
     * Prêt Relais
     * @param {{ bridgeAmount: number, annualRate: number, durationMonths: number, expectedSalePrice: number, capitalizedInterest?: boolean, fees?: number }} params
     */
    pretRelais({ bridgeAmount, annualRate, durationMonths, expectedSalePrice, capitalizedInterest = false, fees = 0 }) {
        const monthlyRate = annualRate / 100 / 12;
        const schedule = [];
        let balance = bridgeAmount;
        let totalInterest = 0;

        for (let i = 1; i <= durationMonths; i++) {
            const interest = balance * monthlyRate;
            if (capitalizedInterest) {
                balance += interest;
            }
            totalInterest += interest;

            const isLast = i === durationMonths;
            schedule.push({
                period: i,
                payment: capitalizedInterest ? 0 : interest,
                interest,
                capitalizedInterest: capitalizedInterest ? interest : 0,
                balance: isLast ? 0 : balance,
                totalInterest
            });
        }

        const finalBalance = capitalizedInterest ? balance : bridgeAmount;
        const netProceeds = expectedSalePrice - finalBalance;

        // TAEG
        const cashflows = [-bridgeAmount + fees];
        for (const row of schedule) cashflows.push(row.payment);
        cashflows[cashflows.length - 1] += finalBalance; // repayment of capital at end
        const { taeg, teg } = this._effectiveRates(cashflows, 12);

        return {
            monthlyPayment: capitalizedInterest ? 0 : bridgeAmount * monthlyRate,
            finalBalance,
            totalInterest,
            totalCost: totalInterest + fees,
            netProceeds,
            ltv: expectedSalePrice > 0 ? (bridgeAmount / expectedSalePrice * 100) : null,
            taeg,
            teg,
            schedule
        };
    },

    /**
     * Crédit Relais de TVA (préfinancement de TVA)
     * Avance la TVA décaissée sur une opération (foncier / travaux), récupérée in fine
     * au remboursement du crédit de TVA par le Trésor (ou par imputation). Le capital
     * est constant jusqu'à la récupération ; seuls les intérêts de portage sont servis.
     * À distinguer de pretRelais (relais d'acquisition adossé à une revente).
     *
     * @param {{
     *   tvaAmount: number,
     *   annualRate: number,
     *   durationMonths: number,
     *   frequency?: string,
     *   interestMode?: string,
     *   fees?: number
     * }} params
     *   - tvaAmount      : TVA préfinancée (capital mobilisé)
     *   - annualRate     : Taux tout-compris du relais (Euribor + marge)
     *   - durationMonths : Délai jusqu'à récupération de la TVA
     *   - frequency      : Périodicité des intérêts (défaut : trimestriel)
     *   - interestMode   : 'periodic' (intérêts servis) | 'capitalized' (in fine)
     *   - fees           : Frais de dossier / commission d'engagement
     */
    creditRelaisTVA({ tvaAmount, annualRate, durationMonths, frequency = 'quarterly', interestMode = 'periodic', fees = 0 }) {
        const ppy = this.getPeriodsPerYear(frequency);
        const periodicRate = annualRate / 100 / ppy;
        const totalPeriods = Math.max(1, Math.round(durationMonths / (12 / ppy)));
        const capitalized = interestMode === 'capitalized';

        const schedule = [];
        let balance = tvaAmount;
        let totalInterest = 0;

        for (let i = 1; i <= totalPeriods; i++) {
            const isLast = i === totalPeriods;
            const interest = balance * periodicRate;
            totalInterest += interest;

            if (capitalized) {
                balance += interest; // intérêts capitalisés jusqu'à la sortie
                schedule.push({
                    period: i,
                    payment: isLast ? balance : 0,
                    principal: isLast ? tvaAmount : 0,
                    interest,
                    capitalizedInterest: interest,
                    balance: isLast ? 0 : balance,
                    totalInterest
                });
            } else {
                schedule.push({
                    period: i,
                    payment: interest + (isLast ? tvaAmount : 0),
                    principal: isLast ? tvaAmount : 0,
                    interest,
                    capitalizedInterest: 0,
                    balance: isLast ? 0 : tvaAmount,
                    totalInterest
                });
            }
        }

        const carryingCost = totalInterest + fees;
        const carryingCostPct = tvaAmount > 0 ? (carryingCost / tvaAmount) * 100 : 0;

        // TAEG (même convention de signe que inFine / pretRelais)
        const cashflows = [-tvaAmount + fees];
        for (const row of schedule) cashflows.push(row.payment);
        const { taeg, teg } = this._effectiveRates(cashflows, ppy);

        return {
            tvaAmount,
            periodicInterest: tvaAmount * periodicRate,
            totalInterest,
            carryingCost,
            carryingCostPct,
            taeg,
            teg,
            frequency,
            interestMode,
            finalRecoveryMonth: durationMonths,
            schedule
        };
    },

    /**
     * Dette Mezzanine
     * - intérêts cash servis mensuellement sur le nominal + PIK déjà capitalisé ;
     * - PIK couru mensuellement, capitalisé selon pikCompounding : 'monthly'
     *   (défaut historique) ou 'annual' (usage courant des contrats) ;
     * - remboursement in fine du nominal + PIK, plus l'equity kicker.
     * @param {{ principal: number, cashRate: number, pikRate: number, durationMonths: number, equityKicker?: number, fees?: number, pikCompounding?: string }} params
     */
    detteMezzanine({ principal, cashRate, pikRate, durationMonths, equityKicker = 0, fees = 0, pikCompounding = 'monthly' }) {
        const n = Math.max(1, Math.round(durationMonths));
        const monthlyCashRate = cashRate / 100 / 12;
        const monthlyPikRate = pikRate / 100 / 12;
        const annual = pikCompounding === 'annual';
        const schedule = [];
        let balance = principal;   // nominal + PIK capitalisé
        let accrued = 0;           // PIK couru non encore capitalisé
        let totalCashInterest = 0;
        let totalPikInterest = 0;

        for (let i = 1; i <= n; i++) {
            const cashInterest = balance * monthlyCashRate;
            const pikInterest = balance * monthlyPikRate;
            accrued += pikInterest;
            const isLast = i === n;
            if (!annual || i % 12 === 0 || isLast) { balance += accrued; accrued = 0; }
            totalCashInterest += cashInterest;
            totalPikInterest += pikInterest;

            schedule.push({
                period: i,
                cashPayment: cashInterest,
                pikInterest,
                periodInterest: cashInterest + pikInterest,
                balance: isLast ? 0 : balance + accrued,
                totalCashInterest,
                totalPikInterest
            });
        }

        const finalRepayment = balance;
        const kickerValue = principal * (equityKicker / 100);

        // TAEG: receive principal - fees, pay cash interest monthly, repay balance + kicker at end
        const cashflows = [-principal + fees];
        for (const row of schedule) cashflows.push(row.cashPayment);
        cashflows[cashflows.length - 1] += finalRepayment + kickerValue;
        const { taeg, teg } = this._effectiveRates(cashflows, 12);

        return {
            monthlyCashPayment: principal * monthlyCashRate,
            finalRepayment,
            totalCashInterest,
            totalPikInterest,
            equityKickerValue: kickerValue,
            pikCompounding: annual ? 'annual' : 'monthly',
            totalCost: totalCashInterest + totalPikInterest + kickerValue + fees,
            // Coût moyen simple (non actuariel) — le TAEG ci-dessous fait foi
            allInCost: ((totalCashInterest + totalPikInterest + kickerValue + fees) / principal / n * 12) * 100,
            taeg,
            teg,
            schedule
        };
    },

    // =============================================
    // TRANCHING (LBO MULTI-TRANCHE)
    // =============================================

    /**
     * Tranching - Multi-tranche leveraged loan simulation
     * Runs each tranche independently and builds a consolidated schedule
     * @param {TrancheInput[]} tranches
     */
    tranching(tranches) {
        const trancheResults = tranches.map(t => {
            const freq = t.frequency || 'monthly';
            const params = {
                principal: t.amount,
                annualRate: t.rate,
                durationMonths: t.duration,
                insuranceMonthly: 0,
                fees: 0,
                frequency: freq
            };
            const result = t.type === 'infine'
                ? this.inFine(params)
                : t.type === 'degressif'
                    ? this.amortissableDegressif(params)
                    : this.amortissableConstant(params);
            return { ...t, result };
        });

        // Normalize all tranche schedules to monthly periods for consolidated view
        // Each tranche may have different frequency, so we expand to monthly
        const maxDuration = Math.max(...tranches.map(t => t.duration));

        // Build consolidated schedule (monthly)
        const consolidatedSchedule = [];
        for (let month = 1; month <= maxDuration; month++) {
            let totalPayment = 0, totalPrincipal = 0, totalInterest = 0, totalBalance = 0;

            for (const tr of trancheResults) {
                const freq = tr.frequency || 'monthly';
                const ppy = this.getPeriodsPerYear(freq);
                const monthsPerPeriod = 12 / ppy;

                const schedule = tr.result.schedule;
                // Échéance tombant ce mois-ci (fin de période) : flux comptés
                if (month % monthsPerPeriod === 0) {
                    const row = schedule[month / monthsPerPeriod - 1];
                    if (row) {
                        totalPayment += row.payment;
                        totalPrincipal += row.principal;
                        totalInterest += row.interest;
                    }
                }
                // CRD fin de mois = solde après la dernière échéance passée
                // (montant tiré tant qu'aucune échéance n'est tombée)
                const lastPaid = Math.floor(month / monthsPerPeriod) - 1;
                if (lastPaid < 0) totalBalance += schedule.length ? tr.amount : 0;
                else if (lastPaid < schedule.length) totalBalance += schedule[lastPaid].balance;
            }

            consolidatedSchedule.push({
                period: month,
                payment: totalPayment,
                principal: totalPrincipal,
                interest: totalInterest,
                balance: totalBalance
            });
        }

        const totalDebt = tranches.reduce((s, t) => s + t.amount, 0);
        const weightedRate = totalDebt > 0
            ? tranches.reduce((s, t) => s + t.amount * t.rate, 0) / totalDebt
            : 0;
        const totalInterestAll = trancheResults.reduce((s, tr) => s + tr.result.totalInterest, 0);
        const totalPaymentAll = trancheResults.reduce((s, tr) => s + tr.result.totalPayment, 0);
        const totalCost = trancheResults.reduce((s, tr) => s + tr.result.totalCost, 0);
        const annualDebtService = consolidatedSchedule.slice(0, 12).reduce((s, r) => s + r.payment, 0);

        return {
            tranches: trancheResults,
            consolidated: {
                schedule: consolidatedSchedule,
                totalDebt,
                weightedRate,
                annualDebtService,
                totalInterest: totalInterestAll,
                totalCost,
                totalPayment: totalPaymentAll
            }
        };
    },

    // =============================================
    // STRUCTURED FINANCE
    // =============================================

    /**
     * Structured Finance - cascade de paiements (waterfall) multi-tranches.
     * Chaque mois, dans l'ordre :
     *  1. intérêts de TOUTES les tranches de dette, par rang de priorité ;
     *     l'impayé est capitalisé (il porte intérêt et reste dû) ;
     *  2. capital, tranche par tranche dans l'ordre de priorité, avec le cash
     *     restant (balayage à 100 %) ;
     *  3. le solde éventuel revient aux tranches 'equity' (sans intérêt).
     * TRI de chaque tranche : nominal annuel (taux mensuel × 12) et actuariel.
     * @param {{
     *   tranches: Array<{ name: string, amount: number, rate: number, type?: string, priority: number }>,
     *   projectCashflows: number[],
     *   durationMonths: number
     * }} params tranches : type 'senior' | 'mezzanine' | 'equity'
     */
    structuredFinance({ tranches, projectCashflows, durationMonths }) {
        const sortedTranches = [...tranches].sort((a, b) => a.priority - b.priority);
        const results = sortedTranches.map(t => ({
            ...t,
            balance: t.amount,
            totalInterest: 0,
            capitalizedInterest: 0,
            totalPrincipal: 0,
            payments: /** @type {number[]} */ ([]),
            irr: /** @type {number | null} */ (null),
            irrActuarial: /** @type {number | null} */ (null)
        }));
        const debt = results.filter(t => t.type !== 'equity');
        const equity = results.filter(t => t.type === 'equity');

        const waterfall = [];

        for (let month = 1; month <= durationMonths; month++) {
            const cashflow = projectCashflows[month - 1] || 0;
            let remaining = Math.max(0, cashflow);
            /** @type {Map<string, { name: string, interest: number, principal: number, capitalized: number }>} */
            const alloc = new Map(results.map(t => [t.name, { name: t.name, interest: 0, principal: 0, capitalized: 0 }]));

            // 1. Intérêts, par priorité ; impayé capitalisé
            for (const tranche of debt) {
                if (tranche.balance <= 0) continue;
                const interest = tranche.balance * tranche.rate / 100 / 12;
                const paid = Math.min(interest, remaining);
                remaining -= paid;
                tranche.totalInterest += paid;
                const a = /** @type {{ interest: number, capitalized: number }} */ (alloc.get(tranche.name));
                a.interest = paid;
                if (interest > paid) {
                    tranche.balance += interest - paid;
                    tranche.capitalizedInterest += interest - paid;
                    a.capitalized = interest - paid;
                }
            }
            // 2. Capital, séquentiel
            for (const tranche of debt) {
                if (remaining <= 0) break;
                if (tranche.balance <= 0) continue;
                const paid = Math.min(tranche.balance, remaining);
                tranche.balance -= paid;
                tranche.totalPrincipal += paid;
                remaining -= paid;
                /** @type {{ principal: number }} */ (alloc.get(tranche.name)).principal = paid;
            }
            // 3. Résiduel aux fonds propres (au prorata des montants)
            const equityTotal = equity.reduce((s, t) => s + t.amount, 0);
            for (const tranche of equity) {
                const share = equityTotal > 0 ? remaining * tranche.amount / equityTotal : 0;
                /** @type {{ principal: number }} */ (alloc.get(tranche.name)).principal = share;
                tranche.totalPrincipal += share;
            }
            const excess = equity.length ? 0 : remaining;

            for (const tranche of results) {
                const a = /** @type {{ interest: number, principal: number }} */ (alloc.get(tranche.name));
                tranche.payments.push(a.interest + a.principal);
            }
            waterfall.push({ period: month, cashflow, allocations: [...alloc.values()], excess });
        }

        for (const tranche of results) {
            const flows = [-tranche.amount, ...tranche.payments];
            try {
                const r = this.irr(flows);
                tranche.irr = r * 12 * 100;
                tranche.irrActuarial = (Math.pow(1 + r, 12) - 1) * 100;
            } catch { tranche.irr = null; tranche.irrActuarial = null; }
        }

        return { tranches: results, waterfall };
    },

    // =============================================
    // RATIOS & METRICS
    // =============================================

    /**
     * Debt Service Coverage Ratio
     * @param {number} netOperatingIncome
     * @param {number} totalDebtService
     * @returns {number}
     */
    dscr(netOperatingIncome, totalDebtService) {
        return totalDebtService === 0 ? Infinity : netOperatingIncome / totalDebtService;
    },

    /**
     * Loan-to-Value Ratio
     * @param {number} loanAmount
     * @param {number} assetValue
     * @returns {number} LTV en %
     */
    ltv(loanAmount, assetValue) {
        return assetValue === 0 ? 0 : (loanAmount / assetValue) * 100;
    },

    /**
     * Interest Coverage Ratio
     * @param {number} ebit
     * @param {number} interestExpense
     * @returns {number}
     */
    icr(ebit, interestExpense) {
        return interestExpense === 0 ? Infinity : ebit / interestExpense;
    },

    /**
     * Debt-to-Equity Ratio
     * @param {number} totalDebt
     * @param {number} totalEquity
     * @returns {number}
     */
    debtToEquity(totalDebt, totalEquity) {
        return totalEquity === 0 ? Infinity : totalDebt / totalEquity;
    },

    /**
     * Weighted Average Cost of Capital
     * @param {{ debtAmount: number, equityAmount: number, costOfDebt: number, costOfEquity: number, taxRate: number }} params
     * @returns {number}
     */
    wacc({ debtAmount, equityAmount, costOfDebt, costOfEquity, taxRate }) {
        const total = debtAmount + equityAmount;
        if (total === 0) return 0;
        const wd = debtAmount / total;
        const we = equityAmount / total;
        return wd * costOfDebt * (1 - taxRate / 100) + we * costOfEquity;
    },

    // =============================================
    // STRESS TESTING
    // =============================================

    /**
     * Sensitivity analysis - varies rate and duration
     * @param {{ principal: number, baseRate: number, baseDuration: number, rateRange: number[], durationRange: number[], insuranceMonthly?: number, frequency?: string }} params
     */
    sensitivityAnalysis({ principal, baseRate, baseDuration, rateRange, durationRange, insuranceMonthly = 0, frequency = 'monthly' }) {
        const results = [];
        for (const rateDelta of rateRange) {
            const row = [];
            for (const durationDelta of durationRange) {
                const rate = baseRate + rateDelta;
                const duration = baseDuration + durationDelta;
                if (rate <= 0 || duration <= 0) {
                    row.push(null);
                    continue;
                }
                const sim = this.amortissableConstant({
                    principal,
                    annualRate: rate,
                    durationMonths: duration,
                    insuranceMonthly,
                    frequency
                });
                row.push({
                    rate,
                    duration,
                    monthlyPayment: sim.monthlyPayment,
                    periodicPayment: sim.periodicPayment,
                    totalCost: sim.totalCost,
                    totalInterest: sim.totalInterest
                });
            }
            results.push(row);
        }
        return results;
    },

    /**
     * Lit un nombre saisi au format français ou anglais : « -1 000 000 »,
     * « 1 000,50 », « 1.000,50 », « 4,5 % », « 12 000 € ». NaN si illisible.
     * @param {unknown} raw
     * @returns {number}
     */
    parseNumber(raw) {
        if (typeof raw === 'number') return raw;
        let t = String(raw ?? '').trim().replace(/[\s\u00a0\u202f€%]/g, '').replace(/[\u2212\u2013]/g, '-');
        if (!t) return NaN;
        const sign = /^[-+]/.test(t) ? t[0] : '';
        const body = sign ? t.slice(1) : t;
        if (body.includes(',') && body.includes('.')) {
            // le dernier séparateur est la décimale : 1.000,50 ou 1,000.50
            t = body.lastIndexOf(',') > body.lastIndexOf('.') ? body.replace(/\./g, '').replace(',', '.') : body.replace(/,/g, '');
        } else if (/^\d{1,3}(\.\d{3})+$/.test(body)) {
            t = body.replace(/\./g, '');            // 1.000 / 1.000.000 (milliers)
        } else if (/^\d{1,3}(,\d{3}){2,}$/.test(body)) {
            t = body.replace(/,/g, '');              // 1,000,000
        } else {
            t = body.replace(',', '.');
        }
        t = sign + t;
        return /^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(t) ? parseFloat(t) : NaN;
    },

    // =============================================
    // FORMATTING
    // =============================================

    /**
     * @param {number | null | undefined} value
     * @param {number} [decimals]
     * @returns {string}
     */
    formatCurrency(value, decimals = 0) {
        if (value == null || isNaN(value)) return '—';
        return new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: 'EUR',
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        }).format(value);
    },

    /**
     * @param {number | null | undefined} value Valeur en % (ex: 3,25 pour 3,25 %)
     * @param {number} [decimals]
     * @returns {string}
     */
    formatPercent(value, decimals = 2) {
        if (value == null || isNaN(value)) return '—';
        return new Intl.NumberFormat('fr-FR', {
            style: 'percent',
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        }).format(value / 100);
    },

    /**
     * @param {number | null | undefined} value
     * @param {number} [decimals]
     * @returns {string}
     */
    formatNumber(value, decimals = 0) {
        if (value == null || isNaN(value)) return '—';
        return new Intl.NumberFormat('fr-FR', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        }).format(value);
    }
};
