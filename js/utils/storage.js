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

export const Storage = {
    /**
     * Applique les migrations de schéma en attente. Appelé au démarrage de
     * l'app, avant tout accès aux données.
     */
    migrate() {
        let version = this.get('schema_version', 1);
        if (typeof version !== 'number' || version < 1) version = 1;
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
        localStorage.removeItem(STORAGE_PREFIX + key);
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
        history.unshift(simulation);
        // Keep last 100 simulations
        if (history.length > 100) history.length = 100;
        if (!this.set('history', history)) {
            // Quota plein : on retente avec un historique réduit de moitié
            history.length = Math.max(1, Math.floor(history.length / 2));
            if (!this.set('history', history)) return null;
        }
        return simulation.id;
    },

    /** @returns {Simulation[]} */
    getHistory() {
        return this.get('history', /** @type {Simulation[]} */ ([]));
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
    },

    clearHistory() {
        this.set('history', []);
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
