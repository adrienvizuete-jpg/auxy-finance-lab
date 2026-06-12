/**
 * Auxy Partners - HTML sanitization helpers
 * Échappe les chaînes saisies par l'utilisateur avant toute injection
 * dans innerHTML / attributs (protection XSS).
 */

/** @type {Record<string, string>} */
const ESCAPE_MAP = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
};

/**
 * Échappe une valeur pour insertion sûre dans du HTML (texte ou attribut quoté).
 * Toujours utiliser sur les données utilisateur (noms, notes, libellés).
 * @param {unknown} value Valeur à échapper (null/undefined → chaîne vide)
 * @returns {string}
 */
export function escapeHtml(value) {
    if (value == null) return '';
    return String(value).replace(/[&<>"']/g, ch => ESCAPE_MAP[ch]);
}
