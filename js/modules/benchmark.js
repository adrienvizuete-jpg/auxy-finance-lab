/**
 * Auxy Partners - Benchmark / Loan Comparison Module
 * With multi-person insurance and guarantee support
 */

import { Financial } from '../utils/financial.js';
import { Charts } from '../utils/charts.js';
import { Export } from '../utils/export.js';
import { Storage } from '../utils/storage.js';

const MAX_LOANS = 5;

function defaultLoan(name) {
    return {
        name,
        principal: 500000,
        rate: 4.5,
        duration: 84,
        type: 'constant',
        fees: 0,
        insP1: { mode: 'amount', value: 0, nature: 'ci', quotite: 100 },
        insP2: { mode: 'amount', value: 0, nature: 'ci', quotite: 0 },
        guarantee: { mode: 'amount', value: 0 }
    };
}

let loans = [defaultLoan('Prêt A'), defaultLoan('Prêt B')];
loans[1].rate = 4.0;
loans[1].duration = 120;

let results = [];

// ── Helpers ──

function setNestedField(loan, fieldPath, value) {
    const parts = fieldPath.split('.');
    if (parts.length === 1) {
        loan[fieldPath] = value;
    } else {
        let obj = loan;
        for (let i = 0; i < parts.length - 1; i++) {
            if (!obj[parts[i]]) obj[parts[i]] = {};
            obj = obj[parts[i]];
        }
        obj[parts[parts.length - 1]] = value;
    }
}

function getNestedField(loan, fieldPath) {
    const parts = fieldPath.split('.');
    let obj = loan;
    for (const p of parts) {
        if (obj == null) return undefined;
        obj = obj[p];
    }
    return obj;
}

function computePersonInsurance(person, principal, balance, periodsPerYear) {
    if (!person || !person.quotite || person.quotite <= 0) return 0;
    const q = person.quotite / 100;
    if (person.mode === 'rate' && person.value > 0) {
        const base = person.nature === 'crd' ? balance : principal;
        return base * person.value / 100 / periodsPerYear * q;
    }
    return (person.value || 0) * q;
}

// ── UI: Insurance/guarantee section per card ──

function renderInsuranceSection(loan, i) {
    const p1 = loan.insP1;
    const p2 = loan.insP2;
    const g = loan.guarantee;
    const showP2 = p2.quotite > 0;

    return `
        <div class="bench-insurance-section">
            <div class="bench-section-title">Assurance & Garantie</div>

            <!-- Person 1 -->
            <div class="bench-ins-person">
                <div class="bench-ins-label">Emprunteur 1</div>
                <div class="bench-ins-row">
                    <div class="bench-toggle-group">
                        <button class="toggle-btn-sm bench-toggle ${p1.mode === 'amount' ? 'active' : ''}" data-index="${i}" data-field="insP1.mode" data-val="amount">€/mois</button>
                        <button class="toggle-btn-sm bench-toggle ${p1.mode === 'rate' ? 'active' : ''}" data-index="${i}" data-field="insP1.mode" data-val="rate">Taux %</button>
                    </div>
                    <input type="number" class="form-input form-input-sm" value="${p1.value}" data-index="${i}" data-field="insP1.value" min="0" step="${p1.mode === 'rate' ? '0.01' : '10'}" placeholder="${p1.mode === 'rate' ? 'Taux' : 'Montant'}">
                </div>
                ${p1.mode === 'rate' ? `
                <div class="bench-ins-row">
                    <div class="bench-toggle-group">
                        <button class="toggle-btn-sm bench-toggle ${p1.nature === 'ci' ? 'active' : ''}" data-index="${i}" data-field="insP1.nature" data-val="ci">Capital Emprunté</button>
                        <button class="toggle-btn-sm bench-toggle ${p1.nature === 'crd' ? 'active' : ''}" data-index="${i}" data-field="insP1.nature" data-val="crd">Capital Restant Dû</button>
                    </div>
                </div>` : ''}
                <div class="bench-ins-row">
                    <label class="bench-ins-mini-label">Quotité %</label>
                    <input type="number" class="form-input form-input-sm" value="${p1.quotite}" data-index="${i}" data-field="insP1.quotite" min="0" max="100" step="5" style="max-width:80px">
                </div>
            </div>

            <!-- Person 2 -->
            <div class="bench-ins-person ${showP2 ? '' : 'bench-p2-collapsed'}">
                <div class="bench-ins-label">
                    Emprunteur 2
                    ${!showP2 ? `<button class="btn btn-ghost btn-xs bench-show-p2" data-index="${i}">+ Ajouter</button>` : ''}
                </div>
                ${showP2 ? `
                <div class="bench-ins-row">
                    <div class="bench-toggle-group">
                        <button class="toggle-btn-sm bench-toggle ${p2.mode === 'amount' ? 'active' : ''}" data-index="${i}" data-field="insP2.mode" data-val="amount">€/mois</button>
                        <button class="toggle-btn-sm bench-toggle ${p2.mode === 'rate' ? 'active' : ''}" data-index="${i}" data-field="insP2.mode" data-val="rate">Taux %</button>
                    </div>
                    <input type="number" class="form-input form-input-sm" value="${p2.value}" data-index="${i}" data-field="insP2.value" min="0" step="${p2.mode === 'rate' ? '0.01' : '10'}" placeholder="${p2.mode === 'rate' ? 'Taux' : 'Montant'}">
                </div>
                ${p2.mode === 'rate' ? `
                <div class="bench-ins-row">
                    <div class="bench-toggle-group">
                        <button class="toggle-btn-sm bench-toggle ${p2.nature === 'ci' ? 'active' : ''}" data-index="${i}" data-field="insP2.nature" data-val="ci">Capital Emprunté</button>
                        <button class="toggle-btn-sm bench-toggle ${p2.nature === 'crd' ? 'active' : ''}" data-index="${i}" data-field="insP2.nature" data-val="crd">Capital Restant Dû</button>
                    </div>
                </div>` : ''}
                <div class="bench-ins-row">
                    <label class="bench-ins-mini-label">Quotité %</label>
                    <input type="number" class="form-input form-input-sm" value="${p2.quotite}" data-index="${i}" data-field="insP2.quotite" min="0" max="100" step="5" style="max-width:80px">
                </div>` : ''}
            </div>

            <!-- Guarantee -->
            <div class="bench-guarantee">
                <div class="bench-ins-label">Garantie</div>
                <div class="bench-ins-row">
                    <div class="bench-toggle-group">
                        <button class="toggle-btn-sm bench-toggle ${g.mode === 'amount' ? 'active' : ''}" data-index="${i}" data-field="guarantee.mode" data-val="amount">Montant €</button>
                        <button class="toggle-btn-sm bench-toggle ${g.mode === 'percent' ? 'active' : ''}" data-index="${i}" data-field="guarantee.mode" data-val="percent">% du capital</button>
                    </div>
                    <input type="number" class="form-input form-input-sm" value="${g.value}" data-index="${i}" data-field="guarantee.value" min="0" step="${g.mode === 'percent' ? '0.1' : '100'}" placeholder="${g.mode === 'percent' ? '%' : '€'}">
                </div>
            </div>
        </div>
    `;
}

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
                    <label class="form-label">Montant (€)</label>
                    <input type="number" class="form-input" value="${loan.principal}" data-index="${i}" data-field="principal" min="1000" step="10000">
                </div>
                <div class="form-group">
                    <label class="form-label">Taux (%)</label>
                    <input type="number" class="form-input" value="${loan.rate}" data-index="${i}" data-field="rate" min="0.01" max="30" step="0.01">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Durée (mois)</label>
                    <input type="number" class="form-input" value="${loan.duration}" data-index="${i}" data-field="duration" min="1" max="600" step="1">
                </div>
                <div class="form-group">
                    <label class="form-label">Type</label>
                    <select class="form-select" data-index="${i}" data-field="type">
                        <option value="constant" ${loan.type === 'constant' ? 'selected' : ''}>Amortissable</option>
                        <option value="degressif" ${loan.type === 'degressif' ? 'selected' : ''}>Dégressif</option>
                        <option value="infine" ${loan.type === 'infine' ? 'selected' : ''}>In Fine</option>
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Frais de dossier (€)</label>
                    <input type="number" class="form-input" value="${loan.fees}" data-index="${i}" data-field="fees" min="0" step="100">
                </div>
            </div>
            ${renderInsuranceSection(loan, i)}
        </div>
    `).join('') + (loans.length < MAX_LOANS ? `
        <div class="comparison-slot" id="add-loan-slot">
            <div style="color:var(--text-muted)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="32" height="32" style="margin-bottom:8px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                <div>Ajouter un prêt</div>
            </div>
        </div>
    ` : '');
}

// ── Computation ──

function runBenchmark() {
    results = loans.map(loan => {
        // 1. Run base simulation without insurance
        let sim;
        const params = {
            principal: loan.principal,
            annualRate: loan.rate,
            durationMonths: loan.duration,
            insuranceMonthly: 0,
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

        const schedule = sim.schedule || [];
        const ppy = 12; // periods per year

        // 2. Compute guarantee amount
        const guaranteeAmount = loan.guarantee.mode === 'percent'
            ? loan.principal * loan.guarantee.value / 100
            : (loan.guarantee.value || 0);

        // 3. Overlay insurance on each period
        let totalInsurance = 0;
        schedule.forEach(row => {
            const insP1 = computePersonInsurance(loan.insP1, loan.principal, row.balance, ppy);
            const insP2 = computePersonInsurance(loan.insP2, loan.principal, row.balance, ppy);
            const periodIns = insP1 + insP2;
            row.insurance = periodIns;
            row.payment = (row.payment || 0) + periodIns;
            totalInsurance += periodIns;
        });

        // 4. Compute totals
        const monthlyPaymentBase = sim.monthlyPayment || sim.firstPayment || sim.monthlyPaymentExInsurance || 0;
        const avgMonthlyInsurance = schedule.length > 0 ? totalInsurance / schedule.length : 0;
        const monthlyPayment = monthlyPaymentBase + avgMonthlyInsurance;
        const totalInterest = sim.totalInterest;
        const totalCost = totalInterest + totalInsurance + guaranteeAmount + (loan.fees || 0);
        const totalPayment = loan.principal + totalCost;

        // 5. Compute TAEG with insurance + guarantee
        let taeg = null;
        try {
            const cashflows = [-(loan.principal - (loan.fees || 0) - guaranteeAmount)];
            schedule.forEach(row => {
                cashflows.push(row.payment);
            });
            taeg = Financial.taeg(cashflows, ppy);
        } catch (e) {
            taeg = sim.taeg || null;
        }

        return {
            ...loan,
            monthlyPayment,
            monthlyPaymentBase,
            avgMonthlyInsurance,
            totalInterest,
            totalInsurance,
            guaranteeAmount,
            totalCost,
            totalPayment,
            schedule,
            taeg
        };
    });

    renderComparison();
}

// ── Comparison rendering ──

function renderComparison() {
    const container = document.getElementById('benchmark-results');
    if (!container || results.length === 0) return;

    const bestCost = Math.min(...results.map(r => r.totalCost));
    const bestPayment = Math.min(...results.map(r => r.monthlyPayment));
    const bestInterest = Math.min(...results.map(r => r.totalInterest));
    const bestInsurance = Math.min(...results.map(r => r.totalInsurance));

    // Scoring
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

    const hasInsurance = results.some(r => r.totalInsurance > 0);
    const hasGuarantee = results.some(r => r.guaranteeAmount > 0);

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
                            <th>Critère</th>
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
                            <td>Durée</td>
                            ${results.map(r => `<td class="number">${r.duration} mois (${(r.duration / 12).toFixed(1)} ans)</td>`).join('')}
                        </tr>
                        <tr>
                            <td>Type</td>
                            ${results.map(r => `<td class="number">${r.type === 'constant' ? 'Amortissable' : r.type === 'degressif' ? 'Dégressif' : 'In Fine'}</td>`).join('')}
                        </tr>
                        <tr>
                            <td><strong>Mensualité (hors ass.)</strong></td>
                            ${results.map(r => `<td class="number">${Financial.formatCurrency(r.monthlyPaymentBase)}</td>`).join('')}
                        </tr>
                        ${hasInsurance ? `<tr>
                            <td>Assurance/mois (moy.)</td>
                            ${results.map(r => `<td class="number">${Financial.formatCurrency(r.avgMonthlyInsurance)}</td>`).join('')}
                        </tr>` : ''}
                        <tr>
                            <td><strong>Mensualité totale</strong></td>
                            ${results.map(r => `<td class="number" style="${r.monthlyPayment === bestPayment ? 'color:var(--success);font-weight:700' : ''}">${Financial.formatCurrency(r.monthlyPayment)}</td>`).join('')}
                        </tr>
                        <tr>
                            <td><strong>Total intérêts</strong></td>
                            ${results.map(r => `<td class="number" style="${r.totalInterest === bestInterest ? 'color:var(--success);font-weight:700' : ''}">${Financial.formatCurrency(r.totalInterest)}</td>`).join('')}
                        </tr>
                        ${hasInsurance ? `<tr>
                            <td>Coût assurance total</td>
                            ${results.map(r => `<td class="number" style="${r.totalInsurance === bestInsurance ? 'color:var(--success);font-weight:700' : ''}">${Financial.formatCurrency(r.totalInsurance)}</td>`).join('')}
                        </tr>` : ''}
                        ${hasGuarantee ? `<tr>
                            <td>Frais de garantie</td>
                            ${results.map(r => `<td class="number">${Financial.formatCurrency(r.guaranteeAmount)}</td>`).join('')}
                        </tr>` : ''}
                        <tr class="total-row">
                            <td><strong>Coût total</strong></td>
                            ${results.map(r => `<td class="number" style="${r.totalCost === bestCost ? 'color:var(--success)' : ''}">${Financial.formatCurrency(r.totalCost)}</td>`).join('')}
                        </tr>
                        ${results.some(r => r.taeg) ? `<tr>
                            <td>TAEG</td>
                            ${results.map(r => `<td class="number">${r.taeg ? Financial.formatPercent(r.taeg) : '—'}</td>`).join('')}
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
                <div class="card-title">Comparaison des coûts</div>
                <div class="chart-container"><canvas id="chart-bench-cost"></canvas></div>
            </div>
            <div class="card">
                <div class="card-title">Comparaison des mensualités</div>
                <div class="chart-container"><canvas id="chart-bench-payment"></canvas></div>
            </div>
        </div>

        <div class="grid-2 section">
            <div class="card">
                <div class="card-title">Profil radar</div>
                <div class="chart-container"><canvas id="chart-bench-radar"></canvas></div>
            </div>
            <div class="card">
                <div class="card-title">Évolution du CRD</div>
                <div class="chart-container"><canvas id="chart-bench-balance"></canvas></div>
            </div>
        </div>
    `;

    // Render charts
    Charts.benchmarkComparison('chart-bench-cost', results, {
        key: 'totalCost',
        label: 'Coût total',
        format: v => Financial.formatCurrency(v)
    });

    Charts.benchmarkComparison('chart-bench-payment', results, {
        key: 'monthlyPayment',
        label: 'Mensualité',
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
            ['Prêt', 'Montant', 'Taux', 'Durée', 'Type', 'Mensualité', 'Ass./mois', 'Total Int.', 'Coût Ass.', 'Garantie', 'Coût Total', 'TAEG'],
            ...results.map(r => [
                r.name,
                r.principal,
                r.rate + '%',
                r.duration,
                r.type === 'constant' ? 'Amortissable' : r.type === 'degressif' ? 'Dégressif' : 'In Fine',
                Math.round(r.monthlyPayment * 100) / 100,
                Math.round(r.avgMonthlyInsurance * 100) / 100,
                Math.round(r.totalInterest),
                Math.round(r.totalInsurance),
                Math.round(r.guaranteeAmount),
                Math.round(r.totalCost),
                r.taeg ? r.taeg.toFixed(2) + '%' : '—'
            ])
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
                <h1>Benchmark - Comparaison de Prêts</h1>
                <p>Comparez jusqu'à ${MAX_LOANS} offres de financement côte à côte</p>
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

        // Input handling (supports dotted field paths like insP1.value)
        container?.addEventListener('input', e => {
            const idx = parseInt(e.target.dataset.index);
            const field = e.target.dataset.field;
            if (isNaN(idx) || !field || !loans[idx]) return;
            const val = e.target.value;
            const isText = field === 'name' || field === 'type';
            setNestedField(loans[idx], field, isText ? val : parseFloat(val) || 0);
        });

        container?.addEventListener('change', e => {
            const idx = parseInt(e.target.dataset.index);
            const field = e.target.dataset.field;
            if (isNaN(idx) || !field || !loans[idx]) return;
            const val = e.target.value;
            const isText = field === 'name' || field === 'type';
            setNestedField(loans[idx], field, isText ? val : parseFloat(val) || 0);
        });

        // Toggle buttons (mode, nature)
        container?.addEventListener('click', e => {
            const toggle = e.target.closest('.bench-toggle');
            if (toggle) {
                const idx = parseInt(toggle.dataset.index);
                const field = toggle.dataset.field;
                const val = toggle.dataset.val;
                if (isNaN(idx) || !field || !loans[idx]) return;
                setNestedField(loans[idx], field, val);
                container.innerHTML = renderLoanCards();
                return;
            }

            // Show person 2
            const showP2 = e.target.closest('.bench-show-p2');
            if (showP2) {
                const idx = parseInt(showP2.dataset.index);
                if (!isNaN(idx) && loans[idx]) {
                    loans[idx].insP2.quotite = 100;
                    container.innerHTML = renderLoanCards();
                }
                return;
            }

            // Remove loan
            const removeBtn = e.target.closest('.remove-loan');
            if (removeBtn) {
                const idx = parseInt(removeBtn.dataset.index);
                if (loans.length <= 2) { window.showToast?.('Minimum 2 prêts requis', 'warning'); return; }
                loans.splice(idx, 1);
                container.innerHTML = renderLoanCards();
                return;
            }

            // Add loan
            if (e.target.closest('#add-loan-slot')) {
                if (loans.length >= MAX_LOANS) return;
                loans.push(defaultLoan(`Prêt ${String.fromCharCode(65 + loans.length)}`));
                container.innerHTML = renderLoanCards();
                return;
            }
        });

        // Run benchmark
        document.getElementById('run-benchmark')?.addEventListener('click', runBenchmark);
    }
};
