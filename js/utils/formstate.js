/**
 * Auxy Partners - Saisies conservées d'une visite à l'autre
 *
 * Calculatrice, Stress Test, Crédit et Benchmark gardent leurs saisies dans
 * le DOM : revenir sur la page repartait des valeurs par défaut, et changer
 * de thème effaçait tout ce qui n'avait pas été simulé. On photographie les
 * champs (par id) et les calculs lancés (boutons, formulaires) en quittant
 * la page, puis on les rejoue au retour. Les autres modules gardent déjà leur
 * état en mémoire.
 *
 * Mémoire de session (sessionStorage) : les saisies survivent à un
 * rechargement de l'onglet, pas à sa fermeture.
 */

/** Pages dont l'état vit dans le DOM */
export const DOM_STATE_PAGES = new Set(['calculator', 'stress', 'credit', 'benchmark']);

/** Boutons de calcul à rejouer (pas les exports, sauvegardes, partages…) */
const REPLAY_BTN = /^(calc-[a-z]+-btn|st-run|run-benchmark|btn-calc-prepayment)$/;
const KEY = 'formstate:';

/**
 * @typedef {{ values: Record<string, string | boolean>, actions: string[] }} Snapshot
 */

/** @type {Map<string, Snapshot>} */
const memory = new Map();
/** @type {string[]} */
let actions = [];

/** @param {ParentNode} root @returns {Snapshot} */
export function snapshot(root) {
    /** @type {Record<string, string | boolean>} */
    const values = {};
    root.querySelectorAll('input[id], select[id], textarea[id]').forEach(node => {
        const el = /** @type {HTMLInputElement} */ (node);
        if (el.type === 'file' || el.type === 'hidden' || el.closest('#modal-overlay')) return;
        values[el.id] = el.type === 'checkbox' || el.type === 'radio' ? el.checked : el.value;
    });
    return { values, actions: [...new Set(actions)] };
}

/**
 * Réapplique les valeurs qui diffèrent du rendu par défaut (événement input /
 * change sur celles-là seulement), puis rejoue les calculs lancés.
 * @param {ParentNode} root @param {Snapshot | undefined} snap
 */
export function restore(root, snap) {
    actions = [];
    if (!snap) return;
    Object.entries(snap.values).forEach(([id, v]) => {
        const el = /** @type {HTMLInputElement | null} */ (root.querySelector(`#${CSS.escape(id)}`));
        if (!el) return;
        if (typeof v === 'boolean') {
            if (el.checked === v) return;
            el.checked = v;
        } else {
            if (el.value === v) return;
            el.value = v;
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    snap.actions.forEach(a => {
        const [kind, id] = a.split(':');
        const el = root.querySelector(`#${CSS.escape(id)}`);
        if (kind === 'click' && el instanceof HTMLElement) el.click();
        else if (kind === 'submit' && el instanceof HTMLFormElement) el.requestSubmit();
    });
}

/** Nouvelle page : on oublie les calculs de la précédente. */
export function reset() { actions = []; }

/** Enregistre les calculs lancés sur la page courante. @param {HTMLElement} container */
export function trackActions(container) {
    container.addEventListener('click', e => {
        const btn = e.target instanceof Element ? e.target.closest('button[id]') : null;
        if (btn && REPLAY_BTN.test(btn.id)) actions.push(`click:${btn.id}`);
    });
    container.addEventListener('submit', e => {
        const form = /** @type {HTMLElement} */ (e.target);
        if (form.id) actions.push(`submit:${form.id}`);
    });
}

/** @param {string} page @param {ParentNode} root */
export function save(page, root) {
    const snap = snapshot(root);
    memory.set(page, snap);
    try { sessionStorage.setItem(KEY + page, JSON.stringify(snap)); } catch { /* navigation privée */ }
}

/** @param {string} page @returns {Snapshot | undefined} */
export function load(page) {
    if (memory.has(page)) return memory.get(page);
    try {
        const raw = sessionStorage.getItem(KEY + page);
        if (!raw) return undefined;
        const snap = JSON.parse(raw);
        return snap && typeof snap === 'object' && snap.values ? snap : undefined;
    } catch { return undefined; }
}
