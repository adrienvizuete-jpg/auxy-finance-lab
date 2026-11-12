/**
 * Auxy Partners - Financial Calculator & Stress Test Modules
 */

import { Financial } from '../utils/financial.js';
import { Charts } from '../utils/charts.js';
import { Export } from '../utils/export.js';
import { Fmt } from '../utils/format.js';
import { Handoff } from '../utils/handoff.js';
import * as FormState from '../utils/formstate.js';
import { Storage } from '../utils/storage.js';
import { Dialog } from '../utils/dialog.js';

// =============================================
// FINANCIAL CALCULATOR
// =============================================

export const CalculatorModule = {
    render() {
        return `
            <div class="page-header">
                <h1>Calculatrice Financi\u00e8re</h1>
                <p>VAN, TRI, WACC et taux effectif</p>
            </div>
            <p class="context-meta" style="margin:-8px 0 16px">Le calcul d'une mensualité se fait dans <a href="#credit" data-nav="credit">Simulation Crédit</a> (échéancier, TEG, envoi vers les autres modules) ; DSCR, ICR et levier dans <a href="#covenants" data-nav="covenants">Covenants &amp; DSCR</a>.</p>

            <div class="grid-2 section">
                <!-- NPV Calculator -->
                <div class="card">
                    <div class="card-title">Valeur Actuelle Nette (VAN)</div>
                    <div class="form-group" style="margin-top:12px">
                        <label class="form-label">Taux d'actualisation (%)</label>
                        <input type="number" class="form-input" id="calc-npv-rate" value="8" step="0.5">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Flux de tr\u00e9sorerie (un par ligne, investissement initial n\u00e9gatif)</label>
                        <textarea class="form-input" id="calc-npv-flows" rows="5" style="font-family:monospace" placeholder="-1000000\n300000\n350000\n400000\n450000">-1000000\n300000\n350000\n400000\n450000</textarea>
                    </div>
                    <button class="btn btn-primary btn-sm" id="calc-npv-btn">Calculer</button>
                    <div id="calc-npv-result" class="results-panel" style="margin-top:12px;display:none"></div>
                </div>

                <!-- IRR Calculator -->
                <div class="card">
                    <div class="card-title">Taux de Rendement Interne (TRI)</div>
                    <div class="form-group" style="margin-top:12px">
                        <label class="form-label">Flux de tr\u00e9sorerie (un par ligne)</label>
                        <textarea class="form-input" id="calc-irr-flows" rows="5" style="font-family:monospace" placeholder="-500000\n150000\n175000\n200000\n225000">-500000\n150000\n175000\n200000\n225000</textarea>
                    </div>
                    <button class="btn btn-primary btn-sm" id="calc-irr-btn">Calculer</button>
                    <div id="calc-irr-result" class="results-panel" style="margin-top:12px;display:none"></div>
                </div>

                <!-- WACC Calculator -->
                <div class="card">
                    <div class="card-title">WACC (Co\u00fbt Moyen Pond\u00e9r\u00e9 du Capital)</div>
                    <div class="form-row" style="margin-top:12px">
                        <div class="form-group">
                            <label class="form-label">Dette (\u20ac)</label>
                            <input type="number" class="form-input" id="calc-wacc-debt" value="3000000" step="100000">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Fonds propres (\u20ac)</label>
                            <input type="number" class="form-input" id="calc-wacc-equity" value="2000000" step="100000">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label class="form-label">Co\u00fbt dette (%)</label>
                            <input type="number" class="form-input" id="calc-wacc-rd" value="5.0" step="0.25">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Co\u00fbt FP (%)</label>
                            <input type="number" class="form-input" id="calc-wacc-re" value="12.0" step="0.5">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Taux IS (%)</label>
                            <input type="number" class="form-input" id="calc-wacc-tax" value="25" step="1">
                        </div>
                    </div>
                    <button class="btn btn-primary btn-sm" id="calc-wacc-btn">Calculer</button>
                    <div id="calc-wacc-result" class="results-panel" style="margin-top:12px;display:none"></div>
                </div>

                <!-- Effective Rate -->
                <div class="card">
                    <div class="card-title">Taux Effectif Annuel</div>
                    <div class="form-row" style="margin-top:12px">
                        <div class="form-group">
                            <label class="form-label">Taux nominal (%)</label>
                            <input type="number" class="form-input" id="calc-eff-rate" value="4.5" step="0.1">
                        </div>
                        <div class="form-group">
                            <label class="form-label">P\u00e9riodes/an</label>
                            <select class="form-select" id="calc-eff-periods">
                                <option value="12" selected>Mensuel (12)</option>
                                <option value="4">Trimestriel (4)</option>
                                <option value="2">Semestriel (2)</option>
                                <option value="1">Annuel (1)</option>
                                <option value="365">Journalier (365)</option>
                            </select>
                        </div>
                    </div>
                    <button class="btn btn-primary btn-sm" id="calc-eff-btn">Calculer</button>
                    <div id="calc-eff-result" class="results-panel" style="margin-top:12px;display:none"></div>
                </div>
            </div>
        `;
    },

    init() {
        document.querySelectorAll('#page-container [data-nav]').forEach(link => link.addEventListener('click', e => {
            e.preventDefault();
            window.navigateTo?.(/** @type {HTMLElement} */ (link).dataset.nav || 'dashboard');
        }));

        // NPV
        document.getElementById('calc-npv-btn')?.addEventListener('click', () => {
            const rate = parseFloat(document.getElementById('calc-npv-rate').value) / 100;
            // Une ligne par flux, format français admis (« -1 000 000 », « 250 000,50 »)
            const lines = document.getElementById('calc-npv-flows').value.split('\n').filter(v => v.trim());
            const flows = lines.map(v => Financial.parseNumber(v)).filter(v => !isNaN(v));
            if (flows.length < lines.length) window.showToast?.(`${lines.length - flows.length} ligne(s) illisible(s) ignorée(s)`, 'warning');
            if (flows.length < 2) { window.showToast?.('Saisissez au moins deux flux (un par ligne)', 'warning'); return; }
            const npv = flows[0] + Financial.npv(rate, flows.slice(1));
            document.getElementById('calc-npv-result').style.display = 'block';
            document.getElementById('calc-npv-result').innerHTML = `
                <div class="results-grid">
                    <div class="result-item"><div class="result-label">VAN</div><div class="result-value" style="color:${npv >= 0 ? 'var(--success)' : 'var(--danger)'}">${Financial.formatCurrency(npv)}</div></div>
                    <div class="result-item"><div class="result-label">D\u00e9cision</div><div class="result-value" style="font-size:1rem">${npv >= 0 ? 'Projet rentable' : 'Projet non rentable'}</div></div>
                </div>
            `;
        });

        // IRR
        document.getElementById('calc-irr-btn')?.addEventListener('click', () => {
            const lines = document.getElementById('calc-irr-flows').value.split('\n').filter(v => v.trim());
            const flows = lines.map(v => Financial.parseNumber(v)).filter(v => !isNaN(v));
            if (flows.length < lines.length) window.showToast?.(`${lines.length - flows.length} ligne(s) illisible(s) ignorée(s)`, 'warning');
            if (flows.length < 2) { window.showToast?.('Saisissez au moins deux flux (un par ligne)', 'warning'); return; }
            let irr;
            try {
                irr = Financial.irr(flows) * 100;
            } catch {
                window.showToast?.('TRI non calculable : ces flux n\u2019admettent pas de taux unique (vérifiez les signes)', 'error');
                return;
            }
            document.getElementById('calc-irr-result').style.display = 'block';
            document.getElementById('calc-irr-result').innerHTML = `
                <div class="results-grid">
                    <div class="result-item"><div class="result-label">TRI</div><div class="result-value">${Financial.formatPercent(irr)}</div></div>
                </div>
            `;
        });

        // WACC
        document.getElementById('calc-wacc-btn')?.addEventListener('click', () => {
            const debt = parseFloat(document.getElementById('calc-wacc-debt').value);
            const equity = parseFloat(document.getElementById('calc-wacc-equity').value);
            const rd = parseFloat(document.getElementById('calc-wacc-rd').value) / 100;
            const re = parseFloat(document.getElementById('calc-wacc-re').value) / 100;
            const tax = parseFloat(document.getElementById('calc-wacc-tax').value);
            const wacc = Financial.wacc({ debtAmount: debt, equityAmount: equity, costOfDebt: rd, costOfEquity: re, taxRate: tax });
            const total = debt + equity;
            document.getElementById('calc-wacc-result').style.display = 'block';
            document.getElementById('calc-wacc-result').innerHTML = `
                <div class="results-grid">
                    <div class="result-item"><div class="result-label">WACC</div><div class="result-value">${Financial.formatPercent(wacc * 100)}</div></div>
                    <div class="result-item"><div class="result-label">Poids dette</div><div class="result-value">${Financial.formatPercent(debt / total * 100)}</div></div>
                    <div class="result-item"><div class="result-label">Poids FP</div><div class="result-value">${Financial.formatPercent(equity / total * 100)}</div></div>
                </div>
            `;
        });

        // Effective Rate
        document.getElementById('calc-eff-btn')?.addEventListener('click', () => {
            const rate = parseFloat(document.getElementById('calc-eff-rate').value) / 100;
            const periods = parseInt(document.getElementById('calc-eff-periods').value);
            const eff = Financial.effectiveRate(rate, periods);
            document.getElementById('calc-eff-result').style.display = 'block';
            document.getElementById('calc-eff-result').innerHTML = `
                <div class="results-grid">
                    <div class="result-item"><div class="result-label">Taux nominal</div><div class="result-value">${Financial.formatPercent(rate * 100)}</div></div>
                    <div class="result-item"><div class="result-label">Taux effectif</div><div class="result-value">${Financial.formatPercent(eff * 100)}</div></div>
                    <div class="result-item"><div class="result-label">\u00c9cart</div><div class="result-value">${Financial.formatPercent((eff - rate) * 100)}</div></div>
                </div>
            `;
        });
    }
};

// =============================================
// STRESS TEST MODULE
// =============================================

export const StressTestModule = {
    _lastAnalysis: null,

    render() {
        // Analyse rechargée depuis l'Historique : mêmes champs, grille relancée
        const reloaded = /** @type {any} */ (window)._pendingReload;
        if (reloaded?.type === 'stress' && reloaded.params) {
            /** @type {any} */ (window)._pendingReload = null;
            const p = reloaded.params;
            /** @type {Record<string, string>} */
            const values = {};
            /** @type {Array<[string, unknown]>} */ ([['st-principal', p.principal], ['st-rate', p.annualRate], ['st-duration', p.durationMonths], ['st-insurance', p.insuranceMonthly], ['st-frequency', p.frequency], ['st-rate-min', p.rateMin], ['st-rate-max', p.rateMax], ['st-rate-step', p.rateStep]])
                .forEach(([id, v]) => { if (v != null && v !== '' && !(typeof v === 'number' && isNaN(v))) values[id] = String(v); });
            FormState.prefill('stress', values, ['click:st-run']);
        }
        // Prêt reçu de Crédit : champs pré-remplis et grille de sensibilité lancée
        const incoming = Handoff.take('stress')[0];
        if (incoming) {
            FormState.prefill('stress', { 'st-principal': String(incoming.amount), 'st-rate': String(incoming.rate), 'st-duration': String(incoming.durationMonths) }, ['click:st-run']);
        }
        return `
            <div class="page-header">
                <h1>Stress Test</h1>
                <p>Analyse de sensibilit\u00e9 — Impact des variations de taux et de dur\u00e9e sur le co\u00fbt du cr\u00e9dit</p>
            </div>

            <div class="card section">
                <div class="card-title">Param\u00e8tres de base</div>
                <div class="form-row" style="margin-top:12px">
                    <div class="form-group">
                        <label class="form-label">Montant (\u20ac)</label>
                        <input type="number" class="form-input" id="st-principal" value="500000" step="50000">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Taux de base (%)</label>
                        <input type="number" class="form-input" id="st-rate" value="4.5" step="0.25">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Dur\u00e9e de base (mois)</label>
                        <input type="number" class="form-input" id="st-duration" value="84" step="12">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Assurance/mois (\u20ac)</label>
                        <input type="number" class="form-input" id="st-insurance" value="0" step="10">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Fr\u00e9quence</label>
                        <select class="form-select" id="st-frequency">
                            <option value="monthly" selected>Mensuel</option>
                            <option value="quarterly">Trimestriel</option>
                            <option value="semiannual">Semestriel</option>
                            <option value="annual">Annuel</option>
                        </select>
                    </div>
                </div>

                <div class="card-title" style="margin-top:20px;font-size:0.95rem">Plage de variation du taux</div>
                <div class="form-row" style="margin-top:8px">
                    <div class="form-group">
                        <label class="form-label">Variation min (pts)</label>
                        <input type="number" class="form-input" id="st-rate-min" value="-0.5" step="0.1">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Variation max (pts)</label>
                        <input type="number" class="form-input" id="st-rate-max" value="0.5" step="0.1">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Pas (pts)</label>
                        <input type="number" class="form-input" id="st-rate-step" value="0.10" step="0.05" min="0.05">
                    </div>
                </div>

                <button class="btn btn-primary btn-lg" id="st-run" style="margin-top:16px">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    Lancer l'analyse
                </button>
            </div>

            <div id="st-results"></div>
        `;
    },

    _buildRateRange(min, max, step) {
        const range = [];
        for (let v = min; v <= max + 0.001; v += step) {
            range.push(Math.round(v * 100) / 100);
        }
        // Ensure 0 is in the range
        if (!range.includes(0)) range.push(0);
        range.sort((a, b) => a - b);
        return range;
    },

    _collapsibleId: 0,

    _buildHeatmapTable(title, badge, results, rateRange, durationRange, baseRate, baseDuration, valueKey, baseValue, thresholds) {
        const id = 'st-collapse-' + (this._collapsibleId++);
        return `
            <div class="card section st-collapsible">
                <div class="card-header st-collapse-toggle" data-target="${id}" style="cursor:pointer;user-select:none;display:flex;align-items:center;justify-content:space-between">
                    <div style="display:flex;align-items:center;gap:12px">
                        <div class="card-title" style="margin:0">${title}</div>
                        ${badge ? `<div class="badge badge-blue">${badge}</div>` : ''}
                    </div>
                    <svg class="st-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20" style="transition:transform 0.3s ease;flex-shrink:0"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </div>
                <div id="${id}" class="st-collapse-body" style="overflow:hidden;transition:max-height 0.35s ease, opacity 0.25s ease;max-height:2000px;opacity:1">
                    <div class="table-container" style="margin-top:16px">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Taux \\ Dur\u00e9e</th>
                                    ${durationRange.map(d => `<th style="text-align:center">${baseDuration + d} mois</th>`).join('')}
                                </tr>
                            </thead>
                            <tbody>
                                ${results.map((row, ri) => `
                                    <tr>
                                        <td style="font-weight:600">${Fmt.pct((baseRate + rateRange[ri]), 2)}</td>
                                        ${row.map(cell => {
                                            if (!cell) return '<td class="heatmap-cell">\u2014</td>';
                                            const val = cell[valueKey];
                                            const diff = val - baseValue;
                                            const pctDiff = (diff / baseValue) * 100;
                                            const cls = Math.abs(pctDiff) < thresholds[0] ? 'heat-low' : Math.abs(pctDiff) < thresholds[1] ? 'heat-medium' : 'heat-high';
                                            const isBase = rateRange[ri] === 0 && cell.duration === baseDuration;
                                            return `<td class="heatmap-cell ${cls}" style="${isBase ? 'font-weight:800;outline:2px solid var(--primary-500)' : ''}">
                                                ${Financial.formatCurrency(val, valueKey === 'periodicPayment' ? undefined : 0)}
                                                <div style="font-size:0.7rem;opacity:0.7">${diff >= 0 ? '+' : ''}${Financial.formatCurrency(diff, 0)}</div>
                                            </td>`;
                                        }).join('')}
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    },

    init() {
        document.getElementById('st-run')?.addEventListener('click', () => {
            const principal = parseFloat(document.getElementById('st-principal').value);
            const baseRate = parseFloat(document.getElementById('st-rate').value);
            const baseDuration = parseInt(document.getElementById('st-duration').value);
            const insurance = parseFloat(document.getElementById('st-insurance').value);
            const rateMin = parseFloat(document.getElementById('st-rate-min').value);
            const rateMax = parseFloat(document.getElementById('st-rate-max').value);
            const rateStep = Math.max(0.05, parseFloat(document.getElementById('st-rate-step').value));
            const frequency = document.getElementById('st-frequency').value;

            const freqLabels = { monthly: 'Mensuel', quarterly: 'Trimestriel', semiannual: 'Semestriel', annual: 'Annuel' };
            const freqLabel = freqLabels[frequency] || 'Mensuel';

            const rateRange = this._buildRateRange(rateMin, rateMax, rateStep);
            const durationRange = [-24, -12, 0, 12, 24, 36];

            const results = Financial.sensitivityAnalysis({
                principal, baseRate, baseDuration,
                rateRange, durationRange,
                insuranceMonthly: insurance,
                frequency
            });

            // Base case
            const baseSim = Financial.amortissableConstant({ principal, annualRate: baseRate, durationMonths: baseDuration, insuranceMonthly: insurance, frequency });
            const basePayment = baseSim.periodicPayment;
            const baseCost = baseSim.totalCost;

            // Flatten all valid cells for KPIs
            const allCells = results.flat().filter(c => c !== null);
            const maxCost = Math.max(...allCells.map(c => c.totalCost));
            const worstCell = allCells.reduce((a, b) => a.totalCost > b.totalCost ? a : b);

            // Store for exports
            this._lastAnalysis = { principal, baseRate, baseDuration, insurance, frequency, freqLabel, rateRange, durationRange, results, baseSim, allCells, worstCell };

            const container = document.getElementById('st-results');
            container.innerHTML = `
                <!-- KPI Summary -->
                <div class="grid-4 section">
                    <div class="card st-kpi-card">
                        <div class="st-kpi-label">\u00c9ch\u00e9ance de base (${freqLabel})</div>
                        <div class="st-kpi-value">${Financial.formatCurrency(basePayment)}</div>
                        <div class="st-kpi-sub">${Fmt.pct(baseRate, 2)} \u2014 ${baseDuration} mois</div>
                    </div>
                    <div class="card st-kpi-card">
                        <div class="st-kpi-label">Co\u00fbt total de base</div>
                        <div class="st-kpi-value">${Financial.formatCurrency(baseCost, 0)}</div>
                        <div class="st-kpi-sub">${Fmt.pct(baseRate, 2)} \u2014 ${baseDuration} mois</div>
                    </div>
                    <div class="card st-kpi-card">
                        <div class="st-kpi-label">Co\u00fbt total min</div>
                        <div class="st-kpi-value" style="color:var(--success)">${Financial.formatCurrency(Math.min(...allCells.map(c => c.totalCost)), 0)}</div>
                        <div class="st-kpi-sub">${(() => { const best = allCells.reduce((a, b) => a.totalCost < b.totalCost ? a : b); return Fmt.pct(best.rate, 2) + ' \u2014 ' + best.duration + ' mois'; })()}</div>
                    </div>
                    <div class="card st-kpi-card">
                        <div class="st-kpi-label">Co\u00fbt total max</div>
                        <div class="st-kpi-value" style="color:var(--danger)">${Financial.formatCurrency(maxCost, 0)}</div>
                        <div class="st-kpi-sub">${Fmt.pct(worstCell.rate, 2)} \u2014 ${worstCell.duration} mois</div>
                    </div>
                </div>

                <!-- Matrices -->
                ${this._buildHeatmapTable(
                    'Matrice de sensibilit\u00e9 \u2014 \u00c9ch\u00e9ance (' + freqLabel + ')',
                    'Base : ' + Financial.formatCurrency(basePayment),
                    results, rateRange, durationRange, baseRate, baseDuration,
                    'periodicPayment', basePayment, [5, 15]
                )}

                ${this._buildHeatmapTable(
                    'Matrice de sensibilit\u00e9 \u2014 Co\u00fbt total',
                    'Base : ' + Financial.formatCurrency(baseCost, 0),
                    results, rateRange, durationRange, baseRate, baseDuration,
                    'totalCost', baseCost, [10, 30]
                )}

                <!-- Line chart: rate impact -->
                <div class="card section st-collapsible">
                    <div class="card-header st-collapse-toggle" data-target="st-collapse-chart" style="cursor:pointer;user-select:none;display:flex;align-items:center;justify-content:space-between">
                        <div class="card-title" style="margin:0">Impact du taux sur l'\u00e9ch\u00e9ance ${freqLabel.toLowerCase()} (dur\u00e9e fixe : ${baseDuration} mois)</div>
                        <svg class="st-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20" style="transition:transform 0.3s ease;flex-shrink:0"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </div>
                    <div id="st-collapse-chart" class="st-collapse-body" style="overflow:hidden;transition:max-height 0.35s ease, opacity 0.25s ease;max-height:2000px;opacity:1">
                        <div class="chart-container" style="margin-top:16px"><canvas id="chart-stress-line"></canvas></div>
                    </div>
                </div>

                <!-- Export buttons -->
                <div class="section" style="display:flex;gap:12px;flex-wrap:wrap">
                    <button class="btn btn-primary" id="st-export-pdf">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        Exporter PDF
                    </button>
                    <button class="btn btn-outline" id="st-save">Sauvegarder</button>
                    <button class="btn btn-outline" id="st-export-xlsx">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        Exporter Excel
                    </button>
                </div>
            `;

            // === Collapsible sections ===
            this._collapsibleId = 0; // reset for next run
            container.querySelectorAll('.st-collapse-toggle').forEach(toggle => {
                toggle.addEventListener('click', () => {
                    const targetId = toggle.getAttribute('data-target');
                    const body = document.getElementById(targetId);
                    const chevron = toggle.querySelector('.st-chevron');
                    if (!body) return;
                    const isCollapsed = body.classList.toggle('st-collapsed');
                    if (isCollapsed) {
                        body.style.maxHeight = body.scrollHeight + 'px';
                        body.offsetHeight; // force reflow
                        body.style.maxHeight = '0';
                        body.style.opacity = '0';
                        chevron.style.transform = 'rotate(-90deg)';
                    } else {
                        body.style.maxHeight = body.scrollHeight + 'px';
                        body.style.opacity = '1';
                        chevron.style.transform = 'rotate(0deg)';
                        setTimeout(() => { if (!body.classList.contains('st-collapsed')) body.style.maxHeight = '2000px'; }, 350);
                    }
                });
            });

            // === Line chart: mensualit\u00e9 par taux (dur\u00e9e fixe) ===
            const validRates = rateRange.filter(rd => baseRate + rd > 0);
            const lineLabels = validRates.map(rd => Fmt.pct(baseRate + rd, 2));
            const lineData = validRates.map(rd => {
                const sim = Financial.amortissableConstant({ principal, annualRate: baseRate + rd, durationMonths: baseDuration, insuranceMonthly: insurance, frequency });
                return sim.periodicPayment;
            });

            Charts.destroy('chart-stress-line');
            const ctxLine = document.getElementById('chart-stress-line');
            // Graphique créé hors du registre Charts : on libère l'instance
            // précédente du canvas, sinon elles s'empilent à chaque calcul
            if (ctxLine) /** @type {any} */ (window).Chart?.getChart?.(ctxLine)?.destroy();
            if (ctxLine) {
                const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
                const theme = {
                    text: isDark ? '#94a3b8' : '#4b5563',
                    grid: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                    bg: isDark ? '#1a2736' : '#ffffff'
                };
                new Chart(ctxLine, {
                    type: 'line',
                    data: {
                        labels: lineLabels,
                        datasets: [{
                            label: 'Mensualit\u00e9',
                            data: lineData,
                            borderColor: Charts.COLORS.primary,
                            backgroundColor: Charts.COLORS.primary + '20',
                            fill: true,
                            tension: 0.3,
                            pointRadius: 4,
                            pointHoverRadius: 6,
                            pointBackgroundColor: lineData.map((v, i) => validRates[i] === 0 ? Charts.COLORS.accent : Charts.COLORS.primary),
                            borderWidth: 2.5
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        interaction: { intersect: false },
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                backgroundColor: theme.bg,
                                titleColor: theme.text,
                                bodyColor: theme.text,
                                borderColor: theme.grid,
                                borderWidth: 1,
                                padding: 12,
                                callbacks: {
                                    label: ctx => `Mensualit\u00e9 : ${Financial.formatCurrency(ctx.raw)}`
                                }
                            }
                        },
                        scales: {
                            x: {
                                grid: { display: false },
                                ticks: { color: theme.text },
                                title: { display: true, text: 'Taux annuel', color: theme.text }
                            },
                            y: {
                                grid: { color: theme.grid },
                                ticks: {
                                    color: theme.text,
                                    callback: v => new Intl.NumberFormat('fr-FR', { notation: 'compact' }).format(v) + ' \u20ac'
                                },
                                title: { display: true, text: 'Mensualit\u00e9 (\u20ac)', color: theme.text }
                            }
                        }
                    }
                });
            }

            // === Export handlers ===
            document.getElementById('st-export-pdf')?.addEventListener('click', () => this._exportPdf());
            document.getElementById('st-export-xlsx')?.addEventListener('click', () => this._exportExcel());
            document.getElementById('st-save')?.addEventListener('click', () => {
                const d = this._lastAnalysis;
                if (!d) return;
                const field = (/** @type {string} */ id) => /** @type {HTMLInputElement | null} */ (document.getElementById(id))?.value ?? '';
                Dialog.save({ defaultName: `Sensibilité — ${Financial.formatCurrency(d.principal)} à ${Fmt.pct(d.baseRate, 2)}` }).then(saved => {
                    if (!saved) return;
                    const id = Storage.saveSimulation({
                        type: 'stress', typeLabel: 'Sensibilité taux × durée', name: saved.name, notes: saved.notes,
                        params: { principal: d.principal, annualRate: d.baseRate, durationMonths: d.baseDuration, insuranceMonthly: d.insurance, frequency: d.frequency, rateMin: parseFloat(field('st-rate-min')), rateMax: parseFloat(field('st-rate-max')), rateStep: parseFloat(field('st-rate-step')) },
                        results: { totalCost: d.baseSim?.totalCost, worstRate: d.worstCell.rate, worstDurationMonths: d.worstCell.duration, worstTotalCost: d.worstCell.totalCost }
                    });
                    window.showToast?.(id ? 'Analyse sauvegardée' : 'Sauvegarde impossible : stockage plein', id ? 'success' : 'error');
                });
            });
        });
    },

    _exportPdf() {
        const d = this._lastAnalysis;
        if (!d) return;

        const fmtCur = v => Financial.formatCurrency(v, 0);
        const fmtCur2 = v => Financial.formatCurrency(v);
        const baseSim = d.baseSim;

        const sections = [
            { type: 'title', text: 'Stress Test \u2014 Analyse de Sensibilite' },
            { type: 'separator' },
            { type: 'keyvalue', items: [
                { label: 'Montant emprunte', value: fmtCur(d.principal) },
                { label: 'Taux de base', value: d.baseRate.toFixed(2) + ' %' },
                { label: 'Duree de base', value: d.baseDuration + ' mois (' + (d.baseDuration / 12).toFixed(1) + ' ans)' },
                { label: 'Frequence d\'amortissement', value: d.freqLabel },
                { label: 'Assurance mensuelle', value: fmtCur2(d.insurance) },
                { label: 'Plage de taux testee', value: (d.baseRate + d.rateRange[0]).toFixed(2) + '% a ' + (d.baseRate + d.rateRange[d.rateRange.length - 1]).toFixed(2) + '%' },
                { label: 'Date d\'analyse', value: new Date().toLocaleDateString('fr-FR') }
            ]},
            { type: 'separator' },
            { type: 'title', text: 'Indicateurs Cles' },
            { type: 'keyvalue', items: [
                { label: 'Echeance de base (' + d.freqLabel + ')', value: fmtCur2(baseSim.periodicPayment) },
                { label: 'Cout total de base', value: fmtCur(baseSim.totalCost) },
                { label: 'Cout total min', value: fmtCur(Math.min(...d.allCells.map(c => c.totalCost))) },
                { label: 'Cout total max', value: fmtCur(Math.max(...d.allCells.map(c => c.totalCost))) },
                { label: 'Pire scenario', value: `${d.worstCell.rate.toFixed(2)}% / ${d.worstCell.duration} mois = ${fmtCur(d.worstCell.totalCost)}` }
            ]},
            { type: 'separator' }
        ];

        // Matrice Mensualit\u00e9
        const buildMatrixSection = (title, valueKey) => {
            const headers = ['Taux \\ Duree', ...d.durationRange.map(dd => (d.baseDuration + dd) + ' mois')];
            const rows = d.results.map((row, ri) => [
                (d.baseRate + d.rateRange[ri]).toFixed(2) + '%',
                ...row.map(cell => cell ? Financial.formatCurrency(cell[valueKey], valueKey === 'periodicPayment' ? undefined : 0) : '\u2014')
            ]);
            sections.push({ type: 'title', text: title });
            sections.push({ type: 'table', headers, rows });
        };

        buildMatrixSection('Matrice \u2014 Echeance (' + d.freqLabel + ')', 'periodicPayment');
        buildMatrixSection('Matrice \u2014 Cout Total', 'totalCost');

        // Analyse textuelle
        sections.push({ type: 'separator' });
        sections.push({ type: 'title', text: 'Analyse' });

        const baseP = baseSim.periodicPayment;
        const worstP = Math.max(...d.allCells.map(c => c.periodicPayment));
        const bestP = Math.min(...d.allCells.map(c => c.periodicPayment));
        const surchargeMax = d.worstCell.totalCost - baseSim.totalCost;

        const analysisItems = [
            { label: 'Variation mensualite', value: `De ${fmtCur2(bestP)} a ${fmtCur2(worstP)}, soit un ecart de ${fmtCur(worstP - bestP)} (${((worstP - bestP) / baseP * 100).toFixed(1)}%)` },
            { label: 'Surcharge maximale', value: `Le pire scenario (${d.worstCell.rate.toFixed(2)}% sur ${d.worstCell.duration} mois) coute ${fmtCur(surchargeMax)} de plus que le scenario de base` },
            { label: 'Sensibilite au taux', value: `Une hausse de 0.50 pt entraine environ ${fmtCur(Math.abs(this._sensibilityPerHalfPoint(d)))} de variation mensuelle` }
        ];

        sections.push({ type: 'keyvalue', items: analysisItems });

        Export.toPdf('Stress Test \u2014 Analyse de Sensibilite', sections, 'stress_test');
    },

    _sensibilityPerHalfPoint(d) {
        const baseP = d.baseSim.periodicPayment;
        const idx05 = d.rateRange.indexOf(0.5);
        if (idx05 >= 0) {
            const row = d.results[idx05];
            const colBase = d.durationRange.indexOf(0);
            if (colBase >= 0 && row[colBase]) {
                return row[colBase].periodicPayment - baseP;
            }
        }
        // Fallback: estimate from min/max
        const range = d.rateRange[d.rateRange.length - 1] - d.rateRange[0];
        const maxP = Math.max(...d.allCells.map(c => c.periodicPayment));
        const minP = Math.min(...d.allCells.map(c => c.periodicPayment));
        return (maxP - minP) / (range / 0.5);
    },

    _exportExcel() {
        const d = this._lastAnalysis;
        if (!d) return;
        if (typeof XLSX === 'undefined') { window.showToast?.('Outils d\u2019export Excel indisponibles (connexion ?) — réessayez', 'error'); return; }

        const wb = XLSX.utils.book_new();

        const buildSheet = (sheetName, valueKey, decimals) => {
            const headers = ['Taux \\ Dur\u00e9e', ...d.durationRange.map(dd => (d.baseDuration + dd) + ' mois')];
            const rows = d.results.map((row, ri) => [
                (d.baseRate + d.rateRange[ri]).toFixed(2) + '%',
                ...row.map(cell => cell ? Math.round(cell[valueKey] * (decimals ? 100 : 1)) / (decimals ? 100 : 1) : null)
            ]);
            const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
            ws['!cols'] = headers.map(() => ({ wch: 16 }));
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
        };

        // Summary sheet
        const summary = [
            ['AUXY PARTNERS \u2014 Stress Test'],
            [''],
            ['Montant', d.principal],
            ['Taux de base', d.baseRate + '%'],
            ['Dur\u00e9e de base', d.baseDuration + ' mois'],
            ['Fr\u00e9quence', d.freqLabel],
            ['Assurance/mois', d.insurance],
            ['Date', new Date().toLocaleDateString('fr-FR')],
            [''],
            ['\u00c9ch\u00e9ance de base (' + d.freqLabel + ')', Math.round(d.baseSim.periodicPayment * 100) / 100],
            ['Co\u00fbt total de base', Math.round(d.baseSim.totalCost)],
            ['Int\u00e9r\u00eats de base', Math.round(d.baseSim.totalInterest)]
        ];
        const summaryWs = XLSX.utils.aoa_to_sheet(summary);
        summaryWs['!cols'] = [{ wch: 25 }, { wch: 20 }];
        XLSX.utils.book_append_sheet(wb, summaryWs, 'R\u00e9sum\u00e9');

        buildSheet('\u00c9ch\u00e9ance', 'periodicPayment', true);
        buildSheet('Co\u00fbt Total', 'totalCost', false);

        XLSX.writeFile(wb, `stress_test_${new Date().toISOString().slice(0, 10)}.xlsx`);
    }
};
