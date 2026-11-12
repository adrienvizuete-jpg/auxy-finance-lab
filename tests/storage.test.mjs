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

test('getHistory : historique corrompu toléré (non-tableau, entrées nulles)', () => {
    store.clear();
    Storage.set('history', { pas: 'un tableau' });
    assert.deepEqual(Storage.getHistory(), []);
    Storage.set('history', [null, { id: 'abc123def' }, 'texte', { name: 'sans id' }]);
    assert.deepEqual(Storage.getHistory().map(s => s.id), ['abc123def']);
});

test('suppression locale : tombe enregistrée pour propagation au cloud', () => {
    store.clear();
    Storage.set('history', [{ id: 'aaa111bbb' }, { id: 'ccc222ddd' }]);
    Storage.deleteSimulation('aaa111bbb');
    assert.deepEqual(Storage.getTombstones().map(t => t.id), ['aaa111bbb']);
    Storage.clearHistory();
    assert.deepEqual(Storage.getTombstones().map(t => t.id).sort(), ['aaa111bbb', 'ccc222ddd']);
    Storage.clearTombstones(['aaa111bbb']);
    assert.deepEqual(Storage.getTombstones().map(t => t.id), ['ccc222ddd']);
});

// ── Historique allégé ──
test('slimResults retire l\'échéancier et les grands tableaux, garde la synthèse', async () => {
    const { slimResults } = await import('../js/utils/storage.js');
    const { Financial } = await import('../js/utils/financial.js');
    const full = Financial.amortissableConstant({ principal: 500000, annualRate: 4.5, durationMonths: 240 });
    const slim = slimResults({ ...full, loans: { a: { schedule: full.schedule, totalInterest: 1 } }, rows: full.schedule, years: [1, 2, 3] });
    assert.equal(slim.schedule, undefined);
    assert.equal(slim.rows, undefined);
    assert.equal(slim.loans.a.schedule, undefined);
    assert.equal(slim.loans.a.totalInterest, 1);
    assert.deepEqual(slim.years, [1, 2, 3]);
    assert.equal(slim.totalInterest, full.totalInterest);
    assert.ok(JSON.stringify(slim).length < 1500, `${JSON.stringify(slim).length} octets`);
});

test('l\'échéancier se recalcule à l\'identique depuis les paramètres', async () => {
    const { recomputeSchedule } = await import('../js/utils/creditcompute.js');
    const { Financial } = await import('../js/utils/financial.js');
    const p = { principal: 500000, annualRate: 4.5, durationMonths: 84, frequency: 'quarterly', deferralMonths: 12 };
    assert.deepEqual(recomputeSchedule('constant', p), Financial.amortissableConstant(p).schedule);
    const bpi = { principal: 1000000, annualRate: 4, durationMonths: 84, deferralMonths: 24, frequency: 'quarterly', amortProfile: 'constant', retenuePct: 5, cofinancement: true, bankAmount: 500000, bankRate: 4.5, bankDurationMonths: 84, bankDeferralMonths: 0, bankProfile: 'constant' };
    assert.equal(recomputeSchedule('bpi', bpi)?.length, 28);
    assert.equal(recomputeSchedule('covenants', {}), null);
});
