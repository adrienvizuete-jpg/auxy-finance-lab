/**
 * Tests du moteur de profil de dette daté (js/utils/debtengine.js)
 * Exécution : node --test tests/*.test.mjs
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DebtEngine as E } from '../js/utils/debtengine.js';
import { Financial } from '../js/utils/financial.js';

const approx = (actual, expected, tol = 0.01, msg = '') =>
    assert.ok(Math.abs(actual - expected) <= tol, `${msg} — attendu ≈ ${expected}, obtenu ${actual}`);

// Crédit de référence : 500 k€, 4,5 %, 84 mois, 1ère échéance juillet 2021
const LOAN = {
    label: 'Crédit équipement', amount: 500000, rate: 4.5, durationMonths: 84,
    startYear: 2021, startMonth: 7, amortType: 'constant', frequency: 'monthly'
};
const ANALYSIS = E.monthIndex(2026, 6); // analyse en juin 2026

describe('Dates mensuelles et exercices fiscaux', () => {
    test('monthIndex et libellés', () => {
        assert.equal(E.monthIndex(2026, 1), 2026 * 12);
        assert.equal(E.monthIndex(2026, 12) - E.monthIndex(2026, 1), 11);
        assert.equal(E.indexToLabel(E.monthIndex(2026, 6)), '06/2026');
    });

    test('exercice en année civile : décembre clôture', () => {
        assert.equal(E.fiscalYearOf(E.monthIndex(2026, 1), 12), 2026);
        assert.equal(E.fiscalYearOf(E.monthIndex(2026, 12), 12), 2026);
        assert.equal(E.fiscalYearLabel(2026, 12), '2026');
    });

    test('exercice décalé clôture juin : juillet bascule sur l\'exercice suivant', () => {
        assert.equal(E.fiscalYearOf(E.monthIndex(2026, 6), 6), 2026);
        assert.equal(E.fiscalYearOf(E.monthIndex(2026, 7), 6), 2027);
        assert.equal(E.fiscalYearEnd(2026, 6), E.monthIndex(2026, 6));
        assert.equal(E.fiscalYearLabel(2026, 6), '06/2026');
    });
});

describe('Échéancier daté', () => {
    test('84 échéances mensuelles datées depuis 07/2021, tirage en 06/2021', () => {
        const s = E.buildSchedule(LOAN);
        assert.equal(s.rows.length, 84);
        assert.equal(s.firstIdx, E.monthIndex(2021, 7));
        assert.equal(s.drawIdx, E.monthIndex(2021, 6));
        assert.equal(s.lastIdx, E.monthIndex(2028, 6)); // 07/2021 + 83 mois
    });

    test('fréquence trimestrielle : échéances espacées de 3 mois', () => {
        const s = E.buildSchedule({ ...LOAN, durationMonths: 24, frequency: 'quarterly' });
        assert.equal(s.rows.length, 8);
        assert.equal(s.rows[1].mIdx - s.rows[0].mIdx, 3);
    });
});

describe('CRD à date', () => {
    const s = E.buildSchedule(LOAN);

    test('avant tirage : 0 ; entre tirage et 1ère échéance : montant initial', () => {
        assert.equal(E.crdAt(s, E.monthIndex(2021, 5)), 0);
        assert.equal(E.crdAt(s, E.monthIndex(2021, 6)), 500000);
    });

    test('à l\'analyse : égal au CRD du tableau d\'amortissement Financial', () => {
        // 07/2021 → 06/2026 = 60 échéances passées
        const ref = Financial.amortissableConstant({
            principal: 500000, annualRate: 4.5, durationMonths: 84
        }).schedule[59].balance;
        approx(E.crdAt(s, ANALYSIS), ref, 0.01, 'CRD 60e échéance');
    });

    test('après maturité : 0', () => {
        assert.equal(E.crdAt(s, E.monthIndex(2030, 1)), 0);
    });
});

describe('Agrégation par exercice — variation de l\'endettement', () => {
    test('année civile : équation ouverture + tirages − amortissement = clôture', () => {
        const agg = E.aggregate([LOAN], { closingMonth: 12, includeNew: true, analysisIdx: ANALYSIS });
        assert.equal(agg.years[0].label, '2021');
        assert.equal(agg.years[0].drawdowns, 500000);
        for (const y of agg.years) {
            approx(y.closing, Math.max(0, y.opening + y.drawdowns - y.principal), 0.01, `équation ${y.label}`);
        }
        // somme des amortissements = montant initial ; dernier exercice soldé
        const totalPrincipal = agg.years.reduce((s, y) => s + y.principal, 0);
        approx(totalPrincipal, 500000, 0.05, 'capital total amorti');
        approx(agg.years[agg.years.length - 1].closing, 0, 0.05, 'clôture finale nulle');
    });

    test('clôture juin : le tirage de 06/2021 tombe dans l\'exercice 06/2021', () => {
        const agg = E.aggregate([LOAN], { closingMonth: 6, includeNew: true, analysisIdx: ANALYSIS });
        assert.equal(agg.years[0].label, '06/2021');
        assert.equal(agg.years[0].drawdowns, 500000);
        assert.equal(agg.years[0].principal, 0); // aucune échéance avant le 30/06/2021
        // l'exercice clos 06/2026 est l'exercice courant
        const current = agg.years.find(y => y.isCurrent);
        assert.equal(current.label, '06/2026');
    });

    test('flags isPast / isCurrent en année civile', () => {
        const agg = E.aggregate([LOAN], { closingMonth: 12, includeNew: true, analysisIdx: ANALYSIS });
        const y2025 = agg.years.find(y => y.label === '2025');
        const y2026 = agg.years.find(y => y.label === '2026');
        assert.equal(y2025.isPast, true);
        assert.equal(y2026.isCurrent, true);
        assert.equal(y2026.isPast, false);
    });

    test('toggle includeNew exclut les nouveaux financements', () => {
        const newLoan = { ...LOAN, label: 'Nouveau', startYear: 2027, startMonth: 1, isNew: true };
        const avec = E.aggregate([LOAN, newLoan], { closingMonth: 12, includeNew: true, analysisIdx: ANALYSIS });
        const sans = E.aggregate([LOAN, newLoan], { closingMonth: 12, includeNew: false, analysisIdx: ANALYSIS });
        assert.equal(avec.schedules.length, 2);
        assert.equal(sans.schedules.length, 1);
        // 1ère échéance 01/2027 → tirage rattaché à 12/2026 (convention drawIdx = firstIdx − 1)
        const draws2026 = avec.years.find(y => y.label === '2026');
        assert.equal(draws2026.drawdowns, 500000);
        const sans2026 = sans.years.find(y => y.label === '2026');
        assert.equal(sans2026?.drawdowns ?? 0, 0);
    });

    test('le tirage d\'un crédit démarrant en janvier est rattaché à décembre N-1 (année civile)', () => {
        const janLoan = { ...LOAN, startYear: 2027, startMonth: 1 };
        const agg = E.aggregate([janLoan], { closingMonth: 12, includeNew: true, analysisIdx: ANALYSIS });
        assert.equal(agg.years[0].label, '2026'); // tirage 12/2026
        assert.equal(agg.years[0].drawdowns, 500000);
    });
});

describe('KPIs', () => {
    test('exposition, TMP, pic et service courant', () => {
        const loan2 = {
            label: 'Immobilier', amount: 1000000, rate: 3.0, durationMonths: 180,
            startYear: 2020, startMonth: 1, amortType: 'constant', frequency: 'monthly'
        };
        const agg = E.aggregate([LOAN, loan2], { closingMonth: 12, includeNew: true, analysisIdx: ANALYSIS });
        const k = E.kpis(agg, ANALYSIS);

        const crd1 = agg.schedules[0].crdAtAnalysis;
        const crd2 = agg.schedules[1].crdAtAnalysis;
        approx(k.exposure, crd1 + crd2, 0.01, 'exposition');
        approx(k.weightedRate, (crd1 * 4.5 + crd2 * 3.0) / (crd1 + crd2), 1e-9, 'TMP');
        assert.equal(k.currentLabel, '2026');
        assert.ok(k.peak && k.peak.service > 0, 'pic défini');
        assert.ok(k.wal > 0 && k.wal < 15, 'WAL plausible');
    });

    test('WAL d\'un in fine = durée résiduelle exacte', () => {
        const bullet = {
            label: 'In fine', amount: 300000, rate: 5, durationMonths: 36,
            startYear: 2026, startMonth: 7, amortType: 'infine', frequency: 'monthly'
        };
        const agg = E.aggregate([bullet], { closingMonth: 12, includeNew: true, analysisIdx: ANALYSIS });
        const k = E.kpis(agg, ANALYSIS);
        // unique flux de capital à la 36e échéance : 07/2026 + 35 mois = 06/2029 → 36 mois → 3 ans
        approx(k.wal, 3.0, 1e-9, 'WAL bullet');
    });

    test('contrôle CRD : écart en % du constaté', () => {
        approx(E.crdGapPct(101000, 100000), 1.0, 1e-9);
        approx(E.crdGapPct(99000, 100000), -1.0, 1e-9);
        assert.equal(E.crdGapPct(100000, null), null);
        assert.equal(E.crdGapPct(100000, 0), null);
    });
});
