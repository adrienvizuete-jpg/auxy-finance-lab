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
        label: 'Refinancement',
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
    propertyName: '',
    propertyAddress: '',
    propertyValue: 2000000,
    acquisitionCost: 2000000,
    travauxCost: 0,
    fraisNotaire: 150000,
    fraisDivers: 0,
    grossRent: 120000,
    taxeFonciere: 8000,
    fraisGestion: 6000,
    vacancyRate: 5,
    entretien: 3000,
    directNoi: 100000,
    loanAmount: 1400000,
    annualRate: 4.0,
    durationMonths: 240,
    amortType: 'constant',
    frequency: 'monthly',
    fees: 0,
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
    const sim = computeAmortization();
    const schedule = sim.schedule || [];
    const ppy = Financial.getPeriodsPerYear?.(state.frequency) || 12;

    let annualDebtService = 0;
    const periodsInYear = Math.min(ppy, schedule.length);
    for (let i = 0; i < periodsInYear; i++) {
        annualDebtService += schedule[i]?.payment || 0;
    }

    const noi = computeNOI();
    const ltv = computeLTV();
    const ltc = config.showCosts ? computeLTC() : null;
    const dscr = config.showRevenue ? computeDSCR(annualDebtService) : null;
    const valuation = config.showValuation ? computeValuation() : null;
    const propertyValue = computePropertyValue();
    const totalCost = config.showCosts ? computeTotalCost() : null;
    const sensitivity = config.showValuation ? computeSensitivityTable() : [];

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
// FORM HTML (dynamic based on nature)
// =============================================

function getFormHTML() {
    const config = NATURE_CONFIG[currentNature];
    let html = '';

    // Row 1: Property identification (always visible, compact)
    html += `
        <div class="immo-form-section">
            <div class="immo-section-label">Bien immobilier</div>
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
    `;

    // Costs section (hidden for refinancement)
    if (config.showCosts) {
        const totalCost = computeTotalCost();
        html += `
            <div class="immo-form-section">
                <div class="immo-section-label">Coûts du projet <span class="immo-section-total">${Financial.formatCurrency(totalCost)}</span></div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Acquisition (€)</label>
                        <input type="number" class="form-input" value="${state.acquisitionCost}" data-field="acquisitionCost" min="0" step="10000">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Travaux (€)</label>
                        <input type="number" class="form-input" value="${state.travauxCost}" data-field="travauxCost" min="0" step="5000">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Frais notaire (€) <button class="btn btn-ghost btn-xs" id="immo-auto-notaire" title="7.5% du prix d'acquisition" style="font-size:0.65rem;padding:1px 6px">auto</button></label>
                        <input type="number" class="form-input" value="${state.fraisNotaire}" data-field="fraisNotaire" min="0" step="1000">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Frais divers (€)</label>
                        <input type="number" class="form-input" value="${state.fraisDivers}" data-field="fraisDivers" min="0" step="1000">
                    </div>
                </div>
            </div>
        `;
    }

    // Revenue / NOI section (hidden for marchand)
    if (config.showRevenue) {
        const noi = computeNOI();
        html += `
            <div class="immo-form-section">
                <div class="immo-section-label" style="display:flex;justify-content:space-between;align-items:center">
                    <span>Revenus locatifs <span class="immo-section-total">NOI : ${Financial.formatCurrency(noi)}</span></span>
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
                    <div class="form-group">
                        <label class="form-label">Gestion (€/an)</label>
                        <input type="number" class="form-input" value="${state.fraisGestion}" data-field="fraisGestion" min="0" step="500">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Vacance (%)</label>
                        <input type="number" class="form-input" value="${state.vacancyRate}" data-field="vacancyRate" min="0" max="100" step="1">
                    </div>
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
            </div>
        `;
    }

    // Valuation section
    if (config.showValuation) {
        html += `
            <div class="immo-form-section">
                <div class="immo-section-label" style="display:flex;justify-content:space-between;align-items:center">
                    <span>Valorisation</span>
                    <div class="bench-toggle-group" id="ltv-source-toggle">
                        <button class="toggle-btn-sm ${ltvSource === 'manual' ? 'active' : ''}" data-ltvsource="manual">Valeur manuelle</button>
                        <button class="toggle-btn-sm ${ltvSource === 'caprate' ? 'active' : ''}" data-ltvsource="caprate">Cap rate</button>
                    </div>
                </div>
                <div class="form-row">
                    ${ltvSource === 'manual' ? `
                    <div class="form-group">
                        <label class="form-label">Valeur du bien (€)</label>
                        <input type="number" class="form-input" value="${state.propertyValue}" data-field="propertyValue" min="0" step="10000">
                    </div>` : ''}
                    <div class="form-group">
                        <label class="form-label">Taux de capitalisation (%)</label>
                        <input type="number" class="form-input" value="${state.capRate}" data-field="capRate" min="0.1" max="20" step="0.1">
                    </div>
                </div>
                <div class="form-row" style="margin-top:4px">
                    <div class="form-group" style="flex:0 0 auto">
                        <label class="form-label" style="font-size:0.75rem;color:var(--text-muted)">Sensibilité</label>
                        <div style="display:flex;gap:8px;align-items:center">
                            <input type="number" class="form-input" value="${state.capRateMin}" data-field="capRateMin" min="0.5" max="20" step="0.5" style="width:70px" title="Min">
                            <span style="color:var(--text-muted);font-size:0.8rem">à</span>
                            <input type="number" class="form-input" value="${state.capRateMax}" data-field="capRateMax" min="0.5" max="20" step="0.5" style="width:70px" title="Max">
                            <span style="color:var(--text-muted);font-size:0.8rem">pas</span>
                            <input type="number" class="form-input" value="${state.capRateStep}" data-field="capRateStep" min="0.1" max="2" step="0.1" style="width:60px" title="Step">
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // Financing section (always visible)
    html += `
        <div class="immo-form-section">
            <div class="immo-section-label">Financement</div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Montant du prêt (€)</label>
                    <input type="number" class="form-input" value="${state.loanAmount}" data-field="loanAmount" min="0" step="10000">
                </div>
                <div class="form-group">
                    <label class="form-label">Taux annuel (%)</label>
                    <input type="number" class="form-input" value="${state.annualRate}" data-field="annualRate" min="0" max="30" step="0.01">
                </div>
                <div class="form-group">
                    <label class="form-label">Durée (mois)</label>
                    <input type="number" class="form-input" value="${state.durationMonths}" data-field="durationMonths" min="1" max="600" step="1">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Amortissement</label>
                    <select class="form-select" data-field="amortType">
                        ${AMORT_OPTIONS.map(o => `<option value="${o.value}" ${state.amortType === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
                    </select>
                </div>
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

    return html;
}

// =============================================
// RESULTS RENDERING
// =============================================

function renderResults() {
    const container = document.getElementById('immo-results');
    if (!container || !lastResult) return;

    const r = lastResult;
    const config = NATURE_CONFIG[currentNature];

    // Show output sections
    document.querySelectorAll('.immo-output').forEach(el => el.classList.remove('hidden'));

    container.innerHTML = `
        <div class="results-grid">
            <div class="result-item">
                <div class="result-label">LTV</div>
                <div class="result-value">${r.ltv.toFixed(1)} %</div>
                <div class="result-sub">${ltvBadge(r.ltv)} Loan-to-Value</div>
            </div>
            ${r.ltc !== null ? `
            <div class="result-item">
                <div class="result-label">LTC</div>
                <div class="result-value">${r.ltc.toFixed(1)} %</div>
                <div class="result-sub">${ltvBadge(r.ltc)} Loan-to-Cost</div>
            </div>` : ''}
            ${r.dscr !== null ? `
            <div class="result-item">
                <div class="result-label">DSCR</div>
                <div class="result-value">${r.dscr.toFixed(2)}x</div>
                <div class="result-sub">${dscrBadge(r.dscr)}</div>
            </div>` : ''}
            <div class="result-item">
                <div class="result-label">Mensualité</div>
                <div class="result-value">${Financial.formatCurrency(r.monthlyPayment)}</div>
                <div class="result-sub">service de la dette</div>
            </div>
            ${r.noi && config.showRevenue ? `
            <div class="result-item">
                <div class="result-label">NOI annuel</div>
                <div class="result-value">${Financial.formatCurrency(r.noi)}</div>
                <div class="result-sub">net operating income</div>
            </div>` : ''}
            ${r.valuation !== null ? `
            <div class="result-item">
                <div class="result-label">Valorisation</div>
                <div class="result-value">${Financial.formatCurrency(r.valuation)}</div>
                <div class="result-sub">cap rate ${state.capRate}%</div>
            </div>` : ''}
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
    `;

    // Sensitivity table
    const sensiContainer = document.getElementById('immo-sensitivity');
    if (sensiContainer && config.showValuation && r.sensitivity.length > 0) {
        sensiContainer.innerHTML = `
            <table class="data-table">
                <thead><tr><th>Taux de capi</th><th>Valorisation</th><th>LTV</th></tr></thead>
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
        `;
    } else if (sensiContainer) {
        sensiContainer.innerHTML = '';
    }

    // Chart
    if (r.schedule.length > 0) {
        Charts.amortization('chart-immo-amort', r.schedule);
    }

    // Schedule table
    const schedContainer = document.getElementById('immo-schedule-table');
    if (schedContainer) {
        const displayCount = Math.min(r.schedule.length, 60);
        const showToggle = r.schedule.length > 60;
        schedContainer.innerHTML = `
            <div class="table-container" style="max-height:400px;overflow-y:auto">
                <table class="data-table" id="immo-amort-table">
                    <thead><tr><th>Période</th><th>Mensualité</th><th>Capital</th><th>Intérêts</th><th>CRD</th></tr></thead>
                    <tbody>
                        ${r.schedule.slice(0, displayCount).map((row, idx) => `
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
            ${showToggle ? `<button class="btn btn-ghost btn-sm" style="margin-top:8px" id="immo-show-all">Afficher les ${r.schedule.length} lignes</button>` : ''}
        `;

        document.getElementById('immo-show-all')?.addEventListener('click', function () {
            const tbody = document.querySelector('#immo-amort-table tbody');
            if (tbody) {
                tbody.innerHTML = r.schedule.map((row, idx) => `
                    <tr>
                        <td class="number">${idx + 1}</td>
                        <td class="number">${Financial.formatCurrency(row.payment)}</td>
                        <td class="number">${Financial.formatCurrency(row.principal)}</td>
                        <td class="number">${Financial.formatCurrency(row.interest)}</td>
                        <td class="number">${Financial.formatCurrency(row.balance)}</td>
                    </tr>`).join('');
            }
            this.remove();
        });
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

    let sensiComment = '';
    if (r.sensitivity.length > 0) {
        const best = r.sensitivity[r.sensitivity.length - 1];
        const worst = r.sensitivity[0];
        sensiComment = `Sensibilité : cap rate ${worst.capRate.toFixed(1)}% → valorisation ${Financial.formatCurrency(worst.valuation)} (LTV ${worst.ltv.toFixed(1)}%) | cap rate ${best.capRate.toFixed(1)}% → ${Financial.formatCurrency(best.valuation)} (LTV ${best.ltv.toFixed(1)}%).`;
    }

    container.innerHTML = `
        <div class="memo-card">
            <h3 style="margin-bottom:16px;color:var(--text-primary);font-size:1rem">Note d'investissement — ${config.label}</h3>
            <div class="memo-section">
                <p><strong>Bien :</strong> ${state.propertyName || 'N/A'} ${state.propertyAddress ? '— ' + state.propertyAddress : ''}</p>
                <p><strong>Valeur retenue :</strong> ${Financial.formatCurrency(r.propertyValue)} ${ltvSource === 'caprate' ? '(valorisation cap rate)' : '(valeur de marché)'}</p>
                ${r.totalCost !== null ? `<p><strong>Coût total projet :</strong> ${Financial.formatCurrency(r.totalCost)}</p>` : ''}
            </div>
            ${config.showRevenue ? `
            <div class="memo-section">
                <p><strong>Loyer brut :</strong> ${Financial.formatCurrency(state.grossRent)} | <strong>NOI :</strong> ${Financial.formatCurrency(r.noi)} | <strong>Rdt brut :</strong> ${(state.grossRent / r.propertyValue * 100).toFixed(2)}% | <strong>Rdt net :</strong> ${(r.noi / r.propertyValue * 100).toFixed(2)}%</p>
            </div>` : ''}
            <div class="memo-section">
                <p><strong>Prêt :</strong> ${Financial.formatCurrency(state.loanAmount)} à ${state.annualRate}% sur ${state.durationMonths} mois | <strong>Mensualité :</strong> ${Financial.formatCurrency(r.monthlyPayment)} | <strong>TAEG :</strong> ${r.taeg != null ? r.taeg.toFixed(2) + '%' : 'N/A'}</p>
            </div>
            <div class="memo-section">
                <table class="data-table" style="max-width:400px;font-size:0.85rem">
                    <tbody>
                        <tr><td>LTV</td><td class="number">${r.ltv.toFixed(1)} %</td><td>${ltvBadge(r.ltv)}</td></tr>
                        ${r.ltc !== null ? `<tr><td>LTC</td><td class="number">${r.ltc.toFixed(1)} %</td><td>${ltvBadge(r.ltc)}</td></tr>` : ''}
                        ${r.dscr !== null ? `<tr><td>DSCR</td><td class="number">${r.dscr.toFixed(2)}x</td><td>${dscrBadge(r.dscr)}</td></tr>` : ''}
                    </tbody>
                </table>
            </div>
            ${sensiComment ? `<div class="memo-section"><p style="font-size:0.85rem;color:var(--text-secondary)">${sensiComment}</p></div>` : ''}
            <div class="memo-recommendation ${recClass}">
                <strong>Recommandation :</strong> ${recommendation}
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
        { type: 'keyvalue', items: [
            { label: 'Bien', value: state.propertyName || 'N/A' },
            { label: 'Nature', value: config.label },
            { label: 'Valeur du bien', value: Financial.formatCurrency(r.propertyValue) },
            { label: 'Date d\'analyse', value: new Date().toLocaleDateString('fr-FR') }
        ]},
        { type: 'separator' }
    ];

    if (config.showCosts && r.totalCost !== null) {
        sections.push({ type: 'keyvalue', items: [
            { label: 'Cout d\'acquisition', value: Financial.formatCurrency(state.acquisitionCost) },
            { label: 'Travaux', value: Financial.formatCurrency(state.travauxCost) },
            { label: 'Frais de notaire', value: Financial.formatCurrency(state.fraisNotaire) },
            { label: 'Frais divers', value: Financial.formatCurrency(state.fraisDivers) },
            { label: 'Cout total du projet', value: Financial.formatCurrency(r.totalCost) }
        ]});
        sections.push({ type: 'separator' });
    }

    sections.push({ type: 'keyvalue', items: [
        { label: 'Montant du pret', value: Financial.formatCurrency(state.loanAmount) },
        { label: 'Taux', value: state.annualRate + ' %' },
        { label: 'Duree', value: state.durationMonths + ' mois' },
        { label: 'Mensualite', value: Financial.formatCurrency(r.monthlyPayment) },
        { label: 'Total interets', value: Financial.formatCurrency(r.totalInterest) },
        ...(r.taeg != null ? [{ label: 'TAEG', value: r.taeg.toFixed(2) + ' %' }] : [])
    ]});
    sections.push({ type: 'separator' });

    const ratioItems = [{ label: 'LTV', value: r.ltv.toFixed(1) + ' %' }];
    if (r.ltc !== null) ratioItems.push({ label: 'LTC', value: r.ltc.toFixed(1) + ' %' });
    if (r.dscr !== null) ratioItems.push({ label: 'DSCR', value: r.dscr.toFixed(2) + 'x' });
    if (r.noi && config.showRevenue) ratioItems.push({ label: 'NOI', value: Financial.formatCurrency(r.noi) });
    if (r.valuation !== null) ratioItems.push({ label: 'Valorisation', value: Financial.formatCurrency(r.valuation) });
    ratioItems.push({ label: 'Service de dette annuel', value: Financial.formatCurrency(r.annualDebtService) });
    sections.push({ type: 'keyvalue', items: ratioItems });

    if (r.sensitivity.length > 0) {
        sections.push({ type: 'separator' });
        sections.push({ type: 'table', headers: ['Taux capi', 'Valorisation', 'LTV'], rows: r.sensitivity.map(s => [s.capRate.toFixed(1) + ' %', Financial.formatCurrency(s.valuation), s.ltv.toFixed(1) + ' %']) });
    }

    sections.push({ type: 'separator' });
    const schedRows = r.schedule.slice(0, 60);
    sections.push({ type: 'table', headers: ['Periode', 'Mensualite', 'Capital', 'Interets', 'CRD'], rows: schedRows.map((row, i) => [String(i + 1), Financial.formatCurrency(row.payment), Financial.formatCurrency(row.principal), Financial.formatCurrency(row.interest), Financial.formatCurrency(row.balance)]) });

    Export.toPdf(`Analyse Immobiliere - ${config.label}`, sections, `immobilier_${currentNature}`);
}

function exportExcel() {
    if (!lastResult || typeof XLSX === 'undefined') return;
    const r = lastResult;
    const config = NATURE_CONFIG[currentNature];
    const wb = XLSX.utils.book_new();

    const summaryData = [
        ['Analyse Immobilière', config.label],
        ['Date', new Date().toLocaleDateString('fr-FR')],
        [], ['BIEN'],
        ['Nom', state.propertyName || 'N/A'],
        ['Adresse', state.propertyAddress || 'N/A'],
        ['Valeur', r.propertyValue], []
    ];
    if (config.showCosts) {
        summaryData.push(['COUTS'], ['Acquisition', state.acquisitionCost], ['Travaux', state.travauxCost], ['Frais notaire', state.fraisNotaire], ['Frais divers', state.fraisDivers], ['Coût total', r.totalCost], []);
    }
    if (config.showRevenue) {
        summaryData.push(['REVENUS'], ['Loyer brut annuel', state.grossRent], ['NOI', r.noi], []);
    }
    summaryData.push(
        ['FINANCEMENT'], ['Montant du prêt', state.loanAmount], ['Taux', state.annualRate + '%'], ['Durée (mois)', state.durationMonths],
        ['Mensualité', Math.round(r.monthlyPayment * 100) / 100], ['Total intérêts', Math.round(r.totalInterest)],
        ...(r.taeg != null ? [['TAEG', r.taeg.toFixed(2) + '%']] : []), [],
        ['RATIOS'], ['LTV', r.ltv.toFixed(1) + '%'],
        ...(r.ltc !== null ? [['LTC', r.ltc.toFixed(1) + '%']] : []),
        ...(r.dscr !== null ? [['DSCR', r.dscr.toFixed(2) + 'x']] : []),
        ...(r.valuation !== null ? [['Valorisation', Math.round(r.valuation)]] : []),
        ['Service dette annuel', Math.round(r.annualDebtService)]
    );
    const ws1 = XLSX.utils.aoa_to_sheet(summaryData);
    ws1['!cols'] = [{ wch: 22 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Résumé');

    if (r.sensitivity.length > 0) {
        const sensiData = [['Taux capi', 'Valorisation', 'LTV'], ...r.sensitivity.map(s => [s.capRate.toFixed(1) + '%', Math.round(s.valuation), s.ltv.toFixed(1) + '%'])];
        const ws2 = XLSX.utils.aoa_to_sheet(sensiData);
        ws2['!cols'] = [{ wch: 12 }, { wch: 16 }, { wch: 12 }];
        XLSX.utils.book_append_sheet(wb, ws2, 'Sensibilité');
    }

    const schedData = [['Période', 'Mensualité', 'Capital', 'Intérêts', 'CRD'], ...r.schedule.map((row, i) => [i + 1, Math.round(row.payment * 100) / 100, Math.round(row.principal * 100) / 100, Math.round(row.interest * 100) / 100, Math.round(row.balance * 100) / 100])];
    const ws3 = XLSX.utils.aoa_to_sheet(schedData);
    ws3['!cols'] = [{ wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws3, 'Échéancier');

    XLSX.writeFile(wb, `immobilier_${currentNature}_${new Date().toISOString().slice(0, 10)}.xlsx`);
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

            <!-- Nature Tabs (like Credit module) -->
            <div class="tabs" id="immo-tabs">
                ${Object.entries(NATURE_CONFIG).map(([key, cfg]) => `
                    <button class="tab ${currentNature === key ? 'active' : ''}" data-nature="${key}" title="${cfg.desc}">
                        ${cfg.label}
                    </button>
                `).join('')}
            </div>

            <!-- Single Form Card -->
            <div class="card section">
                <div class="card-header">
                    <div>
                        <div class="card-title">Paramètres</div>
                        <div class="card-subtitle" id="immo-nature-desc">${NATURE_CONFIG[currentNature].desc}</div>
                    </div>
                </div>
                <div id="immo-form-fields">
                    ${getFormHTML()}
                </div>
                <div class="btn-group" style="margin-top:20px">
                    <button class="btn btn-primary btn-lg" id="immo-calculate">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                        Calculer
                    </button>
                    <button class="btn btn-outline" id="immo-generate-memo" style="display:none">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                        Note d'investissement
                    </button>
                </div>
            </div>

            <!-- Results (KPIs) -->
            <div id="immo-results"></div>

            <!-- Charts + Sensitivity (side by side) -->
            <div class="immo-output hidden">
                <div class="grid-2 section">
                    <div class="card">
                        <div class="card-title">Décomposition des mensualités</div>
                        <div class="chart-container"><canvas id="chart-immo-amort"></canvas></div>
                    </div>
                    <div class="card">
                        <div class="card-title">Sensibilité au taux de capitalisation</div>
                        <div id="immo-sensitivity" style="max-height:350px;overflow-y:auto"></div>
                    </div>
                </div>
            </div>

            <!-- Schedule Table -->
            <div class="immo-output hidden">
                <div class="card section">
                    <div class="card-header">
                        <div class="card-title">Tableau d'amortissement</div>
                        <div class="btn-group">
                            <button class="btn btn-sm btn-outline" id="immo-export-excel">Excel</button>
                            <button class="btn btn-sm btn-accent" id="immo-export-pdf">PDF</button>
                        </div>
                    </div>
                    <div id="immo-schedule-table"></div>
                </div>
            </div>

            <!-- Investment Memo -->
            <div id="immo-memo-content"></div>
        `;
    },

    init() {
        const formContainer = document.getElementById('immo-form-fields');

        // ── Nature Tabs ──
        document.getElementById('immo-tabs')?.addEventListener('click', e => {
            const btn = e.target.closest('.tab');
            if (!btn || !btn.dataset.nature) return;
            const nature = btn.dataset.nature;
            if (nature === currentNature) return;

            currentNature = nature;
            const config = NATURE_CONFIG[nature];
            state.amortType = config.defaultAmort;
            state.durationMonths = config.defaultDuration;

            document.querySelectorAll('#immo-tabs .tab').forEach(t => t.classList.remove('active'));
            btn.classList.add('active');

            const sub = document.getElementById('immo-nature-desc');
            if (sub) sub.textContent = config.desc;

            formContainer.innerHTML = getFormHTML();

            hasCalculated = false;
            lastResult = null;
            document.getElementById('immo-results').innerHTML = '';
            document.getElementById('immo-memo-content').innerHTML = '';
            document.querySelectorAll('.immo-output').forEach(el => el.classList.add('hidden'));
            document.getElementById('immo-generate-memo').style.display = 'none';
        });

        // ── Delegated input/change ──
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

        formContainer?.addEventListener('input', handleFieldUpdate);
        formContainer?.addEventListener('change', handleFieldUpdate);

        // ── Delegated click on form ──
        formContainer?.addEventListener('click', e => {
            // NOI mode toggle
            const noiBtn = e.target.closest('[data-noimmode]');
            if (noiBtn) {
                noiMode = noiBtn.dataset.noimmode;
                formContainer.innerHTML = getFormHTML();
                if (hasCalculated) { clearTimeout(recalcTimer); recalcTimer = setTimeout(runCalculation, 300); }
                return;
            }

            // LTV source toggle
            const ltvBtn = e.target.closest('[data-ltvsource]');
            if (ltvBtn) {
                ltvSource = ltvBtn.dataset.ltvsource;
                formContainer.innerHTML = getFormHTML();
                if (hasCalculated) { clearTimeout(recalcTimer); recalcTimer = setTimeout(runCalculation, 300); }
                return;
            }

            // Auto notaire
            if (e.target.closest('#immo-auto-notaire')) {
                state.fraisNotaire = Math.round(state.acquisitionCost * 0.075);
                formContainer.innerHTML = getFormHTML();
                if (hasCalculated) { clearTimeout(recalcTimer); recalcTimer = setTimeout(runCalculation, 300); }
                return;
            }
        });

        // ── Calculate button ──
        document.getElementById('immo-calculate')?.addEventListener('click', () => {
            runCalculation();
            document.getElementById('immo-generate-memo').style.display = '';
        });
    }
};
