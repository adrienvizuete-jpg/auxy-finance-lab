/**
 * Tests de la fusion locale/distante des simulations (js/utils/cloud.js)
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mergeSimulations, isValidSimulation } from '../js/utils/cloud.js';

const sim = (id, date, name = id) => ({ id, date, name });

describe('mergeSimulations', () => {
    test('union de deux ensembles disjoints, triée par date décroissante', () => {
        const local = [sim('a', '2026-06-01T10:00:00Z')];
        const remote = [sim('b', '2026-06-05T10:00:00Z'), sim('c', '2026-05-01T10:00:00Z')];
        const { merged, added } = mergeSimulations(local, remote);
        assert.equal(added, 2);
        assert.deepEqual(merged.map(s => s.id), ['b', 'a', 'c']);
    });

    test('doublon par id : la version la plus récente gagne', () => {
        const local = [sim('a', '2026-06-01T10:00:00Z', 'ancienne')];
        const remote = [sim('a', '2026-06-09T10:00:00Z', 'récente')];
        const { merged, added } = mergeSimulations(local, remote);
        assert.equal(added, 0); // pas une nouvelle entrée
        assert.equal(mergeSimulations(local, remote).updated, 1); // mise à jour à enregistrer
        assert.equal(merged.length, 1);
        assert.equal(merged[0].name, 'récente');
    });

    test('doublon par id : la version locale plus récente est conservée', () => {
        const local = [sim('a', '2026-06-09T10:00:00Z', 'locale-récente')];
        const remote = [sim('a', '2026-06-01T10:00:00Z', 'distante-ancienne')];
        const { merged } = mergeSimulations(local, remote);
        assert.equal(merged[0].name, 'locale-récente');
    });

    test('tolérant aux entrées invalides (sans id, null)', () => {
        const local = [sim('a', '2026-06-01T10:00:00Z'), null, { name: 'sans id' }];
        const remote = [undefined, { id: null }, sim('b', '2026-06-02T10:00:00Z')];
        const { merged, added } = mergeSimulations(local, remote);
        assert.equal(added, 1);
        assert.deepEqual(merged.map(s => s.id), ['b', 'a']);
    });

    test('listes vides ou absentes', () => {
        assert.deepEqual(mergeSimulations([], []), { merged: [], added: 0, updated: 0 });
        assert.equal(mergeSimulations(undefined, [sim('x', '2026-01-01')]).added, 1);
    });
});

describe('isValidSimulation (garde de schéma du pull cloud)', () => {
    const ok = { id: 'lq2x8f0abcde', type: 'credit', name: 'Prêt A', date: '2026-06-01T10:00:00.000Z', params: {} };

    test('accepte une simulation au format interne', () => {
        assert.equal(isValidSimulation(ok), true);
    });

    test('refuse un id piégé (injection HTML dans data-id)', () => {
        assert.equal(isValidSimulation({ ...ok, id: 'x"><img src=x onerror=alert(1)>' }), false);
    });

    test('refuse un type non alphabétique, une date illisible, des params non objet', () => {
        assert.equal(isValidSimulation({ ...ok, type: '<b>' }), false);
        assert.equal(isValidSimulation({ ...ok, date: 'demain' }), false);
        assert.equal(isValidSimulation({ ...ok, params: [1, 2] }), false);
    });

    test('refuse null, tableau, chaîne', () => {
        assert.equal(isValidSimulation(null), false);
        assert.equal(isValidSimulation([ok]), false);
        assert.equal(isValidSimulation('ok'), false);
    });
});
