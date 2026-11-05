/**
 * Tests du comparatif de refinancement (js/utils/refiengine.js)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RefiEngine } from '../js/utils/refiengine.js';
import { DebtEngine } from '../js/utils/debtengine.js';

const near = (a, b, tol, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} ≠ ${b}`);

// Crédit existant : 1 M€ à 6 %, 120 mois, 1re échéance 01/2022 ; analyse 12/2026
const sched = DebtEngine.buildSchedule({ label: 'A', amount: 1e6, rate: 6, durationMonths: 120, startYear: 2022, startMonth: 1, amortType: 'constant', frequency: 'monthly' });
const analysisIdx = DebtEngine.monthIndex(2026, 12);
const crd = DebtEngine.crdAt(sched, analysisIdx);
const remainingMonths = sched.rows.filter(r => r.mIdx > analysisIdx).length;
const base = { loans: [{ label: 'A', rows: sched.rows, crd }], analysisIdx, discountRate: 5 };

test('taux plus bas, sans frais : économie = écart d\'intérêts, VAN positive', () => {
    const r = RefiEngine.compare({ ...base, newLoan: { principal: 0, durationMonths: remainingMonths, frequency: 'monthly', fixedRate: 4 } });
    near(r.principal, crd, 1e-6, 'nominal = CRD');
    assert.ok(r.grossSaving > 0 && r.npvSaving > 0);
    near(r.grossSaving, r.interestBefore - r.newLoan.totalInterest, 1e-6);
    assert.ok(r.paybackLabel, 'point mort atteint');
});

test('indemnités financées : nominal augmenté, économie réduite du coût de sortie', () => {
    const sans = RefiEngine.compare({ ...base, newLoan: { principal: 0, durationMonths: remainingMonths, frequency: 'monthly', fixedRate: 4 } });
    const avec = RefiEngine.compare({ ...base, loans: [{ ...base.loans[0], exitCostPct: 3 }], newLoan: { principal: 0, durationMonths: remainingMonths, frequency: 'monthly', fixedRate: 4 } });
    near(avec.exitCosts, crd * 0.03, 1e-6);
    near(avec.principal, crd * 1.03, 1e-6);
    assert.ok(avec.grossSaving < sans.grossSaving - crd * 0.03 + 1);
});

test('refinancement défavorable : taux plus haut → économie négative', () => {
    const r = RefiEngine.compare({ ...base, newLoan: { principal: 0, durationMonths: remainingMonths, frequency: 'monthly', fixedRate: 7.5, upfrontFeePct: 1 } });
    assert.ok(r.grossSaving < 0 && r.npvSaving < 0);
    assert.equal(r.paybackLabel, null);
});

test('frais d\'arrangement en % du nouveau nominal financés : nominal = besoin / (1 − frais)', () => {
    const r = RefiEngine.compare({ ...base, newLoan: { principal: 0, durationMonths: 60, frequency: 'quarterly', fixedRate: 4, upfrontFeePct: 1 } });
    near(r.principal, crd / 0.99, 1e-6);
    near(r.upfront, r.principal * 0.01, 1e-6);
});

test('allongement de durée plus coûteux au total : pas de point mort même si le service baisse au début', () => {
    const r = RefiEngine.compare({ ...base, newLoan: { principal: 0, durationMonths: 120, frequency: 'monthly', fixedRate: 5.5, upfrontFeePct: 1 } });
    assert.ok(r.years[1].saving > 0, 'service soulagé la 1re année pleine');
    assert.ok(r.grossSaving < 0);
    assert.equal(r.paybackLabel, null);
});
