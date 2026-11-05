/**
 * Tests de l'import Data Pack (js/utils/dossier.js)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: k => { store.delete(k); }
};
const { parseDataPack, dossierFromDataPack, Dossier } = await import('../js/utils/dossier.js');

const d = (y, m = 12, day = 31) => new Date(y, m - 1, day);
// Onglet Cash Flow au format Data Pack : lignes 4-6 = durée, type, clôture
const cashFlow = {
    name: 'Cash Flow',
    rows: [
        ['AUXY PARTNERS — Cash Flow'],
        [],
        ['K€'],
        [null, '12 Mois', '12 Mois', '12 Mois', '12 Mois'],
        [null, 'Réel', 'Réel', 'BP', 'BP'],
        [null, d(2024), d(2025), d(2026), d(2027)],
        ['EBITDA Ajusté', 3200, 3500, 3750, 3900],
        ['− Variation BFR', -150, -80, -90, -60],
        ['− CAPEX net', -400, -500, -450, -450],
        ['= FCF avant IS', 2650, 2920, 3210, 3390],
        ['− IS décaissé', -500, -560, -600, -640],
        ['Trésorerie nette', 1800, 2100, null, null]
    ]
};
const pnl = { name: '> P&L >', rows: [[null, 'Réel'], [null, d(2025)], ['EBITDA', 9999]] };

test('lit les lignes du Cash Flow (prioritaire sur le P&L) avec leur référence', () => {
    const pack = parseDataPack([pnl, cashFlow]);
    assert.deepEqual(pack.periods.map(p => p.type), ['Réel', 'Réel', 'BP', 'BP']);
    assert.deepEqual(pack.lines.ebitda, [3200, 3500, 3750, 3900]);
    assert.equal(pack.refs.ebitda, 'Cash Flow!ligne 7');
});

test('capex, IS et BFR saisis en négatif ramenés en besoins positifs', () => {
    const pack = parseDataPack([cashFlow]);
    assert.deepEqual(pack.lines.capex, [400, 500, 450, 450]);
    assert.deepEqual(pack.lines.tax, [500, 560, 600, 640]);
    assert.deepEqual(pack.lines.wcChange, [150, 80, 90, 60]);
});

test('dossier : LTM = dernière période réelle, prévisionnel = colonnes BP', () => {
    const dossier = dossierFromDataPack(parseDataPack([cashFlow]), 'Data_Pack_ALVA.xlsx');
    assert.equal(dossier.name, 'Data Pack ALVA');
    assert.equal(dossier.ebitdaLtm, 3500);
    assert.equal(dossier.netCash, 2100);
    assert.deepEqual(dossier.forecast.years, ['12/2026', '12/2027']);
    assert.deepEqual(dossier.forecast.ebitda, [3750, 3900]);
});

test('dossier actif : fusion et persistance', () => {
    store.clear();
    Dossier.update({ name: 'ALVA', ebitdaLtm: 3500 });
    Dossier.update({ netCash: 2100 });
    const got = Dossier.get();
    assert.equal(got.name, 'ALVA');
    assert.equal(got.ebitdaLtm, 3500);
    assert.equal(got.netCash, 2100);
});
