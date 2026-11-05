/**
 * Auxy Partners - Formats d'affichage communs
 *
 * Un seul endroit pour écrire un montant, un pourcentage ou un multiple
 * « à la française » (1 000 000 · 12,5 % · 2,35x), au lieu des toFixed()
 * et Intl.NumberFormat dupliqués dans chaque module (point décimal dans la
 * Calculatrice, « 12,5% » ici et « 12,50 % » là).
 */

const NBSP = ' ';
/** @type {Map<string, Intl.NumberFormat>} */
const cache = new Map();

/** @param {number} min @param {number} [max] */
function nf(min, max = min) {
    const key = `${min}-${max}`;
    let f = cache.get(key);
    if (!f) {
        f = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: min, maximumFractionDigits: max });
        cache.set(key, f);
    }
    return f;
}

/** @param {unknown} v @returns {v is number} */
const ok = v => typeof v === 'number' && isFinite(v);

export const Fmt = {
    /** Nombre seul : 1 234 567 ou 1 234,5 */
    num(/** @type {number | null | undefined} */ v, decimals = 0) {
        return ok(v) ? nf(decimals).format(v) : '—';
    },

    /** Montant avec unité : 1 234 k€, 500 000 € */
    amount(/** @type {number | null | undefined} */ v, unit = '€', decimals = 0) {
        return ok(v) ? `${nf(decimals).format(v)}${NBSP}${unit}` : '—';
    },

    /** Pourcentage (valeur déjà en %) : 12,5 % */
    pct(/** @type {number | null | undefined} */ v, decimals = 1) {
        return ok(v) ? `${nf(decimals).format(v)}${NBSP}%` : '—';
    },

    /** Multiple (DSCR, levier) : 2,35x */
    multiple(/** @type {number | null | undefined} */ v, decimals = 2) {
        return ok(v) ? `${nf(decimals).format(v)}x` : '—';
    },

    /** Ordre de grandeur lisible d'un montant saisi : 1,25 M€, 850 k€ (base en € ou k€). */
    compact(/** @type {number | null | undefined} */ v, unit = '€') {
        if (!ok(v)) return '';
        const euros = unit === 'k€' ? v * 1000 : unit === 'M€' ? v * 1e6 : v;
        const abs = Math.abs(euros);
        if (abs >= 1e9) return `${nf(0, 2).format(euros / 1e9)}${NBSP}Md€`;
        if (abs >= 1e6) return `${nf(0, 2).format(euros / 1e6)}${NBSP}M€`;
        if (abs >= 1e3) return `${nf(0, 1).format(euros / 1e3)}${NBSP}k€`;
        return `${nf(0, 2).format(euros)}${NBSP}€`;
    },

    /**
     * Dette nette lisible : une dette nette négative est une trésorerie nette.
     * @returns {{ label: string, value: string }}
     */
    netDebt(/** @type {number | null | undefined} */ v, unit = 'k€') {
        if (!ok(v)) return { label: 'Dette nette', value: '—' };
        return v < 0
            ? { label: 'Trésorerie nette', value: Fmt.amount(-v, unit) }
            : { label: 'Dette nette', value: Fmt.amount(v, unit) };
    },

    /** Dette nette en cellule de tableau : « 1 820 » ou « tréso. 1 820 » */
    netDebtCell(/** @type {number | null | undefined} */ v) {
        if (!ok(v)) return '—';
        return v < 0 ? `tréso.${NBSP}${nf(0).format(-v)}` : nf(0).format(v);
    }
};
