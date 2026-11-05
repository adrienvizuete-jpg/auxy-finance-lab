/**
 * Auxy Partners - Taux de marché
 * Consomme data/rates.json (publié quotidiennement par le workflow veille)
 * avec cache localStorage. Tolérant : retourne null si indisponible.
 */

import { Storage } from './storage.js';

const CACHE_KEY = 'market_rates';
const DEFAULT_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 h

/**
 * Un taux publié dans rates.json.
 * @typedef {Object} RateEntry
 * @property {string} label
 * @property {number} value
 * @property {string} [unit]
 * @property {string} [as_of] Date (AAAA-MM-JJ) ou période (AAAA-MM) de l'observation
 * @property {string} [note] Précision (ex. « moyenne mensuelle BCE »)
 */

/**
 * Contenu de data/rates.json.
 * @typedef {Object} RatesData
 * @property {string} [updated_at]
 * @property {string} [source]
 * @property {Record<string, RateEntry>} [rates]
 */

export const Market = {
    /**
     * Retourne le contenu de rates.json :
     * { updated_at, source, rates: { euribor_3m: {label, value, unit}, ... } }
     * ou null si aucune donnée disponible (offline + cache vide).
     * @param {{ maxAgeMs?: number }} [opts]
     * @returns {Promise<RatesData | null>}
     */
    async getRates({ maxAgeMs = DEFAULT_MAX_AGE_MS } = {}) {
        /** @type {{ fetchedAt: number, data: RatesData } | null} */
        const cached = Storage.get(CACHE_KEY);
        if (cached?.data && (Date.now() - cached.fetchedAt) < maxAgeMs) {
            return cached.data;
        }
        try {
            const resp = await fetch('data/rates.json', { cache: 'no-store' });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            if (!data || typeof data !== 'object' || !data.rates) throw new Error('format invalide');
            Storage.set(CACHE_KEY, { fetchedAt: Date.now(), data });
            return data;
        } catch {
            return cached?.data || null;
        }
    },

    /**
     * Date de mise à jour formatée (JJ/MM/AAAA) ou null
     * @param {RatesData | null} data
     * @returns {string | null}
     */
    formatUpdatedAt(data) {
        if (!data?.updated_at) return null;
        const d = new Date(data.updated_at);
        return isNaN(/** @type {any} */ (d)) ? null : d.toLocaleDateString('fr-FR');
    },

    /**
     * Précision à afficher à côté d'un taux : nature (ex. « moyenne mensuelle
     * BCE ») et date de l'observation si elle n'est pas du jour de mise à jour.
     * Chaîne vide si le taux est frais.
     * @param {RatesData | null} data
     * @param {string} key
     * @returns {string}
     */
    rateNote(data, key) {
        const r = data?.rates?.[key];
        if (!r) return '';
        const asOf = typeof r.as_of === 'string' ? r.as_of : '';
        let when = '';
        if (/^\d{4}-\d{2}$/.test(asOf)) when = `${asOf.slice(5, 7)}/${asOf.slice(0, 4)}`;
        else if (/^\d{4}-\d{2}-\d{2}/.test(asOf)) {
            const days = data?.updated_at ? (Date.parse(data.updated_at) - Date.parse(asOf)) / 86400000 : 0;
            if (days > 4) when = `au ${asOf.slice(8, 10)}/${asOf.slice(5, 7)}/${asOf.slice(0, 4)}`;
        }
        const note = typeof r.note === 'string' ? r.note : '';
        return [note, when].filter(Boolean).join(' ');
    },

    /**
     * Valeur d'un taux (ex: 'euribor_3m') ou null
     * @param {RatesData | null} data
     * @param {string} key
     * @returns {number | null}
     */
    rateValue(data, key) {
        const v = data?.rates?.[key]?.value;
        return typeof v === 'number' && isFinite(v) ? v : null;
    }
};
