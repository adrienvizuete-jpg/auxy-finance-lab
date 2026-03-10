/**
 * Auxy Partners - Financial Calculator & Stress Test Modules
 */

import { Financial } from '../utils/financial.js';
import { Charts } from '../utils/charts.js';

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
    render() {
        return `
            <div class="page-header">
                <h1>Stress Test</h1>
                <p>Analyse de sensibilit\u00e9 - Impact des variations de taux et de dur\u00e9e sur la mensualit\u00e9</p>
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
                </div>
                <button class="btn btn-primary btn-lg" id="st-run" style="margin-top:16px">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    Lancer l'analyse
                </button>
            </div>

            <div id="st-results"></div>
        `;
    },

    init() {
        document.getElementById('st-run')?.addEventListener('click', () => {
            const principal = parseFloat(document.getElementById('st-principal').value);
            const baseRate = parseFloat(document.getElementById('st-rate').value);
            const baseDuration = parseInt(document.getElementById('st-duration').value);
            const insurance = parseFloat(document.getElementById('st-insurance').value);

            const rateRange = [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 3];
            const durationRange = [-24, -12, 0, 12, 24, 36];

            const results = Financial.sensitivityAnalysis({
                principal, baseRate, baseDuration,
                rateRange, durationRange,
                insuranceMonthly: insurance
            });

            // Base case
            const baseSim = Financial.amortissableConstant({ principal, annualRate: baseRate, durationMonths: baseDuration, insuranceMonthly: insurance });
            const basePayment = baseSim.monthlyPayment;

            const container = document.getElementById('st-results');
            container.innerHTML = `
                <div class="card section">
                    <div class="card-header">
                        <div class="card-title">Matrice de sensibilit\u00e9 - Mensualit\u00e9</div>
                        <div class="badge badge-blue">Base: ${Financial.formatCurrency(basePayment)}</div>
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
                                            const diff = cell.monthlyPayment - basePayment;
                                            const pctDiff = (diff / basePayment) * 100;
                                            const cls = Math.abs(pctDiff) < 5 ? 'heat-low' : Math.abs(pctDiff) < 15 ? 'heat-medium' : 'heat-high';
                                            const isBase = rateRange[ri] === 0 && cell.duration === baseDuration;
                                            return `<td class="heatmap-cell ${cls}" style="${isBase ? 'font-weight:800;outline:2px solid var(--primary-500)' : ''}">
                                                ${Financial.formatCurrency(cell.monthlyPayment)}
                                                <div style="font-size:0.7rem;opacity:0.7">${diff >= 0 ? '+' : ''}${Financial.formatCurrency(diff, 0)}</div>
                                            </td>`;
                                        }).join('')}
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div class="card section">
                    <div class="card-header">
                        <div class="card-title">Matrice de sensibilit\u00e9 - Co\u00fbt total</div>
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
                                            const baseCost = baseSim.totalCost;
                                            const diff = cell.totalCost - baseCost;
                                            const pctDiff = (diff / baseCost) * 100;
                                            const cls = Math.abs(pctDiff) < 10 ? 'heat-low' : Math.abs(pctDiff) < 30 ? 'heat-medium' : 'heat-high';
                                            return `<td class="heatmap-cell ${cls}">
                                                ${Financial.formatCurrency(cell.totalCost, 0)}
                                            </td>`;
                                        }).join('')}
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div class="card section">
                    <div class="card-title">Impact du taux sur la mensualit\u00e9</div>
                    <div class="chart-container"><canvas id="chart-stress-rate"></canvas></div>
                </div>
            `;

            // Chart: rate impact
            const rateData = rateRange.map(rd => {
                const r = baseRate + rd;
                if (r <= 0) return null;
                const sim = Financial.amortissableConstant({ principal, annualRate: r, durationMonths: baseDuration, insuranceMonthly: insurance });
                return sim.monthlyPayment;
            }).filter(v => v !== null);

            const rateLabels = rateRange.filter((rd, i) => baseRate + rd > 0).map(rd => (baseRate + rd).toFixed(2) + '%');

            Charts.benchmarkComparison('chart-stress-rate',
                rateLabels.map((label, i) => ({ name: label, value: rateData[i] })),
                { key: 'value', label: 'Mensualit\u00e9', format: v => Financial.formatCurrency(v) }
            );
        });
    }
};
