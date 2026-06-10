/**
 * Auxy Partners - Dashboard Module
 */

import { Financial } from '../utils/financial.js';
import { Storage } from '../utils/storage.js';
import { Market } from '../utils/market.js';
import { escapeHtml } from '../utils/sanitize.js';

export const DashboardModule = {
    render() {
        const stats = Storage.getStats();
        const history = Storage.getHistory();
        const recent = history.slice(0, 5);

        const typeLabels = {
            constant: 'Amortissable',
            degressif: 'D\u00e9gressif',
            infine: 'In Fine',
            creditbail: 'Cr\u00e9dit-Bail',
            revolving: 'Revolving',
            relais: 'Pr\u00eat Relais',
            mezzanine: 'Mezzanine',
            structured: 'Structur\u00e9',
            tranching: 'Tranching',
            immobilier: 'Immobilier',
            covenants: 'Covenants',
            debtprofile: 'Profil de Dette'
        };

        return `
            <div class="page-header">
                <h1>Dashboard</h1>
                <p>Vue d'ensemble de votre activit\u00e9 de simulation</p>
            </div>

            <!-- KPIs -->
            <div class="grid-4 section">
                <div class="kpi-card">
                    <div class="kpi-icon blue">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    </div>
                    <div class="kpi-content">
                        <div class="kpi-label">Simulations</div>
                        <div class="kpi-value">${stats.totalSimulations}</div>
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-icon orange">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>
                    </div>
                    <div class="kpi-content">
                        <div class="kpi-label">Benchmarks</div>
                        <div class="kpi-value">${stats.totalBenchmarks}</div>
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-icon green">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
                    </div>
                    <div class="kpi-content">
                        <div class="kpi-label">Volume simul\u00e9</div>
                        <div class="kpi-value">${stats.totalAmount > 0 ? Financial.formatCurrency(stats.totalAmount, 0) : '\u2014'}</div>
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-icon blue">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    </div>
                    <div class="kpi-content">
                        <div class="kpi-label">Derni\u00e8re simulation</div>
                        <div class="kpi-value" style="font-size:1rem">${stats.lastSimulation ? new Date(stats.lastSimulation.date).toLocaleDateString('fr-FR') : 'Aucune'}</div>
                    </div>
                </div>
            </div>

            <!-- Taux de march\u00e9 (peupl\u00e9 en async par init si data/rates.json est disponible) -->
            <div class="card section" id="market-card" style="display:none">
                <div class="card-header">
                    <div class="card-title">Taux du jour</div>
                    <span class="market-updated" id="market-updated"></span>
                </div>
                <div class="market-grid" id="market-grid"></div>
            </div>

            <!-- Quick Actions -->
            <div class="card section">
                <div class="card-title">Acc\u00e8s rapide</div>
                <div class="grid-4" style="margin-top:16px">
                    <a href="#credit" class="btn btn-outline" style="padding:20px;flex-direction:column;gap:8px;text-align:center">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="28" height="28"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
                        Simulation Cr\u00e9dit
                    </a>
                    <a href="#structured" class="btn btn-outline" style="padding:20px;flex-direction:column;gap:8px;text-align:center">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="28" height="28"><path d="M3 3v18h18"/><path d="M7 16l4-8 4 5 5-9"/></svg>
                        Financement Structur\u00e9
                    </a>
                    <a href="#benchmark" class="btn btn-outline" style="padding:20px;flex-direction:column;gap:8px;text-align:center">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="28" height="28"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>
                        Benchmark
                    </a>
                    <a href="#calculator" class="btn btn-outline" style="padding:20px;flex-direction:column;gap:8px;text-align:center">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="28" height="28"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/></svg>
                        Calculatrice
                    </a>
                </div>
            </div>

            <!-- Recent Activity -->
            <div class="grid-2 section">
                <div class="card">
                    <div class="card-header">
                        <div class="card-title">Derni\u00e8res simulations</div>
                        <a href="#history" class="btn btn-ghost btn-sm">Voir tout</a>
                    </div>
                    ${recent.length > 0 ? `
                        <div style="display:flex;flex-direction:column;gap:12px">
                            ${recent.map(s => `
                                <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border-color)">
                                    <div>
                                        <div style="font-weight:600;font-size:0.9rem">${escapeHtml(s.name) || escapeHtml(s.typeLabel) || 'Simulation'}</div>
                                        <div style="font-size:0.8rem;color:var(--text-muted)">${typeLabels[s.type] || escapeHtml(s.type)} \u2022 ${new Date(s.date).toLocaleDateString('fr-FR')}</div>
                                    </div>
                                    <span class="badge badge-blue">${typeLabels[s.type] || escapeHtml(s.type)}</span>
                                </div>
                            `).join('')}
                        </div>
                    ` : `
                        <div class="empty-state">
                            <p>Aucune simulation pour le moment</p>
                            <a href="#credit" class="btn btn-primary btn-sm" style="margin-top:12px">Cr\u00e9er une simulation</a>
                        </div>
                    `}
                </div>

                <div class="card">
                    <div class="card-title">R\u00e9partition par type</div>
                    ${Object.keys(stats.byType).length > 0 ? `
                        <div style="margin-top:16px;display:flex;flex-direction:column;gap:12px">
                            ${Object.entries(stats.byType).map(([type, count]) => {
                                const pct = (count / stats.totalSimulations * 100).toFixed(0);
                                return `
                                    <div>
                                        <div style="display:flex;justify-content:space-between;margin-bottom:4px;font-size:0.85rem">
                                            <span>${typeLabels[type] || type}</span>
                                            <span style="color:var(--text-muted)">${count} (${pct}%)</span>
                                        </div>
                                        <div class="progress-bar">
                                            <div class="progress-fill" style="width:${pct}%"></div>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    ` : `
                        <div class="empty-state" style="padding:24px">
                            <p>Pas de donn\u00e9es disponibles</p>
                        </div>
                    `}
                </div>
            </div>
        `;
    },

    init() {
        // Quick action links
        document.querySelectorAll('a[href^="#"]').forEach(link => {
            link.addEventListener('click', e => {
                e.preventDefault();
                const page = link.getAttribute('href').slice(1);
                if (page) window.navigateTo?.(page);
            });
        });

        // Taux du jour (data/rates.json publié par la veille quotidienne)
        this._loadMarketRates();
    },

    async _loadMarketRates() {
        const data = await Market.getRates();
        const card = document.getElementById('market-card');
        const grid = document.getElementById('market-grid');
        if (!data?.rates || !card || !grid) return;

        const ORDER = ['euribor_3m', 'euribor_12m', 'oat_10y', 'bund_10y', 'ust_10y'];
        const keys = [...ORDER.filter(k => data.rates[k]), ...Object.keys(data.rates).filter(k => !ORDER.includes(k))];
        const tiles = keys
            .map(k => ({ key: k, r: data.rates[k] }))
            .filter(({ r }) => r && typeof r.value === 'number' && isFinite(r.value))
            .map(({ r }) => `
                <div class="market-tile">
                    <div class="market-tile-label">${escapeHtml(r.label)}</div>
                    <div class="market-tile-value">${Financial.formatNumber(r.value, 2)} %</div>
                </div>`);
        if (tiles.length === 0) return;

        grid.innerHTML = tiles.join('');
        const updated = Market.formatUpdatedAt(data);
        const updatedEl = document.getElementById('market-updated');
        if (updatedEl && updated) updatedEl.textContent = `Mise à jour : ${updated}`;
        card.style.display = '';
    }
};
