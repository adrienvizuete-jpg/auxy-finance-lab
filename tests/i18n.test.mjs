/**
 * Tests du formatage des valeurs (js/utils/i18n.js) — unités explicites
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatValue, excelValue, unitOf } from '../js/utils/i18n.js';

const clean = s => s.replace(/\s/g, ' ');

test('unités explicites : kicker en %, montant du kicker en €, DSCR en x', () => {
    assert.equal(clean(formatValue('equityKicker', 5)), '5,00 %');
    assert.ok(clean(formatValue('equityKickerValue', 100000)).endsWith('€'));
    assert.equal(formatValue('dscrMin', 1.52), '1,52x');
    assert.equal(clean(formatValue('commitmentFee', 0.5)), '0,50 %');
    assert.equal(formatValue('deferralMonths', 12), '12 mois');
});

test('tableaux et énumérations lisibles (plus de [object Object] ni d\'anglais)', () => {
    assert.equal(formatValue('tranches', [{ a: 1 }, { a: 2 }]), '2 lignes');
    assert.equal(formatValue('frequency', 'monthly'), 'Mensuelle');
    assert.equal(formatValue('deferralType', 'partial'), 'Partiel (intérêts payés)');
    assert.equal(formatValue('dscrMin', null), '—');
});

test('export Excel : nombres conservés, unité séparée', () => {
    assert.equal(excelValue('annualRate', 4.5), 4.5);
    assert.equal(unitOf('annualRate', 4.5), '%');
    assert.equal(unitOf('ebitda', 3750), 'k€');
    assert.equal(unitOf('principal', 1e6), '€');
});
