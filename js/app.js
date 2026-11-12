/**
 * Auxy Partners - Finance Lab
 * Main Application Entry Point
 */

import { Storage } from './utils/storage.js';
import { Cloud } from './utils/cloud.js';
import { initExportLibs } from './utils/libs.js';
import { watchA11y } from './utils/a11y.js';
import { enhanceAmounts } from './utils/fields.js';
import { enhanceGlossary } from './utils/glossary.js';
import { Dialog } from './utils/dialog.js';
import * as FormState from './utils/formstate.js';
import { mountKpiBar } from './utils/kpibar.js';
import { initContextBar } from './utils/contextbar.js';
import { Draft } from './utils/draft.js';

// =============================================
// MODULE REGISTRY
// =============================================

// Chaque module est importé à sa première ouverture : le premier affichage
// ne télécharge plus les dix modules (le service worker les garde hors ligne).
const loaders = /** @type {Record<string, () => Promise<any>>} */ ({
    dashboard: () => import('./modules/dashboard.js').then(m => m.DashboardModule),
    credit: () => import('./modules/credit.js').then(m => m.CreditModule),
    structured: () => import('./modules/structured.js').then(m => m.StructuredModule),
    benchmark: () => import('./modules/benchmark.js').then(m => m.BenchmarkModule),
    immobilier: () => import('./modules/immobilier.js').then(m => m.ImmobilierModule),
    covenants: () => import('./modules/covenants.js').then(m => m.CovenantsModule),
    debtprofile: () => import('./modules/debtprofile.js').then(m => m.DebtProfileModule),
    calculator: () => import('./modules/tools.js').then(m => m.CalculatorModule),
    stress: () => import('./modules/tools.js').then(m => m.StressTestModule),
    history: () => import('./modules/history.js').then(m => m.HistoryModule)
});

/** Modules déjà chargés */
const modules = /** @type {Record<string, any>} */ ({});

/** Unité des montants saisis par module (affichée dans chaque champ montant) */
const AMOUNT_UNITS = /** @type {Record<string, string>} */ ({
    structured: 'k€', covenants: 'k€',
    credit: '€', debtprofile: '€', immobilier: '€', benchmark: '€', stress: '€', calculator: '€'
});

let currentPage = 'dashboard';
/** Page réellement affichée (dont on sauvegarde les saisies en la quittant) */
let renderedPage = '';
/** @type {(() => void) | undefined} */
let refreshContext;
const APP_VERSION = '1.4.0';

// =============================================
// ROUTER
// =============================================

/**
 * @param {string} page
 * @param {{ history?: 'push' | 'replace' | 'none' }} [opts] Entrée d'historique :
 *   'push' pour une navigation de l'utilisateur, 'none' quand le navigateur
 *   vient lui-même de changer d'URL (Retour / Suivant), 'replace' au démarrage.
 */
function navigateTo(page, { history: mode = 'push' } = {}) {
    if (!loaders[page]) page = 'dashboard';
    currentPage = page;

    // Update nav (+ page courante annoncée aux lecteurs d'écran)
    let label = '';
    document.querySelectorAll('.nav-item').forEach(item => {
        const active = item.dataset.page === page;
        item.classList.toggle('active', active);
        if (active) { item.setAttribute('aria-current', 'page'); label = item.textContent.trim(); }
        else item.removeAttribute('aria-current');
    });
    // Titre d'onglet par module : onglets et historique du navigateur lisibles
    document.title = `${label || 'Accueil'} · Auxy Finance Lab`;

    // Close mobile sidebar
    document.getElementById('sidebar')?.classList.remove('open');

    // Historique : jamais d'entrée ajoutée sur un Retour / Suivant (sinon le
    // bouton Retour tourne en boucle sur la même page). Mis à jour APRÈS le
    // rendu : init() du module lit d'abord le lien de partage (#page?s=…).
    const show = () => {
        renderPage(page);
        if (mode === 'push' && location.hash.split('?')[0] !== `#${page}`) history.pushState(null, '', `#${page}`);
        else if (mode === 'replace') history.replaceState(null, '', `#${page}`);
    };

    // Rendu immédiat si le module est déjà chargé, sinon dès son arrivée
    if (modules[page]) { show(); return; }
    loaders[page]().then(mod => {
        modules[page] = mod;
        if (currentPage === page) show(); // l'utilisateur n'est pas reparti ailleurs entre-temps
    }).catch(() => showToast('Module indisponible (connexion ?) — réessayez', 'error'));
}

/** Affiche un module chargé. @param {string} page */
function renderPage(page) {
    // Render page (saisies de la page quittée gardées pour le retour)
    const container = document.getElementById('page-container');
    if (container) {
        if (renderedPage && FormState.DOM_STATE_PAGES.has(renderedPage)) FormState.save(renderedPage, container);
        FormState.reset();
        renderedPage = page;
        Draft.restore(page); // travail non sauvegardé d'avant un rechargement de la page
        if (AMOUNT_UNITS[page]) container.dataset.amountUnit = AMOUNT_UNITS[page];
        else delete container.dataset.amountUnit;
        container.innerHTML = modules[page].render();
        // Reset scroll
        document.getElementById('main-content')?.scrollTo(0, 0);
        // Re-run animation
        container.style.animation = 'none';
        container.offsetHeight; // Force reflow
        container.style.animation = '';
        // Initialize module
        modules[page].init?.();
        if (FormState.DOM_STATE_PAGES.has(page)) {
            FormState.restore(container, FormState.load(page));
            // un calcul rejoué ne fait pas défiler la page
            document.getElementById('main-content')?.scrollTo({ top: 0, behavior: 'instant' });
        }
        mountKpiBar(page, container);
    }
    refreshContext?.();
}

// Expose globally for modules
window.navigateTo = navigateTo;

// =============================================
// TOAST NOTIFICATIONS
// =============================================

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const icons = {
        success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
        error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
        warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
        info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    // Erreurs et avertissements annoncés immédiatement et laissés plus longtemps
    if (type === 'error' || type === 'warning') toast.setAttribute('role', 'alert');
    // L'icône est une constante ; le message passe en textContent : il peut
    // contenir des données externes (fragment d'URL, réponse serveur).
    toast.innerHTML = icons[type] || icons.info;
    const text = document.createElement('span');
    text.textContent = String(message);
    toast.appendChild(text);
    container.appendChild(toast);

    const close = () => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    };
    // 3 s pour une confirmation, 8 s pour une erreur ; pause au survol
    let timer = setTimeout(close, type === 'error' ? 8000 : type === 'warning' ? 6000 : 3000);
    toast.addEventListener('mouseenter', () => clearTimeout(timer));
    toast.addEventListener('mouseleave', () => { timer = setTimeout(close, 2000); });
}

window.showToast = showToast;

// =============================================
// THEME MANAGEMENT
// =============================================

function initTheme() {
    const savedTheme = Storage.getTheme();
    document.documentElement.setAttribute('data-theme', savedTheme);
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    Storage.setTheme(next);

    // Re-render de la page pour redessiner les graphiques aux couleurs du
    // thème, sans perdre les saisies en cours ni le défilement
    if (modules[currentPage]) {
        const container = document.getElementById('page-container');
        const main = document.getElementById('main-content');
        if (container) {
            // Modules à état DOM : saisies photographiées puis rejouées ; les
            // autres re-rendent depuis leur état en mémoire
            const domState = FormState.DOM_STATE_PAGES.has(currentPage);
            const snap = domState ? FormState.snapshot(container) : undefined;
            const scroll = main?.scrollTop || 0;
            container.innerHTML = modules[currentPage].render();
            modules[currentPage].init?.();
            if (domState) FormState.restore(container, snap);
            mountKpiBar(currentPage, container);
            main?.scrollTo({ top: scroll, behavior: 'instant' });
        }
    }
}

// =============================================
// MODAL MANAGEMENT
// =============================================

/** Focus dans la fenêtre à l'ouverture, piège à Tab, retour au déclencheur à la fermeture. */
function initModalFocus() {
    const overlay = document.getElementById('modal-overlay');
    const content = document.getElementById('modal-content');
    if (!overlay || !content) return;
    /** @type {HTMLElement | null} */
    let opener = null;
    const focusables = () => [...content.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
        .filter(el => !(/** @type {any} */ (el).disabled) && /** @type {HTMLElement} */ (el).offsetParent !== null);
    new MutationObserver(() => {
        const open = !overlay.classList.contains('hidden');
        if (open && !opener) {
            opener = /** @type {HTMLElement | null} */ (document.activeElement);
            if (!content.contains(document.activeElement)) {
                const first = focusables().find(el => el.id !== 'modal-close') || content;
                setTimeout(() => /** @type {HTMLElement} */ (first).focus(), 0);
            }
        } else if (!open && opener) {
            const back = opener;
            opener = null;
            if (document.contains(back)) back.focus();
        }
    }).observe(overlay, { attributes: true, attributeFilter: ['class'] });
    content.addEventListener('keydown', e => {
        if (e.key !== 'Tab') return;
        const list = focusables();
        if (!list.length) return;
        const first = /** @type {HTMLElement} */ (list[0]), last = /** @type {HTMLElement} */ (list[list.length - 1]);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
}

function initModal() {
    initModalFocus();
    document.getElementById('modal-close')?.addEventListener('click', () => Dialog.close());

    document.getElementById('modal-overlay')?.addEventListener('click', e => {
        if (e.target === e.currentTarget) Dialog.close();
    });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && Dialog.isOpen()) Dialog.close();
    });
}

// =============================================
// MOBILE NAVIGATION
// =============================================

function initMobileNav() {
    const toggle = document.getElementById('menu-toggle');
    toggle?.addEventListener('click', () => {
        const open = document.getElementById('sidebar')?.classList.toggle('open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    // Close sidebar on outside click (mobile)
    document.getElementById('main-content')?.addEventListener('click', () => {
        document.getElementById('sidebar')?.classList.remove('open');
    });
}

// =============================================
// SERVICE WORKER — mise à jour avec consentement
// =============================================

// Le SW n'active plus skipWaiting tout seul (voir sw.js) : quand une
// nouvelle version est téléchargée, elle reste « en attente » et on
// propose à l'utilisateur de recharger. Au clic : SKIP_WAITING →
// controllerchange → reload. Page et SW restent synchrones.

// Reload uniquement si la mise à jour a été demandée par l'utilisateur :
// au tout premier chargement, l'activation du SW (clients.claim) déclenche
// aussi controllerchange — sans ce garde-fou, le visiteur subirait un
// rechargement sauvage quelques secondes après son arrivée.
let updateRequested = false;

// Mise à jour automatique à l'ouverture : si une nouvelle version est prête
// dans les premières secondes et que l'utilisateur n'a encore rien saisi ni
// cliqué, on l'applique sans demander (rien à perdre). Sinon : bandeau.
const OPENED_AT = Date.now();
let userInteracted = false;
['pointerdown', 'keydown', 'input'].forEach(evt => document.addEventListener(evt, () => { userInteracted = true; }, { once: true, capture: true }));

/** @param {ServiceWorker} worker */
function offerUpdate(worker) {
    if (!userInteracted && Date.now() - OPENED_AT < 10000) {
        updateRequested = true;
        worker.postMessage({ type: 'SKIP_WAITING' });
        return;
    }
    showUpdateBanner(worker);
}

function showUpdateBanner(worker) {
    if (document.getElementById('sw-update-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'sw-update-banner';
    banner.className = 'sw-update-banner';
    banner.innerHTML = `
        <span>Nouvelle version disponible</span>
        <button type="button" class="btn btn-primary" id="sw-update-btn">Mettre à jour</button>
        <button type="button" class="sw-update-dismiss" id="sw-update-dismiss" aria-label="Plus tard">✕</button>`;
    document.body.appendChild(banner);
    document.getElementById('sw-update-btn')?.addEventListener('click', () => {
        updateRequested = true;
        worker.postMessage({ type: 'SKIP_WAITING' });
    });
    document.getElementById('sw-update-dismiss')?.addEventListener('click', () => banner.remove());
}

function initServiceWorker() {
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!updateRequested || refreshing) return;
        refreshing = true;
        location.reload();
    });

    navigator.serviceWorker.register('sw.js').then(reg => {
        // Une version est déjà en attente (mise à jour détectée lors d'une
        // visite précédente, jamais activée)
        if (reg.waiting && navigator.serviceWorker.controller) {
            offerUpdate(reg.waiting);
        }
        reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (!newWorker) return;
            newWorker.addEventListener('statechange', () => {
                // installed + controller existant = mise à jour (pas 1ère install)
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    offerUpdate(newWorker);
                }
            });
        });
    }).catch(() => { /* PWA optionnelle */ });
}

// =============================================
// INITIALIZATION
// =============================================

function init() {
    // Migrations de schéma des données persistées — avant tout accès
    Storage.migrate();

    // Theme
    initTheme();

    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', e => {
            e.preventDefault();
            const page = item.dataset.page;
            if (page) navigateTo(page);
        });
    });

    // Stockage plein : les plus anciennes simulations ont été retirées — on prévient
    window.addEventListener('storage:purged', e => {
        const n = /** @type {CustomEvent} */ (e).detail?.removed || 0;
        showToast(`Stockage du navigateur plein : ${n} simulation${n > 1 ? 's' : ''} parmi les plus anciennes ${n > 1 ? 'ont été retirées' : 'a été retirée'} de l'Historique. Exportez ou synchronisez pour ne rien perdre.`, 'error');
    });

    // En-tête : client actif et parcours de mission ; l'accueil suit le dossier
    refreshContext = initContextBar(() => currentPage);
    window.addEventListener('dossier:change', () => {
        if (currentPage === 'dashboard') navigateTo('dashboard', { history: 'none' });
    });

    // Calculs lancés sur la page (rejoués au retour)
    const pc = document.getElementById('page-container');
    if (pc) FormState.trackActions(pc);

    // Theme toggle
    document.getElementById('toggle-theme')?.addEventListener('click', toggleTheme);

    // Modal
    initModal();

    // Mobile
    initMobileNav();

    // Handle browser back/forward
    // Le hash peut contenir un payload de partage (#credit?s=...) : la page est avant le '?'
    window.addEventListener('popstate', () => {
        const hash = (location.hash.slice(1) || 'dashboard').split('?')[0];
        navigateTo(hash, { history: 'none' });
    });

    // Lien de partage collé dans un onglet où l'app est déjà chargée :
    // le changement de hash seul ne recharge pas le document → on re-render
    // le module, dont l'init() lit le payload (?s=...).
    window.addEventListener('hashchange', () => {
        if (!location.hash.includes('?s=')) return;
        navigateTo(location.hash.slice(1).split('?')[0], { history: 'none' });
    });

    // Retour d'un lien de connexion cloud (#access_token=...) : capte la
    // session AVANT le routeur, nettoie l'URL et atterrit sur l'Historique.
    if (location.hash.includes('access_token=') || location.hash.includes('error_description=')) {
        const pending = Cloud.captureSessionFromHash();
        history.replaceState(null, '', location.pathname + '#history');
        pending.then(result => {
            if (result && 'email' in result) {
                showToast(result.email ? `Connecté : ${result.email}` : 'Connecté', 'success');
                if (currentPage === 'history') navigateTo('history');
            } else if (result?.error) {
                showToast(`Connexion impossible : ${result.error}`, 'error');
            }
        });
    }

    // Initial page from hash (la partie avant '?' — un payload de partage peut suivre)
    const initialPage = (location.hash.slice(1) || 'dashboard').split('?')[0];
    navigateTo(initialPage, { history: 'replace' });

    // Version affichée = version réelle
    const versionLabel = document.querySelector('.version-label');
    if (versionLabel) versionLabel.textContent = `v${APP_VERSION}`;

    // Champs montant formatés, puis noms accessibles des champs et boutons générés par les modules
    watchA11y(/** @type {HTMLElement[]} */ ([document.getElementById('page-container'), document.getElementById('modal-body')].filter(Boolean)), [enhanceAmounts, enhanceGlossary]);

    // Bibliothèques d'export (jsPDF, SheetJS) : après le premier affichage
    initExportLibs();

    // Autres modules préchargés au calme : la navigation reste instantanée
    setTimeout(() => Object.entries(loaders).forEach(([page, load]) => {
        if (!modules[page]) load().then(mod => { modules[page] = modules[page] || mod; }).catch(() => { /* rechargé au clic */ });
    }), 2500);

    // Service worker (PWA) — uniquement servi en http(s), ignoré en file://
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
        initServiceWorker();
    }

    console.log('%c Auxy Partners Finance Lab %c v' + APP_VERSION + ' ', 'background:#1a3548;color:#e8973f;padding:4px 8px;border-radius:4px 0 0 4px;font-weight:bold', 'background:#e8973f;color:#1a3548;padding:4px 8px;border-radius:0 4px 4px 0;font-weight:bold');
}

// Start app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
