/**
 * Auxy Partners - Partage de simulation par URL
 * Encode les paramètres d'une simulation en base64url dans le hash :
 *   #credit?s=<payload>
 * Aucun backend : le lien restitue la simulation à l'identique chez le destinataire.
 */

function toBase64Url(str) {
    // UTF-8 safe base64url
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    bytes.forEach(b => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(b64u) {
    const b64 = b64u.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, ch => ch.charCodeAt(0));
    return new TextDecoder().decode(bytes);
}

export const Share = {
    /** Encode un objet de paramètres en payload compact pour URL */
    encode(obj) {
        return toBase64Url(JSON.stringify(obj));
    },

    /** Décode un payload ; retourne null si invalide (jamais d'exception) */
    decode(payload) {
        try {
            const obj = JSON.parse(fromBase64Url(payload));
            return (obj && typeof obj === 'object') ? obj : null;
        } catch {
            return null;
        }
    },

    /** Construit l'URL de partage pour une page + payload */
    buildUrl(page, params) {
        const url = new URL(window.location.href);
        url.hash = `#${page}?s=${this.encode(params)}`;
        return url.toString();
    },

    /**
     * Lit le payload présent dans le hash courant (#page?s=...).
     * À appeler dans init() du module AVANT que le routeur ne nettoie le hash.
     */
    getPayload() {
        const m = window.location.hash.match(/\?s=([A-Za-z0-9_-]+)/);
        if (!m) return null;
        return this.decode(m[1]);
    },

    /** Copie le lien de partage dans le presse-papier et notifie l'utilisateur */
    async copyLink(page, params) {
        const url = this.buildUrl(page, params);
        try {
            await navigator.clipboard.writeText(url);
            window.showToast?.('Lien de partage copié dans le presse-papier', 'success');
        } catch {
            // Fallback (clipboard refusé) : affiche le lien dans une fenêtre de saisie
            window.prompt('Copiez le lien de partage :', url);
        }
        return url;
    },

    /** Bouton de partage standard (HTML) — l'appelant branche le listener */
    buttonHtml(id) {
        return `
            <button type="button" class="btn btn-outline" id="${id}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                Partager
            </button>`;
    }
};
