/**
 * Auxy Partners - Finance Lab
 * Main Application Entry Point
 */

import { DashboardModule } from './modules/dashboard.js';
import { CreditModule } from './modules/credit.js';
import { StructuredModule } from './modules/structured.js';
import { BenchmarkModule } from './modules/benchmark.js';
import { CalculatorModule, StressTestModule } from './modules/tools.js';
import { HistoryModule } from './modules/history.js';
import { ImmobilierModule } from './modules/immobilier.js';
import { CovenantsModule } from './modules/covenants.js';
import { DebtProfileModule } from './modules/debtprofile.js';
import { Storage } from './utils/storage.js';
import { Cloud } from './utils/cloud.js';

// =============================================
// MODULE REGISTRY
// =============================================

const modules = {
    dashboard: DashboardModule,
    credit: CreditModule,
    structured: StructuredModule,
    benchmark: BenchmarkModule,
    immobilier: ImmobilierModule,
    covenants: CovenantsModule,
    debtprofile: DebtProfileModule,
    calculator: CalculatorModule,
    stress: StressTestModule,
    history: HistoryModule
};

let currentPage = 'dashboard';

// =============================================
// ROUTER
// =============================================

function navigateTo(page) {
    if (!modules[page]) page = 'dashboard';
    currentPage = page;

    // Update nav
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.page === page);
    });

    // Render page
    const container = document.getElementById('page-container');
    if (container) {
        container.innerHTML = modules[page].render();
        // Reset scroll
        document.getElementById('main-content')?.scrollTo(0, 0);
        // Re-run animation
        container.style.animation = 'none';
        container.offsetHeight; // Force reflow
        container.style.animation = '';
        // Initialize module
        modules[page].init?.();
    }

    // Update hash
    history.pushState(null, '', `#${page}`);

    // Close mobile sidebar
    document.getElementById('sidebar')?.classList.remove('open');
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
    toast.innerHTML = `${icons[type] || icons.info}<span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
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

    // Re-render current page to update charts
    if (modules[currentPage]) {
        const container = document.getElementById('page-container');
        if (container) {
            container.innerHTML = modules[currentPage].render();
            modules[currentPage].init?.();
        }
    }
}

// =============================================
// MODAL MANAGEMENT
// =============================================

function initModal() {
    document.getElementById('modal-close')?.addEventListener('click', () => {
        document.getElementById('modal-overlay')?.classList.add('hidden');
    });

    document.getElementById('modal-overlay')?.addEventListener('click', e => {
        if (e.target === e.currentTarget) {
            e.currentTarget.classList.add('hidden');
        }
    });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            document.getElementById('modal-overlay')?.classList.add('hidden');
        }
    });
}

// =============================================
// MOBILE NAVIGATION
// =============================================

function initMobileNav() {
    document.getElementById('menu-toggle')?.addEventListener('click', () => {
        document.getElementById('sidebar')?.classList.toggle('open');
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
            showUpdateBanner(reg.waiting);
        }
        reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (!newWorker) return;
            newWorker.addEventListener('statechange', () => {
                // installed + controller existant = mise à jour (pas 1ère install)
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    showUpdateBanner(newWorker);
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
        navigateTo(hash);
    });

    // Lien de partage collé dans un onglet où l'app est déjà chargée :
    // le changement de hash seul ne recharge pas le document → on re-render
    // le module, dont l'init() lit le payload (?s=...).
    window.addEventListener('hashchange', () => {
        if (!location.hash.includes('?s=')) return;
        navigateTo(location.hash.slice(1).split('?')[0]);
    });

    // Keyboard shortcut: Ctrl/Cmd + K for quick search (future feature)
    document.addEventListener('keydown', e => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            // Could open a command palette in the future
        }
    });

    // Retour d'un lien de connexion cloud (#access_token=...) : capte la
    // session AVANT le routeur, nettoie l'URL et atterrit sur l'Historique.
    if (location.hash.includes('access_token=') || location.hash.includes('error_description=')) {
        const result = Cloud.captureSessionFromHash();
        history.replaceState(null, '', location.pathname + '#history');
        if (result?.email) {
            setTimeout(() => showToast(`Connecté : ${result.email}`, 'success'), 400);
        } else if (result?.error) {
            setTimeout(() => showToast(`Connexion impossible : ${result.error}`, 'error'), 400);
        }
    }

    // Initial page from hash (la partie avant '?' — un payload de partage peut suivre)
    const initialPage = (location.hash.slice(1) || 'dashboard').split('?')[0];
    navigateTo(initialPage);

    // Service worker (PWA) — uniquement servi en http(s), ignoré en file://
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
        initServiceWorker();
    }

    console.log('%c Auxy Partners Finance Lab %c v1.0.0 ', 'background:#1a3548;color:#e8973f;padding:4px 8px;border-radius:4px 0 0 4px;font-weight:bold', 'background:#e8973f;color:#1a3548;padding:4px 8px;border-radius:0 4px 4px 0;font-weight:bold');
}

// Start app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
