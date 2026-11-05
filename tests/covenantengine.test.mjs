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
