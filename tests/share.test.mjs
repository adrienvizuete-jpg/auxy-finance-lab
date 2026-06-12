/**
 * Tests Share — encodage base64url des payloads de partage + versionnage.
 * Exécution : node --test tests/share.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { Share } from '../js/utils/share.js';
import { SCHEMA_VERSION } from '../js/utils/storage.js';

test('encode/decode : aller-retour fidèle', () => {
    const params = { type: 'constant', principal: 500000, annualRate: 3.2, libellé: 'éàü€' };
    const decoded = Share.decode(Share.encode(params));
    assert.equal(decoded.type, 'constant');
    assert.equal(decoded.principal, 500000);
    assert.equal(decoded.annualRate, 3.2);
    assert.equal(decoded.libellé, 'éàü€', 'UTF-8 préservé');
});

test('encode : embarque la version du schéma (_v)', () => {
    const decoded = Share.decode(Share.encode({ a: 1 }));
    assert.equal(decoded._v, SCHEMA_VERSION);
});

test('encode : le payload est URL-safe (base64url strict)', () => {
    const payload = Share.encode({ s: 'données avec accents ±©', n: [1, 2, 3] });
    assert.match(payload, /^[A-Za-z0-9_-]+$/, 'aucun caractère à échapper dans une URL');
});

test('decode : payload corrompu → null, jamais d\'exception', () => {
    assert.equal(Share.decode('%%%pas-du-base64%%%'), null);
    assert.equal(Share.decode('AAAA'), null); // base64 valide mais pas du JSON
    const objEncoded = Share.encode({ x: 1 });
    assert.equal(Share.decode(objEncoded.slice(0, -4) + 'zzzz'), null);
});

test('decode : un payload v1 (sans _v) reste lisible — rétrocompatibilité', () => {
    // Simulation d'un lien généré avant le versionnage
    const v1Json = JSON.stringify({ type: 'infine', principal: 1000000 });
    const bytes = new TextEncoder().encode(v1Json);
    let bin = '';
    bytes.forEach(b => { bin += String.fromCharCode(b); });
    const v1Payload = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const decoded = Share.decode(v1Payload);
    assert.equal(decoded.type, 'infine');
    assert.equal(decoded.principal, 1000000);
    assert.equal(decoded._v, undefined);
});
