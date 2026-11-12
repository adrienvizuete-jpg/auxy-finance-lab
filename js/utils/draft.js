/**
 * Auxy Partners - Brouillon automatique des modules d'analyse
 *
 * Structuré, Covenants et Profil de dette gardent leur état en mémoire : un
 * rechargement de la page (ou « Mettre à jour ») effaçait un travail non
 * sauvegardé. Chaque recalcul enregistre les paramètres du module ; à la
 * première ouverture du module après un chargement de page, le brouillon est
 * rejoué par le chemin de rechargement habituel (window._pendingReload).
 */

import { Storage } from './storage.js';

const PAGES = new Set(['structured', 'covenants', 'debtprofile']);
const key = (/** @type {string} */ page) => `draft_${page}`;
/** Pages déjà ouvertes depuis le chargement : leur état en mémoire fait foi */
const opened = new Set();
/** @type {Record<string, number>} */
const timers = {};

export const Draft = {
    /** Enregistre (en différé) les paramètres courants du module. @param {string} page @param {unknown} params */
    save(page, params) {
        if (!PAGES.has(page) || !params || typeof window === 'undefined') return;
        clearTimeout(timers[page]);
        timers[page] = window.setTimeout(() => Storage.set(key(page), { params, savedAt: new Date().toISOString() }), 400);
    },

    /**
     * À appeler avant le rendu d'une page : pose le brouillon en rechargement
     * si c'est la première ouverture et que rien d'autre n'est à charger.
     * @param {string} page
     */
    restore(page) {
        if (!PAGES.has(page) || opened.has(page)) return;
        opened.add(page);
        const w = /** @type {any} */ (window);
        if (w._pendingReload || location.hash.includes('?s=')) return;
        const draft = Storage.get(key(page));
        if (draft && typeof draft === 'object' && draft.params && typeof draft.params === 'object') {
            w._pendingReload = { type: page, params: draft.params };
        }
    },

    /** @param {string} page */
    clear(page) {
        Storage.remove(key(page));
    }
};
