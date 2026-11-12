/**
 * Tests du moteur de covenants (js/utils/covenantengine.js)
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CovenantEngine } from '../js/utils/covenantengine.js';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);

const base = {
    years: 3,
    ebitda: [1000, 1000, 1000],
    debts: [{ label: 'A', amount: 3000, rate: 0, durationYears: 3, amortType: 'degressif', frequency: 'annual' }],
    covenantDscr: 1.2,
    covenantLeverage: 3.5
};

describe('CovenantEngine.project', () => {
    test('DSCR sur CFADS = (EBITDA − IS − capex − ΔBFR) / service', () => {
        const r = CovenantEngine.project({ ...base, tax: [100, 100, 100], capex: [150, 150, 150], wcChange: [50, 50, 50] });
        // service = 1000 de capital par an (taux 0) ; CFADS = 700
        near(r.rows[0].cfads, 700);
        near(r.rows[0].dscr, 0.7);
        assert.equal(r.rows[0].status, 'breach');
    });

    test('base EBITDA conservée en option (approche simplifiée)', () => {
        const r = CovenantEngine.project({ ...base, tax: [100, 100, 100], dscrBasis: 'ebitda' });
        near(r.rows[0].dscr, 1.0);
    });

    test('marge DSCR = baisse de CFADS supportable = 1 − covenant / DSCR', () => {
        const r = CovenantEngine.project({ ...base, ebitda: [1500, 1500, 1500] });
        near(r.rows[0].dscr, 1.5);
        near(r.rows[0].headroomDscr, 20);
        // CFADS −20 % → DSCR = 1,2 exactement
        near(1500 * 0.8 / r.rows[0].service, 1.2);
    });

    test('levier net : la trésorerie générée réduit la dette nette', () => {
        const r = CovenantEngine.project({ ...base, ebitda: [1500, 1500, 1500], openingCash: 200 });
        // fin A1 : CRD 2000, tréso 200 + 1500 − 1000 = 700 → dette nette 1300
        near(r.rows[0].cash, 700);
        near(r.rows[0].netDebt, 1300);
        near(r.rows[0].leverage, 1300 / 1500);
    });

    test('in fine refinancé : hors DSCR mais conservé dans la dette', () => {
        const infine = { label: 'B', amount: 2000, rate: 5, durationYears: 2, amortType: 'infine', frequency: 'annual' };
        const r = CovenantEngine.project({ ...base, years: 2, debts: [infine] });
        near(r.rows[1].bullet, 2000);
        near(r.rows[1].service, 100); // intérêts seuls
        near(r.rows[1].crd, 2000);     // la dette refinancée reste
        const r2 = CovenantEngine.project({ ...base, years: 2, debts: [infine], excludeBullet: false });
        near(r2.rows[1].service, 2100);
        assert.equal(r2.rows[1].status, 'breach');
    });

    test('durée en années décimales (30 mois) non arrondie', () => {
        const p = CovenantEngine.debtAnnualProfile({ label: 'C', amount: 1200, rate: 0, durationYears: 2.5, amortType: 'degressif', frequency: 'monthly' }, 3);
        near(p[0].principal, 480);
        near(p[2].principal, 240);
        near(p[2].crd, 0);
    });

    test('EBITDA nul avec dette : bris, pas de levier « 0x »', () => {
        const r = CovenantEngine.project({ ...base, ebitda: [0, 0, 0] });
        assert.equal(r.rows[0].leverage, null);
        assert.equal(r.rows[0].status, 'breach');
    });
});

describe('Covenants — taux variable et stress inversé', () => {
    const floating = { label: 'Senior', amount: 3000, rate: 2, durationYears: 3, amortType: 'degressif', frequency: 'annual', rateType: 'floating' };
    const input = { years: 3, ebitda: [1500, 1500, 1500], debts: [floating], covenantDscr: 1.2, covenantLeverage: 3.5, market: { indexPath: [3] } };

    test('intérêts = (index + marge) × CRD', () => {
        const r = CovenantEngine.project(input);
        near(r.rows[0].interest, 3000 * 0.05, 1e-6);
    });

    test('swap à 100 % : intérêts figés au taux swap + marge', () => {
        const hedged = { ...input, debts: [{ ...floating, hedgePct: 100 }], market: { indexPath: [6], swapRate: 2.5 } };
        near(CovenantEngine.project(hedged).rows[0].interest, 3000 * 0.045, 1e-6);
    });

    test('baisse d\'EBITDA supportable cohérente avec le DSCR', () => {
        const drop = /** @type {number} */ (CovenantEngine.breakevenEbitdaDrop(input));
        const at = CovenantEngine.project({ ...input, ebitdaShock: -drop + 0.01 });
        assert.ok(!at.rows.some(r => r.status === 'breach'), 'juste avant : conforme');
        const past = CovenantEngine.project({ ...input, ebitdaShock: -drop - 0.01 });
        assert.ok(past.rows.some(r => r.status === 'breach'), 'juste après : bris');
    });

    test('hausse de taux supportable : null si toute la dette est couverte', () => {
        assert.equal(CovenantEngine.breakevenIndexRise({ ...input, debts: [{ ...floating, hedgePct: 100 }] }), null);
        assert.ok(/** @type {number} */ (CovenantEngine.breakevenIndexRise(input)) > 0);
    });
});

describe('Covenants LBO — cash sweep, grille de marge, equity cure, dimensionnement', () => {
    const senior = { label: 'Senior', amount: 5000, rate: 5, durationYears: 5, amortType: 'degressif', frequency: 'annual' };
    const input = { years: 5, ebitda: [2000, 2000, 2000, 2000, 2000], debts: [senior], covenantDscr: 1.2, covenantLeverage: 3.5 };

    test('sweep 50 % : moitié de l\'excess cash-flow remboursée, CRD et intérêts réduits', () => {
        const base = CovenantEngine.project(input);
        const sw = CovenantEngine.project({ ...input, cashSweep: { pct: 50 } });
        const ecf1 = base.rows[0].cfads - base.rows[0].service;
        near(sw.rows[0].sweep, ecf1 * 0.5, 1e-6);
        near(sw.rows[0].crd, base.rows[0].crd - ecf1 * 0.5, 1e-6);
        assert.ok(sw.rows[1].interest < base.rows[1].interest, 'économie d\'intérêts l\'année suivante');
        near(sw.rows[1].sweepSaving, ecf1 * 0.5 * 0.05, 1e-6);
    });

    test('grille de sweep selon le levier : 0 % sous 1,5x', () => {
        const r = CovenantEngine.project({ ...input, cashSweep: { grid: [{ maxLeverage: 1.5, pct: 0 }, { maxLeverage: 99, pct: 75 }] } });
        // année 1 : palier fixé par le levier d'entrée (5000 / 2000 = 2,5x > 1,5x) → 75 %
        const ecf1 = r.rows[0].cfads - r.rows[0].service;
        near(r.rows[0].sweep, ecf1 * 0.75, 1e-6);
        const low = CovenantEngine.project({ ...input, debts: [{ ...senior, amount: 2000 }], cashSweep: { grid: [{ maxLeverage: 1.5, pct: 0 }, { maxLeverage: 99, pct: 75 }] } });
        assert.equal(low.rows[0].sweep, 0, 'levier d\'entrée 1x ≤ 1,5x : pas de sweep');
    });

    test('equity cure : apport qui ramène le DSCR au covenant', () => {
        const r = CovenantEngine.project({ ...input, ebitda: [1000, 1000, 1000, 1000, 1000] });
        const row = r.rows[0];
        assert.equal(row.status, 'breach');
        near(row.equityCure, Math.max(1.2 * row.service - row.cfads, row.netDebt - 3.5 * row.ebitda), 1e-6);
    });

    test('dimensionnement inverse : contrainte de levier ou de DSCR', () => {
        const tranches = [{ ...senior, amount: 0, share: 100 }];
        const r = CovenantEngine.maxDebt({ ...input, tranches, entryEbitda: 2000 });
        near(r.byLeverage, 7000, 1e-9);
        // à la dette trouvée, le DSCR minimum vaut le covenant (à la précision près)
        const at = CovenantEngine.project({ ...input, debts: [{ ...senior, amount: r.byDscr }], covenantLeverage: Infinity });
        near(Math.min(...at.rows.map(x => x.dscr)), 1.2, 1e-4);
        assert.equal(r.max, Math.min(r.byLeverage, r.byDscr));
    });
});

describe('Covenants — in fine refinancé', () => {
    test('la dette refinancée continue de porter intérêt après l\'échéance', () => {
        const infine = { label: 'B', amount: 2000, rate: 5, durationYears: 3, amortType: 'infine', frequency: 'annual' };
        const r = CovenantEngine.project({ years: 6, ebitda: Array(6).fill(1000), debts: [infine], covenantDscr: 1.2, covenantLeverage: 3.5 });
        near(r.rows[4].interest, 100, 1e-6);
        assert.ok(r.rows[4].dscr != null);
    });
});

describe('Covenants — différé d\'amortissement', () => {
    test('prêt Bpifrance 7 ans dont 2 de différé : intérêts seuls 2 ans, puis amortissement', () => {
        const d = { label: 'Bpifrance', amount: 1000, rate: 4, durationYears: 7, amortType: 'constant', frequency: 'quarterly', deferralMonths: 24 };
        const p = CovenantEngine.debtAnnualProfile(d, 7);
        near(p[0].principal, 0);
        near(p[0].service, 40, 1e-6);
        near(p[1].crd, 1000, 1e-6);
        assert.ok(p[2].principal > 150, 'amortissement à partir de l\'année 3');
        near(p[6].crd, 0, 1e-6);
        // sans différé, le service de l'année 1 serait bien plus lourd : le DSCR ne doit plus l'ignorer
        const flat = CovenantEngine.debtAnnualProfile({ ...d, deferralMonths: 0 }, 7);
        assert.ok(flat[0].service > 4 * p[0].service);
    });

    test('différé sur une dette à taux variable (moteur générique)', () => {
        const d = { label: 'V', amount: 1000, rate: 2, durationYears: 5, amortType: 'degressif', frequency: 'annual', rateType: 'floating', deferralMonths: 12 };
        const p = CovenantEngine.debtAnnualProfile(d, 5, { indexPath: [2] });
        near(p[0].principal, 0);
        near(p[1].principal, 250, 1e-6);
    });
});
