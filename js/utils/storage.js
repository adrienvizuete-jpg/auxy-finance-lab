/**
 * Auxy Partners - LocalStorage Manager
 */

const STORAGE_PREFIX = 'auxy_';

/**
 * Simulation persistée dans l'historique. `params` et `results` sont
 * volontairement libres : leur structure dépend du module émetteur.
 * @typedef {Object} Simulation
 * @property {string} [id]
 * @property {string} [date]
 * @property {string} [type]
 * @property {string} [name]
 * @property {string} [notes]
 * @property {any} [params]
 * @property {any} [results]
 * @property {string} [typeLabel]
 * @property {string} [dossier] Dossier client actif lors de l'enregistrement
 */

/**
 * Comparatif sauvegardé (structure libre selon le module émetteur).
 * @typedef {{ id?: string, date?: string } & Record<string, any>} Benchmark
 */

/**
 * Version du schéma des données persistées (localStorage + payloads de
 * partage). À incrémenter à chaque évolution de structure, en ajoutant la
 * migration correspondante dans MIGRATIONS (clé = version de départ).
 */
export const SCHEMA_VERSION = 2;

// v(n) → v(n+1). Chaque migration doit être idempotente et tolérante aux
// données absentes (un navigateur vierge ne migre rien).
/** @type {Record<number, () => void>} */
const MIGRATIONS = {
    // v1 → v2 : introduction du versionnage (aucune transformation de
    // données — les structures v1 restent lues telles quelles par les
    // modules, qui sont rétrocompatibles).
    1: () => {}
};

/**
 * Copie allégée de résultats pour l'Historique : sans échéancier ni grands
 * tableaux de lignes (recalculés à la demande, js/utils/creditcompute.js).
 * Un échéancier pèse 17 à 48 Ko : 100 simulations saturaient le stockage.
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function slimResults(value) {
    /** @param {any} v @param {number} depth @returns {any} */
    const walk = (v, depth) => {
        if (Array.isArray(v)) {
            if (v.length > 60 && v.every(x => x && typeof x === 'object')) return undefined;
            return depth > 6 ? v : v.map(x => walk(x, depth + 1));
        }
        if (v && typeof v === 'object') {
            if (depth > 6) return v;
            /** @type {Record<string, any>} */
            const out = {};
            for (const [k, x] of Object.entries(v)) {
                if (k === 'schedule') continue;
                const w = walk(x, depth + 1);
                if (w !== undefined) out[k] = w;
            }
            return out;
        }
        return v;
    };
    return walk(value, 0);
}

export const Storage = {
    /**
     * Applique les migrations de schéma en attente. Appelé au démarrage de
     * l'app, avant tout accès aux données.
     */
    migrate() {
        let version = this.get('schema_version', 1);
        if (typeof version !== 'number' || version < 1) version = 1;
        // Historique antérieur à l'allègement : échéanciers retirés une fois pour toutes
        if (!this.get('history_slim')) {
            const raw = this.get('history');
            if (Array.isArray(raw) && raw.length) {
                this.set('history', raw.map(s => (s && typeof s === 'object' && s.results ? { ...s, results: slimResults(s.results) } : s)));
            }
            this.set('history_slim', true);
        }
        while (version < SCHEMA_VERSION) {
            try {
                MIGRATIONS[version]?.();
            } catch (e) {
                console.error(`Migration v${version} → v${version + 1} en échec`, e);
                break;
            }
            version++;
            this.set('schema_version', version);
        }
    },

    /**
     * Lecture typée par la valeur par défaut fournie.
     * @overload
     * @param {string} key
     * @returns {any}
     */
    /**
     * @template T
     * @overload
     * @param {string} key
     * @param {T} defaultValue
     * @returns {T}
     */
    /**
     * @param {string} key
     * @param {*} [defaultValue]
     * @returns {*}
     */
    get(key, defaultValue = null) {
        try {
            const data = localStorage.getItem(STORAGE_PREFIX + key);
            return data ? JSON.parse(data) : defaultValue;
        } catch {
            return defaultValue;
        }
    },

    /**
     * @param {string} key
     * @param {*} value Valeur sérialisable en JSON
     * @returns {boolean} false si l'écriture a échoué (quota plein)
     */
    set(key, value) {
        try {
            localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
            return true;
        } catch {
            return false;
        }
    },

    /** @param {string} key */
    remove(key) {
        try {
            localStorage.removeItem(STORAGE_PREFIX + key);
        } catch { /* stockage indisponible (navigation privée) : rien à retirer */ }
    },

    // Simulation history
    // Retourne l'id, ou null si l'écriture a échoué (quota localStorage plein) —
    // dans ce cas une purge des entrées les plus anciennes est tentée une fois.
    /**
     * @param {Simulation} simulation
     * @returns {string | null}
     */
    saveSimulation(simulation) {
        const history = this.getHistory();
        simulation.id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
        simulation.date = new Date().toISOString();
        if (simulation.results) simulation.results = slimResults(simulation.results);
        // Rattachée au dossier client actif (accueil : dossiers récents, export dossier banque)
        const active = this.get('dossier_active');
        if (!simulation.dossier && active && typeof active.name === 'string') simulation.dossier = active.name.slice(0, 80);
        history.unshift(simulation);
        // Keep last 100 simulations
        if (history.length > 100) history.length = 100;
        if (!this.set('history', history)) {
            // Quota plein : on retente avec un historique réduit de moitié, et on le dit
            const before = history.length;
            history.length = Math.max(1, Math.floor(history.length / 2));
            if (!this.set('history', history)) return null;
            if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('storage:purged', { detail: { removed: before - history.length } }));
        }
        return simulation.id;
    },

    /** @returns {Simulation[]} */
    getHistory() {
        // Tolère un historique corrompu (non-tableau, entrées nulles) plutôt que
        // de faire planter l'Historique et la sauvegarde.
        const raw = this.get('history', /** @type {Simulation[]} */ ([]));
        return Array.isArray(raw) ? raw.filter(s => s && typeof s === 'object' && typeof s.id === 'string') : [];
    },

    /**
     * @param {string} id
     * @returns {Simulation | null}
     */
    getSimulation(id) {
        return this.getHistory().find(s => s.id === id) || null;
    },

    /** @param {string} id */
    deleteSimulation(id) {
        const history = this.getHistory().filter(s => s.id !== id);
        this.set('history', history);
        this.addTombstones([id]);
    },

    clearHistory() {
        this.addTombstones(this.getHistory().map(s => String(s.id)));
        this.set('history', []);
    },

    // Suppressions locales à propager au cloud au prochain envoi (sinon le
    // pull « ressusciterait » les simulations supprimées).
    /** @returns {Array<{ id: string, at: string }>} */
    getTombstones() {
        /** @type {unknown} */
        const raw = this.get('cloud_tombstones', []);
        return Array.isArray(raw) ? raw.filter(t => t && typeof t.id === 'string') : [];
    },

    /** @param {string[]} ids */
    addTombstones(ids) {
        if (!ids.length) return;
        const at = new Date().toISOString();
        const byId = new Map(this.getTombstones().map(t => [t.id, t]));
        for (const id of ids) byId.set(id, { id, at });
        this.set('cloud_tombstones', [...byId.values()].slice(-500));
    },

    /** @param {string[]} ids */
    clearTombstones(ids) {
        const done = new Set(ids);
        this.set('cloud_tombstones', this.getTombstones().filter(t => !done.has(t.id)));
    },

    // Benchmark saves — retourne null si l'écriture a échoué (quota plein)
    /**
     * @param {Benchmark} benchmark
     * @returns {string | null}
     */
    saveBenchmark(benchmark) {
        const benchmarks = this.get('benchmarks', /** @type {Benchmark[]} */ ([]));
        benchmark.id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
        benchmark.date = new Date().toISOString();
        benchmarks.unshift(benchmark);
        if (benchmarks.length > 50) benchmarks.length = 50;
        if (!this.set('benchmarks', benchmarks)) return null;
        return benchmark.id;
    },

    /** @returns {Benchmark[]} */
    getBenchmarks() {
        return this.get('benchmarks', /** @type {Benchmark[]} */ ([]));
    },

    // Theme
    /** @returns {string} */
    getTheme() {
        return this.get('theme', 'light');
    },

    /** @param {string} theme */
    setTheme(theme) {
        this.set('theme', theme);
    },

    // Stats
    getStats() {
        const history = this.getHistory();
        const benchmarks = this.getBenchmarks();
        const totalSimulations = history.length;
        const totalBenchmarks = benchmarks.length;

        /** @type {Record<string, number>} */
        const byType = {};
        history.forEach(s => {
            byType[/** @type {string} */ (s.type)] = (byType[/** @type {string} */ (s.type)] || 0) + 1;
        });

        const totalAmount = history.reduce((sum, s) => sum + (s.params?.principal || s.params?.totalDebt || 0), 0);

        return {
            totalSimulations,
            totalBenchmarks,
            byType,
            totalAmount,
            lastSimulation: history[0] || null
        };
    }
};
