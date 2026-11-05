/**
 * Auxy Partners - Accessibilité des pages rendues par innerHTML
 *
 * Les modules génèrent leurs formulaires en HTML sans relier libellés et
 * champs (aucun <label for>) : un lecteur d'écran annonçait « zone
 * d'édition » sans nom. Ce passage, relancé à chaque modification du DOM de
 * la page, donne un nom accessible à chaque champ et bouton icône :
 *  - champ d'un .form-group → relié à son .form-label (id + for) ;
 *  - champ d'un tableau → aria-label « <en-tête de colonne> — <libellé de ligne> » ;
 *  - bouton sans texte → aria-label depuis son title ou son data-action.
 * Aucun module n'est modifié ; ce sera remplacé par un composant de champ commun.
 */

let seq = 0;

const ACTION_LABELS = /** @type {Record<string, string>} */ ({
    remove: 'Supprimer la ligne',
    duplicate: 'Dupliquer la ligne'
});

/** @param {Element} el */
const text = el => (el.textContent || '').replace(/\s+/g, ' ').trim();

/** @param {HTMLElement} field */
function hasName(field) {
    return !!(field.getAttribute('aria-label') || field.getAttribute('aria-labelledby')
        || (/** @type {HTMLInputElement} */ (field).labels?.length));
}

/** @param {HTMLElement} field */
function tableLabel(field) {
    const cell = field.closest('td, th');
    const row = field.closest('tr');
    const table = field.closest('table');
    if (!cell || !row || !table) return '';
    const idx = [...row.children].indexOf(cell);
    const header = table.querySelector('thead tr');
    const col = header && header.children[idx] ? text(header.children[idx]) : '';
    // libellé de ligne : 1re cellule (texte ou valeur du champ libellé)
    const first = row.children[0];
    let rowName = '';
    if (first && first !== cell) {
        const inp = /** @type {HTMLInputElement | null} */ (first.querySelector('input[type="text"]:not([data-amount]), input:not([type])'));
        rowName = inp ? inp.value : text(first);
    }
    return [col, rowName].filter(Boolean).join(' — ');
}

/** @param {ParentNode} root */
export function enhance(root) {
    root.querySelectorAll('input:not([type="hidden"]), select, textarea').forEach(node => {
        const field = /** @type {HTMLElement} */ (node);
        if (hasName(field)) return;
        const group = field.closest('.form-group');
        const label = group?.querySelector('.form-label');
        if (label && !label.getAttribute('for')) {
            if (!field.id) field.id = `fld-${++seq}`;
            label.setAttribute('for', field.id);
            return;
        }
        // texte posé juste avant le champ (« IS », « Capex », « Croissance »…)
        const prev = field.previousElementSibling;
        const before = prev && /^(SPAN|LABEL|B|STRONG)$/.test(prev.tagName) ? text(prev) : '';
        const name = tableLabel(field) || field.getAttribute('title') || before || field.getAttribute('placeholder') || (label ? text(label) : '');
        if (name) field.setAttribute('aria-label', name);
    });
    root.querySelectorAll('button').forEach(node => {
        const btn = /** @type {HTMLElement} */ (node);
        if (text(btn) || btn.getAttribute('aria-label')) return;
        const name = btn.getAttribute('title') || ACTION_LABELS[btn.dataset.action || ''] || '';
        if (name) btn.setAttribute('aria-label', name);
    });
}

/**
 * Applique enhance() au conteneur de page et à la fenêtre de dialogue, à
 * chaque ajout de contenu (re-rendus partiels des tableaux compris).
 * Les passages `before` (champ montant…) tournent avant, sur les mêmes nœuds.
 * @param {HTMLElement[]} roots
 * @param {Array<(root: ParentNode) => void>} [before]
 */
export function watchA11y(roots, before = []) {
    let scheduled = false;
    const pass = (/** @type {HTMLElement} */ r) => { before.forEach(fn => fn(r)); enhance(r); };
    const run = () => { scheduled = false; roots.forEach(pass); };
    const obs = new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true;
        setTimeout(run, 0); // pas requestAnimationFrame : suspendu quand l'onglet est en arrière-plan
    });
    roots.forEach(r => { obs.observe(r, { childList: true, subtree: true }); pass(r); });
}
