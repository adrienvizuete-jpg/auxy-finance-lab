/**
 * Auxy Partners - History Module (v2 - Labels FR, reload, notes)
 */

import { Financial } from '../utils/financial.js';
import { Storage } from '../utils/storage.js';
import { Export } from '../utils/export.js';
import { PARAM_LABELS, RESULT_LABELS, TYPE_LABELS, t, formatValue } from '../utils/i18n.js';

function renderHistory() {
    const history = Storage.getHistory();

    if (history.length === 0) {
        return `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                <h3>Aucune simulation sauvegard\u00e9e</h3>
                <p>Vos simulations sauvegard\u00e9es appara\u00eetront ici</p>
                <a href="#credit" class="btn btn-primary btn-sm" style="margin-top:16px" onclick="event.preventDefault(); window.navigateTo?.('credit')">Cr\u00e9er une simulation</a>
            </div>
        `;
    }

    return `
        <div class="card">
            <div class="card-header">
                <div>
                    <div class="card-title">${history.length} simulation${history.length > 1 ? 's' : ''} sauvegard\u00e9e${history.length > 1 ? 's' : ''}</div>
                </div>
                <button class="btn btn-danger btn-sm" id="clear-history">Tout supprimer</button>
            </div>
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Type</th>
                            <th>Nom</th>
                            <th>Montant</th>
                            <th style="min-width:160px;text-align:center">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${history.map(s => {
                            const amount = s.params?.principal || s.params?.assetValue || s.params?.creditLine || s.params?.bridgeAmount || s.params?.totalDebt || s.results?.totalEmplois || 0;
                            return `
                                <tr>
                                    <td style="white-space:nowrap">${new Date(s.date).toLocaleDateString('fr-FR')} ${new Date(s.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</td>
                                    <td><span class="badge badge-blue">${TYPE_LABELS[s.type] || s.type}</span></td>
                                    <td style="font-weight:600">${s.name || '\u2014'}</td>
                                    <td class="number">${Financial.formatCurrency(amount)}</td>
                                    <td>
                                        <div class="btn-group" style="justify-content:center">
                                            <button class="btn btn-ghost btn-sm view-sim" data-id="${s.id}" title="Voir les d\u00e9tails">
                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                            </button>
                                            <button class="btn btn-ghost btn-sm reload-sim" data-id="${s.id}" title="Recharger dans le simulateur">
                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
                                            </button>
                                            <button class="btn btn-ghost btn-sm export-sim" data-id="${s.id}" title="Exporter en Excel">
                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                            </button>
                                            <button class="btn btn-ghost btn-sm delete-sim" data-id="${s.id}" title="Supprimer" style="color:var(--danger)">
                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                                ${s.notes ? `<tr><td colspan="5" style="padding:4px 16px 12px;font-size:0.82rem;color:var(--text-muted);border-bottom:1px solid var(--border-color)"><em>Note : ${s.notes}</em></td></tr>` : ''}
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function showSimDetails(id) {
    const sim = Storage.getSimulation(id);
    if (!sim) return;

    const modal = document.getElementById('modal-overlay');
    const body = document.getElementById('modal-body');

    let html = `
        <h2 style="margin-bottom:4px">${sim.name || 'Simulation'}</h2>
        <p style="color:var(--text-muted);margin-bottom:24px;font-size:0.9rem">
            ${TYPE_LABELS[sim.type] || sim.type} &bull; ${new Date(sim.date).toLocaleDateString('fr-FR')} \u00e0 ${new Date(sim.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </p>
    `;

    // Notes
    if (sim.notes) {
        html += `<div style="background:var(--accent-100);padding:12px 16px;border-radius:var(--radius-md);margin-bottom:20px;font-size:0.9rem;color:var(--accent-600)"><strong>Note :</strong> ${sim.notes}</div>`;
    }

    // Param\u00e8tres
    if (sim.params) {
        html += `<h3 class="section-title" style="margin-bottom:12px">Param\u00e8tres</h3>`;
        html += `<div class="table-container" style="margin-bottom:24px"><table class="data-table"><tbody>`;
        const p = sim.params;
        Object.entries(p).forEach(([key, value]) => {
            // Skip redundant insurance params
            if (key === 'insuranceMonthly' && p.insuranceRate > 0) return;
            if ((key === 'insuranceRate' || key === 'insuranceMode') && (!p.insuranceRate || p.insuranceRate === 0)) return;
            const label = t(key, PARAM_LABELS);
            const formatted = formatValue(key, value);
            html += `<tr><td style="font-weight:600;color:var(--text-secondary)">${label}</td><td class="number" style="font-weight:600">${formatted}</td></tr>`;
        });
        html += `</tbody></table></div>`;
    }

    // R\u00e9sultats
    if (sim.results) {
        html += `<h3 class="section-title" style="margin-bottom:12px">R\u00e9sultats</h3>`;
        html += `<div class="results-panel"><div class="results-grid">`;
        Object.entries(sim.results).forEach(([key, value]) => {
            if (typeof value === 'object' || key === 'schedule') return;
            const label = t(key, RESULT_LABELS);
            const formatted = formatValue(key, value);
            html += `<div class="result-item"><div class="result-label">${label}</div><div class="result-value" style="font-size:1.1rem">${formatted}</div></div>`;
        });
        html += `</div></div>`;
    }

    // Actions
    html += `
        <div class="btn-group" style="margin-top:24px;justify-content:center">
            <button class="btn btn-outline modal-reload" data-id="${id}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
                Recharger dans le simulateur
            </button>
            <button class="btn btn-accent modal-export" data-id="${id}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                Exporter Excel
            </button>
        </div>
    `;

    body.innerHTML = html;
    modal.classList.remove('hidden');

    // Modal action handlers
    body.querySelector('.modal-reload')?.addEventListener('click', () => {
        modal.classList.add('hidden');
        reloadSimulation(id);
    });
    body.querySelector('.modal-export')?.addEventListener('click', () => {
        const s = Storage.getSimulation(id);
        if (s) Export.fullReportExcel(s);
    });
}

function reloadSimulation(id) {
    const sim = Storage.getSimulation(id);
    if (!sim) return;

    // Navigate to the appropriate page
    const page = sim.type === 'structured' ? 'structured' : 'credit';
    window.navigateTo?.(page);

    // Store params to be loaded after navigation
    window._pendingReload = sim;
    window.showToast?.('Simulation recharg\u00e9e \u2014 les param\u00e8tres ont \u00e9t\u00e9 restaur\u00e9s', 'success');
}

export const HistoryModule = {
    render() {
        return `
            <div class="page-header">
                <h1>Historique</h1>
                <p>Retrouvez toutes vos simulations sauvegard\u00e9es</p>
            </div>
            <div id="history-content">
                ${renderHistory()}
            </div>
        `;
    },

    init() {
        const content = document.getElementById('history-content');
        if (!content) return;

        content.addEventListener('click', e => {
            // View details
            const viewBtn = e.target.closest('.view-sim');
            if (viewBtn) {
                showSimDetails(viewBtn.dataset.id);
                return;
            }

            // Reload simulation
            const reloadBtn = e.target.closest('.reload-sim');
            if (reloadBtn) {
                reloadSimulation(reloadBtn.dataset.id);
                return;
            }

            // Export
            const exportBtn = e.target.closest('.export-sim');
            if (exportBtn) {
                const sim = Storage.getSimulation(exportBtn.dataset.id);
                if (sim) Export.fullReportExcel(sim);
                return;
            }

            // Delete
            const deleteBtn = e.target.closest('.delete-sim');
            if (deleteBtn) {
                if (confirm('Supprimer cette simulation ?')) {
                    Storage.deleteSimulation(deleteBtn.dataset.id);
                    content.innerHTML = renderHistory();
                    window.showToast?.('Simulation supprim\u00e9e', 'info');
                }
                return;
            }

            // Clear all
            if (e.target.closest('#clear-history')) {
                if (confirm('\u00cates-vous s\u00fbr de vouloir supprimer tout l\'historique ?')) {
                    Storage.clearHistory();
                    content.innerHTML = renderHistory();
                    window.showToast?.('Historique effac\u00e9', 'info');
                }
            }
        });
    }
};
