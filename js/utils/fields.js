/**
 * Auxy Partners - Champ montant commun
 *
 * Les champs de montant étaient des <input type="number"> : « 500000 » sans
 * séparateur, unité affichée seulement dans certains modules (Structuré et
 * Covenants en k€, Crédit et Profil de dette en €) → erreurs ×1 000 faciles.
 *
 * enhanceAmounts() transforme chaque champ de montant en champ texte formaté
 * « 1 000 000 », avec l'unité dans le champ et l'ordre de grandeur en
 * info-bulle (« 1,25 M€ »). La propriété value du champ continue de renvoyer
 * le nombre brut (« 1000000.5 ») : les modules qui lisent parseFloat(el.value)
 * ne changent pas, et une affectation el.value = 1234 est formatée.
 * Flèches haut / bas : ± le pas du champ, comme avant.
 */

import { Financial } from './financial.js';
import { Fmt } from './format.js';

const NATIVE = /** @type {PropertyDescriptor} */ (Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value'));
const AMOUNT_NAME = /amount|montant|principal|price|prix|cost|ebitda|rent|loyer|capex|taxe|cash|deposit|residual|equity|debt|apport|crdCheck|exitCostFixed|\bca\b/i;
const NOT_AMOUNT = /duration|duree|durée|mois|month|year|annee|horizon|days|jours|dso|dpo|pct|percent|rate|taux|ratio|quotite/i;
const UNIT_RE = /\b(M€|k€|K€)|€/;
const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 4 });

/** @param {string} raw */
const parse = raw => Financial.parseNumber(raw);

/** Unité visible à côté du champ (suffixe de .input-group) */
function suffixOf(/** @type {HTMLInputElement} */ input) {
    return input.closest('.input-group')?.querySelector('.input-suffix')?.textContent?.trim() || '';
}

/** Unité d'un champ de tableau, lue dans l'en-tête de sa colonne */
function headerUnit(/** @type {HTMLInputElement} */ input) {
    const cell = input.closest('td');
    const row = input.closest('tr');
    const head = input.closest('table')?.querySelector('thead tr');
    if (!cell || !row || !head) return '';
    const th = head.children[[...row.children].indexOf(cell)];
    const m = th?.textContent?.match(UNIT_RE);
    return m ? (m[1] || '€').replace('K€', 'k€') : '';
}

/** Unité écrite dans le libellé du champ : « Prix d'acquisition (€) », « EBITDA (k€) » */
function labelUnit(/** @type {HTMLInputElement} */ input) {
    const label = input.closest('.form-group')?.querySelector('.form-label')?.textContent || '';
    const m = label.match(UNIT_RE);
    return m ? (m[1] || '€').replace('K€', 'k€') : '';
}

/** @param {HTMLInputElement} input */
function isAmount(input) {
    const fmt = input.dataset.format;
    if (fmt === 'amount') return true;
    if (fmt === 'plain' || input.type !== 'number') return false;
    if (NOT_AMOUNT.test(`${input.id} ${input.dataset.field || ''}`)) return false;
    const suffix = suffixOf(input);
    if (suffix) return UNIT_RE.test(suffix);
    const max = parseFloat(input.max);
    if (isFinite(max) && max < 10000) return false;
    const step = parseFloat(input.step);
    if (isFinite(step) && step >= 10) return true;
    return AMOUNT_NAME.test(`${input.id} ${input.dataset.field || ''}`);
}

/** @param {HTMLInputElement} input */
function unitOf(input) {
    if (input.dataset.unit) return input.dataset.unit;
    const suffix = suffixOf(input);
    if (suffix) return suffix;
    return headerUnit(input) || labelUnit(input)
        || /** @type {HTMLElement | null} */ (input.closest('[data-amount-unit]'))?.dataset.amountUnit
        || '';
}

/** @param {number} n */
const display = n => nf.format(n);

/** @param {HTMLInputElement} input */
function upgrade(input) {
    const raw = NATIVE.get?.call(input) ?? '';
    const unit = unitOf(input);
    const step = parseFloat(input.step);
    input.type = 'text';
    input.inputMode = 'decimal';
    input.autocomplete = 'off';
    input.dataset.amount = '';
    input.classList.add('amount-input');

    Object.defineProperty(input, 'value', {
        configurable: true,
        get() {
            const n = parse(NATIVE.get?.call(this) ?? '');
            return isNaN(n) ? '' : String(n);
        },
        set(v) {
            const n = parse(v == null ? '' : String(v));
            NATIVE.set?.call(this, isNaN(n) ? String(v ?? '') : (document.activeElement === this ? String(v) : display(n)));
            hint();
        }
    });

    const hint = () => {
        const n = parse(NATIVE.get?.call(input) ?? '');
        const c = isNaN(n) ? '' : Fmt.compact(n, unit || '€');
        if (c && Math.abs(n) >= 1000) input.title = `= ${c}`;
        else input.removeAttribute('title');
    };
    const reformat = () => {
        const n = parse(NATIVE.get?.call(input) ?? '');
        if (!isNaN(n)) NATIVE.set?.call(input, display(n));
        hint();
    };

    input.addEventListener('blur', reformat);
    input.addEventListener('input', hint);
    input.addEventListener('keydown', e => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        const n = parse(NATIVE.get?.call(input) ?? '') || 0;
        const d = (isFinite(step) && step > 0 ? step : 1) * (e.shiftKey ? 10 : 1);
        NATIVE.set?.call(input, display(n + (e.key === 'ArrowUp' ? d : -d)));
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    reformat();

    // Unité dans le champ quand elle n'est pas déjà affichée à côté
    if (unit && !suffixOf(input)) {
        const wrap = document.createElement('span');
        wrap.className = 'amount-wrap';
        input.replaceWith(wrap);
        wrap.appendChild(input);
        const chip = document.createElement('span');
        chip.className = 'amount-unit';
        chip.textContent = unit;
        chip.setAttribute('aria-hidden', 'true');
        wrap.appendChild(chip);
    }
}

/** @param {ParentNode} root */
export function enhanceAmounts(root) {
    root.querySelectorAll('input[type="number"], input[data-format="amount"]:not([data-amount])').forEach(node => {
        const input = /** @type {HTMLInputElement} */ (node);
        if ('amount' in input.dataset || !isAmount(input)) return;
        upgrade(input);
    });
}
