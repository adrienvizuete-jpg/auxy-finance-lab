/**
 * Tests du moteur financier Auxy Finance Lab (js/utils/financial.js)
 * Exécution : node --test tests/   (aucune dépendance npm — node:test natif, Node ≥ 18)
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Financial } from '../js/utils/financial.js';

const approx = (actual, expected, tol = 0.01, msg = '') =>
    assert.ok(Math.abs(actual - expected) <= tol, `${msg} — attendu ≈ ${expected}, obtenu ${actual}`);

// ─────────────────────────────────────────────
describe('PMT / fonctions de base', () => {
    test('PMT 500 000 € à 4,5 % sur 84 mois = 6 950,08 €', () => {
        const pmt = Math.abs(Financial.pmt(0.045 / 12, 84, 500000));
        approx(pmt, 6950.08, 0.02, 'mensualité');
    });

    test('PMT à taux zéro = principal / périodes', () => {
        const pmt = Math.abs(Financial.pmt(0, 100, 500000));
        approx(pmt, 5000, 1e-9, 'taux 0');
    });

    test('PMT avec durée nulle ou négative retourne 0 (pas de division par zéro)', () => {
        assert.equal(Financial.pmt(0.004, 0, 500000), 0);
        assert.equal(Financial.pmt(0.004, -5, 500000), 0);
        assert.equal(Financial.pmt(0, 0, 500000), 0);
    });

    test('NPV de flux constants', () => {
        // 3 flux de 100 actualisés à 10 % : 100/1,1 + 100/1,21 + 100/1,331
        approx(Financial.npv(0.10, [100, 100, 100]), 248.685, 0.01, 'NPV');
    });

    test('IRR retrouve le taux périodique d\'une annuité', () => {
        const rate = 0.045 / 12;
        const pmt = Math.abs(Financial.pmt(rate, 84, 500000));
        const flows = [-500000, ...Array(84).fill(pmt)];
        approx(Financial.irr(flows), rate, 1e-7, 'IRR');
    });
});

// ─────────────────────────────────────────────
describe('Amortissable constant', () => {
    const base = { principal: 500000, annualRate: 4.5, durationMonths: 84 };

    test('le CRD final est nul et la somme du capital = principal', () => {
        const r = Financial.amortissableConstant(base);
        assert.equal(r.schedule.length, 84);
        approx(r.schedule[83].balance, 0, 0.01, 'CRD final');
        const sumPrincipal = r.schedule.reduce((s, row) => s + row.principal, 0);
        approx(sumPrincipal, 500000, 0.05, 'somme capital');
    });

    test('TAEG sans frais ≈ taux nominal annualisé (4,594 %)', () => {
        const r = Financial.amortissableConstant(base);
        approx(r.taeg, (Math.pow(1 + 0.045 / 12, 12) - 1) * 100, 0.005, 'TAEG');
    });

    test('le TAEG augmente avec les frais de dossier (convention montant net)', () => {
        const sans = Financial.amortissableConstant(base);
        const avec = Financial.amortissableConstant({ ...base, fees: 5000 });
        assert.ok(avec.taeg > sans.taeg, `TAEG avec frais (${avec.taeg}) > sans frais (${sans.taeg})`);
        // coût total intègre les frais
        approx(avec.totalCost - sans.totalCost, 5000, 0.01, 'frais dans le coût total');
    });

    test('paramètres invalides → résultat vide propre (pas de NaN/Infinity)', () => {
        const r = Financial.amortissableConstant({ principal: 500000, annualRate: 4.5, durationMonths: 0 });
        assert.equal(r.invalid, true);
        assert.equal(r.schedule.length, 0);
        assert.equal(r.taeg, null);
        assert.ok(isFinite(r.totalCost));
    });

    test('fréquence trimestrielle : 4 échéances/an, totaux cohérents', () => {
        const r = Financial.amortissableConstant({ ...base, durationMonths: 24, frequency: 'quarterly' });
        assert.equal(r.schedule.length, 8);
        approx(r.schedule[7].balance, 0, 0.01, 'CRD final trimestriel');
    });

    test('différé partiel : intérêts seuls pendant le différé', () => {
        const r = Financial.amortissableConstant({ ...base, deferralMonths: 12 });
        const d = r.schedule[0];
        assert.equal(d.principal, 0);
        approx(d.interest, 500000 * 0.045 / 12, 0.01, 'intérêts différé');
        approx(r.schedule[83].balance, 0, 0.01, 'CRD final avec différé');
    });

    test('assurance sur CRD décroît, assurance sur CI constante', () => {
        const ci = Financial.amortissableConstant({ ...base, insuranceRate: 0.3, insuranceMode: 'ci' });
        const crd = Financial.amortissableConstant({ ...base, insuranceRate: 0.3, insuranceMode: 'crd' });
        assert.equal(ci.schedule[0].insurance.toFixed(6), ci.schedule[40].insurance.toFixed(6));
        assert.ok(crd.schedule[40].insurance < crd.schedule[0].insurance);
        assert.ok(crd.totalInsurance < ci.totalInsurance);
    });
});

// ─────────────────────────────────────────────
describe('Amortissable dégressif', () => {
    test('capital constant, échéances décroissantes', () => {
        const r = Financial.amortissableDegressif({ principal: 600000, annualRate: 4, durationMonths: 60 });
        approx(r.schedule[0].principal, 10000, 0.01, 'capital constant');
        approx(r.schedule[59].principal, 10000, 0.01, 'capital constant fin');
        assert.ok(r.firstPayment > r.lastPayment, 'échéances décroissantes');
        approx(r.schedule[59].balance, 0, 0.01, 'CRD final');
    });
});

// ─────────────────────────────────────────────
describe('In fine', () => {
    test('intérêts constants, capital remboursé à maturité', () => {
        const r = Financial.inFine({ principal: 1000000, annualRate: 5, durationMonths: 36 });
        const monthlyInterest = 1000000 * 0.05 / 12;
        approx(r.schedule[0].payment, monthlyInterest, 0.01, '1ère échéance');
        approx(r.schedule[35].payment, monthlyInterest + 1000000, 0.01, 'échéance finale');
        approx(r.totalInterest, monthlyInterest * 36, 0.05, 'total intérêts');
        assert.equal(r.schedule[35].balance, 0);
    });
});

// ─────────────────────────────────────────────
describe('Crédit-bail / Prêt relais / Mezzanine', () => {
    test('crédit-bail : loyer cohérent avec valeur résiduelle', () => {
        const r = Financial.creditBail({ assetValue: 500000, deposit: 50000, annualRate: 5, durationMonths: 60, residualValue: 25000 });
        assert.equal(r.financedAmount, 450000);
        const sumPrincipal = r.schedule.reduce((s, row) => s + row.principal, 0);
        approx(sumPrincipal + 25000, 450000, 1, 'capital amorti + résiduel = financé');
    });

    test('prêt relais capitalisé : solde final > montant initial', () => {
        const r = Financial.pretRelais({ bridgeAmount: 300000, annualRate: 5, durationMonths: 18, expectedSalePrice: 450000, capitalizedInterest: true });
        assert.ok(r.finalBalance > 300000);
        approx(r.netProceeds, 450000 - r.finalBalance, 0.01, 'produit net');
    });

    test('mezzanine : PIK capitalisé fait croître le remboursement final', () => {
        const r = Financial.detteMezzanine({ principal: 2000000, cashRate: 8, pikRate: 4, durationMonths: 60, equityKicker: 5 });
        assert.ok(r.finalRepayment > 2000000, 'PIK capitalisé');
        approx(r.equityKickerValue, 100000, 0.01, 'kicker 5 %');
    });
});

// ─────────────────────────────────────────────
describe('Tranching consolidé', () => {
    test('fréquences identiques : le consolidé égale la somme des tranches', () => {
        const tranches = [
            { name: 'A', amount: 3000000, rate: 3.5, duration: 84, type: 'constant', frequency: 'monthly' },
            { name: 'B', amount: 2000000, rate: 4.5, duration: 60, type: 'constant', frequency: 'monthly' }
        ];
        const r = Financial.tranching(tranches);
        assert.equal(r.consolidated.totalDebt, 5000000);
        approx(r.consolidated.weightedRate, (3000000 * 3.5 + 2000000 * 4.5) / 5000000, 1e-9, 'taux pondéré');

        // mois 1 : paiement consolidé = somme des paiements des 2 tranches
        const p1 = Math.abs(Financial.pmt(0.035 / 12, 84, 3000000));
        const p2 = Math.abs(Financial.pmt(0.045 / 12, 60, 2000000));
        approx(r.consolidated.schedule[0].payment, p1 + p2, 0.05, 'paiement mois 1');

        // après 60 mois, seule la tranche A reste
        approx(r.consolidated.schedule[60].payment, p1, 0.05, 'paiement mois 61');

        // total intérêts = somme des tranches
        const sumInterest = r.tranches.reduce((s, tr) => s + tr.result.totalInterest, 0);
        approx(r.consolidated.totalInterest, sumInterest, 0.01, 'intérêts consolidés');
    });
});

// ─────────────────────────────────────────────
describe('Remboursement anticipé (IRA)', () => {
    test('IRA = max(3 % CRD ; 6 mois d\'intérêts sur le montant remboursé)', () => {
        const sim = Financial.amortissableConstant({ principal: 500000, annualRate: 4.5, durationMonths: 84 });
        const a = Financial.prepaymentAnalysis({
            schedule: sim.schedule, principal: 500000, annualRate: 4.5,
            prepaymentPeriod: 24, prepaymentAmount: 100000, strategy: 'reduceDuration'
        });
        const crd24 = sim.schedule[23].balance;
        approx(a.ira3pct, crd24 * 0.03, 0.01, '3 % CRD');
        approx(a.ira6mois, 100000 * (0.045 / 12) * 6, 0.01, '6 mois intérêts');
        approx(a.ira, Math.max(a.ira3pct, a.ira6mois), 1e-9, 'max des deux');
        assert.ok(a.comparison.savings.interest > 0, 'RA réduit les intérêts');
        assert.ok(a.comparison.after.duration < a.comparison.before.duration, 'durée réduite');
    });
});

// ─────────────────────────────────────────────
describe('Ratios bancaires', () => {
    test('DSCR, LTV, ICR, WACC', () => {
        approx(Financial.dscr(1200, 1000), 1.2, 1e-9, 'DSCR');
        approx(Financial.ltv(1400000, 2000000), 70, 1e-9, 'LTV');
        approx(Financial.icr(500, 100), 5, 1e-9, 'ICR');
        // WACC : 60 % dette à 5 % (IS 25 %) + 40 % equity à 12 % = 2,25 + 4,8 = 7,05
        approx(Financial.wacc({ debtAmount: 600, equityAmount: 400, costOfDebt: 5, costOfEquity: 12, taxRate: 25 }), 7.05, 1e-9, 'WACC');
    });
});

// ─────────────────────────────────────────────
describe('Analyse de sensibilité', () => {
    test('grille correcte, cases invalides à null', () => {
        const grid = Financial.sensitivityAnalysis({
            principal: 500000, baseRate: 4.5, baseDuration: 84,
            rateRange: [-5, 0, 0.5], durationRange: [-12, 0, 12]
        });
        assert.equal(grid.length, 3);
        assert.equal(grid[0][0], null, 'taux ≤ 0 → null');
        approx(grid[1][1].monthlyPayment, 6950.08, 0.02, 'case centrale = base');
        assert.ok(grid[2][1].monthlyPayment > grid[1][1].monthlyPayment, 'taux + → mensualité +');
        assert.ok(grid[1][2].monthlyPayment < grid[1][1].monthlyPayment, 'durée + → mensualité -');
    });
});
