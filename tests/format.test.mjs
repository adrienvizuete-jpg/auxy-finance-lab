/**
 * Tests des formats d'affichage communs (js/utils/format.js)
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Fmt } from '../js/utils/format.js';

// Intl fr-FR : espace fine insécable (U+202F) pour les milliers
const norm = (/** @type {string} */ s) => s.replace(/[  ]/g, ' ');

describe('Fmt', () => {
    test('montants, pourcentages et multiples à la française', () => {
        assert.equal(norm(Fmt.amount(1234567, 'k€')), '1 234 567 k€');
        assert.equal(norm(Fmt.pct(12.5)), '12,5 %');
        assert.equal(Fmt.multiple(2.345), '2,35x');
        assert.equal(Fmt.pct(null), '—');
    });

    test('ordre de grandeur selon l\'unité de saisie', () => {
        assert.equal(norm(Fmt.compact(1250000, '€')), '1,25 M€');
        assert.equal(norm(Fmt.compact(12500, 'k€')), '12,5 M€');
        assert.equal(norm(Fmt.compact(850, 'k€')), '850 k€');
    });

    test('dette nette négative = trésorerie nette', () => {
        const n = Fmt.netDebt(-1820);
        assert.equal(n.label, 'Trésorerie nette');
        assert.equal(norm(n.value), '1 820 k€');
        assert.equal(Fmt.netDebt(500).label, 'Dette nette');
        assert.equal(norm(Fmt.netDebtCell(-1820)), 'tréso. 1 820');
    });
});
