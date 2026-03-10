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
import { Storage } from './utils/storage.js';

// =============================================
// MODULE REGISTRY
// =============================================

const modules = {
    dashboard: DashboardModule,
    credit: CreditModule,
    structured: StructuredModule,
    benchmark: BenchmarkModule,
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
// INITIALIZATION
// =============================================

function init() {
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
    window.addEventListener('popstate', () => {
        const hash = location.hash.slice(1) || 'dashboard';
        navigateTo(hash);
    });

    // Keyboard shortcut: Ctrl/Cmd + K for quick search (future feature)
    document.addEventListener('keydown', e => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            // Could open a command palette in the future
        }
    });

    // Initial page from hash
    const initialPage = location.hash.slice(1) || 'dashboard';
    navigateTo(initialPage);

    console.log('%c Auxy Partners Finance Lab %c v1.0.0 ', 'background:#1a3548;color:#e8973f;padding:4px 8px;border-radius:4px 0 0 4px;font-weight:bold', 'background:#e8973f;color:#1a3548;padding:4px 8px;border-radius:0 4px 4px 0;font-weight:bold');
}

// Start app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
