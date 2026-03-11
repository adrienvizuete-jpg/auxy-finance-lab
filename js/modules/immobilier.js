/**
 * Auxy Partners - Module Immobilier
 * Foncière, Marchand de Biens, Investisseur, Fiducie, Refinancement Hypothécaire
 * Calculs : LTV, LTC, DSCR, Valorisation par capitalisation, Amortissement
 */

import { Financial } from '../utils/financial.js';
import { Charts } from '../utils/charts.js';
import { Export } from '../utils/export.js';
import { Storage } from '../utils/storage.js';

// =============================================
// CONSTANTS
// =============================================

const NATURE_CONFIG = {
    fonciere: {
        label: 'Foncière',
        desc: 'Investissement locatif long terme',
        showCosts: true,
        showRevenue: true,
        showValuation: true,
        defaultAmort: 'constant',
        defaultDuration: 240
    },
    marchand: {
        label: 'Marchand de Biens',
        desc: 'Achat-revente court terme',
        showCosts: true,
        showRevenue: false,
        showValuation: false,
        defaultAmort: 'infine',
        defaultDuration: 24
    },
    investisseur: {
        label: 'Investisseur',
        desc: 'Portefeuille immobilier',
        showCosts: true,
        showRevenue: true,
        showValuation: true,
        defaultAmort: 'constant',
        defaultDuration: 180
    },
    fiducie: {
        label: 'Fiducie',
        desc: 'Garantie fiduciaire',
        showCosts: true,
        showRevenue: true,
        showValuation: true,
        defaultAmort: 'constant',
        defaultDuration: 180
    },
    refinancement: {
        label: 'Refinancement Hypothécaire',
        desc: 'Refinancement d\'un actif existant',
        showCosts: false,
        showRevenue: true,
        showValuation: true,
        defaultAmort: 'constant',
        defaultDuration: 180
    }
};

const AMORT_OPTIONS = [
    { value: 'constant', label: 'Amortissable Constant' },
    { value: 'degressif', label: 'Amortissable Dégressif' },
    { value: 'infine', label: 'In Fine' }
];

const FREQ_OPTIONS = [
    { value: 'monthly', label: 'Mensuel' },
    { value: 'quarterly', label: 'Trimestriel' },
    { value: 'semiannual', label: 'Semestriel' },
    { value: 'annual', label: 'Annuel' }
];

// =============================================
// STATE
// =============================================

let currentNature = 'fonciere';
let noiMode = 'detailed';
let ltvSource = 'manual';
let lastResult = null;
let recalcTimer = null;
let hasCalculated = false;

const state = {
    // Property
    propertyName: '',
    propertyAddress: '',
    propertyValue: 2000000,

    // Costs
    acquisitionCost: 2000000,
    travauxCost: 0,
    fraisNotaire: 150000,
    fraisDivers: 0,

    // Revenue
    grossRent: 120000,
    taxeFonciere: 8000,
    fraisGestion: 6000,
    vacancyRate: 5,
    entretien: 3000,
    directNoi: 100000,

    // Financing
    loanAmount: 1400000,
    annualRate: 4.0,
    durationMonths: 240,
    amortType: 'constant',
    frequency: 'monthly',
    fees: 0,

    // Valuation
    capRate: 6.0,
    capRateMin: 4.0,
    capRateMax: 8.0,
    capRateStep: 0.5
};

// =============================================
// CALCULATION FUNCTIONS
// =============================================

function computeNOI() {
    if (noiMode === 'simplified') return state.directNoi || 0;
    const vacancyDeduction = state.grossRent * (state.vacancyRate / 100);
    return state.grossRent - vacancyDeduction - state.taxeFonciere - state.fraisGestion - state.entretien;
}

function computeValuation() {
    const noi = computeNOI();
    return state.capRate > 0 ? noi / (state.capRate / 100) : 0;
}

function computePropertyValue() {
    return ltvSource === 'caprate' ? computeValuation() : state.propertyValue;
}

function computeTotalCost() {
    return state.acquisitionCost + state.travauxCost + state.fraisNotaire + state.fraisDivers;
}

function computeLTV() {
    const value = computePropertyValue();
    return value > 0 ? (state.loanAmount / value) * 100 : 0;
}

function computeLTC() {
    const cost = computeTotalCost();
    return cost > 0 ? (state.loanAmount / cost) * 100 : 0;
}

function computeDSCR(annualDebtService) {
    const noi = computeNOI();
    return annualDebtService > 0 ? noi / annualDebtService : 0;
}

function computeSensitivityTable() {
    const noi = computeNOI();
    const rows = [];
    for (let cr = state.capRateMin; cr <= state.capRateMax + 0.001; cr += state.capRateStep) {
        const crRound = Math.round(cr * 100) / 100;
        const val = noi / (crRound / 100);
        const ltv = val > 0 ? (state.loanAmount / val) * 100 : 0;
        rows.push({ capRate: crRound, valuation: val, ltv });
    }
    return rows;
}

function computeAmortization() {
    const params = {
        principal: state.loanAmount,
        annualRate: state.annualRate,
        durationMonths: state.durationMonths,
        insuranceMonthly: 0,
        fees: state.fees,
        frequency: state.frequency
    };
    switch (state.amortType) {
        case 'degressif': return Financial.amortissableDegressif(params);
        case 'infine': return Financial.inFine(params);
        default: return Financial.amortissableConstant(params);
    }
}

function ltvBadge(value) {
    if (value > 80) return '<span class="kpi-badge kpi-badge-red">Élevé</span>';
    if (value > 70) return '<span class="kpi-badge kpi-badge-orange">Modéré</span>';
    return '<span class="kpi-badge kpi-badge-green">Bon</span>';
}

function dscrBadge(value) {
    if (value < 1.0) return '<span class="kpi-badge kpi-badge-red">Insuffisant</span>';
    if (value < 1.2) return '<span class="kpi-badge kpi-badge-orange">Limite</span>';
    return '<span class="kpi-badge kpi-badge-green">Confortable</span>';
}

function sensitivityColor(ltv) {
    if (ltv > 80) return 'var(--danger-bg, #fde8e8)';
    if (ltv > 70) return 'var(--warning-bg, #fef3cd)';
    return 'var(--success-bg, #d4edda)';
}

// =============================================
// MAIN CALCULATION
// =============================================

function runCalculation() {
    const config = NATURE_CONFIG[currentNature];

    // Amortization
    const sim = computeAmortization();
    const schedule = sim.schedule || [];
    const ppy = Financial.getPeriodsPerYear?.(state.frequency) || 12;

    // Annual debt service
    let annualDebtService = 0;
    const periodsInYear = Math.min(ppy, schedule.length);
    for (let i = 0; i < periodsInYear; i++) {
        annualDebtService += schedule[i]?.payment || 0;
    }

    // NOI
    const noi = computeNOI();

    // Ratios
    const ltv = computeLTV();
    const ltc = config.showCosts ? computeLTC() : null;
    const dscr = config.showRevenue ? computeDSCR(annualDebtService) : null;
    const valuation = config.showValuation ? computeValuation() : null;
    const propertyValue = computePropertyValue();
    const totalCost = config.showCosts ? computeTotalCost() : null;

    // Sensitivity
    const sensitivity = config.showValuation ? computeSensitivityTable() : [];

    // TAEG
    let taeg = null;
    try {
        const cashflows = [-(state.loanAmount - (state.fees || 0))];
        schedule.forEach(row => cashflows.push(row.payment));
        taeg = Financial.taeg(cashflows, ppy);
    } catch (e) {
        taeg = sim.taeg || null;
    }

    lastResult = {
        noi, ltv, ltc, dscr, valuation, propertyValue, totalCost,
        annualDebtService, sensitivity, schedule, taeg,
        monthlyPayment: sim.monthlyPayment || sim.firstPayment || 0,
        totalInterest: sim.totalInterest || 0,
        totalPayment: sim.totalPayment || 0
    };

    hasCalculated = true;
    renderResults();
}

// =============================================
// RESULTS RENDERING
// =============================================

function renderResults() {
    const container = document.getElementById('immo-results');
    if (!container || !lastResult) return;

    const r = lastResult;
    const config = NATURE_CONFIG[currentNature];

    container.innerHTML = `
        <!-- KPIs -->
        <div class="card section">
            <div class="card-header">
                <div class="card-title">Indicateurs clés</div>
            </div>
            <div class="results-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-top:12px">
                <div class="result-item">
                    <div class="result-label">LTV (Loan-to-Value)</div>
                    <div class="result-value">${r.ltv.toFixed(1)} % ${ltvBadge(r.ltv)}</div>
                </div>
                ${r.ltc !== null ? `
                <div class="result-item">
                    <div class="result-label">LTC (Loan-to-Cost)</div>
                    <div class="result-value">${r.ltc.toFixed(1)} % ${ltvBadge(r.ltc)}</div>
                </div>` : ''}
                ${r.dscr !== null ? `
                <div class="result-item">
                    <div class="result-label">DSCR</div>
                    <div class="result-value">${r.dscr.toFixed(2)}x ${dscrBadge(r.dscr)}</div>
                </div>` : ''}
                ${r.noi && config.showRevenue ? `
                <div class="result-item">
                    <div class="result-label">NOI annuel</div>
                    <div class="result-value">${Financial.formatCurrency(r.noi)}</div>
                </div>` : ''}
                ${r.valuation !== null ? `
                <div class="result-item">
                    <div class="result-label">Valorisation (Cap Rate ${state.capRate}%)</div>
                    <div class="result-value">${Financial.formatCurrency(r.valuation)}</div>
                </div>` : ''}
                <div class="result-item">
                    <div class="result-label">Service de dette annuel</div>
                    <div class="result-value">${Financial.formatCurrency(r.annualDebtService)}</div>
                </div>
                <div class="result-item">
                    <div class="result-label">Mensualité</div>
                    <div class="result-value">${Financial.formatCurrency(r.monthlyPayment)}</div>
                </div>
                <div class="result-item">
                    <div class="result-label">Total intérêts</div>
                    <div class="result-value">${Financial.formatCurrency(r.totalInterest)}</div>
                </div>
                ${r.taeg != null ? `
                <div class="result-item">
                    <div class="result-label">TAEG</div>
                    <div class="result-value">${r.taeg.toFixed(2)} %</div>
                </div>` : ''}
            </div>
        </div>

        ${config.showValuation && r.sensitivity.length > 0 ? `
        <!-- Sensitivity Table -->
        <div class="card section">
            <div class="card-header">
                <div class="card-title">Sensibilité au taux de capitalisation</div>
            </div>
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Taux de capi</th>
                            <th>Valorisation</th>
                            <th>LTV</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${r.sensitivity.map(row => {
                            const isActive = Math.abs(row.capRate - state.capRate) < 0.01;
                            return `<tr style="${isActive ? 'font-weight:700;' : ''}">
                                <td class="number">${row.capRate.toFixed(1)} %</td>
                                <td class="number">${Financial.formatCurrency(row.valuation)}</td>
                                <td class="number" style="background:${sensitivityColor(row.ltv)}">${row.ltv.toFixed(1)} %</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>` : ''}

        <!-- Amortization -->
        <div class="card section">
            <div class="card-header">
                <div class="card-title">Tableau d'amortissement</div>
                <div class="btn-group">
                    <button class="btn btn-sm btn-outline" id="immo-export-excel">Excel</button>
                    <button class="btn btn-sm btn-accent" id="immo-export-pdf">PDF</button>
                </div>
            </div>
            <div class="chart-container" style="margin-bottom:20px">
                <canvas id="chart-immo-amort"></canvas>
            </div>
            <div class="table-container" style="max-height:400px;overflow-y:auto">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Période</th>
                            <th>Mensualité</th>
                            <th>Capital</th>
                            <th>Intérêts</th>
                            <th>CRD</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${r.schedule.map((row, idx) => `
                        <tr>
                            <td class="number">${idx + 1}</td>
                            <td class="number">${Financial.formatCurrency(row.payment)}</td>
                            <td class="number">${Financial.formatCurrency(row.principal)}</td>
                            <td class="number">${Financial.formatCurrency(row.interest)}</td>
                            <td class="number">${Financial.formatCurrency(row.balance)}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Investment Memo -->
        <div class="card section">
            <button class="btn btn-primary" id="immo-generate-memo">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                Générer la note d'investissement
            </button>
            <div id="immo-memo-content"></div>
        </div>
    `;

    // Render chart
    if (r.schedule.length > 0) {
        Charts.amortization('chart-immo-amort', r.schedule);
    }

    // Bind export + memo buttons
    document.getElementById('immo-export-pdf')?.addEventListener('click', exportPdf);
    document.getElementById('immo-export-excel')?.addEventListener('click', exportExcel);
    document.getElementById('immo-generate-memo')?.addEventListener('click', generateMemo);
}

// =============================================
// INVESTMENT MEMO
// =============================================

function generateMemo() {
    const container = document.getElementById('immo-memo-content');
    if (!container || !lastResult) return;

    const r = lastResult;
    const config = NATURE_CONFIG[currentNature];

    // Recommendation logic
    let recommendation = '';
    let recClass = '';
    if (r.ltv <= 70 && (r.dscr === null || r.dscr >= 1.2)) {
        recommendation = 'Le profil de risque est favorable. Les ratios sont dans les normes bancaires avec une marge de sécurité confortable.';
        recClass = 'memo-positive';
    } else if (r.ltv <= 80 && (r.dscr === null || r.dscr >= 1.0)) {
        recommendation = 'Le profil est acceptable mais les ratios sont proches des limites. Une attention particulière doit être portée à la sensibilité des hypothèses.';
        recClass = 'memo-neutral';
    } else {
        recommendation = 'Le profil présente des risques significatifs. Les ratios dépassent les seuils habituellement acceptés par les établissements bancaires.';
        recClass = 'memo-negative';
    }

    // Best/worst sensitivity
    let sensiComment = '';
    if (r.sensitivity.length > 0) {
        const bestCase = r.sensitivity[r.sensitivity.length - 1]; // highest cap rate = lowest valuation
        const worstCase = r.sensitivity[0]; // lowest cap rate = highest valuation
        sensiComment = `En scénario favorable (cap rate ${worstCase.capRate.toFixed(1)}%), la valorisation atteint ${Financial.formatCurrency(worstCase.valuation)} (LTV ${worstCase.ltv.toFixed(1)}%). En scénario défavorable (cap rate ${bestCase.capRate.toFixed(1)}%), elle descend à ${Financial.formatCurrency(bestCase.valuation)} (LTV ${bestCase.ltv.toFixed(1)}%).`;
    }

    container.innerHTML = `
        <div class="memo-card" style="margin-top:16px">
            <h3 style="margin-bottom:16px;color:var(--text-primary)">Note d'investissement</h3>

            <div class="memo-section">
                <h4>Objet de l'opération</h4>
                <p><strong>Bien :</strong> ${state.propertyName || 'Non renseigné'} ${state.propertyAddress ? '— ' + state.propertyAddress : ''}</p>
                <p><strong>Nature :</strong> ${config.label} — ${config.desc}</p>
                <p><strong>Valeur retenue :</strong> ${Financial.formatCurrency(r.propertyValue)} ${ltvSource === 'caprate' ? '(valorisation par capitalisation)' : '(valeur de marché)'}</p>
                ${r.totalCost !== null ? `<p><strong>Coût total du projet :</strong> ${Financial.formatCurrency(r.totalCost)}</p>` : ''}
            </div>

            ${config.showRevenue ? `
            <div class="memo-section">
                <h4>Revenus locatifs</h4>
                <p><strong>Loyer brut annuel :</strong> ${Financial.formatCurrency(state.grossRent)}</p>
                <p><strong>NOI :</strong> ${Financial.formatCurrency(r.noi)}</p>
                <p><strong>Rendement brut :</strong> ${(state.grossRent / r.propertyValue * 100).toFixed(2)} %</p>
                <p><strong>Rendement net (NOI/Valeur) :</strong> ${(r.noi / r.propertyValue * 100).toFixed(2)} %</p>
            </div>` : ''}

            <div class="memo-section">
                <h4>Financement</h4>
                <p><strong>Montant du prêt :</strong> ${Financial.formatCurrency(state.loanAmount)}</p>
                <p><strong>Taux :</strong> ${state.annualRate} % — <strong>Durée :</strong> ${state.durationMonths} mois (${(state.durationMonths / 12).toFixed(1)} ans)</p>
                <p><strong>Mensualité :</strong> ${Financial.formatCurrency(r.monthlyPayment)}</p>
                <p><strong>Total intérêts :</strong> ${Financial.formatCurrency(r.totalInterest)}</p>
                ${r.taeg != null ? `<p><strong>TAEG :</strong> ${r.taeg.toFixed(2)} %</p>` : ''}
            </div>

            <div class="memo-section">
                <h4>Ratios clés</h4>
                <table class="data-table" style="max-width:500px">
                    <tbody>
                        <tr><td>LTV</td><td class="number">${r.ltv.toFixed(1)} %</td><td>${ltvBadge(r.ltv)}</td></tr>
                        ${r.ltc !== null ? `<tr><td>LTC</td><td class="number">${r.ltc.toFixed(1)} %</td><td>${ltvBadge(r.ltc)}</td></tr>` : ''}
                        ${r.dscr !== null ? `<tr><td>DSCR</td><td class="number">${r.dscr.toFixed(2)}x</td><td>${dscrBadge(r.dscr)}</td></tr>` : ''}
                    </tbody>
                </table>
            </div>

            ${sensiComment ? `
            <div class="memo-section">
                <h4>Analyse de sensibilité</h4>
                <p>${sensiComment}</p>
            </div>` : ''}

            <div class="memo-section memo-recommendation ${recClass}">
                <h4>Recommandation</h4>
                <p>${recommendation}</p>
            </div>
        </div>
    `;
}

// =============================================
// EXPORTS
// =============================================

function exportPdf() {
    if (!lastResult) return;
    const r = lastResult;
    const config = NATURE_CONFIG[currentNature];

    const sections = [
        { type: 'title', text: `Analyse Immobiliere - ${config.label}` },
        { type: 'separator' },
        {
            type: 'keyvalue',
            items: [
                { label: 'Bien', value: state.propertyName || 'N/A' },
                { label: 'Nature', value: config.label },
                { label: 'Valeur du bien', value: Financial.formatCurrency(r.propertyValue) },
                { label: 'Date d\'analyse', value: new Date().toLocaleDateString('fr-FR') }
            ]
        },
        { type: 'separator' }
    ];

    // Costs
    if (config.showCosts && r.totalCost !== null) {
        sections.push({
            type: 'keyvalue',
            items: [
                { label: 'Cout d\'acquisition', value: Financial.formatCurrency(state.acquisitionCost) },
                { label: 'Travaux', value: Financial.formatCurrency(state.travauxCost) },
                { label: 'Frais de notaire', value: Financial.formatCurrency(state.fraisNotaire) },
                { label: 'Frais divers', value: Financial.formatCurrency(state.fraisDivers) },
                { label: 'Cout total du projet', value: Financial.formatCurrency(r.totalCost) }
            ]
        });
        sections.push({ type: 'separator' });
    }

    // Financing
    sections.push({
        type: 'keyvalue',
        items: [
            { label: 'Montant du pret', value: Financial.formatCurrency(state.loanAmount) },
            { label: 'Taux', value: state.annualRate + ' %' },
            { label: 'Duree', value: state.durationMonths + ' mois' },
            { label: 'Mensualite', value: Financial.formatCurrency(r.monthlyPayment) },
            { label: 'Total interets', value: Financial.formatCurrency(r.totalInterest) },
            ...(r.taeg != null ? [{ label: 'TAEG', value: r.taeg.toFixed(2) + ' %' }] : [])
        ]
    });
    sections.push({ type: 'separator' });

    // Ratios
    const ratioItems = [
        { label: 'LTV', value: r.ltv.toFixed(1) + ' %' }
    ];
    if (r.ltc !== null) ratioItems.push({ label: 'LTC', value: r.ltc.toFixed(1) + ' %' });
    if (r.dscr !== null) ratioItems.push({ label: 'DSCR', value: r.dscr.toFixed(2) + 'x' });
    if (r.noi && config.showRevenue) ratioItems.push({ label: 'NOI', value: Financial.formatCurrency(r.noi) });
    if (r.valuation !== null) ratioItems.push({ label: 'Valorisation', value: Financial.formatCurrency(r.valuation) });
    ratioItems.push({ label: 'Service de dette annuel', value: Financial.formatCurrency(r.annualDebtService) });
    sections.push({ type: 'keyvalue', items: ratioItems });

    // Sensitivity table
    if (r.sensitivity.length > 0) {
        sections.push({ type: 'separator' });
        sections.push({
            type: 'table',
            headers: ['Taux capi', 'Valorisation', 'LTV'],
            rows: r.sensitivity.map(s => [
                s.capRate.toFixed(1) + ' %',
                Financial.formatCurrency(s.valuation),
                s.ltv.toFixed(1) + ' %'
            ])
        });
    }

    // Schedule (first 60 periods)
    sections.push({ type: 'separator' });
    const schedRows = r.schedule.slice(0, 60);
    sections.push({
        type: 'table',
        headers: ['Periode', 'Mensualite', 'Capital', 'Interets', 'CRD'],
        rows: schedRows.map((row, i) => [
            String(i + 1),
            Financial.formatCurrency(row.payment),
            Financial.formatCurrency(row.principal),
            Financial.formatCurrency(row.interest),
            Financial.formatCurrency(row.balance)
        ])
    });

    Export.toPdf(`Analyse Immobiliere - ${config.label}`, sections, `immobilier_${currentNature}`);
}

function exportExcel() {
    if (!lastResult || typeof XLSX === 'undefined') return;
    const r = lastResult;
    const config = NATURE_CONFIG[currentNature];
    const wb = XLSX.utils.book_new();

    // Sheet 1: Summary
    const summaryData = [
        ['Analyse Immobilière', config.label],
        ['Date', new Date().toLocaleDateString('fr-FR')],
        [],
        ['BIEN'],
        ['Nom', state.propertyName || 'N/A'],
        ['Adresse', state.propertyAddress || 'N/A'],
        ['Valeur', r.propertyValue],
        []
    ];
    if (config.showCosts) {
        summaryData.push(
            ['COUTS'],
            ['Acquisition', state.acquisitionCost],
            ['Travaux', state.travauxCost],
            ['Frais notaire', state.fraisNotaire],
            ['Frais divers', state.fraisDivers],
            ['Coût total', r.totalCost],
            []
        );
    }
    if (config.showRevenue) {
        summaryData.push(
            ['REVENUS'],
            ['Loyer brut annuel', state.grossRent],
            ['NOI', r.noi],
            []
        );
    }
    summaryData.push(
        ['FINANCEMENT'],
        ['Montant du prêt', state.loanAmount],
        ['Taux', state.annualRate + '%'],
        ['Durée (mois)', state.durationMonths],
        ['Mensualité', Math.round(r.monthlyPayment * 100) / 100],
        ['Total intérêts', Math.round(r.totalInterest)],
        ...(r.taeg != null ? [['TAEG', r.taeg.toFixed(2) + '%']] : []),
        [],
        ['RATIOS'],
        ['LTV', r.ltv.toFixed(1) + '%'],
        ...(r.ltc !== null ? [['LTC', r.ltc.toFixed(1) + '%']] : []),
        ...(r.dscr !== null ? [['DSCR', r.dscr.toFixed(2) + 'x']] : []),
        ...(r.valuation !== null ? [['Valorisation', Math.round(r.valuation)]] : []),
        ['Service dette annuel', Math.round(r.annualDebtService)]
    );
    const ws1 = XLSX.utils.aoa_to_sheet(summaryData);
    ws1['!cols'] = [{ wch: 22 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Résumé');

    // Sheet 2: Sensitivity
    if (r.sensitivity.length > 0) {
        const sensiData = [
            ['Taux capi', 'Valorisation', 'LTV'],
            ...r.sensitivity.map(s => [s.capRate.toFixed(1) + '%', Math.round(s.valuation), s.ltv.toFixed(1) + '%'])
        ];
        const ws2 = XLSX.utils.aoa_to_sheet(sensiData);
        ws2['!cols'] = [{ wch: 12 }, { wch: 16 }, { wch: 12 }];
        XLSX.utils.book_append_sheet(wb, ws2, 'Sensibilité');
    }

    // Sheet 3: Schedule
    const schedData = [
        ['Période', 'Mensualité', 'Capital', 'Intérêts', 'CRD'],
        ...r.schedule.map((row, i) => [
            i + 1,
            Math.round(row.payment * 100) / 100,
            Math.round(row.principal * 100) / 100,
            Math.round(row.interest * 100) / 100,
            Math.round(row.balance * 100) / 100
        ])
    ];
    const ws3 = XLSX.utils.aoa_to_sheet(schedData);
    ws3['!cols'] = [{ wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws3, 'Échéancier');

    XLSX.writeFile(wb, `immobilier_${currentNature}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// =============================================
// UI RENDERING HELPERS
// =============================================

function renderNatureSelector() {
    return Object.entries(NATURE_CONFIG).map(([key, cfg]) => `
        <button class="toggle-btn ${currentNature === key ? 'active' : ''}" data-nature="${key}">
            ${cfg.label}
        </button>
    `).join('');
}

function renderCostsSection() {
    if (!NATURE_CONFIG[currentNature].showCosts) return '';
    const total = computeTotalCost();
    return `
        <div class="card section" id="immo-costs-section">
            <div class="card-title">Décomposition des coûts</div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Coût d'acquisition (€)</label>
                    <input type="number" class="form-input" value="${state.acquisitionCost}" data-field="acquisitionCost" min="0" step="10000">
                </div>
                <div class="form-group">
                    <label class="form-label">Travaux (€)</label>
                    <input type="number" class="form-input" value="${state.travauxCost}" data-field="travauxCost" min="0" step="5000">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Frais de notaire (€) <button class="btn btn-ghost btn-xs" id="immo-auto-notaire" style="margin-left:8px;font-size:0.7rem">auto 7.5%</button></label>
                    <input type="number" class="form-input" value="${state.fraisNotaire}" data-field="fraisNotaire" min="0" step="1000">
                </div>
                <div class="form-group">
                    <label class="form-label">Frais divers (€)</label>
                    <input type="number" class="form-input" value="${state.fraisDivers}" data-field="fraisDivers" min="0" step="1000">
                </div>
            </div>
            <div style="margin-top:12px;padding:10px 14px;background:var(--bg-tertiary);border-radius:var(--radius-md);font-size:0.9rem">
                <strong>Coût total du projet :</strong> ${Financial.formatCurrency(total)}
            </div>
        </div>
    `;
}

function renderRevenueSection() {
    if (!NATURE_CONFIG[currentNature].showRevenue) return '';
    const noi = computeNOI();
    return `
        <div class="card section" id="immo-revenue-section">
            <div class="card-header" style="margin-bottom:12px">
                <div class="card-title">Revenus locatifs / NOI</div>
                <div class="bench-toggle-group" id="noi-mode-toggle">
                    <button class="toggle-btn-sm ${noiMode === 'detailed' ? 'active' : ''}" data-noimmode="detailed">Détaillé</button>
                    <button class="toggle-btn-sm ${noiMode === 'simplified' ? 'active' : ''}" data-noimmode="simplified">Simplifié</button>
                </div>
            </div>
            ${noiMode === 'detailed' ? `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Loyer brut annuel (€)</label>
                    <input type="number" class="form-input" value="${state.grossRent}" data-field="grossRent" min="0" step="1000">
                </div>
                <div class="form-group">
                    <label class="form-label">Taxe foncière (€/an)</label>
                    <input type="number" class="form-input" value="${state.taxeFonciere}" data-field="taxeFonciere" min="0" step="500">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Frais de gestion (€/an)</label>
                    <input type="number" class="form-input" value="${state.fraisGestion}" data-field="fraisGestion" min="0" step="500">
                </div>
                <div class="form-group">
                    <label class="form-label">Taux de vacance (%)</label>
                    <input type="number" class="form-input" value="${state.vacancyRate}" data-field="vacancyRate" min="0" max="100" step="1">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Entretien (€/an)</label>
                    <input type="number" class="form-input" value="${state.entretien}" data-field="entretien" min="0" step="500">
                </div>
            </div>
            ` : `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">NOI annuel (€)</label>
                    <input type="number" class="form-input" value="${state.directNoi}" data-field="directNoi" min="0" step="1000">
                </div>
            </div>
            `}
            <div style="margin-top:12px;padding:10px 14px;background:var(--bg-tertiary);border-radius:var(--radius-md);font-size:0.9rem">
                <strong>NOI calculé :</strong> ${Financial.formatCurrency(noi)}
            </div>
        </div>
    `;
}

function renderFinancingSection() {
    return `
        <div class="card section" id="immo-financing-section">
            <div class="card-title">Financement</div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Montant du prêt (€)</label>
                    <input type="number" class="form-input" value="${state.loanAmount}" data-field="loanAmount" min="0" step="10000">
                </div>
                <div class="form-group">
                    <label class="form-label">Taux annuel (%)</label>
                    <input type="number" class="form-input" value="${state.annualRate}" data-field="annualRate" min="0" max="30" step="0.01">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Durée (mois)</label>
                    <input type="number" class="form-input" value="${state.durationMonths}" data-field="durationMonths" min="1" max="600" step="1">
                </div>
                <div class="form-group">
                    <label class="form-label">Type d'amortissement</label>
                    <select class="form-select" data-field="amortType">
                        ${AMORT_OPTIONS.map(o => `<option value="${o.value}" ${state.amortType === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Fréquence</label>
                    <select class="form-select" data-field="frequency">
                        ${FREQ_OPTIONS.map(o => `<option value="${o.value}" ${state.frequency === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Frais de dossier (€)</label>
                    <input type="number" class="form-input" value="${state.fees}" data-field="fees" min="0" step="100">
                </div>
            </div>
        </div>
    `;
}

function renderValuationSection() {
    if (!NATURE_CONFIG[currentNature].showValuation) return '';
    return `
        <div class="card section" id="immo-valuation-section">
            <div class="card-header" style="margin-bottom:12px">
                <div class="card-title">Valorisation par capitalisation</div>
                <div class="bench-toggle-group" id="ltv-source-toggle">
                    <button class="toggle-btn-sm ${ltvSource === 'manual' ? 'active' : ''}" data-ltvsource="manual">Valeur manuelle</button>
                    <button class="toggle-btn-sm ${ltvSource === 'caprate' ? 'active' : ''}" data-ltvsource="caprate">Valorisation cap rate</button>
                </div>
            </div>
            ${ltvSource === 'manual' ? `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Valeur du bien (€)</label>
                    <input type="number" class="form-input" value="${state.propertyValue}" data-field="propertyValue" min="0" step="10000">
                </div>
            </div>` : ''}
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Taux de capitalisation (%)</label>
                    <input type="number" class="form-input" value="${state.capRate}" data-field="capRate" min="0.1" max="20" step="0.1">
                </div>
            </div>
            <div style="margin-top:8px;font-size:0.85rem;color:var(--text-secondary)">
                <strong>Plage de sensibilité :</strong>
            </div>
            <div class="form-row" style="margin-top:4px">
                <div class="form-group">
                    <label class="form-label">Cap rate min (%)</label>
                    <input type="number" class="form-input" value="${state.capRateMin}" data-field="capRateMin" min="0.5" max="20" step="0.5">
                </div>
                <div class="form-group">
                    <label class="form-label">Cap rate max (%)</label>
                    <input type="number" class="form-input" value="${state.capRateMax}" data-field="capRateMax" min="0.5" max="20" step="0.5">
                </div>
                <div class="form-group">
                    <label class="form-label">Pas (%)</label>
                    <input type="number" class="form-input" value="${state.capRateStep}" data-field="capRateStep" min="0.1" max="2" step="0.1">
                </div>
            </div>
        </div>
    `;
}

// =============================================
// MODULE EXPORT
// =============================================

export const ImmobilierModule = {
    render() {
        return `
            <div class="page-header">
                <h1>Immobilier</h1>
                <p>Analyse d'opérations immobilières — ratios, valorisation et financement</p>
            </div>

            <!-- Nature selector -->
            <div class="card section">
                <div class="card-title">Nature de l'opération</div>
                <div class="immo-nature-grid" id="immo-nature-selector">
                    ${renderNatureSelector()}
                </div>
                <div style="margin-top:8px;font-size:0.85rem;color:var(--text-secondary)" id="immo-nature-desc">
                    ${NATURE_CONFIG[currentNature].desc}
                </div>
            </div>

            <!-- Property info -->
            <div class="card section">
                <div class="card-title">Informations du bien</div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Nom du bien</label>
                        <input type="text" class="form-input" value="${state.propertyName}" data-field="propertyName" placeholder="Ex: Immeuble Haussmann 75008">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Adresse</label>
                        <input type="text" class="form-input" value="${state.propertyAddress}" data-field="propertyAddress" placeholder="Ex: 15 rue de la Paix, Paris">
                    </div>
                </div>
            </div>

            <!-- Dynamic sections container -->
            <div id="immo-dynamic-sections">
                ${renderCostsSection()}
                ${renderRevenueSection()}
                ${renderValuationSection()}
                ${renderFinancingSection()}
            </div>

            <!-- Calculate button -->
            <div style="text-align:center;margin-bottom:28px">
                <button class="btn btn-primary btn-lg" id="immo-calculate">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    Calculer
                </button>
            </div>

            <!-- Results -->
            <div id="immo-results"></div>
        `;
    },

    init() {
        const dynamicContainer = document.getElementById('immo-dynamic-sections');

        // ── Nature selector ──
        document.getElementById('immo-nature-selector')?.addEventListener('click', e => {
            const btn = e.target.closest('.toggle-btn');
            if (!btn || !btn.dataset.nature) return;
            const nature = btn.dataset.nature;
            if (nature === currentNature) return;

            currentNature = nature;
            const config = NATURE_CONFIG[nature];

            // Reset defaults per nature
            state.amortType = config.defaultAmort;
            state.durationMonths = config.defaultDuration;

            // Update selector UI
            document.querySelectorAll('#immo-nature-selector .toggle-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('immo-nature-desc').textContent = config.desc;

            // Re-render dynamic sections
            dynamicContainer.innerHTML = renderCostsSection() + renderRevenueSection() + renderValuationSection() + renderFinancingSection();

            // Clear results
            hasCalculated = false;
            lastResult = null;
            const resultsEl = document.getElementById('immo-results');
            if (resultsEl) resultsEl.innerHTML = '';
        });

        // ── Delegated input/change on dynamic sections ──
        const handleFieldUpdate = e => {
            const field = e.target.dataset.field;
            if (!field) return;
            const isText = field === 'propertyName' || field === 'propertyAddress' || field === 'amortType' || field === 'frequency';
            state[field] = isText ? e.target.value : (parseFloat(e.target.value) || 0);

            if (hasCalculated) {
                clearTimeout(recalcTimer);
                recalcTimer = setTimeout(runCalculation, 300);
            }
        };

        dynamicContainer?.addEventListener('input', handleFieldUpdate);
        dynamicContainer?.addEventListener('change', handleFieldUpdate);

        // Also handle property info inputs (outside dynamic container)
        document.querySelectorAll('.page-container .card .form-input[data-field="propertyName"], .page-container .card .form-input[data-field="propertyAddress"]').forEach(input => {
            input.addEventListener('input', handleFieldUpdate);
        });

        // ── Delegated click on dynamic sections ──
        dynamicContainer?.addEventListener('click', e => {
            // NOI mode toggle
            const noiBtn = e.target.closest('[data-noimmode]');
            if (noiBtn) {
                noiMode = noiBtn.dataset.noimmode;
                dynamicContainer.innerHTML = renderCostsSection() + renderRevenueSection() + renderValuationSection() + renderFinancingSection();
                if (hasCalculated) {
                    clearTimeout(recalcTimer);
                    recalcTimer = setTimeout(runCalculation, 300);
                }
                return;
            }

            // LTV source toggle
            const ltvBtn = e.target.closest('[data-ltvsource]');
            if (ltvBtn) {
                ltvSource = ltvBtn.dataset.ltvsource;
                dynamicContainer.innerHTML = renderCostsSection() + renderRevenueSection() + renderValuationSection() + renderFinancingSection();
                if (hasCalculated) {
                    clearTimeout(recalcTimer);
                    recalcTimer = setTimeout(runCalculation, 300);
                }
                return;
            }

            // Auto notaire
            if (e.target.closest('#immo-auto-notaire')) {
                state.fraisNotaire = Math.round(state.acquisitionCost * 0.075);
                const input = dynamicContainer.querySelector('[data-field="fraisNotaire"]');
                if (input) input.value = state.fraisNotaire;
                if (hasCalculated) {
                    clearTimeout(recalcTimer);
                    recalcTimer = setTimeout(runCalculation, 300);
                }
                return;
            }
        });

        // ── Calculate button ──
        document.getElementById('immo-calculate')?.addEventListener('click', runCalculation);
    }
};
