/**
 * Auxy Partners - Chargement différé des bibliothèques d'export
 *
 * jsPDF, jspdf-autotable et SheetJS (≈ 1,3 Mo) ne servent qu'aux exports et à
 * l'import de Data Pack : ils ne bloquent plus le premier affichage. Ils sont
 * téléchargés quand le navigateur est inactif après le démarrage, ou au
 * premier clic sur un bouton d'export s'il arrive avant.
 * Mêmes URL et mêmes empreintes SRI qu'avant (autorisées par la CSP).
 */

const LIBS = [
    { test: () => !!(/** @type {any} */ (window).jspdf), src: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', integrity: 'sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk' },
    // autotable s'enregistre sur jsPDF : chargé après lui
    { test: () => !!(/** @type {any} */ (window).jspdf?.jsPDF?.API?.autoTable), src: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.1/jspdf.plugin.autotable.min.js', integrity: 'sha384-b8MpgG2ZzWN6OPAtiB1JiBmDr9MpTt3NKK6KQf61hC/L7X4wJrvoTeVmMFPgp3nL' },
    { test: () => !!(/** @type {any} */ (window).XLSX), src: 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js', integrity: 'sha384-EnyY0/GSHQGSxSgMwaIPzSESbqoOLSexfnSMN2AP+39Ckmn92stwABZynq1JyzdT' }
];

/** @type {Promise<void> | null} */
let loading = null;

/** @param {{ src: string, integrity: string }} lib */
function inject(lib) {
    return new Promise((resolve, reject) => {
        const el = document.createElement('script');
        el.src = lib.src;
        el.integrity = lib.integrity;
        el.crossOrigin = 'anonymous';
        el.onload = () => resolve(undefined);
        el.onerror = () => reject(new Error(`Échec du chargement de ${lib.src}`));
        document.head.appendChild(el);
    });
}

/** true si toutes les bibliothèques d'export sont disponibles */
export function exportLibsReady() {
    return LIBS.every(l => l.test());
}

/**
 * Charge (une seule fois) les bibliothèques d'export manquantes, dans l'ordre.
 * @returns {Promise<void>}
 */
export function ensureExportLibs() {
    if (exportLibsReady()) return Promise.resolve();
    if (!loading) {
        loading = (async () => {
            for (const lib of LIBS) if (!lib.test()) await inject(lib);
        })().catch(err => { loading = null; throw err; });
    }
    return loading;
}

/** Boutons qui ont besoin des bibliothèques d'export */
const EXPORT_SELECTOR = '[id*="export"], .export-sim, #immo-generate-memo';

/**
 * Préchargement à l'inactivité + garde au clic : un export demandé avant la
 * fin du chargement attend les bibliothèques puis se relance tout seul.
 */
export function initExportLibs() {
    const idle = /** @type {any} */ (window).requestIdleCallback || ((/** @type {() => void} */ cb) => setTimeout(cb, 1500));
    idle(() => { ensureExportLibs().catch(() => { /* réessayé au premier export */ }); });

    document.addEventListener('click', e => {
        const target = /** @type {HTMLElement | null} */ (e.target instanceof Element ? e.target.closest(EXPORT_SELECTOR) : null);
        if (!target || exportLibsReady()) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        window.showToast?.('Chargement des outils d’export…', 'info');
        ensureExportLibs()
            .then(() => target.click())
            .catch(() => window.showToast?.('Outils d’export indisponibles (connexion ?) — réessayez', 'error'));
    }, true);
}
