/**
 * Auxy Partners - Moteur de profil de dette daté
 *
 * Reconstruit les échéanciers des crédits depuis leurs conditions d'ORIGINE
 * (montant initial, date de 1ère échéance, durée totale) puis agrège par
 * exercice fiscal (mois de clôture paramétrable) : variation de
 * l'endettement, service historique et projectif, KPIs (WAL, TMP, pic).
 *
 * Module PUR (aucune dépendance DOM) — testé dans tests/debtengine.test.mjs.
 *
 * Conventions (reprises dans l'encart méthodologie du PDF) :
 * - une « date mensuelle » est un index absolu : year × 12 + (month − 1) ;
 * - le tirage est rattaché au mois précédant la 1ère échéance ;
 * - le CRD « à date » est le solde après la dernière échéance passée
 *   (montant initial si le crédit est tiré mais sans échéance passée) ;
 * - un exercice clos en (closingMonth, Y) couvre les 12 mois se terminant
 *   au closingMonth de Y ; il est étiqueté « Y » en année civile
 *   (closingMonth = 12), « MM/Y » sinon.
 */

import { Financial } from './financial.js';

export const DebtEngine = {

    // ── Dates mensuelles ──
    monthIndex(year, month) {
        return year * 12 + (month - 1);
    },

    indexToLabel(mIdx) {
        const year = Math.floor(mIdx / 12);
        const month = (mIdx % 12) + 1;
        return `${String(month).padStart(2, '0')}/${year}`;
    },

    /** Année de clôture de l'exercice fiscal contenant le mois mIdx */
    fiscalYearOf(mIdx, closingMonth = 12) {
        const year = Math.floor(mIdx / 12);
        const month = (mIdx % 12) + 1;
        return month <= closingMonth ? year : year + 1;
    },

    /** Dernier mois (index) de l'exercice clos en closingYear */
    fiscalYearEnd(closingYear, closingMonth = 12) {
        return this.monthIndex(closingYear, closingMonth);
    },

    fiscalYearLabel(closingYear, closingMonth = 12) {
        return closingMonth === 12
            ? String(closingYear)
            : `${String(closingMonth).padStart(2, '0')}/${closingYear}`;
    },

    // ── Échéancier daté d'un crédit ──

    /**
     * loan : { amount, rate, durationMonths, startYear, startMonth (1ère échéance),
     *          amortType: 'constant'|'degressif'|'infine', frequency, deferralMonths? }
     * Retourne { rows: [{ mIdx, payment, principal, interest, balance }],
     *            drawIdx, firstIdx, lastIdx, result }
     */
    buildSchedule(loan) {
        const params = {
            principal: loan.amount,
            annualRate: loan.rate,
            durationMonths: Math.max(1, Math.round(loan.durationMonths)),
            frequency: loan.frequency || 'monthly',
            deferralMonths: loan.deferralMonths || 0
        };
        let result;
        if (loan.amortType === 'infine') result = Financial.inFine(params);
        else if (loan.amortType === 'degressif') result = Financial.amortissableDegressif(params);
        else result = Financial.amortissableConstant(params);

        const ppy = Financial.getPeriodsPerYear(params.frequency);
        const step = 12 / ppy;
        const firstIdx = this.monthIndex(loan.startYear, loan.startMonth);
        const rows = (result.schedule || []).map((r, i) => ({
            mIdx: firstIdx + i * step,
            payment: r.payment,
            principal: r.principal || 0,
            interest: r.interest || 0,
            balance: r.balance
        }));
        const lastIdx = rows.length ? rows[rows.length - 1].mIdx : firstIdx;

        return { rows, drawIdx: firstIdx - 1, firstIdx, lastIdx, result };
    },

    /** CRD d'un échéancier à la fin du mois mIdx (0 si non tiré ou éteint) */
    crdAt(schedule, mIdx) {
        if (mIdx < schedule.drawIdx) return 0;
        let lastPassed = null;
        for (const r of schedule.rows) {
            if (r.mIdx <= mIdx) lastPassed = r;
            else break;
        }
        if (lastPassed === null) {
            // tiré mais aucune échéance passée : encours = montant initial
            return schedule.rows.length ? this._initialAmount(schedule) : 0;
        }
        return Math.max(0, lastPassed.balance);
    },

    _initialAmount(schedule) {
        // montant initial = capital restant avant toute échéance
        const first = schedule.rows[0];
        return first ? first.balance + first.principal : 0;
    },

    // ── Agrégation par exercice fiscal ──

    /**
     * loans : lignes de saisie { ...loan, label, isNew }
     * opts : { closingMonth, includeNew, analysisIdx }
     *
     * Retourne :
     *  - schedules : [{ loan, sched, crdAtAnalysis }]
     *  - years : [{ closingYear, label, endIdx, opening, drawdowns, principal,
     *               interest, service, closing, isPast, isCurrent }]
     *  - perLoanCapital : [{ label, isNew, data: [capital par exercice] }]
     */
    aggregate(loans, { closingMonth = 12, includeNew = true, analysisIdx }) {
        const active = (loans || [])
            .filter(l => l && l.amount > 0 && l.durationMonths >= 1 && l.rate >= 0)
            .filter(l => includeNew || !l.isNew);

        const schedules = active.map(loan => {
            const sched = this.buildSchedule(loan);
            return { loan, sched, crdAtAnalysis: this.crdAt(sched, analysisIdx) };
        });

        if (schedules.length === 0) {
            return { schedules: [], years: [], perLoanCapital: [] };
        }

        const minIdx = Math.min(...schedules.map(s => s.sched.drawIdx));
        const maxIdx = Math.max(...schedules.map(s => s.sched.lastIdx));
        const firstFY = this.fiscalYearOf(minIdx, closingMonth);
        const lastFY = this.fiscalYearOf(maxIdx, closingMonth);
        const currentFY = this.fiscalYearOf(analysisIdx, closingMonth);

        const years = [];
        const perLoanCapital = schedules.map(s => ({
            label: s.loan.label,
            isNew: !!s.loan.isNew,
            data: []
        }));

        let opening = 0;
        for (let fy = firstFY; fy <= lastFY; fy++) {
            const endIdx = this.fiscalYearEnd(fy, closingMonth);
            const startIdx = endIdx - 11;
            let drawdowns = 0, principal = 0, interest = 0;

            schedules.forEach((s, i) => {
                if (s.sched.drawIdx >= startIdx && s.sched.drawIdx <= endIdx) {
                    drawdowns += s.loan.amount;
                }
                let loanCapital = 0;
                for (const r of s.sched.rows) {
                    if (r.mIdx < startIdx) continue;
                    if (r.mIdx > endIdx) break;
                    loanCapital += r.principal;
                    interest += r.interest;
                }
                principal += loanCapital;
                perLoanCapital[i].data.push(loanCapital);
            });

            const closing = opening + drawdowns - principal;
            years.push({
                closingYear: fy,
                label: this.fiscalYearLabel(fy, closingMonth),
                endIdx,
                opening,
                drawdowns,
                principal,
                interest,
                service: principal + interest,
                closing: Math.max(0, closing),
                isPast: endIdx < analysisIdx,
                isCurrent: fy === currentFY
            });
            opening = Math.max(0, closing);
        }

        return { schedules, years, perLoanCapital };
    },

    // ── KPIs ──

    /**
     * Retourne { exposure, currentService, currentLabel, peak: {label, service},
     *            weightedRate, wal, amortized3yPct, newCount, newAmount }
     */
    kpis(agg, analysisIdx) {
        const { schedules, years } = agg;
        if (!schedules.length) return null;

        // Exposition : CRD total à la date d'analyse (les crédits non tirés comptent 0)
        const exposure = schedules.reduce((s, x) => s + x.crdAtAnalysis, 0);

        // Taux moyen pondéré par l'encours à date ; à défaut (aucun encours,
        // ex. scénario 100 % nouveaux financements) pondéré par le montant initial
        const withCrd = schedules.filter(s => s.crdAtAnalysis > 0);
        const base = withCrd.length ? withCrd : schedules;
        const weightKey = withCrd.length ? (s => s.crdAtAnalysis) : (s => s.loan.amount);
        const totalW = base.reduce((s, x) => s + weightKey(x), 0);
        const weightedRate = totalW > 0
            ? base.reduce((s, x) => s + weightKey(x) * x.loan.rate, 0) / totalW
            : 0;

        // WAL : durée de vie moyenne pondérée des flux de capital FUTURS (années)
        let walNum = 0, walDen = 0;
        for (const s of schedules) {
            for (const r of s.sched.rows) {
                if (r.mIdx <= analysisIdx || r.principal <= 0) continue;
                walNum += r.principal * (r.mIdx - analysisIdx) / 12;
                walDen += r.principal;
            }
        }
        const wal = walDen > 0 ? walNum / walDen : 0;

        // Capital amorti sur les 36 prochains mois / encours+tirages futurs
        let amortized3y = 0;
        for (const s of schedules) {
            for (const r of s.sched.rows) {
                if (r.mIdx > analysisIdx && r.mIdx <= analysisIdx + 36) amortized3y += r.principal;
            }
        }
        const futureBase = exposure + schedules
            .filter(s => s.sched.drawIdx > analysisIdx)
            .reduce((s, x) => s + x.loan.amount, 0);
        const amortized3yPct = futureBase > 0 ? amortized3y / futureBase * 100 : 0;

        // Service de l'exercice courant et pic futur
        const current = years.find(y => y.isCurrent) || null;
        const future = years.filter(y => !y.isPast);
        const peakYear = future.length
            ? future.reduce((a, b) => (b.service > a.service ? b : a))
            : null;

        const newLoans = schedules.filter(s => s.loan.isNew);

        return {
            exposure,
            currentService: current?.service ?? 0,
            currentLabel: current?.label ?? '—',
            peak: peakYear ? { label: peakYear.label, service: peakYear.service } : null,
            weightedRate,
            wal,
            amortized3yPct,
            newCount: newLoans.length,
            newAmount: newLoans.reduce((s, x) => s + x.loan.amount, 0)
        };
    },

    /** Écart CRD calculé vs constaté, en % du constaté (null si pas de contrôle) */
    crdGapPct(crdCalc, crdCheck) {
        if (crdCheck == null || !isFinite(crdCheck) || crdCheck <= 0) return null;
        return (crdCalc - crdCheck) / crdCheck * 100;
    }
};
