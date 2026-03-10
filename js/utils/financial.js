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
     * Internal Rate of Return (IRR) - Newton's method
     */
    irr(cashflows, guess = 0.1) {
        const maxIter = 1000;
        const tolerance = 1e-10;
        let rate = guess;

        for (let i = 0; i < maxIter; i++) {
            let npv = 0;
            let dnpv = 0;
            for (let j = 0; j < cashflows.length; j++) {
                npv += cashflows[j] / Math.pow(1 + rate, j);
                dnpv -= j * cashflows[j] / Math.pow(1 + rate, j + 1);
            }
            const newRate = rate - npv / dnpv;
            if (Math.abs(newRate - rate) < tolerance) return newRate;
            rate = newRate;
        }
        return rate;
    },

    /**
     * Effective Annual Rate from nominal rate
     */
    effectiveRate(nominalRate, periodsPerYear) {
        return Math.pow(1 + nominalRate / periodsPerYear, periodsPerYear) - 1;
    },

    /**
     * TAEG (Taux Annuel Effectif Global)
     */
    taeg(cashflows) {
        return this.irr(cashflows) * 12;
    },

    // =============================================
    // AMORTIZATION SCHEDULES
    // =============================================

    /**
     * Crédit Amortissable - Mensualités Constantes
     */
    amortissableConstant({ principal, annualRate, durationMonths, insuranceMonthly = 0, insuranceRate = 0, insuranceMode = 'ci', fees = 0 }) {
        const monthlyRate = annualRate / 100 / 12;
        const payment = Math.abs(this.pmt(monthlyRate, durationMonths, principal));
        const getInsurance = (balance) => {
            if (insuranceRate > 0) {
                const base = insuranceMode === 'crd' ? balance : principal;
                return base * insuranceRate / 100 / 12;
            }
            return insuranceMonthly;
        };
        const schedule = [];
        let balance = principal;
        let totalInterest = 0;
        let totalInsurance = 0;

        for (let i = 1; i <= durationMonths; i++) {
            const interest = balance * monthlyRate;
            const principalPart = payment - interest;
            const ins = getInsurance(balance);
            balance = Math.max(0, balance - principalPart);
            totalInterest += interest;
            totalInsurance += ins;

            schedule.push({
                period: i,
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

        // TAEG calculation (use per-period cashflows for variable insurance)
        const cashflows = [-principal + fees];
        for (const row of schedule) {
            cashflows.push(row.payment);
        }
        let taeg;
        try { taeg = this.irr(cashflows) * 12 * 100; } catch { taeg = null; }

        return {
            monthlyPayment: payment + firstInsurance,
            monthlyPaymentExInsurance: payment,
            totalInterest,
            totalInsurance,
            totalCost,
            totalPayment,
            taeg,
            schedule
        };
    },

    /**
     * Crédit Amortissable - Amortissement Constant (mensualités dégressives)
     */
    amortissableDegressif({ principal, annualRate, durationMonths, insuranceMonthly = 0, insuranceRate = 0, insuranceMode = 'ci', fees = 0 }) {
        const monthlyRate = annualRate / 100 / 12;
        const constantPrincipal = principal / durationMonths;
        const getInsurance = (balance) => {
            if (insuranceRate > 0) {
                const base = insuranceMode === 'crd' ? balance : principal;
                return base * insuranceRate / 100 / 12;
            }
            return insuranceMonthly;
        };
        const schedule = [];
        let balance = principal;
        let totalInterest = 0;
        let totalInsurance = 0;

        for (let i = 1; i <= durationMonths; i++) {
            const interest = balance * monthlyRate;
            const payment = constantPrincipal + interest;
            const ins = getInsurance(balance);
            balance = Math.max(0, balance - constantPrincipal);
            totalInterest += interest;
            totalInsurance += ins;

            schedule.push({
                period: i,
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
        const firstPayment = schedule[0].payment;
        const lastPayment = schedule[schedule.length - 1].payment;

        return {
            firstPayment,
            lastPayment,
            averagePayment: totalPayment / durationMonths,
            totalInterest,
            totalInsurance,
            totalCost,
            totalPayment,
            schedule
        };
    },

    /**
     * Crédit In Fine - Intérêts seuls puis remboursement capital
     */
    inFine({ principal, annualRate, durationMonths, insuranceMonthly = 0, insuranceRate = 0, insuranceMode = 'ci', fees = 0 }) {
        const monthlyRate = annualRate / 100 / 12;
        const monthlyInterest = principal * monthlyRate;
        const getInsurance = (balance) => {
            if (insuranceRate > 0) {
                const base = insuranceMode === 'crd' ? balance : principal;
                return base * insuranceRate / 100 / 12;
            }
            return insuranceMonthly;
        };
        const schedule = [];
        let totalInterest = 0;
        let totalInsurance = 0;

        for (let i = 1; i <= durationMonths; i++) {
            const isLast = i === durationMonths;
            const balance = isLast ? 0 : principal;
            const principalPart = isLast ? principal : 0;
            const payment = monthlyInterest + (isLast ? principal : 0);
            const ins = getInsurance(principal); // In Fine: balance = principal until last period
            totalInterest += monthlyInterest;
            totalInsurance += ins;

            schedule.push({
                period: i,
                payment: payment + ins,
                principal: principalPart,
                interest: monthlyInterest,
                insurance: ins,
                balance,
                totalInterest,
                totalInsurance
            });
        }

        const totalPayment = totalInterest + principal + totalInsurance + fees;
        const totalCost = totalPayment - principal;
        const firstInsurance = schedule[0]?.insurance || 0;

        return {
            monthlyPayment: monthlyInterest + firstInsurance,
            finalPayment: principal + monthlyInterest + firstInsurance,
            totalInterest,
            totalInsurance,
            totalCost,
            totalPayment,
            schedule
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

        return {
            monthlyRent: payment,
            deposit,
            residualValue,
            financedAmount: financed,
            totalRent,
            totalInterest,
            totalCost,
            totalPayment: deposit + totalRent + residualValue + fees,
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

        return {
            monthlyPayment: capitalizedInterest ? 0 : bridgeAmount * monthlyRate,
            finalBalance,
            totalInterest,
            totalCost: totalInterest + fees,
            netProceeds,
            ltv: (bridgeAmount / expectedSalePrice * 100),
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

        return {
            monthlyCashPayment: principal * monthlyCashRate,
            finalRepayment,
            totalCashInterest,
            totalPikInterest,
            equityKickerValue: kickerValue,
            totalCost: totalCashInterest + totalPikInterest + kickerValue + fees - principal,
            allInCost: ((totalCashInterest + totalPikInterest + kickerValue) / principal / durationMonths * 12) * 100,
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
            const params = {
                principal: t.amount,
                annualRate: t.rate,
                durationMonths: t.duration,
                insuranceMonthly: 0,
                fees: 0
            };
            const result = t.type === 'infine'
                ? this.inFine(params)
                : this.amortissableConstant(params);
            return { ...t, result };
        });

        const maxDuration = Math.max(...tranches.map(t => t.duration));

        // Build consolidated schedule
        const consolidatedSchedule = [];
        for (let period = 1; period <= maxDuration; period++) {
            let totalPayment = 0, totalPrincipal = 0, totalInterest = 0, totalBalance = 0;

            for (const tr of trancheResults) {
                const row = tr.result.schedule[period - 1];
                if (row) {
                    totalPayment += row.payment;
                    totalPrincipal += row.principal;
                    totalInterest += row.interest;
                    totalBalance += row.balance;
                }
            }

            consolidatedSchedule.push({
                period,
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
