/**
 * Auxy Partners - Financial Calculation Engine
 * All core financial formulas for credit simulation, structured finance, etc.
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
        if (rate === 0) return -(pv + fv) / nper;
        const q = Math.pow(1 + rate, nper);
        return -(pv * q * rate + fv * rate) / (q - 1);
    },

    /**
     * Interest portion of payment (IPMT)
     */
    ipmt(rate, per, nper, pv, fv = 0) {
        const payment = this.pmt(rate, nper, pv, fv);
        const balance = this.fv(rate, per - 1, payment, pv);
        return balance * rate;
    },

    /**
     * Principal portion of payment (PPMT)
     */
    ppmt(rate, per, nper, pv, fv = 0) {
        return this.pmt(rate, nper, pv, fv) - this.ipmt(rate, per, nper, pv, fv);
    },

    /**
     * Future Value (FV)
     */
    fv(rate, nper, pmt, pv) {
        if (rate === 0) return -(pv + pmt * nper);
        const q = Math.pow(1 + rate, nper);
        return -(pv * q + pmt * (q - 1) / rate);
    },

    /**
     * Present Value (PV)
     */
    pv(rate, nper, pmt, fv = 0) {
        if (rate === 0) return -(fv + pmt * nper);
        const q = Math.pow(1 + rate, nper);
        return -(fv + pmt * (q - 1) / rate) / q;
    },

    /**
     * Net Present Value (NPV)
     */
    npv(rate, cashflows) {
        return cashflows.reduce((acc, cf, i) => acc + cf / Math.pow(1 + rate, i + 1), 0);
    },

    /**
     * Internal Rate of Return (IRR) - Newton's method with multiple guesses
     */
    irr(cashflows, guess = 0.1) {
        const maxIter = 1000;
        const tolerance = 1e-10;

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
     */
    effectiveRate(nominalRate, periodsPerYear) {
        return Math.pow(1 + nominalRate / periodsPerYear, periodsPerYear) - 1;
    },

    /**
     * TAEG (Taux Annuel Effectif Global) - EU directive 2008/48/CE
     * Actuarial annualization: (1 + periodic_irr)^ppy - 1
     */
    taeg(cashflows, periodsPerYear = 12) {
        const periodicRate = this.irr(cashflows);
        return (Math.pow(1 + periodicRate, periodsPerYear) - 1) * 100;
    },

    // =============================================
    // HELPERS
    // =============================================

    _frequencyMap: { monthly: 12, quarterly: 4, semiannual: 2, annual: 1 },

    _frequencyLabels: { monthly: 'Mensualité', quarterly: 'Échéance trim.', semiannual: 'Échéance sem.', annual: 'Annuité' },

    _periodLabels: { monthly: 'Mois', quarterly: 'Trim.', semiannual: 'Sem.', annual: 'Année' },

    getPeriodsPerYear(frequency = 'monthly') {
        return this._frequencyMap[frequency] || 12;
    },

    getPaymentLabel(frequency = 'monthly') {
        return this._frequencyLabels[frequency] || 'Mensualité';
    },

    getPeriodLabel(frequency = 'monthly') {
        return this._periodLabels[frequency] || 'Mois';
    },

    // =============================================
    // AMORTIZATION SCHEDULES
    // =============================================

    /**
     * Crédit Amortissable - Échéances Constantes
     * Supports frequency (monthly/quarterly/semiannual/annual)
     * Supports deferral (partial: interest-only, total: capitalized interest)
     */
    amortissableConstant({ principal, annualRate, durationMonths, insuranceMonthly = 0, insuranceRate = 0, insuranceMode = 'ci', fees = 0, frequency = 'monthly', deferralMonths = 0, deferralType = 'partial' }) {
        const ppy = this.getPeriodsPerYear(frequency);
        const periodicRate = annualRate / 100 / ppy;
        const totalPeriods = Math.round(durationMonths / (12 / ppy));
        const deferralPeriods = Math.min(Math.round(deferralMonths / (12 / ppy)), totalPeriods - 1);
        const amortPeriods = totalPeriods - deferralPeriods;

        const getInsurance = (bal) => {
            if (insuranceRate > 0) {
                const base = insuranceMode === 'crd' ? bal : principal;
                return base * insuranceRate / 100 / ppy;
            }
            return insuranceMonthly * (12 / ppy);
        };

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
        const firstInsurance = schedule[0]?.insurance || 0;
        const firstAmortRow = schedule.find(r => !r.deferred) || schedule[0];

        // TAEG (actuarial annualization per EU directive)
        const cashflows = [-principal + fees];
        for (const row of schedule) cashflows.push(row.payment);
        let taeg;
        try { taeg = this.taeg(cashflows, ppy); } catch { taeg = null; }

        return {
            periodicPayment: firstAmortRow ? firstAmortRow.payment : 0,
            monthlyPayment: (firstAmortRow ? firstAmortRow.payment : 0) / (12 / ppy),
            monthlyPaymentExInsurance: payment / (12 / ppy),
            totalInterest,
            totalInsurance,
            totalCost,
            totalPayment,
            taeg,
            frequency,
            deferralMonths,
            deferralType,
            schedule
        };
    },

    /**
     * Crédit Amortissable - Amortissement Constant (échéances dégressives)
     * Supports frequency + deferral
     */
    amortissableDegressif({ principal, annualRate, durationMonths, insuranceMonthly = 0, insuranceRate = 0, insuranceMode = 'ci', fees = 0, frequency = 'monthly', deferralMonths = 0, deferralType = 'partial' }) {
        const ppy = this.getPeriodsPerYear(frequency);
        const periodicRate = annualRate / 100 / ppy;
        const totalPeriods = Math.round(durationMonths / (12 / ppy));
        const deferralPeriods = Math.min(Math.round(deferralMonths / (12 / ppy)), totalPeriods - 1);
        const amortPeriods = totalPeriods - deferralPeriods;

        const getInsurance = (bal) => {
            if (insuranceRate > 0) {
                const base = insuranceMode === 'crd' ? bal : principal;
                return base * insuranceRate / 100 / ppy;
            }
            return insuranceMonthly * (12 / ppy);
        };

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
        let taeg;
        try { taeg = this.taeg(cashflows, ppy); } catch { taeg = null; }

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
            frequency,
            deferralMonths,
            deferralType,
            schedule
        };
    },

    /**
     * Crédit In Fine - Intérêts seuls puis remboursement capital
     * Supports frequency
     */
    inFine({ principal, annualRate, durationMonths, insuranceMonthly = 0, insuranceRate = 0, insuranceMode = 'ci', fees = 0, frequency = 'monthly' }) {
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
        let taeg;
        try { taeg = this.taeg(cashflows, ppy); } catch { taeg = null; }

        return {
            periodicPayment: periodicInterest + firstInsurance,
            monthlyPayment: (periodicInterest + firstInsurance) / (12 / ppy),
            finalPayment: principal + periodicInterest + firstInsurance,
            totalInterest,
            totalInsurance,
            totalCost,
            totalPayment,
            taeg,
            frequency,
            schedule
        };
    },

    // =============================================
    // PREPAYMENT ANALYSIS (IRA)
    // =============================================

    /**
     * Analyse de remboursement anticipé avec calcul des IRA
     * @param {object} params - { schedule, principal, annualRate, frequency, prepaymentPeriod, prepaymentAmount, strategy }
     * strategy: 'reduceDuration' | 'reducePayment'
     */
    prepaymentAnalysis({ schedule, principal, annualRate, frequency = 'monthly', prepaymentPeriod, prepaymentAmount, strategy = 'reduceDuration', insuranceMonthly = 0, insuranceRate = 0, insuranceMode = 'ci', type = 'constant', deferralMonths = 0, deferralType = 'partial' }) {
        const ppy = this.getPeriodsPerYear(frequency);
        const periodicRate = annualRate / 100 / ppy;

        // Find CRD at prepayment date
        const row = schedule[prepaymentPeriod - 1];
        if (!row) return null;
        const crdAtDate = row.balance;
        if (crdAtDate <= 0) return null;

        const actualPrepayment = Math.min(prepaymentAmount, crdAtDate);
        const isTotal = actualPrepayment >= crdAtDate * 0.999;

        // IRA = max(3% du CRD, 6 mois d'intérêts sur montant remboursé)
        // "6 mois d'intérêts" = montant remboursé × taux mensuel × 6
        const ira3pct = crdAtDate * 0.03;
        const ira6mois = actualPrepayment * (annualRate / 100 / 12) * 6;
        const ira = Math.max(ira3pct, ira6mois);

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
     */
    creditBail({ assetValue, deposit, annualRate, durationMonths, residualValue, fees = 0 }) {
        const financed = assetValue - deposit;
        const monthlyRate = annualRate / 100 / 12;
        const payment = Math.abs(this.pmt(monthlyRate, durationMonths, financed, -residualValue));
        const schedule = [];
        let balance = financed;
        let totalRent = 0;
        let totalInterest = 0;

        for (let i = 1; i <= durationMonths; i++) {
            const interest = balance * monthlyRate;
            const principalPart = payment - interest;
            balance = Math.max(0, balance - principalPart);
            totalRent += payment;
            totalInterest += interest;

            schedule.push({
                period: i,
                payment,
                principal: principalPart,
                interest,
                insurance: 0,
                balance: Math.max(0, balance),
                totalInterest
            });
        }

        const totalCost = deposit + totalRent + residualValue - assetValue + fees;

        // TAEG: borrower receives financed amount net of fees, pays rent, then residual
        const cashflows = [-financed + fees];
        for (const row of schedule) cashflows.push(row.payment);
        cashflows[cashflows.length - 1] += residualValue;
        let taeg;
        try { taeg = this.taeg(cashflows, 12); } catch { taeg = null; }

        return {
            monthlyRent: payment,
            deposit,
            residualValue,
            financedAmount: financed,
            totalRent,
            totalInterest,
            totalCost,
            totalPayment: deposit + totalRent + residualValue + fees,
            taeg,
            schedule
        };
    },

    /**
     * Ligne de Crédit Revolving
     */
    revolving({ creditLine, utilization, annualRate, commitmentFee, durationMonths }) {
        const monthlyRate = annualRate / 100 / 12;
        const commitmentMonthly = commitmentFee / 100 / 12;
        const utilized = creditLine * (utilization / 100);
        const unused = creditLine - utilized;
        const schedule = [];
        let totalInterest = 0;
        let totalCommitment = 0;

        for (let i = 1; i <= durationMonths; i++) {
            const interest = utilized * monthlyRate;
            const commitment = unused * commitmentMonthly;
            totalInterest += interest;
            totalCommitment += commitment;

            schedule.push({
                period: i,
                utilized,
                unused,
                interest,
                commitmentFee: commitment,
                totalCost: interest + commitment,
                totalInterest,
                totalCommitment
            });
        }

        return {
            monthlyInterest: utilized * monthlyRate,
            monthlyCommitment: unused * commitmentMonthly,
            monthlyCost: utilized * monthlyRate + unused * commitmentMonthly,
            totalInterest,
            totalCommitment,
            totalCost: totalInterest + totalCommitment,
            effectiveRate: ((totalInterest + totalCommitment) / utilized / durationMonths * 12) * 100,
            schedule
        };
    },

    /**
     * Prêt Relais
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
        let taeg;
        try { taeg = this.taeg(cashflows, 12); } catch { taeg = null; }

        return {
            monthlyPayment: capitalizedInterest ? 0 : bridgeAmount * monthlyRate,
            finalBalance,
            totalInterest,
            totalCost: totalInterest + fees,
            netProceeds,
            ltv: (bridgeAmount / expectedSalePrice * 100),
            taeg,
            schedule
        };
    },

    /**
     * Dette Mezzanine
     */
    detteMezzanine({ principal, cashRate, pikRate, durationMonths, equityKicker = 0, fees = 0 }) {
        const monthlyCashRate = cashRate / 100 / 12;
        const monthlyPikRate = pikRate / 100 / 12;
        const schedule = [];
        let balance = principal;
        let totalCashInterest = 0;
        let totalPikInterest = 0;

        for (let i = 1; i <= durationMonths; i++) {
            const cashInterest = balance * monthlyCashRate;
            const pikInterest = balance * monthlyPikRate;
            balance += pikInterest; // PIK is capitalized
            totalCashInterest += cashInterest;
            totalPikInterest += pikInterest;

            const isLast = i === durationMonths;
            schedule.push({
                period: i,
                cashPayment: cashInterest,
                pikInterest,
                totalInterest: cashInterest + pikInterest,
                balance: isLast ? 0 : balance,
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
        let taeg;
        try { taeg = this.taeg(cashflows, 12); } catch { taeg = null; }

        return {
            monthlyCashPayment: principal * monthlyCashRate,
            finalRepayment,
            totalCashInterest,
            totalPikInterest,
            equityKickerValue: kickerValue,
            totalCost: totalCashInterest + totalPikInterest + kickerValue + fees - principal,
            allInCost: ((totalCashInterest + totalPikInterest + kickerValue) / principal / durationMonths * 12) * 100,
            taeg,
            schedule
        };
    },

    // =============================================
    // TRANCHING (LBO MULTI-TRANCHE)
    // =============================================

    /**
     * Tranching - Multi-tranche leveraged loan simulation
     * Runs each tranche independently and builds a consolidated schedule
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

                // Find the corresponding period for this month
                const periodIndex = Math.ceil(month / monthsPerPeriod) - 1;
                const row = tr.result.schedule[periodIndex];
                if (row) {
                    // Only count payment on the actual period boundary month
                    const isPeriodBoundary = (month % monthsPerPeriod === 0) || (monthsPerPeriod === 1);
                    if (isPeriodBoundary) {
                        totalPayment += row.payment;
                        totalPrincipal += row.principal;
                        totalInterest += row.interest;
                    }
                    totalBalance += row.balance;
                }
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
     * Structured Finance - Multi-tranche waterfall
     */
    structuredFinance({ totalDebt, tranches, projectCashflows, durationMonths }) {
        // tranches: [{ name, amount, rate, type: 'senior'|'mezzanine'|'equity', priority }]
        const sortedTranches = [...tranches].sort((a, b) => a.priority - b.priority);
        const results = sortedTranches.map(t => ({
            ...t,
            balance: t.amount,
            totalInterest: 0,
            totalPrincipal: 0,
            payments: [],
            irr: null
        }));

        const waterfall = [];

        for (let month = 1; month <= durationMonths; month++) {
            const cashflow = projectCashflows[month - 1] || 0;
            let remaining = cashflow;
            const monthData = { period: month, cashflow, allocations: [] };

            // Pay interest first (by priority)
            for (const tranche of results) {
                if (tranche.balance <= 0) {
                    monthData.allocations.push({ name: tranche.name, interest: 0, principal: 0 });
                    continue;
                }
                const monthlyRate = tranche.rate / 100 / 12;
                const interest = tranche.balance * monthlyRate;
                const interestPaid = Math.min(interest, remaining);
                remaining -= interestPaid;
                tranche.totalInterest += interestPaid;

                const allocation = { name: tranche.name, interest: interestPaid, principal: 0 };

                // Principal repayment with remaining cash
                if (remaining > 0) {
                    const principalPaid = Math.min(tranche.balance, remaining);
                    tranche.balance -= principalPaid;
                    tranche.totalPrincipal += principalPaid;
                    remaining -= principalPaid;
                    allocation.principal = principalPaid;
                }

                tranche.payments.push(interestPaid + allocation.principal);
                monthData.allocations.push(allocation);
            }

            monthData.excess = remaining;
            waterfall.push(monthData);
        }

        // Calculate IRR for each tranche
        for (const tranche of results) {
            const flows = [-tranche.amount, ...tranche.payments];
            try { tranche.irr = this.irr(flows) * 12 * 100; } catch { tranche.irr = null; }
        }

        return { tranches: results, waterfall };
    },

    // =============================================
    // RATIOS & METRICS
    // =============================================

    /**
     * Debt Service Coverage Ratio
     */
    dscr(netOperatingIncome, totalDebtService) {
        return totalDebtService === 0 ? Infinity : netOperatingIncome / totalDebtService;
    },

    /**
     * Loan-to-Value Ratio
     */
    ltv(loanAmount, assetValue) {
        return assetValue === 0 ? 0 : (loanAmount / assetValue) * 100;
    },

    /**
     * Interest Coverage Ratio
     */
    icr(ebit, interestExpense) {
        return interestExpense === 0 ? Infinity : ebit / interestExpense;
    },

    /**
     * Debt-to-Equity Ratio
     */
    debtToEquity(totalDebt, totalEquity) {
        return totalEquity === 0 ? Infinity : totalDebt / totalEquity;
    },

    /**
     * Weighted Average Cost of Capital
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
     */
    sensitivityAnalysis({ principal, baseRate, baseDuration, rateRange, durationRange, insuranceMonthly = 0 }) {
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
                    insuranceMonthly
                });
                row.push({
                    rate,
                    duration,
                    monthlyPayment: sim.monthlyPayment,
                    totalCost: sim.totalCost,
                    totalInterest: sim.totalInterest
                });
            }
            results.push(row);
        }
        return results;
    },

    // =============================================
    // FORMATTING
    // =============================================

    formatCurrency(value, decimals = 0) {
        if (value == null || isNaN(value)) return '—';
        return new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: 'EUR',
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        }).format(value);
    },

    formatPercent(value, decimals = 2) {
        if (value == null || isNaN(value)) return '—';
        return new Intl.NumberFormat('fr-FR', {
            style: 'percent',
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        }).format(value / 100);
    },

    formatNumber(value, decimals = 0) {
        if (value == null || isNaN(value)) return '—';
        return new Intl.NumberFormat('fr-FR', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        }).format(value);
    }
};
