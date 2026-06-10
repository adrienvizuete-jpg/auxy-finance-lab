/**
 * Auxy Partners - LocalStorage Manager
 */

const STORAGE_PREFIX = 'auxy_';

export const Storage = {
    get(key, defaultValue = null) {
        try {
            const data = localStorage.getItem(STORAGE_PREFIX + key);
            return data ? JSON.parse(data) : defaultValue;
        } catch {
            return defaultValue;
        }
    },

    set(key, value) {
        try {
            localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
            return true;
        } catch {
            return false;
        }
    },

    remove(key) {
        localStorage.removeItem(STORAGE_PREFIX + key);
    },

    // Simulation history
    // Retourne l'id, ou null si l'écriture a échoué (quota localStorage plein) —
    // dans ce cas une purge des entrées les plus anciennes est tentée une fois.
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

    getHistory() {
        return this.get('history', []);
    },

    getSimulation(id) {
        return this.getHistory().find(s => s.id === id) || null;
    },

    deleteSimulation(id) {
        const history = this.getHistory().filter(s => s.id !== id);
        this.set('history', history);
    },

    clearHistory() {
        this.set('history', []);
    },

    // Benchmark saves — retourne null si l'écriture a échoué (quota plein)
    saveBenchmark(benchmark) {
        const benchmarks = this.get('benchmarks', []);
        benchmark.id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
        benchmark.date = new Date().toISOString();
        benchmarks.unshift(benchmark);
        if (benchmarks.length > 50) benchmarks.length = 50;
        if (!this.set('benchmarks', benchmarks)) return null;
        return benchmark.id;
    },

    getBenchmarks() {
        return this.get('benchmarks', []);
    },

    // Theme
    getTheme() {
        return this.get('theme', 'light');
    },

    setTheme(theme) {
        this.set('theme', theme);
    },

    // Stats
    getStats() {
        const history = this.getHistory();
        const benchmarks = this.getBenchmarks();
        const totalSimulations = history.length;
        const totalBenchmarks = benchmarks.length;

        const byType = {};
        history.forEach(s => {
            byType[s.type] = (byType[s.type] || 0) + 1;
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
