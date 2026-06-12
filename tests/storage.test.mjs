/**
 * Tests Storage — migrations de schéma des données persistées.
 * localStorage est simulé (node n'en a pas) AVANT l'import du module.
 * Exécution : node --test tests/storage.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// Mock minimal de localStorage, installé avant l'import du module
const store = new Map();
globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: k => { store.delete(k); }
};

const { Storage, SCHEMA_VERSION } = await import('../js/utils/storage.js');

test('migrate : navigateur vierge → version courante posée', () => {
    store.clear();
    Storage.migrate();
    assert.equal(Storage.get('schema_version'), SCHEMA_VERSION);
});

test('migrate : idempotent (ré-exécution sans effet)', () => {
    store.clear();
    Storage.migrate();
    const snapshot = new Map(store);
    Storage.migrate();
    assert.deepEqual([...store.entries()].sort(), [...snapshot.entries()].sort());
});

test('migrate : version invalide ou corrompue → repart de v1 sans planter', () => {
    store.clear();
    store.set('auxy_schema_version', '"pas-un-nombre"');
    Storage.migrate();
    assert.equal(Storage.get('schema_version'), SCHEMA_VERSION);
});

test('migrate : ne touche pas aux données existantes (v1 → v2 neutre)', () => {
    store.clear();
    const history = [{ id: 'abc', type: 'credit', params: { principal: 250000 } }];
    Storage.set('history', history);
    Storage.migrate();
    assert.deepEqual(Storage.getHistory(), history);
});

test('migrate : une version future reste intacte (pas de rétrogradation)', () => {
    store.clear();
    Storage.set('schema_version', SCHEMA_VERSION + 5);
    Storage.migrate();
    assert.equal(Storage.get('schema_version'), SCHEMA_VERSION + 5);
});
