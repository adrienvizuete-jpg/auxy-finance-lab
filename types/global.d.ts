/**
 * Déclarations globales pour le typecheck JSDoc (tsc --checkJs).
 * Étend `window` avec les API exposées par l'app (js/app.js) et
 * consommées par les moteurs de js/utils/.
 */
export {};

declare global {
    interface Window {
        /** Toast de notification global (défini dans js/app.js) */
        showToast?: (message: string, type?: string) => void;
        /** Navigation programmatique du routeur à hash (js/app.js) */
        navigateTo?: (page: string) => void;
        /** Rechargement différé en attente (service worker / mise à jour) */
        _pendingReload?: unknown;
    }
}
