/**
 * Auxy Partners - Financial Calculator & Stress Test Modules
 */

import { Financial } from '../utils/financial.js';
import { Charts } from '../utils/charts.js';
import { Export } from '../utils/export.js';

// =============================================
// FINANCIAL CALCULATOR
// =============================================

export const CalculatorModule = {
    render() {
        return `
            <div class="page-header">
                <h1>Calculatrice Financi\u00e8re</h1>
                <p>Outils de calcul rapide pour les op\u00e9rations courantes</p>
            </div>

            <div class="grid-2 section">
                <!-- PMT Calculator -->
                <div class="card">
                    <div class="card-title">Calcul de mensualit\u00e9 (PMT)</div>
                    <div class="form-row" style="margin-top:12px">
                        <div class="form-group">
                            <label class="form-label">Capital</label>
                            <input type="number" class="form-input" id="calc-pmt-pv" value="500000" step="10000">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Taux annuel (%)</label>
                            <input type="number" class="form-input" id="calc-pmt-rate" value="4.5" step="0.1">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Dur\u00e9e (mois)</label>
                            <input type="number" class="form-input" id="calc-pmt-n" value="84" step="1">
                        </div>
                    </div>
                    <button class="btn btn-primary btn-sm" id="calc-pmt-btn">Calculer</button>
                    <div id="calc-pmt-result" class="results-panel" style="margin-top:12px;display:none"></div>
                </div>

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

                <!-- Ratios Calculator -->
                <div class="card">
                    <div class="card-title">Ratios Financiers</div>
                    <div class="form-row" style="margin-top:12px">
                        <div class="form-group">
                            <label class="form-label">EBIT / R\u00e9sultat op. (\u20ac)</label>
                            <input type="number" class="form-input" id="calc-ratio-ebit" value="500000" step="10000">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Service de la dette (\u20ac/an)</label>
                            <input type="number" class="form-input" id="calc-ratio-ds" value="300000" step="10000">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label class="form-label">Charge d'int\u00e9r\u00eats (\u20ac/an)</label>
                            <input type="number" class="form-input" id="calc-ratio-interest" value="120000" step="5000">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Montant du pr\u00eat (\u20ac)</label>
                            <input type="number" class="form-input" id="calc-ratio-loan" value="2000000" step="100000">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Valeur de l'actif (\u20ac)</label>
                            <input type="number" class="form-input" id="calc-ratio-asset" value="3500000" step="100000">
                        </div>
                    </div>
                    <button class="btn btn-primary btn-sm" id="calc-ratio-btn">Calculer</button>
                    <div id="calc-ratio-result" class="results-panel" style="margin-top:12px;display:none"></div>
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
        // PMT
        document.getElementById('calc-pmt-btn')?.addEventListener('click', () => {
            const pv = parseFloat(document.getElementById('calc-pmt-pv').value);
            const rate = parseFloat(document.getElementById('calc-pmt-rate').value) / 100 / 12;
            const n = parseInt(document.getElementById('calc-pmt-n').value);
            const pmt = Math.abs(Financial.pmt(rate, n, pv));
            const total = pmt * n;
            document.getElementById('calc-pmt-result').style.display = 'block';
            document.getElementById('calc-pmt-result').innerHTML = `
                <div class="results-grid">
                    <div class="result-item"><div class="result-label">Mensualit\u00e9</div><div class="result-value">${Financial.formatCurrency(pmt)}</div></div>
                    <div class="result-item"><div class="result-label">Total rembours\u00e9</div><div class="result-value">${Financial.formatCurrency(total)}</div></div>
                    <div class="result-item"><div class="result-label">Int\u00e9r\u00eats</div><div class="result-value">${Financial.formatCurrency(total - pv)}</div></div>
                </div>
            `;
        });

        // NPV
        document.getElementById('calc-npv-btn')?.addEventListener('click', () => {
            const rate = parseFloat(document.getElementById('calc-npv-rate').value) / 100;
            const flows = document.getElementById('calc-npv-flows').value.split('\n').map(v => parseFloat(v.trim())).filter(v => !isNaN(v));
            if (flows.length < 2) return;
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
            const flows = document.getElementById('calc-irr-flows').value.split('\n').map(v => parseFloat(v.trim())).filter(v => !isNaN(v));
            if (flows.length < 2) return;
            const irr = Financial.irr(flows) * 100;
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

        // Ratios
        document.getElementById('calc-ratio-btn')?.addEventListener('click', () => {
            const ebit = parseFloat(document.getElementById('calc-ratio-ebit').value);
            const ds = parseFloat(document.getElementById('calc-ratio-ds').value);
            const interest = parseFloat(document.getElementById('calc-ratio-interest').value);
            const loan = parseFloat(document.getElementById('calc-ratio-loan').value);
            const asset = parseFloat(document.getElementById('calc-ratio-asset').value);

            const dscr = Financial.dscr(ebit, ds);
            const icr = Financial.icr(ebit, interest);
            const ltv = Financial.ltv(loan, asset);

            const dscrColor = dscr >= 1.3 ? 'var(--success)' : dscr >= 1.0 ? 'var(--warning)' : 'var(--danger)';
            const icrColor = icr >= 3 ? 'var(--success)' : icr >= 1.5 ? 'var(--warning)' : 'var(--danger)';
            const ltvColor = ltv <= 60 ? 'var(--success)' : ltv <= 80 ? 'var(--warning)' : 'var(--danger)';

            document.getElementById('calc-ratio-result').style.display = 'block';
            document.getElementById('calc-ratio-result').innerHTML = `
                <div class="results-grid">
                    <div class="result-item"><div class="result-label">DSCR</div><div class="result-value" style="color:${dscrColor}">${dscr.toFixed(2)}x</div><div class="result-sub">${dscr >= 1.3 ? 'Confortable' : dscr >= 1.0 ? 'Limite' : 'Insuffisant'}</div></div>
                    <div class="result-item"><div class="result-label">ICR</div><div class="result-value" style="color:${icrColor}">${icr.toFixed(2)}x</div><div class="result-sub">${icr >= 3 ? 'Solide' : icr >= 1.5 ? 'Acceptable' : 'Risqu\u00e9'}</div></div>
                    <div class="result-item"><div class="result-label">LTV</div><div class="result-value" style="color:${ltvColor}">${ltv.toFixed(1)}%</div><div class="result-sub">${ltv <= 60 ? 'Conservateur' : ltv <= 80 ? 'Mod\u00e9r\u00e9' : '\u00c9lev\u00e9'}</div></div>
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
                        <input type="number" class="form-input" id="st-rate-min" value="-2" step="0.5">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Variation max (pts)</label>
                        <input type="number" class="form-input" id="st-rate-max" value="2" step="0.5">
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

    _buildHeatmapTable(title, badge, results, rateRange, durationRange, baseRate, baseDuration, valueKey, baseValue, thresholds) {
        return `
            <div class="card section">
                <div class="card-header">
                    <div class="card-title">${title}</div>
                    ${badge ? `<div class="badge badge-blue">${badge}</div>` : ''}
                </div>
                <div class="table-container">
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
                                    <td style="font-weight:600">${(baseRate + rateRange[ri]).toFixed(2)}%</td>
                                    ${row.map(cell => {
                                        if (!cell) return '<td class="heatmap-cell">\u2014</td>';
                                        const val = cell[valueKey];
                                        const diff = val - baseValue;
                                        const pctDiff = (diff / baseValue) * 100;
                                        const cls = Math.abs(pctDiff) < thresholds[0] ? 'heat-low' : Math.abs(pctDiff) < thresholds[1] ? 'heat-medium' : 'heat-high';
                                        const isBase = rateRange[ri] === 0 && cell.duration === baseDuration;
                                        return `<td class="heatmap-cell ${cls}" style="${isBase ? 'font-weight:800;outline:2px solid var(--primary-500)' : ''}">
                                            ${Financial.formatCurrency(val, valueKey === 'monthlyPayment' ? undefined : 0)}
                                            <div style="font-size:0.7rem;opacity:0.7">${diff >= 0 ? '+' : ''}${Financial.formatCurrency(diff, 0)}</div>
                                        </td>`;
                                    }).join('')}
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
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
            const basePayment = baseSim.monthlyPayment;
            const baseCost = baseSim.totalCost;

            // Flatten all valid cells for KPIs
            const allCells = results.flat().filter(c => c !== null);
            const minPayment = Math.min(...allCells.map(c => c.monthlyPayment));
            const maxPayment = Math.max(...allCells.map(c => c.monthlyPayment));
            const maxInterest = Math.max(...allCells.map(c => c.totalInterest));
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
                        <div class="st-kpi-sub">${baseRate.toFixed(2)}% \u2014 ${baseDuration} mois</div>
                    </div>
                    <div class="card st-kpi-card">
                        <div class="st-kpi-label">Co\u00fbt total de base</div>
                        <div class="st-kpi-value">${Financial.formatCurrency(baseCost, 0)}</div>
                        <div class="st-kpi-sub">${baseRate.toFixed(2)}% \u2014 ${baseDuration} mois</div>
                    </div>
                    <div class="card st-kpi-card">
                        <div class="st-kpi-label">Co\u00fbt total min</div>
                        <div class="st-kpi-value" style="color:var(--success)">${Financial.formatCurrency(Math.min(...allCells.map(c => c.totalCost)), 0)}</div>
                        <div class="st-kpi-sub">${(() => { const best = allCells.reduce((a, b) => a.totalCost < b.totalCost ? a : b); return best.rate.toFixed(2) + '% \u2014 ' + best.duration + ' mois'; })()}</div>
                    </div>
                    <div class="card st-kpi-card">
                        <div class="st-kpi-label">Co\u00fbt total max</div>
                        <div class="st-kpi-value" style="color:var(--danger)">${Financial.formatCurrency(maxCost, 0)}</div>
                        <div class="st-kpi-sub">${worstCell.rate.toFixed(2)}% \u2014 ${worstCell.duration} mois</div>
                    </div>
                </div>

                <!-- Matrices -->
                ${this._buildHeatmapTable(
                    'Matrice de sensibilit\u00e9 \u2014 \u00c9ch\u00e9ance (' + freqLabel + ')',
                    'Base : ' + Financial.formatCurrency(basePayment),
                    results, rateRange, durationRange, baseRate, baseDuration,
                    'monthlyPayment', basePayment, [5, 15]
                )}

                ${this._buildHeatmapTable(
                    'Matrice de sensibilit\u00e9 \u2014 Co\u00fbt total',
                    'Base : ' + Financial.formatCurrency(baseCost, 0),
                    results, rateRange, durationRange, baseRate, baseDuration,
                    'totalCost', baseCost, [10, 30]
                )}

                <!-- Line chart: rate impact -->
                <div class="card section">
                    <div class="card-title">Impact du taux sur l'\u00e9ch\u00e9ance ${freqLabel.toLowerCase()} (dur\u00e9e fixe : ${baseDuration} mois)</div>
                    <div class="chart-container"><canvas id="chart-stress-line"></canvas></div>
                </div>

                <!-- Export buttons -->
                <div class="section" style="display:flex;gap:12px;flex-wrap:wrap">
                    <button class="btn btn-primary" id="st-export-pdf">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        Exporter PDF
                    </button>
                    <button class="btn btn-outline" id="st-export-xlsx">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        Exporter Excel
                    </button>
                </div>
            `;

            // === Line chart: mensualit\u00e9 par taux (dur\u00e9e fixe) ===
            const validRates = rateRange.filter(rd => baseRate + rd > 0);
            const lineLabels = validRates.map(rd => (baseRate + rd).toFixed(2) + '%');
            const lineData = validRates.map(rd => {
                const sim = Financial.amortissableConstant({ principal, annualRate: baseRate + rd, durationMonths: baseDuration, insuranceMonthly: insurance, frequency });
                return sim.monthlyPayment;
            });

            Charts.destroy('chart-stress-line');
            const ctxLine = document.getElementById('chart-stress-line');
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
                { label: 'Mensualite de base', value: fmtCur2(baseSim.monthlyPayment) },
                { label: 'Cout total de base', value: fmtCur(baseSim.totalCost) },
                { label: 'Interets de base', value: fmtCur(baseSim.totalInterest) },
                { label: 'Mensualite min', value: fmtCur2(Math.min(...d.allCells.map(c => c.monthlyPayment))) },
                { label: 'Mensualite max', value: fmtCur2(Math.max(...d.allCells.map(c => c.monthlyPayment))) },
                { label: 'Ecart max mensualite', value: fmtCur(Math.max(...d.allCells.map(c => c.monthlyPayment)) - Math.min(...d.allCells.map(c => c.monthlyPayment))) },
                { label: 'Pire scenario', value: `${d.worstCell.rate.toFixed(2)}% / ${d.worstCell.duration} mois = ${fmtCur(d.worstCell.totalCost)}` }
            ]},
            { type: 'separator' }
        ];

        // Matrice Mensualit\u00e9
        const buildMatrixSection = (title, valueKey) => {
            const headers = ['Taux \\ Duree', ...d.durationRange.map(dd => (d.baseDuration + dd) + ' mois')];
            const rows = d.results.map((row, ri) => [
                (d.baseRate + d.rateRange[ri]).toFixed(2) + '%',
                ...row.map(cell => cell ? Financial.formatCurrency(cell[valueKey], valueKey === 'monthlyPayment' ? undefined : 0) : '\u2014')
            ]);
            sections.push({ type: 'title', text: title });
            sections.push({ type: 'table', headers, rows });
        };

        buildMatrixSection('Matrice \u2014 Echeance', 'monthlyPayment');
        buildMatrixSection('Matrice \u2014 Cout Total', 'totalCost');

        // Analyse textuelle
        sections.push({ type: 'separator' });
        sections.push({ type: 'title', text: 'Analyse' });

        const baseP = baseSim.monthlyPayment;
        const worstP = Math.max(...d.allCells.map(c => c.monthlyPayment));
        const bestP = Math.min(...d.allCells.map(c => c.monthlyPayment));
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
        const baseP = d.baseSim.monthlyPayment;
        const idx05 = d.rateRange.indexOf(0.5);
        if (idx05 >= 0) {
            const row = d.results[idx05];
            const colBase = d.durationRange.indexOf(0);
            if (colBase >= 0 && row[colBase]) {
                return row[colBase].monthlyPayment - baseP;
            }
        }
        // Fallback: estimate from min/max
        const range = d.rateRange[d.rateRange.length - 1] - d.rateRange[0];
        const maxP = Math.max(...d.allCells.map(c => c.monthlyPayment));
        const minP = Math.min(...d.allCells.map(c => c.monthlyPayment));
        return (maxP - minP) / (range / 0.5);
    },

    _exportExcel() {
        const d = this._lastAnalysis;
        if (!d) return;
        if (typeof XLSX === 'undefined') { alert('Biblioth\u00e8que Excel non charg\u00e9e'); return; }

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
            ['Mensualit\u00e9 de base', Math.round(d.baseSim.monthlyPayment * 100) / 100],
            ['Co\u00fbt total de base', Math.round(d.baseSim.totalCost)],
            ['Int\u00e9r\u00eats de base', Math.round(d.baseSim.totalInterest)]
        ];
        const summaryWs = XLSX.utils.aoa_to_sheet(summary);
        summaryWs['!cols'] = [{ wch: 25 }, { wch: 20 }];
        XLSX.utils.book_append_sheet(wb, summaryWs, 'R\u00e9sum\u00e9');

        buildSheet('\u00c9ch\u00e9ance', 'monthlyPayment', true);
        buildSheet('Co\u00fbt Total', 'totalCost', false);

        XLSX.writeFile(wb, `stress_test_${new Date().toISOString().slice(0, 10)}.xlsx`);
    }
};
