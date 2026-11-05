/**
 * Auxy Partners - Bandeau de KPI fixe
 *
 * Structuré, Covenants et Profil de dette font 3 à 4 écrans : on modifiait
 * un EBITDA en haut et le verdict était deux écrans plus bas. Ce bandeau
 * reste collé en haut de la zone de travail et recopie en direct les KPI
 * clés du module. Il s'efface quand les cartes KPI d'origine sont à l'écran
 * (pas de doublon) ; un clic y ramène.
 */

/** KPI recopiés, par page (id des valeurs dans le module) */
const PAGES = /** @type {Record<string, string[]>} */ ({
    covenants: ['cov-kpi-status', 'cov-kpi-dscr', 'cov-kpi-lev', 'cov-kpi-headroom'],
    structured: ['kpi-ve', 'kpi-df-closing', 'kpi-dfn', 'kpi-levier'],
    debtprofile: ['dp-kpi-expo', 'dp-kpi-service', 'dp-kpi-rate', 'dp-kpi-wal']
});

/** @type {MutationObserver | null} */
let mo = null;
/** @type {IntersectionObserver | null} */
let io = null;

function teardown() {
    mo?.disconnect(); mo = null;
    io?.disconnect(); io = null;
    document.getElementById('kpi-sticky')?.remove();
}

/**
 * À appeler après le rendu de chaque page.
 * @param {string} page
 * @param {HTMLElement} container
 */
export function mountKpiBar(page, container) {
    teardown();
    const ids = PAGES[page];
    if (!ids) return;

    const bar = document.createElement('div');
    bar.id = 'kpi-sticky';
    bar.className = 'kpi-sticky';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Indicateurs clés');
    bar.tabIndex = -1;
    const header = container.querySelector('.page-header');
    if (header) header.after(bar); else container.prepend(bar);

    const grid = () => document.getElementById(ids[0])?.closest('.er-kpi-grid');

    const refresh = () => {
        const items = ids.map(id => {
            const el = document.getElementById(id);
            if (!el) return '';
            const label = el.closest('.er-kpi-card')?.querySelector('.kpi-label')?.textContent?.trim() || '';
            // contenu déjà rendu (et échappé) par le module
            return `<div class="kpi-sticky-item"><span class="kpi-sticky-label">${label.replace(/</g, '&lt;')}</span><span class="kpi-sticky-value">${el.innerHTML}</span></div>`;
        }).join('');
        if (bar.innerHTML !== items) bar.innerHTML = items;
    };

    let timer = 0;
    mo = new MutationObserver(muts => {
        if (muts.every(m => bar.contains(m.target))) return;
        clearTimeout(timer);
        timer = window.setTimeout(refresh, 30);
    });
    mo.observe(container, { childList: true, subtree: true, characterData: true });
    refresh();

    const target = grid();
    if (target && 'IntersectionObserver' in window) {
        io = new IntersectionObserver(([entry]) => {
            bar.classList.toggle('kpi-sticky-hidden', entry.isIntersecting);
        }, { root: document.getElementById('main-content'), threshold: 0.2 });
        io.observe(target);
    }

    bar.addEventListener('click', () => grid()?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
}
