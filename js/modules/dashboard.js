/**
 * Auxy Partners - Dashboard Module
 */

import { Financial } from '../utils/financial.js';
import { Storage } from '../utils/storage.js';
import { Market } from '../utils/market.js';
import { escapeHtml } from '../utils/sanitize.js';
import { Dossier } from '../utils/dossier.js';
import { MISSIONS, Mission } from '../utils/mission.js';
import { openDossierPicker } from '../utils/contextbar.js';

export const DashboardModule = {
    render() {
        const stats = Storage.getStats();
        const history = Storage.getHistory();
        const recent = history.slice(0, 5);

        const typeLabels = {
            constant: 'Amortissable',
            degressif: 'D\u00e9gressif',
            infine: 'In Fine',
            bpi: 'Pr\u00eat Bpifrance',
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

        const dossiers = Dossier.recent();
        const active = Dossier.get();
        const countFor = (/** @type {string} */ name) => history.filter(h => h.dossier === name).length;
        const lastFor = (/** @type {string} */ name) => history.find(h => h.dossier === name);
        const QUICK = [
            ['credit', 'Simulation Crédit', '<path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>'],
            ['structured', 'Financement Structuré', '<path d="M3 3v18h18"/><path d="M7 16l4-8 4 5 5-9"/>'],
            ['covenants', 'Covenants & DSCR', '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/>'],
            ['debtprofile', 'Profil de Dette', '<path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6"/><rect x="12" y="8" width="3" height="10"/><rect x="17" y="5" width="3" height="13"/>'],
            ['immobilier', 'Immobilier', '<path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"/>'],
            ['benchmark', 'Benchmark', '<path d="M18 20V10M12 20V4M6 20v-6"/>'],
            ['calculator', 'Calculatrice', '<rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/>'],
            ['stress', 'Stress Test', '<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>']
        ];

        return `
            <div class="page-header">
                <h1>Accueil</h1>
                <p>Reprenez un dossier client ou lancez un parcours de mission</p>
            </div>

            <div class="grid-2 section home-top">
                <!-- Dossiers récents -->
                <div class="card">
                    <div class="card-header">
                        <div class="card-title">Dossiers récents</div>
                        <button type="button" class="btn btn-ghost btn-sm" id="home-dossier-new">${dossiers.length ? 'Nouveau dossier' : 'Créer un dossier'}</button>
                    </div>
                    ${dossiers.length ? `
                        <ul class="home-dossiers">
                            ${dossiers.slice(0, 6).map(d => {
                                const last = lastFor(d.name);
                                const n = countFor(d.name);
                                const isActive = active?.name === d.name;
                                return `
                                <li class="home-dossier ${isActive ? 'active' : ''}">
                                    <div style="min-width:0">
                                        <div class="home-dossier-name">${escapeHtml(d.name)}</div>
                                        <div class="context-meta">${[
                                            d.ebitdaLtm != null ? `EBITDA ${Financial.formatNumber(d.ebitdaLtm, 0)} k€` : '',
                                            n ? `${n} analyse${n > 1 ? 's' : ''}` : 'aucune analyse enregistrée',
                                            last ? `dernière : ${escapeHtml(typeLabels[last.type] || last.type || '')} le ${new Date(last.date).toLocaleDateString('fr-FR')}` : ''
                                        ].filter(Boolean).join(' · ')}</div>
                                    </div>
                                    ${isActive ? '<span class="cov-badge ok">Actif</span>' : `<button type="button" class="btn btn-sm btn-outline" data-resume="${escapeHtml(d.name)}">Reprendre</button>`}
                                </li>`;
                            }).join('')}
                        </ul>` : `
                        <div class="empty-state" style="padding:20px 8px">
                            <p>Aucun dossier pour le moment.</p>
                            <p class="context-meta" style="margin-top:6px">Importez un Data Pack depuis Structuré, Covenants ou Profil de dette, ou créez un dossier.</p>
                        </div>`}
                </div>

                <!-- Parcours de mission -->
                <div class="card">
                    <div class="card-title">Lancer un parcours</div>
                    <div class="home-missions">
                        ${MISSIONS.map(m => `
                            <button type="button" class="home-mission" data-mission="${m.id}">
                                <span class="home-mission-label">${escapeHtml(m.label)}</span>
                                <span class="home-mission-desc">${escapeHtml(m.desc)}</span>
                                <span class="home-mission-steps">${m.steps.map(st => escapeHtml(st.label)).join(' → ')}</span>
                            </button>`).join('')}
                    </div>
                </div>
            </div>

            <!-- Taux de marché (peuplé en async par init si data/rates.json est disponible) -->
            <div class="card section" id="market-card" style="display:none">
                <div class="card-header">
                    <div class="card-title">Taux du jour</div>
                    <span class="market-updated" id="market-updated"></span>
                </div>
                <div class="market-grid" id="market-grid"></div>
            </div>

            <!-- Accès direct à tous les modules -->
            <div class="card section">
                <div class="card-title">Modules</div>
                <div class="home-quick">
                    ${QUICK.map(([page, label, icon]) => `
                        <a href="#${page}" class="btn btn-outline home-quick-item">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24" aria-hidden="true">${icon}</svg>
                            ${label}
                        </a>`).join('')}
                </div>
            </div>

            ${recent.length > 0 ? `
            <!-- Activité récente -->
            <div class="grid-2 section">
                <div class="card">
                    <div class="card-header">
                        <div class="card-title">Dernières simulations</div>
                        <a href="#history" class="btn btn-ghost btn-sm">Voir tout</a>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:12px">
                        ${recent.map(s => `
                            <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border-color)">
                                <div style="min-width:0">
                                    <div style="font-weight:600;font-size:0.9rem">${escapeHtml(s.name) || escapeHtml(s.typeLabel) || 'Simulation'}</div>
                                    <div style="font-size:0.8rem;color:var(--text-muted)">${s.dossier ? `${escapeHtml(s.dossier)} \u2022 ` : ''}${new Date(s.date).toLocaleDateString('fr-FR')}</div>
                                </div>
                                <span class="badge badge-blue">${typeLabels[s.type] || escapeHtml(s.type)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div class="card">
                    <div class="card-title">Activité</div>
                    <div class="home-stats">
                        <div><div class="kpi-label">Simulations</div><div class="kpi-value">${stats.totalSimulations}</div></div>
                        <div><div class="kpi-label">Analyses de structuration</div><div class="kpi-value">${(stats.byType.structured || 0) + (stats.byType.covenants || 0) + (stats.byType.debtprofile || 0)}</div></div>
                        <div><div class="kpi-label">Volume simulé</div><div class="kpi-value">${stats.totalAmount > 0 ? Financial.formatCurrency(stats.totalAmount, 0) : '\u2014'}</div></div>
                    </div>
                    <div style="margin-top:16px;display:flex;flex-direction:column;gap:12px">
                        ${Object.entries(stats.byType).map(([type, count]) => {
                            const pct = (count / stats.totalSimulations * 100).toFixed(0);
                            return `
                                <div>
                                    <div style="display:flex;justify-content:space-between;margin-bottom:4px;font-size:0.85rem">
                                        <span>${typeLabels[type] || escapeHtml(type)}</span>
                                        <span style="color:var(--text-muted)">${count} (${pct}\u00a0%)</span>
                                    </div>
                                    <div class="progress-bar">
                                        <div class="progress-fill" style="width:${pct}%"></div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            </div>` : ''}
        `;
    },

    init() {
        // Quick action links
        // Limité au contenu de la page : la barre latérale a ses propres
        // écouteurs (sinon chaque visite du Dashboard en ajoutait un de plus)
        document.querySelectorAll('#page-container a[href^="#"]').forEach(link => {
            link.addEventListener('click', e => {
                e.preventDefault();
                const page = link.getAttribute('href').slice(1);
                if (page) window.navigateTo?.(page);
            });
        });

        // Reprise d'un dossier, nouveau dossier, parcours
        document.querySelectorAll('#page-container [data-resume]').forEach(btn => btn.addEventListener('click', () => {
            const name = /** @type {HTMLElement} */ (btn).dataset.resume || '';
            // l'accueil se redessine sur l'événement dossier:change (app.js)
            if (Dossier.activate(name)) window.showToast?.(`Dossier « ${name} » actif`, 'success');
        }));
        document.getElementById('home-dossier-new')?.addEventListener('click', () => openDossierPicker());
        document.querySelectorAll('#page-container [data-mission]').forEach(btn => btn.addEventListener('click', () => {
            Mission.start(/** @type {HTMLElement} */ (btn).dataset.mission || '');
        }));

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
            .map(({ key, r }) => {
                const note = Market.rateNote(data, key);
                return `
                <div class="market-tile">
                    <div class="market-tile-label">${escapeHtml(r.label)}</div>
                    <div class="market-tile-value">${Financial.formatNumber(r.value, 2)} %</div>
                    ${note ? `<div class="market-tile-note" style="font-size:0.7rem;color:${/moyenne|au \d/.test(note) ? 'var(--warning)' : 'var(--text-muted)'}">${escapeHtml(note)}</div>` : ''}
                </div>`;
            });
        if (tiles.length === 0) return;

        grid.innerHTML = tiles.join('');
        const updated = Market.formatUpdatedAt(data);
        const updatedEl = document.getElementById('market-updated');
        if (updatedEl && updated) updatedEl.textContent = `Mise à jour : ${updated}`;
        card.style.display = '';
    }
};
