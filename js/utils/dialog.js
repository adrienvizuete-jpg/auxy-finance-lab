/**
 * Auxy Partners - Fenêtre de dialogue unique
 *
 * Toutes les fenêtres (sauvegarde, détails, import, confirmations) passent
 * par ici : même ouverture, même fermeture (bouton, clic extérieur, Échap),
 * titre annoncé aux lecteurs d'écran (aria-labelledby sur le premier titre),
 * focus géré par app.js. Remplace aussi confirm() / alert() natifs, qui
 * bloquaient la page et n'avaient pas l'apparence de l'outil.
 */

import { escapeHtml } from './sanitize.js';

const overlay = () => document.getElementById('modal-overlay');
const content = () => document.getElementById('modal-content');
const body = () => document.getElementById('modal-body');

/** @type {((ok: boolean) => void) | null} */
let pending = null;
let seq = 0;

function label() {
    const c = content();
    const title = body()?.querySelector('h1, h2, h3');
    if (!c) return;
    if (title) {
        if (!title.id) title.id = `dlg-title-${++seq}`;
        c.setAttribute('aria-labelledby', title.id);
        c.removeAttribute('aria-label');
    } else {
        c.removeAttribute('aria-labelledby');
        c.setAttribute('aria-label', 'Fenêtre');
    }
}

export const Dialog = {
    /** Affiche la fenêtre avec le contenu déjà placé dans #modal-body. */
    show() {
        label();
        overlay()?.classList.remove('hidden');
    },

    /** Remplace le contenu et ouvre. @param {string} html @returns {HTMLElement | null} */
    open(html) {
        const b = body();
        if (b) b.innerHTML = html;
        Dialog.show();
        return b;
    },

    close() {
        overlay()?.classList.add('hidden');
        if (pending) { const p = pending; pending = null; p(false); }
    },

    isOpen() {
        return !!overlay() && !overlay()?.classList.contains('hidden');
    },

    /**
     * Fenêtre « Sauvegarder » commune (nom + notes).
     * @param {{ title?: string, defaultName: string }} opts
     * @returns {Promise<{ name: string, notes: string } | null>}
     */
    save({ title = 'Sauvegarder l\u2019analyse', defaultName }) {
        if (pending) Dialog.close();
        Dialog.open(`
            <h2 style="margin-bottom:20px">${escapeHtml(title)}</h2>
            <div class="form-group" style="margin-bottom:16px">
                <label class="form-label" for="dlg-save-name">Nom</label>
                <input type="text" class="form-input" id="dlg-save-name" value="${escapeHtml(defaultName)}" maxlength="120" style="width:100%">
            </div>
            <div class="form-group" style="margin-bottom:24px">
                <label class="form-label" for="dlg-save-notes">Notes (optionnel)</label>
                <textarea class="form-input notes-input" id="dlg-save-notes" rows="3" placeholder="Ajoutez des notes ou commentaires..."></textarea>
            </div>
            <div class="btn-group" style="justify-content:flex-end">
                <button type="button" class="btn btn-outline" id="dlg-cancel">Annuler</button>
                <button type="button" class="btn btn-primary" id="dlg-ok">Sauvegarder</button>
            </div>`);
        return new Promise(resolve => {
            pending = ok => { if (!ok) resolve(null); };
            document.getElementById('dlg-cancel')?.addEventListener('click', () => Dialog.close());
            document.getElementById('dlg-ok')?.addEventListener('click', () => {
                const name = /** @type {HTMLInputElement | null} */ (document.getElementById('dlg-save-name'))?.value.trim() || defaultName;
                const notes = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('dlg-save-notes'))?.value || '';
                pending = null;
                overlay()?.classList.add('hidden');
                resolve({ name, notes });
            });
        });
    },

    /**
     * Confirmation dans la fenêtre de l'outil.
     * @param {string} message
     * @param {{ title?: string, confirmLabel?: string, danger?: boolean }} [opts]
     * @returns {Promise<boolean>}
     */
    confirm(message, { title = 'Confirmer', confirmLabel = 'Confirmer', danger = false } = {}) {
        if (pending) Dialog.close();
        Dialog.open(`
            <h2 style="margin-bottom:12px">${escapeHtml(title)}</h2>
            <p style="margin-bottom:24px">${escapeHtml(message)}</p>
            <div class="btn-group" style="justify-content:flex-end">
                <button type="button" class="btn btn-outline" id="dlg-cancel">Annuler</button>
                <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="dlg-ok">${escapeHtml(confirmLabel)}</button>
            </div>`);
        return new Promise(resolve => {
            pending = resolve;
            document.getElementById('dlg-cancel')?.addEventListener('click', () => Dialog.close());
            document.getElementById('dlg-ok')?.addEventListener('click', () => {
                pending = null;
                overlay()?.classList.add('hidden');
                resolve(true);
            });
        });
    }
};
