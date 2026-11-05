/**
 * Tests du moteur de prêt générique (js/utils/loanengine.js)
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { LoanEngine } from '../js/utils/loanengine.js';
import { Financial } from '../js/utils/financial.js';

const near = (a, b, tol = 1e-6, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} ≠ ${b}`);

describe('LoanEngine — taux fixe', () => {
    test('30/360 échéances constantes = moteur historique', () => {
        const a = LoanEngine.build({ principal: 1e6, durationMonths: 84, frequency: 'quarterly', fixedRate: 4.5 });
        const b = Financial.amortissableConstant({ principal: 1e6, annualRate: 4.5, durationMonths: 84, frequency: 'quarterly' });
        near(a.rows[0].payment, b.schedule[0].payment, 1e-6, 'échéance');
        near(a.totalInterest, b.totalInterest, 1e-4, 'intérêts');
        near(/** @type {number} */ (a.teg), 4.5, 1e-6, 'TEG sans frais = taux nominal');
    });
});

describe('LoanEngine — taux variable', () => {
    const base = { principal: 10e6, durationMonths: 60, frequency: 'quarterly', amortType: 'infine', rateType: 'floating', margin: 2, indexPath: [3], startDate: '2026-01-01' };

    test('Exact/360 sur dates réelles : 1er trimestre = 90 jours', () => {
        const r = LoanEngine.build(base);
        assert.equal(r.rows[0].date, '2026-04-01');
        near(r.rows[0].interest, 10e6 * 0.05 * 90 / 360, 1e-6);
        // sur une année pleine, Exact/360 coûte 365/360 du 30/360
        const year1 = r.rows.slice(0, 4).reduce((s, x) => s + x.interest, 0);
        near(year1, 10e6 * 0.05 * 365 / 360, 1e-6);
    });

    test('floor à 0 % : un index négatif ne réduit pas la marge', () => {
        const r = LoanEngine.build({ ...base, indexPath: [-0.5] });
        near(r.rows[0].rate, 2, 1e-12);
        const sansFloor = LoanEngine.build({ ...base, indexPath: [-0.5], floor: null });
        near(sansFloor.rows[0].rate, 1.5, 1e-12);
    });

    test('trajectoire d\'index par année, dernière valeur prolongée', () => {
        const r = LoanEngine.build({ ...base, indexPath: [3, 2.5] });
        near(r.rows[0].indexRate, 3, 1e-12);
        near(r.rows[4].indexRate, 2.5, 1e-12);
        near(r.rows[19].indexRate, 2.5, 1e-12);
    });

    test('swap à 100 % : coût = (taux swap + marge) quel que soit l\'index', () => {
        const r = LoanEngine.build({ ...base, indexPath: [3, 5, 1], hedge: { type: 'swap', pct: 100, swapRate: 2.8 } });
        r.rows.slice(0, 12).forEach(row => {
            const yf = row.interest / (10e6 * row.rate / 100);
            near(row.interest + row.hedgeFlow, 10e6 * (2.8 + 2) / 100 * yf, 1e-6, `période ${row.period}`);
        });
    });

    test('cap : remboursement au-delà du strike, prime à la mise en place', () => {
        const r = LoanEngine.build({ ...base, indexPath: [4], hedge: { type: 'cap', pct: 50, capStrike: 3, capPremiumPct: 1 } });
        near(r.hedgePremium, 10e6 * 0.5 * 0.01, 1e-6);
        assert.ok(r.rows[0].hedgeFlow < 0, 'le cap paie quand l\'index dépasse le strike');
        near(r.rows[0].hedgeFlow, -5e6 * 0.01 * 90 / 360, 1e-6);
    });
});

describe('LoanEngine — profils d\'amortissement', () => {
    test('profil Senior A libre 10/15/20/25/30', () => {
        const r = LoanEngine.build({ principal: 1000, durationMonths: 60, frequency: 'annual', amortType: 'custom', customProfile: [10, 15, 20, 25, 30], fixedRate: 4 });
        assert.deepEqual(r.rows.map(x => Math.round(x.principal)), [100, 150, 200, 250, 300]);
        near(r.rows[4].balance, 0, 1e-9);
    });

    test('ballon 30 % : 70 % amortis, 30 % payés à l\'échéance', () => {
        const r = LoanEngine.build({ principal: 1000, durationMonths: 60, frequency: 'annual', amortType: 'balloon', balloonPct: 30, fixedRate: 0 });
        near(r.rows[3].balance, 440, 1e-6);
        near(r.rows[4].principal, 440, 1e-6); // dernière annuité 140 + ballon 300
    });

    test('différé d\'amortissement : intérêts seuls pendant le différé', () => {
        const r = LoanEngine.build({ principal: 1000, durationMonths: 60, frequency: 'annual', amortType: 'degressif', deferralMonths: 12, fixedRate: 5 });
        near(r.rows[0].principal, 0);
        near(r.rows[1].principal, 250);
    });

    test('frais d\'arrangement intégrés au TEG', () => {
        const sans = LoanEngine.build({ principal: 1e6, durationMonths: 60, frequency: 'quarterly', fixedRate: 4 });
        const avec = LoanEngine.build({ principal: 1e6, durationMonths: 60, frequency: 'quarterly', fixedRate: 4, upfrontFeePct: 1.5 });
        assert.ok(/** @type {number} */ (avec.teg) > /** @type {number} */ (sans.teg) + 0.5);
    });
});

describe('LoanEngine.annualProfile', () => {
    test('agrégat annuel cohérent avec l\'échéancier', () => {
        const loan = { principal: 1000, durationMonths: 36, frequency: 'monthly', amortType: 'degressif', fixedRate: 0 };
        const p = LoanEngine.annualProfile(loan, 4);
        p.slice(0, 3).forEach(y => near(y.principal, 1000 / 3, 1e-6));
        near(p[2].crd, 0, 1e-9);
        assert.equal(p[3].service, 0);
    });
});

describe('LoanEngine — profil incomplet et durée arrondie', () => {
    test('profil 10/20 sur 5 ans : le solde tombe à l\'échéance (pas de renormalisation)', () => {
        const r = LoanEngine.build({ principal: 1000, durationMonths: 60, frequency: 'annual', amortType: 'custom', customProfile: [10, 20], fixedRate: 0 });
        assert.deepEqual(r.rows.map(x => Math.round(x.principal)), [100, 200, 0, 0, 700]);
    });
    test('durée non multiple signalée', () => {
        assert.equal(LoanEngine.build({ principal: 1000, durationMonths: 18, frequency: 'annual', fixedRate: 1 }).effectiveDurationMonths, 24);
    });
});
