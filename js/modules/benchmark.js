/**
 * Auxy Partners - Benchmark / Loan Comparison Module
 */

import { Financial } from '../utils/financial.js';
import { Charts } from '../utils/charts.js';
import { Export } from '../utils/export.js';
import { Storage } from '../utils/storage.js';

const MAX_LOANS = 5;

let loans = [
    { name: 'Pr\u00eat A', principal: 500000, rate: 4.5, duration: 84, type: 'constant', insurance: 0, fees: 0 },
    { name: 'Pr\u00eat B', principal: 500000, rate: 4.0, duration: 120, type: 'constant', insurance: 0, fees: 0 }
];

let results = [];

function renderLoanCards() {
    return loans.map((loan, i) => `
        <div class="card comparison-slot filled" data-index="${i}">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                <input type="text" class="form-input" value="${loan.name}" data-index="${i}" data-field="name" style="font-weight:700;max-width:200px;border:none;padding:4px 0;background:transparent;font-size:1rem;color:var(--text-primary)">
                <button class="btn btn-ghost btn-sm remove-loan" data-index="${i}" title="Supprimer">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Montant (\u20ac)</label>
                    <input type="number" class="form-input" value="${loan.principal}" data-index="${i}" data-field="principal" min="1000" step="10000">
                </div>
                <div class="form-group">
                    <label class="form-label">Taux (%)</label>
                    <input type="number" class="form-input" value="${loan.rate}" data-index="${i}" data-field="rate" min="0.01" max="30" step="0.01">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Dur\u00e9e (mois)</label>
                    <input type="number" class="form-input" value="${loan.duration}" data-index="${i}" data-field="duration" min="1" max="600" step="1">
                </div>
                <div class="form-group">
                    <label class="form-label">Type</label>
                    <select class="form-select" data-index="${i}" data-field="type">
                        <option value="constant" ${loan.type === 'constant' ? 'selected' : ''}>Amortissable</option>
                        <option value="degressif" ${loan.type === 'degressif' ? 'selected' : ''}>D\u00e9gressif</option>
                        <option value="infine" ${loan.type === 'infine' ? 'selected' : ''}>In Fine</option>
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Assurance/mois (\u20ac)</label>
                    <input type="number" class="form-input" value="${loan.insurance}" data-index="${i}" data-field="insurance" min="0" step="10">
                </div>
                <div class="form-group">
                    <label class="form-label">Frais (\u20ac)</label>
                    <input type="number" class="form-input" value="${loan.fees}" data-index="${i}" data-field="fees" min="0" step="100">
                </div>
            </div>
        </div>
    `).join('') + (loans.length < MAX_LOANS ? `
        <div class="comparison-slot" id="add-loan-slot">
            <div style="color:var(--text-muted)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="32" height="32" style="margin-bottom:8px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                <div>Ajouter un pr\u00eat</div>
            </div>
        </div>
    ` : '');
}

function runBenchmark() {
    results = loans.map(loan => {
        let sim;
        const params = {
            principal: loan.principal,
            annualRate: loan.rate,
            durationMonths: loan.duration,
            insuranceMonthly: loan.insurance,
            fees: loan.fees
        };

        switch (loan.type) {
            case 'degressif':
                sim = Financial.amortissableDegressif(params);
                break;
            case 'infine':
                sim = Financial.inFine(params);
                break;
            default:
                sim = Financial.amortissableConstant(params);
        }

        const monthlyPayment = sim.monthlyPayment || sim.firstPayment || sim.monthlyPaymentExInsurance || 0;

        return {
            ...loan,
            monthlyPayment,
            totalInterest: sim.totalInterest,
            totalCost: sim.totalCost,
            totalPayment: sim.totalPayment,
            schedule: sim.schedule,
            taeg: sim.taeg
        };
    });

    renderComparison();
}

function renderComparison() {
    const container = document.getElementById('benchmark-results');
    if (!container || results.length === 0) return;

    // Find best values
    const bestCost = Math.min(...results.map(r => r.totalCost));
    const bestPayment = Math.min(...results.map(r => r.monthlyPayment));
    const bestInterest = Math.min(...results.map(r => r.totalInterest));

    // Scoring (lower is better for cost, payment, interest)
    const maxCost = Math.max(...results.map(r => r.totalCost));
    const maxPayment = Math.max(...results.map(r => r.monthlyPayment));
    const maxRate = Math.max(...results.map(r => r.rate));
    const maxDuration = Math.max(...results.map(r => r.duration));

    const scoredLoans = results.map(r => {
        const costScore = maxCost > 0 ? 10 * (1 - r.totalCost / maxCost) : 5;
        const paymentScore = maxPayment > 0 ? 10 * (1 - r.monthlyPayment / maxPayment) : 5;
        const rateScore = maxRate > 0 ? 10 * (1 - r.rate / maxRate) : 5;
        const flexScore = r.type === 'constant' ? 6 : r.type === 'degressif' ? 7 : 5;
        const durationScore = maxDuration > 0 ? 10 * (1 - r.duration / maxDuration) : 5;

        return {
            ...r,
            scores: [
                Math.max(1, Math.min(10, costScore + 2)),
                Math.max(1, Math.min(10, paymentScore + 2)),
                Math.max(1, Math.min(10, rateScore + 2)),
                Math.max(1, Math.min(10, flexScore)),
                Math.max(1, Math.min(10, durationScore + 3))
            ],
            totalScore: costScore + paymentScore + rateScore + flexScore + durationScore
        };
    });

    const winner = scoredLoans.reduce((best, r) => r.totalScore > best.totalScore ? r : best, scoredLoans[0]);

    container.innerHTML = `
        <!-- Summary Table -->
        <div class="card section">
            <div class="card-header">
                <div class="card-title">Tableau comparatif</div>
                <div class="btn-group">
                    <button class="btn btn-sm btn-outline" id="bench-export-excel">Excel</button>
                    <button class="btn btn-sm btn-accent" id="bench-export-pdf">PDF</button>
                </div>
            </div>
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Crit\u00e8re</th>
                            ${results.map(r => `<th style="text-align:center">${r.name}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>Montant</td>
                            ${results.map(r => `<td class="number">${Financial.formatCurrency(r.principal)}</td>`).join('')}
                        </tr>
                        <tr>
                            <td>Taux</td>
                            ${results.map(r => `<td class="number">${Financial.formatPercent(r.rate)}</td>`).join('')}
                        </tr>
                        <tr>
                            <td>Dur\u00e9e</td>
                            ${results.map(r => `<td class="number">${r.duration} mois (${(r.duration / 12).toFixed(1)} ans)</td>`).join('')}
                        </tr>
                        <tr>
                            <td>Type</td>
                            ${results.map(r => `<td class="number">${r.type === 'constant' ? 'Amortissable' : r.type === 'degressif' ? 'D\u00e9gressif' : 'In Fine'}</td>`).join('')}
                        </tr>
                        <tr>
                            <td><strong>Mensualit\u00e9</strong></td>
                            ${results.map(r => `<td class="number" style="${r.monthlyPayment === bestPayment ? 'color:var(--success);font-weight:700' : ''}">${Financial.formatCurrency(r.monthlyPayment)}</td>`).join('')}
                        </tr>
                        <tr>
                            <td><strong>Total int\u00e9r\u00eats</strong></td>
                            ${results.map(r => `<td class="number" style="${r.totalInterest === bestInterest ? 'color:var(--success);font-weight:700' : ''}">${Financial.formatCurrency(r.totalInterest)}</td>`).join('')}
                        </tr>
                        <tr class="total-row">
                            <td><strong>Co\u00fbt total</strong></td>
                            ${results.map(r => `<td class="number" style="${r.totalCost === bestCost ? 'color:var(--success)' : ''}">${Financial.formatCurrency(r.totalCost)}</td>`).join('')}
                        </tr>
                        ${results.some(r => r.taeg) ? `<tr>
                            <td>TAEG</td>
                            ${results.map(r => `<td class="number">${r.taeg ? Financial.formatPercent(r.taeg) : '\u2014'}</td>`).join('')}
                        </tr>` : ''}
                    </tbody>
                </table>
            </div>
            ${winner ? `<div style="margin-top:16px;padding:12px 16px;background:var(--success-bg);border-radius:var(--radius-md);font-size:0.9rem">
                <strong style="color:var(--success)">Recommandation :</strong> ${winner.name} offre le meilleur rapport global (score: ${winner.totalScore.toFixed(1)}/50)
            </div>` : ''}
        </div>

        <!-- Charts -->
        <div class="grid-2 section">
            <div class="card">
                <div class="card-title">Comparaison des co\u00fbts</div>
                <div class="chart-container"><canvas id="chart-bench-cost"></canvas></div>
            </div>
            <div class="card">
                <div class="card-title">Comparaison des mensualit\u00e9s</div>
                <div class="chart-container"><canvas id="chart-bench-payment"></canvas></div>
            </div>
        </div>

        <div class="grid-2 section">
            <div class="card">
                <div class="card-title">Profil radar</div>
                <div class="chart-container"><canvas id="chart-bench-radar"></canvas></div>
            </div>
            <div class="card">
                <div class="card-title">\u00c9volution du CRD</div>
                <div class="chart-container"><canvas id="chart-bench-balance"></canvas></div>
            </div>
        </div>
    `;

    // Render charts
    Charts.benchmarkComparison('chart-bench-cost', results, {
        key: 'totalCost',
        label: 'Co\u00fbt total',
        format: v => Financial.formatCurrency(v)
    });

    Charts.benchmarkComparison('chart-bench-payment', results, {
        key: 'monthlyPayment',
        label: 'Mensualit\u00e9',
        format: v => Financial.formatCurrency(v)
    });

    Charts.radarChart('chart-bench-radar', scoredLoans);

    // Balance comparison
    const maxPeriods = Math.max(...results.map(r => r.schedule?.length || 0));
    const labels = Array.from({ length: maxPeriods }, (_, i) => i + 1);
    const datasets = results.map(r => ({
        label: r.name,
        data: labels.map(p => {
            const row = r.schedule?.[p - 1];
            return row?.balance ?? null;
        })
    }));
    Charts.multiLineComparison('chart-bench-balance', datasets, labels);

    // Export handlers
    document.getElementById('bench-export-pdf')?.addEventListener('click', () => Export.benchmarkPdf(results));
    document.getElementById('bench-export-excel')?.addEventListener('click', () => {
        if (typeof XLSX === 'undefined') return;
        const wb = XLSX.utils.book_new();
        const data = [
            ['Pr\u00eat', 'Montant', 'Taux', 'Dur\u00e9e', 'Type', 'Mensualit\u00e9', 'Total Int.', 'Co\u00fbt Total'],
            ...results.map(r => [r.name, r.principal, r.rate + '%', r.duration, r.type, Math.round(r.monthlyPayment * 100) / 100, Math.round(r.totalInterest), Math.round(r.totalCost)])
        ];
        const ws = XLSX.utils.aoa_to_sheet(data);
        ws['!cols'] = data[0].map(() => ({ wch: 16 }));
        XLSX.utils.book_append_sheet(wb, ws, 'Benchmark');
        XLSX.writeFile(wb, `benchmark_${new Date().toISOString().slice(0, 10)}.xlsx`);
    });

    document.querySelectorAll('.bench-output').forEach(el => el.classList.remove('hidden'));
}

export const BenchmarkModule = {
    render() {
        return `
            <div class="page-header">
                <h1>Benchmark - Comparaison de Pr\u00eats</h1>
                <p>Comparez jusqu'\u00e0 ${MAX_LOANS} offres de financement c\u00f4te \u00e0 c\u00f4te</p>
            </div>

            <div class="grid-auto section" id="loan-cards">
                ${renderLoanCards()}
            </div>

            <div style="text-align:center;margin-bottom:28px">
                <button class="btn btn-primary btn-lg" id="run-benchmark">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>
                    Lancer le benchmark
                </button>
            </div>

            <div id="benchmark-results"></div>
        `;
    },

    init() {
        const container = document.getElementById('loan-cards');

        // Input handling
        container?.addEventListener('input', e => {
            const idx = parseInt(e.target.dataset.index);
            const field = e.target.dataset.field;
            if (isNaN(idx) || !field || !loans[idx]) return;
            const val = e.target.value;
            loans[idx][field] = (field === 'name' || field === 'type') ? val : parseFloat(val) || 0;
        });

        container?.addEventListener('change', e => {
            const idx = parseInt(e.target.dataset.index);
            const field = e.target.dataset.field;
            if (isNaN(idx) || !field || !loans[idx]) return;
            const val = e.target.value;
            loans[idx][field] = (field === 'name' || field === 'type') ? val : parseFloat(val) || 0;
        });

        // Remove loan
        container?.addEventListener('click', e => {
            const btn = e.target.closest('.remove-loan');
            if (!btn) return;
            const idx = parseInt(btn.dataset.index);
            if (loans.length <= 2) { window.showToast?.('Minimum 2 pr\u00eats requis', 'warning'); return; }
            loans.splice(idx, 1);
            container.innerHTML = renderLoanCards();
        });

        // Add loan
        container?.addEventListener('click', e => {
            if (!e.target.closest('#add-loan-slot')) return;
            if (loans.length >= MAX_LOANS) return;
            loans.push({
                name: `Pr\u00eat ${String.fromCharCode(65 + loans.length)}`,
                principal: 500000,
                rate: 4.5,
                duration: 84,
                type: 'constant',
                insurance: 0,
                fees: 0
            });
            container.innerHTML = renderLoanCards();
        });

        // Run benchmark
        document.getElementById('run-benchmark')?.addEventListener('click', runBenchmark);
    }
};
