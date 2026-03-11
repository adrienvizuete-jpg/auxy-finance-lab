/**
 * Auxy Partners - Credit Simulation Module
 * Types: Amortissable Constant, Dégressif, In Fine, Crédit-Bail, Revolving, Prêt Relais, Dette Mezzanine
 */

import { Financial } from '../utils/financial.js';
import { Charts } from '../utils/charts.js';
import { Export } from '../utils/export.js';
import { Storage } from '../utils/storage.js';
import { PARAM_LABELS, RESULT_LABELS, t, formatValue } from '../utils/i18n.js';

const CREDIT_TYPES = [
    { id: 'constant', label: 'Amortissable Constant', desc: 'Mensualités fixes' },
    { id: 'degressif', label: 'Amortissable Dégressif', desc: 'Amortissement constant' },
    { id: 'infine', label: 'In Fine', desc: 'Intérêts seuls + bullet' },
    { id: 'creditbail', label: 'Crédit-Bail', desc: "Leasing avec option d'achat" },
    { id: 'revolving', label: 'Revolving', desc: 'Ligne de crédit' },
    { id: 'relais', label: 'Prêt Relais', desc: 'Court terme, intérêts capitalisés' },
    { id: 'mezzanine', label: 'Dette Mezzanine', desc: 'Cash + PIK + equity kicker' },
    { id: 'tranching', label: 'Tranching', desc: 'Financement multi-tranches (LBO)' }
];

let currentType = 'constant';
let lastResult = null;
let tranchingTranches = [
    { name: 'Senior A', amount: 3000000, rate: 3.5, duration: 84, type: 'constant', frequency: 'monthly' },
    { name: 'Senior B', amount: 2000000, rate: 4.5, duration: 60, type: 'constant', frequency: 'monthly' },
    { name: 'Mezzanine', amount: 1000000, rate: 8.0, duration: 60, type: 'infine', frequency: 'monthly' }
];

// ── Default values per type (for reset) ──
const DEFAULTS = {
    constant: { 'cr-principal': 500000, 'cr-rate': 4.5, 'cr-duration': 84, 'cr-insurance': 0, 'cr-insurance-rate': 0.30, 'cr-fees': 0, 'cr-frequency': 'monthly', 'cr-deferral': 0 },
    degressif: { 'cr-principal': 500000, 'cr-rate': 4.5, 'cr-duration': 84, 'cr-insurance': 0, 'cr-insurance-rate': 0.30, 'cr-fees': 0, 'cr-frequency': 'monthly', 'cr-deferral': 0 },
    infine: { 'cr-principal': 500000, 'cr-rate': 4.5, 'cr-duration': 84, 'cr-insurance': 0, 'cr-insurance-rate': 0.30, 'cr-fees': 0, 'cr-frequency': 'monthly' },
    creditbail: { 'cr-principal': 500000, 'cr-deposit': 50000, 'cr-rate': 5.0, 'cr-duration': 60, 'cr-residual': 25000, 'cr-fees': 0 },
    revolving: { 'cr-principal': 1000000, 'cr-utilization': 60, 'cr-rate': 5.5, 'cr-commitment': 0.5, 'cr-duration': 12 },
    relais: { 'cr-principal': 300000, 'cr-salePrice': 450000, 'cr-rate': 5.0, 'cr-duration': 18, 'cr-capitalized': false, 'cr-fees': 0 },
    mezzanine: { 'cr-principal': 2000000, 'cr-duration': 60, 'cr-rate': 8.0, 'cr-pikRate': 4.0, 'cr-kicker': 5.0, 'cr-fees': 0 },
    tranching: {}
};

// ── Live formatting helper ──
function setupLiveFormatting() {
    document.querySelectorAll('#credit-form-fields .form-input[type="number"]').forEach(input => {
        const suffix = input.closest('.input-group')?.querySelector('.input-suffix')?.textContent?.trim();
        if (suffix !== '€') return;

        // Create or reuse preview element
        let preview = input.closest('.form-group')?.querySelector('.input-preview');
        if (!preview) {
            preview = document.createElement('div');
            preview.className = 'input-preview';
            input.closest('.form-group')?.appendChild(preview);
        }

        const updatePreview = () => {
            const val = parseFloat(input.value);
            if (!isNaN(val) && val > 0) {
                preview.textContent = Financial.formatCurrency(val);
            } else {
                preview.textContent = '';
            }
        };

        input.addEventListener('input', updatePreview);
        updatePreview();
    });
}

// ── Insurance toggle logic ──
function setupInsuranceToggle() {
    const modeToggle = document.getElementById('insurance-mode-toggle');
    const natureToggle = document.getElementById('insurance-nature-toggle');
    const amountGroup = document.getElementById('insurance-amount-group');
    const rateGroup = document.getElementById('insurance-rate-group');
    if (!modeToggle) return;

    modeToggle.addEventListener('click', e => {
        const btn = e.target.closest('.toggle-btn');
        if (!btn) return;
        modeToggle.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const isRate = btn.dataset.mode === 'rate';
        amountGroup?.classList.toggle('hidden', isRate);
        rateGroup?.classList.toggle('hidden', !isRate);
        natureToggle?.classList.toggle('hidden', !isRate);
    });

    natureToggle?.addEventListener('click', e => {
        const btn = e.target.closest('.toggle-btn-sm');
        if (!btn) return;
        natureToggle.querySelectorAll('.toggle-btn-sm').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    });
}

function getInsuranceMode() {
    const activeMode = document.querySelector('#insurance-mode-toggle .toggle-btn.active');
    const activeNature = document.querySelector('#insurance-nature-toggle .toggle-btn-sm.active');
    return {
        isRate: activeMode?.dataset.mode === 'rate',
        nature: activeNature?.dataset.nature || 'ci'
    };
}

// ── Tranching helpers ──
function renderTranchingRows() {
    const freq = t => t.frequency || 'monthly';
    return tranchingTranches.map((t, i) => `
        <tr data-index="${i}">
            <td><input type="text" class="form-input form-input-sm" value="${t.name}" data-field="name" style="min-width:100px"></td>
            <td><input type="number" class="form-input form-input-sm" value="${t.amount}" data-field="amount" min="0" step="1"></td>
            <td><input type="number" class="form-input form-input-sm" value="${t.rate}" data-field="rate" min="0" max="50" step="0.25" style="width:80px"></td>
            <td><input type="number" class="form-input form-input-sm" value="${t.duration}" data-field="duration" min="1" max="720" step="1" style="width:80px"></td>
            <td>
                <select class="form-input form-input-sm" data-field="type">
                    <option value="constant" ${t.type === 'constant' ? 'selected' : ''}>Constant</option>
                    <option value="infine" ${t.type === 'infine' ? 'selected' : ''}>In Fine</option>
                </select>
            </td>
            <td>
                <select class="form-input form-input-sm" data-field="frequency" style="min-width:110px">
                    <option value="monthly" ${freq(t) === 'monthly' ? 'selected' : ''}>Mensuel</option>
                    <option value="quarterly" ${freq(t) === 'quarterly' ? 'selected' : ''}>Trimestriel</option>
                    <option value="semiannual" ${freq(t) === 'semiannual' ? 'selected' : ''}>Semestriel</option>
                    <option value="annual" ${freq(t) === 'annual' ? 'selected' : ''}>Annuel</option>
                </select>
            </td>
            <td>
                ${tranchingTranches.length > 1 ? `<button type="button" class="btn btn-ghost btn-sm remove-tranche" data-index="${i}" title="Supprimer">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>` : ''}
            </td>
        </tr>
    `).join('');
}

function refreshTranchingTotal() {
    const el = document.getElementById('tr-total-debt');
    if (el) el.textContent = Financial.formatCurrency(tranchingTranches.reduce((s, t) => s + t.amount, 0));
}

function setupTranchingListeners() {
    const table = document.getElementById('tranching-table');
    if (!table) return;

    table.addEventListener('input', e => {
        const row = e.target.closest('tr');
        if (!row) return;
        const index = parseInt(row.dataset.index);
        const field = e.target.dataset.field;
        if (field && tranchingTranches[index]) {
            const val = e.target.value;
            tranchingTranches[index][field] = (field === 'name' || field === 'type' || field === 'frequency') ? val : parseFloat(val) || 0;
        }
        refreshTranchingTotal();
    });

    table.addEventListener('change', e => {
        const row = e.target.closest('tr');
        if (!row) return;
        const index = parseInt(row.dataset.index);
        const field = e.target.dataset.field;
        if (field && tranchingTranches[index]) {
            const val = e.target.value;
            tranchingTranches[index][field] = (field === 'name' || field === 'type' || field === 'frequency') ? val : parseFloat(val) || 0;
        }
        refreshTranchingTotal();
    });

    table.addEventListener('click', e => {
        const removeBtn = e.target.closest('.remove-tranche');
        if (removeBtn && tranchingTranches.length > 1) {
            tranchingTranches.splice(parseInt(removeBtn.dataset.index), 1);
            document.getElementById('tranching-rows').innerHTML = renderTranchingRows();
            refreshTranchingTotal();
        }
    });

    document.getElementById('btn-add-tranche')?.addEventListener('click', () => {
        tranchingTranches.push({ name: `Tranche ${tranchingTranches.length + 1}`, amount: 1000000, rate: 5.0, duration: 60, type: 'constant', frequency: 'monthly' });
        document.getElementById('tranching-rows').innerHTML = renderTranchingRows();
        refreshTranchingTotal();
    });
}

// ── Validation ──
function validateForm() {
    let valid = true;

    // Clear previous errors
    document.querySelectorAll('#credit-form-fields .form-input.invalid').forEach(el => el.classList.remove('invalid'));
    document.querySelectorAll('#credit-form-fields .form-error').forEach(el => el.remove());

    // Tranching: validate directly
    if (currentType === 'tranching') {
        if (tranchingTranches.length === 0) return false;
        return tranchingTranches.every(t => t.amount > 0 && t.rate > 0 && t.duration >= 1);
    }

    const requiredFields = getRequiredFields(currentType);

    requiredFields.forEach(({ id, label, min }) => {
        const el = document.getElementById(id);
        if (!el) return;
        const val = parseFloat(el.value);
        if (isNaN(val) || val < (min ?? 0.01)) {
            valid = false;
            el.classList.add('invalid');
            const error = document.createElement('div');
            error.className = 'form-error';
            error.textContent = `${label} est requis`;
            el.closest('.form-group')?.appendChild(error);
        }
    });

    return valid;
}

function getRequiredFields(type) {
    const base = [
        { id: 'cr-principal', label: 'Montant', min: 1 },
        { id: 'cr-rate', label: 'Taux', min: 0.01 },
        { id: 'cr-duration', label: 'Durée', min: 1 }
    ];
    switch (type) {
        case 'creditbail':
            return [
                { id: 'cr-principal', label: 'Valeur du bien', min: 1 },
                { id: 'cr-rate', label: 'Taux', min: 0.01 },
                { id: 'cr-duration', label: 'Durée', min: 1 }
            ];
        case 'revolving':
            return [
                { id: 'cr-principal', label: 'Ligne de crédit', min: 1 },
                { id: 'cr-rate', label: 'Taux', min: 0.01 },
                { id: 'cr-duration', label: 'Durée', min: 1 }
            ];
        case 'relais':
            return [
                { id: 'cr-principal', label: 'Montant du prêt', min: 1 },
                { id: 'cr-salePrice', label: 'Prix de vente', min: 1 },
                { id: 'cr-rate', label: 'Taux', min: 0.01 },
                { id: 'cr-duration', label: 'Durée', min: 1 }
            ];
        default:
            return base;
    }
}

function getFormHTML(type) {
    const hasDeferral = type === 'constant' || type === 'degressif';
    const hasFrequency = type === 'constant' || type === 'degressif' || type === 'infine';
    const common = `
        <div class="form-row">
            <div class="form-group">
                <label class="form-label">Montant emprunté (€)</label>
                <div class="input-group">
                    <input type="number" class="form-input" id="cr-principal" value="500000" min="0" step="1">
                    <span class="input-suffix">€</span>
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">Taux annuel (%)</label>
                <div class="input-group">
                    <input type="number" class="form-input" id="cr-rate" value="4.5" min="0.01" max="50" step="0.01">
                    <span class="input-suffix">%</span>
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">Durée (mois)</label>
                <div class="input-group">
                    <input type="number" class="form-input" id="cr-duration" value="84" min="1" max="720" step="1">
                    <span class="input-suffix">mois</span>
                </div>
            </div>
        </div>
        <div class="form-row">
            ${hasFrequency ? `<div class="form-group">
                <label class="form-label">Fréquence d'amortissement</label>
                <select class="form-select" id="cr-frequency">
                    <option value="monthly">Mensuel</option>
                    <option value="quarterly">Trimestriel</option>
                    <option value="semiannual">Semestriel</option>
                    <option value="annual">Annuel</option>
                </select>
            </div>` : ''}
            ${hasDeferral ? `<div class="form-group">
                <label class="form-label">Différé (mois)</label>
                <div class="input-group">
                    <input type="number" class="form-input" id="cr-deferral" value="0" min="0" max="60" step="1">
                    <span class="input-suffix">mois</span>
                </div>
            </div>
            <div class="form-group" id="deferral-type-group" style="display:none">
                <label class="form-label">Type de différé</label>
                <div class="toggle-group" id="deferral-type-toggle">
                    <button type="button" class="toggle-btn active" data-dtype="partial">Partiel (intérêts)</button>
                    <button type="button" class="toggle-btn" data-dtype="total">Total (capitalisé)</button>
                </div>
            </div>` : ''}
        </div>
        <div class="form-row">
            <div class="form-group insurance-group">
                <label class="form-label">Assurance emprunteur</label>
                <div class="toggle-group" id="insurance-mode-toggle">
                    <button type="button" class="toggle-btn active" data-mode="amount">€/mois</button>
                    <button type="button" class="toggle-btn" data-mode="rate">Taux %</button>
                </div>
                <div class="input-group" id="insurance-amount-group">
                    <input type="number" class="form-input" id="cr-insurance" value="0" min="0" step="1">
                    <span class="input-suffix">€</span>
                </div>
                <div class="input-group hidden" id="insurance-rate-group">
                    <input type="number" class="form-input" id="cr-insurance-rate" value="0.30" min="0" max="10" step="0.01">
                    <span class="input-suffix">%</span>
                </div>
                <div class="toggle-group hidden" id="insurance-nature-toggle" style="margin-top:8px">
                    <button type="button" class="toggle-btn-sm active" data-nature="ci">Capital emprunté</button>
                    <button type="button" class="toggle-btn-sm" data-nature="crd">Capital restant dû</button>
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">Frais de dossier (€)</label>
                <div class="input-group">
                    <input type="number" class="form-input" id="cr-fees" value="0" min="0" step="1">
                    <span class="input-suffix">€</span>
                </div>
            </div>
        </div>`;

    switch (type) {
        case 'constant':
        case 'degressif':
        case 'infine':
            return common;

        case 'creditbail':
            return `
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Valeur du bien (€)</label>
                        <div class="input-group">
                            <input type="number" class="form-input" id="cr-principal" value="500000" min="0" step="1">
                            <span class="input-suffix">€</span>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Apport initial (€)</label>
                        <div class="input-group">
                            <input type="number" class="form-input" id="cr-deposit" value="50000" min="0" step="1">
                            <span class="input-suffix">€</span>
                        </div>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Taux annuel (%)</label>
                        <div class="input-group">
                            <input type="number" class="form-input" id="cr-rate" value="5.0" min="0.01" max="50" step="0.01">
                            <span class="input-suffix">%</span>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Durée (mois)</label>
                        <div class="input-group">
                            <input type="number" class="form-input" id="cr-duration" value="60" min="1" max="720" step="1">
                            <span class="input-suffix">mois</span>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Valeur résiduelle (€)</label>
                        <div class="input-group">
                            <input type="number" class="form-input" id="cr-residual" value="25000" min="0" step="1">
                            <span class="input-suffix">€</span>
                        </div>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Frais (€)</label>
                        <div class="input-group">
                            <input type="number" class="form-input" id="cr-fees" value="0" min="0" step="1">
                            <span class="input-suffix">€</span>
                        </div>
                    </div>
                </div>`;

        case 'revolving':
            return `
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Ligne de crédit (€)</label>
                        <div class="input-group">
                            <input type="number" class="form-input" id="cr-principal" value="1000000" min="0" step="1">
                            <span class="input-suffix">€</span>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Taux d'utilisation (%)</label>
                        <div class="input-group">
                            <input type="number" class="form-input" id="cr-utilization" value="60" min="0" max="100" step="5">
                            <span class="input-suffix">%</span>
                        </div>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Taux d'intérêt annuel (%)</label>
                        <div class="input-group">
                            <input type="number" class="form-input" id="cr-rate" value="5.5" min="0.01" max="50" step="0.01">
                            <span class="input-suffix">%</span>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Commission d'engagement (%/an)</label>
                        <div class="input-group">
                            <input type="number" class="form-input" id="cr-commitment" value="0.5" min="0" max="5" step="0.1">
                            <span class="input-suffix">%</span>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Durée (mois)</label>
                        <div class="input-group">
                            <input type="number" class="form-input" id="cr-duration" value="12" min="1" max="720" step="1">
                            <span class="input-suffix">mois</span>
                        </div>
                    </div>
                </div>`;

        case 'relais':
            return `
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Montant du prêt relais (€)</label>
                        <div class="input-group">
                            <input type="number" class="form-input" id="cr-principal" value="300000" min="0" step="1">
                            <span class="input-suffix">€</span>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Prix de vente estimé (€)</label>
                        <div class="input-group">
                            <input type="number" class="form-input" id="cr-salePrice" value="450000" min="0" step="1">
                            <span class="input-suffix">€</span>
                        </div>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Taux annuel (%)</label>
                        <div class="input-group">
                            <input type="number" class="form-input" id="cr-rate" value="5.0" min="0.01" max="50" step="0.01">
                            <span class="input-suffix">%</span>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Durée (mois)</label>
                        <div class="input-group">
                            <input type="number" class="form-input" id="cr-duration" value="18" min="1" max="720" step="1">
                            <span class="input-suffix">mois</span>
                        </div>
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">
                        <input type="checkbox" id="cr-capitalized"> Intérêts capitalisés (reportés sur le capital)
                    </label>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Frais (€)</label>
                        <div class="input-group">
                            <input type="number" class="form-input" id="cr-fees" value="0" min="0" step="1">
                            <span class="input-suffix">€</span>
                        </div>
                    </div>
                </div>`;

        case 'mezzanine':
            return `
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Montant (€)</label>
                        <div class="input-group">
                            <input type="number" class="form-input" id="cr-principal" value="2000000" min="0" step="1">
                            <span class="input-suffix">€</span>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Durée (mois)</label>
                        <div class="input-group">
                            <input type="number" class="form-input" id="cr-duration" value="60" min="1" max="720" step="1">
                            <span class="input-suffix">mois</span>
                        </div>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Taux cash (%/an)</label>
                        <div class="input-group">
                            <input type="number" class="form-input" id="cr-rate" value="8.0" min="0" max="50" step="0.25">
                            <span class="input-suffix">%</span>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Taux PIK (%/an)</label>
                        <div class="input-group">
                            <input type="number" class="form-input" id="cr-pikRate" value="4.0" min="0" max="20" step="0.25">
                            <span class="input-suffix">%</span>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Equity kicker (%)</label>
                        <div class="input-group">
                            <input type="number" class="form-input" id="cr-kicker" value="5.0" min="0" max="50" step="0.5">
                            <span class="input-suffix">%</span>
                        </div>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Frais (€)</label>
                        <div class="input-group">
                            <input type="number" class="form-input" id="cr-fees" value="0" min="0" step="1">
                            <span class="input-suffix">€</span>
                        </div>
                    </div>
                </div>`;

        case 'tranching':
            return `
                <div class="tranching-form">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
                        <div>Total dette : <strong id="tr-total-debt">${Financial.formatCurrency(tranchingTranches.reduce((s, t) => s + t.amount, 0))}</strong></div>
                        <button type="button" class="btn btn-ghost btn-sm" id="btn-add-tranche">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                            Ajouter une tranche
                        </button>
                    </div>
                    <div class="table-container">
                        <table class="data-table" id="tranching-table">
                            <thead>
                                <tr>
                                    <th>Nom</th>
                                    <th>Montant (€)</th>
                                    <th>Taux (%)</th>
                                    <th>Durée (mois)</th>
                                    <th>Type</th>
                                    <th>Fréquence</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody id="tranching-rows">
                                ${renderTranchingRows()}
                            </tbody>
                        </table>
                    </div>
                </div>`;
    }
}

function getResultsHTML(type, result) {
    const f = Financial.formatCurrency;
    const p = Financial.formatPercent;
    const freq = result.frequency || 'monthly';
    const payLabel = Financial.getPaymentLabel(freq);
    const ppy = Financial.getPeriodsPerYear(freq);
    const deferralInfo = result.deferralMonths > 0 ? `<div class="result-item"><div class="result-label">Différé</div><div class="result-value">${result.deferralMonths} mois (${result.deferralType === 'total' ? 'total' : 'partiel'})</div></div>` : '';

    switch (type) {
        case 'constant':
            return `
                <div class="results-grid">
                    <div class="result-item">
                        <div class="result-label">${payLabel}</div>
                        <div class="result-value">${f(result.periodicPayment)}</div>
                        ${freq === 'monthly' ? `<div class="result-sub">hors assurance: ${f(result.monthlyPaymentExInsurance)}</div>` : ''}
                    </div>
                    <div class="result-item">
                        <div class="result-label">Service de dette annuel</div>
                        <div class="result-value">${f(result.periodicPayment * ppy)}</div>
                    </div>
                    <div class="result-item">
                        <div class="result-label">Coût total des intérêts</div>
                        <div class="result-value">${f(result.totalInterest)}</div>
                    </div>
                    <div class="result-item">
                        <div class="result-label">Coût total du crédit</div>
                        <div class="result-value">${f(result.totalCost)}</div>
                    </div>
                    <div class="result-item">
                        <div class="result-label">Total remboursé</div>
                        <div class="result-value">${f(result.totalPayment)}</div>
                    </div>
                    <div class="result-item">
                        <div class="result-label">Assurance totale</div>
                        <div class="result-value">${f(result.totalInsurance)}</div>
                    </div>
                    ${deferralInfo}
                    ${result.taeg != null ? `<div class="result-item"><div class="result-label">TAEG</div><div class="result-value">${result.taeg.toFixed(2)} %</div></div>` : ''}
                </div>`;

        case 'degressif': {
            const firstYearPeriods = Math.min(ppy, result.schedule.length);
            return `
                <div class="results-grid">
                    <div class="result-item">
                        <div class="result-label">1ère ${payLabel.toLowerCase()}</div>
                        <div class="result-value">${f(result.firstPayment)}</div>
                    </div>
                    <div class="result-item">
                        <div class="result-label">Service de dette 1ère année</div>
                        <div class="result-value">${f(result.schedule.slice(0, firstYearPeriods).reduce((s, r) => s + r.payment, 0))}</div>
                    </div>
                    <div class="result-item">
                        <div class="result-label">Dernière ${payLabel.toLowerCase()}</div>
                        <div class="result-value">${f(result.lastPayment)}</div>
                    </div>
                    <div class="result-item">
                        <div class="result-label">${payLabel} moyenne</div>
                        <div class="result-value">${f(result.averagePayment)}</div>
                    </div>
                    <div class="result-item">
                        <div class="result-label">Coût des intérêts</div>
                        <div class="result-value">${f(result.totalInterest)}</div>
                    </div>
                    <div class="result-item">
                        <div class="result-label">Coût total</div>
                        <div class="result-value">${f(result.totalCost)}</div>
                    </div>
                    ${deferralInfo}
                </div>`;
        }

        case 'infine':
            return `
                <div class="results-grid">
                    <div class="result-item">
                        <div class="result-label">${payLabel} (intérêts)</div>
                        <div class="result-value">${f(result.periodicPayment)}</div>
                    </div>
                    <div class="result-item">
                        <div class="result-label">Service de dette annuel</div>
                        <div class="result-value">${f(result.periodicPayment * ppy)}</div>
                    </div>
                    <div class="result-item">
                        <div class="result-label">Échéance finale</div>
                        <div class="result-value">${f(result.finalPayment)}</div>
                    </div>
                    <div class="result-item">
                        <div class="result-label">Total intérêts</div>
                        <div class="result-value">${f(result.totalInterest)}</div>
                    </div>
                    <div class="result-item">
                        <div class="result-label">Coût total</div>
                        <div class="result-value">${f(result.totalCost)}</div>
                    </div>
                </div>`;

        case 'creditbail':
            return `
                <div class="results-grid">
                    <div class="result-item">
                        <div class="result-label">Loyer mensuel</div>
                        <div class="result-value">${f(result.monthlyRent)}</div>
                    </div>
                    <div class="result-item">
                        <div class="result-label">Apport initial</div>
                        <div class="result-value">${f(result.deposit)}</div>
                    </div>
                    <div class="result-item">
                        <div class="result-label">Valeur résiduelle</div>
                        <div class="result-value">${f(result.residualValue)}</div>
                    </div>
                    <div class="result-item">
                        <div class="result-label">Total des loyers</div>
                        <div class="result-value">${f(result.totalRent)}</div>
                    </div>
                    <div class="result-item">
                        <div class="result-label">Coût total</div>
                        <div class="result-value">${f(result.totalCost)}</div>
                    </div>
                </div>`;

        case 'revolving':
            return `
                <div class="results-grid">
                    <div class="result-item">
                        <div class="result-label">Coût mensuel</div>
                        <div class="result-value">${f(result.monthlyCost)}</div>
                        <div class="result-sub">Intérêts: ${f(result.monthlyInterest)} | Com.: ${f(result.monthlyCommitment)}</div>
                    </div>
                    <div class="result-item">
                        <div class="result-label">Coût annuel</div>
                        <div class="result-value">${f(result.monthlyCost * 12)}</div>
                        <div class="result-sub">coût annuel de la ligne</div>
                    </div>
                    <div class="result-item">
                        <div class="result-label">Total intérêts</div>
                        <div class="result-value">${f(result.totalInterest)}</div>
                    </div>
                    <div class="result-item">
                        <div class="result-label">Total commissions</div>
                        <div class="result-value">${f(result.totalCommitment)}</div>
                    </div>
                    <div class="result-item">
                        <div class="result-label">Coût total</div>
                        <div class="result-value">${f(result.totalCost)}</div>
                    </div>
                    <div class="result-item">
                        <div class="result-label">Taux effectif</div>
                        <div class="result-value">${p(result.effectiveRate)}</div>
                    </div>
                </div>`;

        case 'relais':
            return `
                <div class="results-grid">
                    <div class="result-item">
                        <div class="result-label">Mensualité</div>
                        <div class="result-value">${f(result.monthlyPayment)}</div>
                    </div>
                    <div class="result-item">
                        <div class="result-label">Annuité totale</div>
                        <div class="result-value">${f(result.monthlyPayment * 12)}</div>
                        <div class="result-sub">service de la dette annuel</div>
                    </div>
                    <div class="result-item">
                        <div class="result-label">Solde final</div>
                        <div class="result-value">${f(result.finalBalance)}</div>
                    </div>
                    <div class="result-item">
                        <div class="result-label">Total intérêts</div>
                        <div class="result-value">${f(result.totalInterest)}</div>
                    </div>
                    <div class="result-item">
                        <div class="result-label">Produit net de vente</div>
                        <div class="result-value">${f(result.netProceeds)}</div>
                    </div>
                    <div class="result-item">
                        <div class="result-label">LTV</div>
                        <div class="result-value">${p(result.ltv)}</div>
                    </div>
                </div>`;

        case 'mezzanine':
            return `
                <div class="results-grid">
                    <div class="result-item">
                        <div class="result-label">Paiement cash mensuel</div>
                        <div class="result-value">${f(result.monthlyCashPayment)}</div>
                    </div>
                    <div class="result-item">
                        <div class="result-label">Annuité cash totale</div>
                        <div class="result-value">${f(result.monthlyCashPayment * 12)}</div>
                        <div class="result-sub">paiements cash annuels</div>
                    </div>
                    <div class="result-item">
                        <div class="result-label">Remboursement final</div>
                        <div class="result-value">${f(result.finalRepayment)}</div>
                    </div>
                    <div class="result-item">
                        <div class="result-label">Total int. cash</div>
                        <div class="result-value">${f(result.totalCashInterest)}</div>
                    </div>
                    <div class="result-item">
                        <div class="result-label">Total int. PIK</div>
                        <div class="result-value">${f(result.totalPikInterest)}</div>
                    </div>
                    <div class="result-item">
                        <div class="result-label">Equity kicker</div>
                        <div class="result-value">${f(result.equityKickerValue)}</div>
                    </div>
                    <div class="result-item">
                        <div class="result-label">All-in cost</div>
                        <div class="result-value">${p(result.allInCost)}</div>
                    </div>
                </div>`;

        case 'tranching': {
            const c = result.consolidated;
            return `
                <div class="results-grid">
                    <div class="result-item">
                        <div class="result-label">Dette totale</div>
                        <div class="result-value">${f(c.totalDebt)}</div>
                        <div class="result-sub">${result.tranches.length} tranches</div>
                    </div>
                    <div class="result-item">
                        <div class="result-label">Annuité totale</div>
                        <div class="result-value">${f(c.annualDebtService)}</div>
                        <div class="result-sub">service de la dette annuel</div>
                    </div>
                    <div class="result-item">
                        <div class="result-label">Taux moyen pondéré</div>
                        <div class="result-value">${p(c.weightedRate)}</div>
                    </div>
                    <div class="result-item">
                        <div class="result-label">Total intérêts</div>
                        <div class="result-value">${f(c.totalInterest)}</div>
                    </div>
                    <div class="result-item">
                        <div class="result-label">Coût total</div>
                        <div class="result-value">${f(c.totalCost)}</div>
                    </div>
                </div>
                <div style="margin-top:24px">
                    <h3 style="font-size:1rem;font-weight:600;margin-bottom:12px;color:var(--text-primary)">Détail par tranche</h3>
                    <div class="grid-auto">
                        ${result.tranches.map(tr => {
                            const trFreq = tr.frequency || 'monthly';
                            const trPayLabel = Financial.getPaymentLabel(trFreq);
                            const freqLabels = { monthly: 'Mensuel', quarterly: 'Trimestriel', semiannual: 'Semestriel', annual: 'Annuel' };
                            const periodicPay = tr.result.periodicPayment || tr.result.monthlyPayment || tr.result.schedule?.[0]?.payment || 0;
                            return `
                            <div class="card" style="padding:16px">
                                <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
                                    <span class="badge badge-blue">${tr.type === 'infine' ? 'In Fine' : 'Constant'}</span>
                                    <span class="badge" style="background:var(--bg-secondary);color:var(--text-secondary);font-size:0.7rem">${freqLabels[trFreq]}</span>
                                    <strong>${tr.name}</strong>
                                </div>
                                <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:0.85rem">
                                    <div><span style="color:var(--text-muted)">Montant:</span> ${f(tr.amount)}</div>
                                    <div><span style="color:var(--text-muted)">Taux:</span> ${p(tr.rate)}</div>
                                    <div><span style="color:var(--text-muted)">Durée:</span> ${tr.duration} mois</div>
                                    <div><span style="color:var(--text-muted)">Intérêts:</span> ${f(tr.result.totalInterest)}</div>
                                    <div><span style="color:var(--text-muted)">Coût:</span> ${f(tr.result.totalCost)}</div>
                                    <div><span style="color:var(--text-muted)">${trPayLabel}:</span> ${f(periodicPay)}</div>
                                </div>
                            </div>`;
                        }).join('')}
                    </div>
                </div>`;
        }
    }
}

function runSimulation() {
    // Validate first
    if (!validateForm()) {
        window.showToast?.('Veuillez corriger les champs en erreur', 'error');
        return;
    }

    const val = id => {
        const el = document.getElementById(id);
        return el ? (el.type === 'checkbox' ? el.checked : parseFloat(el.value) || 0) : 0;
    };

    let result, params;

    // Read insurance toggle state for types that support it
    const insMode = getInsuranceMode();
    const insuranceParams = insMode.isRate
        ? { insuranceMonthly: 0, insuranceRate: val('cr-insurance-rate'), insuranceMode: insMode.nature }
        : { insuranceMonthly: val('cr-insurance'), insuranceRate: 0, insuranceMode: 'ci' };

    // Read frequency and deferral for applicable types
    const frequency = document.getElementById('cr-frequency')?.value || 'monthly';
    const deferralMonths = parseFloat(document.getElementById('cr-deferral')?.value) || 0;
    const deferralTypeBtn = document.querySelector('#deferral-type-toggle .toggle-btn.active');
    const deferralType = deferralTypeBtn?.dataset.dtype || 'partial';

    switch (currentType) {
        case 'constant':
            params = { principal: val('cr-principal'), annualRate: val('cr-rate'), durationMonths: val('cr-duration'), ...insuranceParams, fees: val('cr-fees'), frequency, deferralMonths, deferralType };
            result = Financial.amortissableConstant(params);
            break;
        case 'degressif':
            params = { principal: val('cr-principal'), annualRate: val('cr-rate'), durationMonths: val('cr-duration'), ...insuranceParams, fees: val('cr-fees'), frequency, deferralMonths, deferralType };
            result = Financial.amortissableDegressif(params);
            break;
        case 'infine':
            params = { principal: val('cr-principal'), annualRate: val('cr-rate'), durationMonths: val('cr-duration'), ...insuranceParams, fees: val('cr-fees'), frequency };
            result = Financial.inFine(params);
            break;
        case 'creditbail':
            params = { assetValue: val('cr-principal'), deposit: val('cr-deposit'), annualRate: val('cr-rate'), durationMonths: val('cr-duration'), residualValue: val('cr-residual'), fees: val('cr-fees') };
            result = Financial.creditBail(params);
            break;
        case 'revolving':
            params = { creditLine: val('cr-principal'), utilization: val('cr-utilization'), annualRate: val('cr-rate'), commitmentFee: val('cr-commitment'), durationMonths: val('cr-duration') };
            result = Financial.revolving(params);
            break;
        case 'relais':
            params = { bridgeAmount: val('cr-principal'), annualRate: val('cr-rate'), durationMonths: val('cr-duration'), expectedSalePrice: val('cr-salePrice'), capitalizedInterest: val('cr-capitalized'), fees: val('cr-fees') };
            result = Financial.pretRelais(params);
            break;
        case 'mezzanine':
            params = { principal: val('cr-principal'), cashRate: val('cr-rate'), pikRate: val('cr-pikRate'), durationMonths: val('cr-duration'), equityKicker: val('cr-kicker'), fees: val('cr-fees') };
            result = Financial.detteMezzanine(params);
            break;
        case 'tranching':
            params = { tranches: tranchingTranches.map(t => ({ ...t })) };
            result = Financial.tranching(tranchingTranches);
            // Alias consolidated schedule for charts/table compatibility
            result.schedule = result.consolidated.schedule;
            break;
    }

    lastResult = { type: currentType, params, results: result };

    // Render results
    const resultsDiv = document.getElementById('credit-results');
    const supportsPrepayment = ['constant', 'degressif', 'infine'].includes(currentType);
    if (resultsDiv) {
        resultsDiv.innerHTML = `
            <div class="results-panel">
                ${getResultsHTML(currentType, result)}
            </div>
            ${supportsPrepayment ? `
            <div class="card section" style="margin-top:20px">
                <div class="card-header">
                    <div>
                        <div class="card-title">Remboursement Anticipé</div>
                        <div class="card-subtitle">Simuler un remboursement partiel ou total avec IRA</div>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Période du remboursement (n° échéance)</label>
                        <div class="input-group">
                            <input type="number" class="form-input" id="ra-period" value="24" min="1" max="${result.schedule.length}" step="1">
                            <span class="input-suffix">/ ${result.schedule.length}</span>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Montant remboursé (€)</label>
                        <div class="input-group">
                            <input type="number" class="form-input" id="ra-amount" value="100000" min="0" step="1">
                            <span class="input-suffix">€</span>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Stratégie</label>
                        <select class="form-select" id="ra-strategy">
                            <option value="reduceDuration">Réduire la durée</option>
                            <option value="reducePayment">Réduire les échéances</option>
                        </select>
                    </div>
                </div>
                <button type="button" class="btn btn-outline" id="btn-calc-prepayment" style="margin-top:12px">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    Calculer l'impact
                </button>
                <div id="prepayment-results"></div>
            </div>` : ''}
        `;
        // Setup prepayment button
        document.getElementById('btn-calc-prepayment')?.addEventListener('click', runPrepaymentAnalysis);
    }

    // Render charts
    if (result.schedule && result.schedule[0]?.principal !== undefined) {
        Charts.amortization('chart-amort', result.schedule);
        Charts.balanceEvolution('chart-balance', result.schedule);
    }

    // Cost breakdown
    const breakdown = [];
    if (result.totalInterest) breakdown.push({ label: 'Intérêts', value: result.totalInterest });
    if (result.totalInsurance) breakdown.push({ label: 'Assurance', value: result.totalInsurance });
    if (result.totalCommitment) breakdown.push({ label: 'Commissions', value: result.totalCommitment });
    if (result.totalPikInterest) breakdown.push({ label: 'Intérêts PIK', value: result.totalPikInterest });
    if (result.equityKickerValue) breakdown.push({ label: 'Equity Kicker', value: result.equityKickerValue });
    if (params.fees) breakdown.push({ label: 'Frais', value: params.fees });

    if (breakdown.length > 0) {
        Charts.costBreakdown('chart-cost', breakdown);
    }

    // Show schedule table
    renderScheduleTable(result.schedule);

    // Show sections
    document.querySelectorAll('.credit-output').forEach(el => el.classList.remove('hidden'));
}

function renderScheduleTable(schedule) {
    const container = document.getElementById('schedule-table');
    if (!container || !schedule?.length) return;

    const freq = lastResult?.results?.frequency || 'monthly';
    const periodLabel = Financial.getPeriodLabel(freq);
    const payLabel = Financial.getPaymentLabel(freq);

    const first = schedule[0];
    const columns = [];

    if ('period' in first) columns.push({ key: 'period', label: periodLabel });
    if ('payment' in first) columns.push({ key: 'payment', label: payLabel, format: 'currency' });
    if ('cashPayment' in first) columns.push({ key: 'cashPayment', label: 'Cash', format: 'currency' });
    if ('principal' in first) columns.push({ key: 'principal', label: 'Capital', format: 'currency' });
    if ('interest' in first) columns.push({ key: 'interest', label: 'Intérêts', format: 'currency' });
    if ('pikInterest' in first) columns.push({ key: 'pikInterest', label: 'PIK', format: 'currency' });
    if ('insurance' in first && schedule.some(r => r.insurance > 0)) columns.push({ key: 'insurance', label: 'Assurance', format: 'currency' });
    if ('commitmentFee' in first) columns.push({ key: 'commitmentFee', label: 'Com.', format: 'currency' });
    if ('balance' in first) columns.push({ key: 'balance', label: 'CRD', format: 'currency' });

    const displayCount = Math.min(schedule.length, 60);
    const showToggle = schedule.length > 60;

    container.innerHTML = `
        <div class="table-container">
            <table class="data-table" id="amort-table">
                <thead>
                    <tr>${columns.map(c => `<th>${c.label}</th>`).join('')}</tr>
                </thead>
                <tbody>
                    ${schedule.slice(0, displayCount).map(row => `
                        <tr>${columns.map(c => `<td class="${c.format === 'currency' ? 'number' : ''}">${c.format === 'currency' ? Financial.formatCurrency(row[c.key], 2) : row[c.key]}</td>`).join('')}</tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        ${showToggle ? `<button class="btn btn-ghost btn-sm" style="margin-top:8px" id="show-all-schedule">Afficher les ${schedule.length} lignes</button>` : ''}
    `;

    if (showToggle) {
        document.getElementById('show-all-schedule')?.addEventListener('click', function () {
            const tbody = document.querySelector('#amort-table tbody');
            tbody.innerHTML = schedule.map(row => `
                <tr>${columns.map(c => `<td class="${c.format === 'currency' ? 'number' : ''}">${c.format === 'currency' ? Financial.formatCurrency(row[c.key], 2) : row[c.key]}</td>`).join('')}</tr>
            `).join('');
            this.remove();
        });
    }
}

// ── Prepayment analysis ──
function runPrepaymentAnalysis() {
    if (!lastResult?.results?.schedule) return;
    const period = parseInt(document.getElementById('ra-period')?.value) || 24;
    const amount = parseFloat(document.getElementById('ra-amount')?.value) || 100000;
    const strategy = document.getElementById('ra-strategy')?.value || 'reduceDuration';

    const analysis = Financial.prepaymentAnalysis({
        schedule: lastResult.results.schedule,
        principal: lastResult.params.principal,
        annualRate: lastResult.params.annualRate,
        frequency: lastResult.params.frequency || 'monthly',
        prepaymentPeriod: period,
        prepaymentAmount: amount,
        strategy,
        insuranceMonthly: lastResult.params.insuranceMonthly,
        insuranceRate: lastResult.params.insuranceRate,
        insuranceMode: lastResult.params.insuranceMode,
        type: currentType
    });

    const container = document.getElementById('prepayment-results');
    if (!container || !analysis) {
        if (container) container.innerHTML = '<p style="color:var(--danger);margin-top:12px">Période invalide ou CRD nul à cette date.</p>';
        return;
    }

    const f = Financial.formatCurrency;
    const freq = lastResult.params.frequency || 'monthly';
    const pLabel = Financial.getPeriodLabel(freq);
    const c = analysis.comparison;

    container.innerHTML = `
        <div style="margin-top:20px">
            <div class="results-grid" style="margin-bottom:16px">
                <div class="result-item">
                    <div class="result-label">CRD à la période ${period}</div>
                    <div class="result-value">${f(analysis.crdAtDate)}</div>
                </div>
                <div class="result-item">
                    <div class="result-label">Montant remboursé</div>
                    <div class="result-value">${f(analysis.prepaymentAmount)}</div>
                    <div class="result-sub">${analysis.isTotal ? 'Remboursement total' : 'Remboursement partiel'}</div>
                </div>
                <div class="result-item">
                    <div class="result-label">IRA (indemnités)</div>
                    <div class="result-value" style="color:var(--danger)">${f(analysis.ira)}</div>
                    <div class="result-sub">max(3% CRD = ${f(analysis.ira3pct)}, 6 mois int. = ${f(analysis.ira6mois)})</div>
                </div>
                <div class="result-item">
                    <div class="result-label">Coût total du RA</div>
                    <div class="result-value">${f(analysis.totalCostPrepayment)}</div>
                    <div class="result-sub">capital + IRA</div>
                </div>
            </div>
            <h4 style="margin:16px 0 8px;font-size:0.95rem">Comparaison avant / après</h4>
            <div class="table-container">
                <table class="data-table">
                    <thead><tr><th></th><th>Avant RA</th><th>Après RA</th><th>Économie</th></tr></thead>
                    <tbody>
                        <tr><td>Total intérêts</td><td class="number">${f(c.before.totalInterest)}</td><td class="number">${f(c.after.totalInterest)}</td><td class="number" style="color:var(--success)">${f(c.savings.interest)}</td></tr>
                        <tr><td>Durée (${pLabel.toLowerCase()})</td><td class="number">${c.before.duration}</td><td class="number">${c.after.duration}</td><td class="number" style="color:var(--success)">${c.savings.duration > 0 ? '-' + c.savings.duration : '—'}</td></tr>
                        <tr><td>Coût total (int. + ass. + IRA)</td><td class="number">${f(c.before.totalCost)}</td><td class="number">${f(c.after.totalCost)}</td><td class="number" style="color:${c.savings.netSavings > 0 ? 'var(--success)' : 'var(--danger)'}">${f(c.savings.netSavings)}</td></tr>
                        ${!analysis.isTotal && c.after.periodicPayment ? `<tr><td>Nouvelle échéance</td><td class="number">—</td><td class="number">${f(c.after.periodicPayment)}</td><td class="number">—</td></tr>` : ''}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// ── Deferral toggle ──
function setupDeferralToggle() {
    const deferralInput = document.getElementById('cr-deferral');
    const deferralGroup = document.getElementById('deferral-type-group');
    const deferralToggle = document.getElementById('deferral-type-toggle');

    if (deferralInput && deferralGroup) {
        const show = () => {
            deferralGroup.style.display = (parseFloat(deferralInput.value) || 0) > 0 ? '' : 'none';
        };
        deferralInput.addEventListener('input', show);
        show();
    }

    deferralToggle?.addEventListener('click', e => {
        const btn = e.target.closest('.toggle-btn');
        if (!btn) return;
        deferralToggle.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    });
}

function saveSimulation() {
    if (!lastResult) {
        window.showToast?.('Lancez d\'abord une simulation', 'warning');
        return;
    }

    // Show save dialog with name and notes
    const modal = document.getElementById('modal-overlay');
    const body = document.getElementById('modal-body');

    const typeLabel = CREDIT_TYPES.find(t => t.id === currentType)?.label || currentType;
    const defaultName = `${typeLabel} - ${Financial.formatCurrency(lastResult.params.principal || lastResult.params.assetValue || lastResult.params.creditLine || lastResult.params.bridgeAmount)}`;

    body.innerHTML = `
        <h2 style="margin-bottom:20px">Sauvegarder la simulation</h2>
        <div class="form-group" style="margin-bottom:16px">
            <label class="form-label">Nom de la simulation</label>
            <input type="text" class="form-input" id="save-sim-name" value="${defaultName}" style="width:100%">
        </div>
        <div class="form-group" style="margin-bottom:24px">
            <label class="form-label">Notes (optionnel)</label>
            <textarea class="form-input notes-input" id="save-sim-notes" rows="3" placeholder="Ajoutez des notes ou commentaires..."></textarea>
        </div>
        <div class="btn-group" style="justify-content:flex-end">
            <button class="btn btn-outline" id="save-cancel">Annuler</button>
            <button class="btn btn-primary" id="save-confirm">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/></svg>
                Sauvegarder
            </button>
        </div>
    `;

    modal.classList.remove('hidden');

    // Focus name input
    document.getElementById('save-sim-name')?.focus();

    document.getElementById('save-cancel')?.addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    document.getElementById('save-confirm')?.addEventListener('click', () => {
        const name = document.getElementById('save-sim-name')?.value || defaultName;
        const notes = document.getElementById('save-sim-notes')?.value || '';

        Storage.saveSimulation({
            ...lastResult,
            name,
            notes,
            typeLabel
        });

        modal.classList.add('hidden');
        window.showToast?.('Simulation sauvegardée', 'success');
    });
}

function resetForm() {
    // Special reset for tranching
    if (currentType === 'tranching') {
        tranchingTranches = [
            { name: 'Senior A', amount: 3000000, rate: 3.5, duration: 84, type: 'constant', frequency: 'monthly' },
            { name: 'Senior B', amount: 2000000, rate: 4.5, duration: 60, type: 'constant', frequency: 'monthly' },
            { name: 'Mezzanine', amount: 1000000, rate: 8.0, duration: 60, type: 'infine', frequency: 'monthly' }
        ];
        document.getElementById('tranching-rows').innerHTML = renderTranchingRows();
        refreshTranchingTotal();
        document.getElementById('credit-results').innerHTML = '';
        document.querySelectorAll('.credit-output').forEach(el => el.classList.add('hidden'));
        lastResult = null;
        window.showToast?.('Formulaire réinitialisé', 'info');
        return;
    }

    const defaults = DEFAULTS[currentType];
    if (!defaults) return;

    Object.entries(defaults).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (el.type === 'checkbox') {
            el.checked = !!val;
        } else {
            el.value = val;
        }
    });

    // Clear validation errors
    document.querySelectorAll('#credit-form-fields .form-input.invalid').forEach(el => el.classList.remove('invalid'));
    document.querySelectorAll('#credit-form-fields .form-error').forEach(el => el.remove());

    // Reset insurance toggles to default (amount mode, CI nature)
    const modeToggle = document.getElementById('insurance-mode-toggle');
    if (modeToggle) {
        modeToggle.querySelectorAll('.toggle-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === 'amount'));
        document.getElementById('insurance-amount-group')?.classList.remove('hidden');
        document.getElementById('insurance-rate-group')?.classList.add('hidden');
        document.getElementById('insurance-nature-toggle')?.classList.add('hidden');
        const natureToggle = document.getElementById('insurance-nature-toggle');
        natureToggle?.querySelectorAll('.toggle-btn-sm').forEach(b => b.classList.toggle('active', b.dataset.nature === 'ci'));
    }

    // Clear results
    document.getElementById('credit-results').innerHTML = '';
    document.querySelectorAll('.credit-output').forEach(el => el.classList.add('hidden'));
    lastResult = null;

    // Re-setup live formatting
    setupLiveFormatting();

    window.showToast?.('Formulaire réinitialisé', 'info');
}

function exportPdf() {
    if (!lastResult) return;
    const typeLabel = CREDIT_TYPES.find(t => t.id === currentType)?.label || currentType;
    const sections = [
        { type: 'title', text: `Simulation - ${typeLabel}` },
        { type: 'separator' },
        { type: 'keyvalue', items: Object.entries(lastResult.params).filter(([k]) => {
            const p = lastResult.params;
            if (k === 'insuranceMonthly' && p.insuranceRate > 0) return false;
            if ((k === 'insuranceRate' || k === 'insuranceMode') && (!p.insuranceRate || p.insuranceRate === 0)) return false;
            return true;
        }).map(([k, v]) => ({
            label: t(k, PARAM_LABELS),
            value: formatValue(k, v)
        })) },
        { type: 'separator' }
    ];

    // Add results summary
    if (lastResult.results) {
        const resultItems = Object.entries(lastResult.results)
            .filter(([k, v]) => typeof v !== 'object' && k !== 'schedule')
            .map(([k, v]) => ({
                label: t(k, RESULT_LABELS),
                value: formatValue(k, v)
            }));
        if (resultItems.length > 0) {
            sections.push({ type: 'title', text: 'Résultats' });
            sections.push({ type: 'keyvalue', items: resultItems });
            sections.push({ type: 'separator' });
        }
    }

    if (lastResult.results.schedule) {
        const sched = lastResult.results.schedule;
        const first = sched[0];
        const keys = Object.keys(first).filter(k => k !== 'totalInterest' && k !== 'totalInsurance' && k !== 'totalCommitment' && k !== 'totalCashInterest' && k !== 'totalPikInterest');
        const scheduleLabels = {
            period: 'Période', payment: 'Échéance', principal: 'Capital',
            interest: 'Intérêts', insurance: 'Assurance', balance: 'CRD',
            utilized: 'Utilisé', unused: 'Non utilisé', commitmentFee: 'Com. Engagement',
            totalCost: 'Coût Total', cashPayment: 'Paiement Cash', pikInterest: 'Intérêts PIK',
            capitalizedInterest: 'Int. Capitalisés'
        };
        sections.push({
            type: 'table',
            headers: keys.map(k => scheduleLabels[k] || k),
            rows: sched.map(row => keys.map(k => typeof row[k] === 'number' ? Financial.formatNumber(row[k], 2) : row[k]))
        });
    }

    Export.toPdf(`Simulation ${typeLabel}`, sections, `simulation_${currentType}`);
}

function exportExcel() {
    if (!lastResult) return;
    const typeLabel = CREDIT_TYPES.find(t => t.id === currentType)?.label || currentType;

    if (currentType === 'tranching') {
        exportTranchingExcel();
        return;
    }

    Export.fullReportExcel({ ...lastResult, typeLabel });
}

function exportTranchingExcel() {
    if (!lastResult || currentType !== 'tranching') return;
    if (typeof XLSX === 'undefined') {
        alert('Bibliothèque Excel non chargée');
        return;
    }

    const wb = XLSX.utils.book_new();
    const result = lastResult.results;
    const f = v => Math.round(v * 100) / 100;

    // Sheet 1: Summary
    const summaryData = [
        ['AUXY PARTNERS - Simulation Tranching (LBO)'],
        [''],
        ['Date', new Date().toLocaleDateString('fr-FR')],
        [''],
        ['STRUCTURE DE LA DETTE'],
        ['']
    ];

    const freqLabelsExcel = { monthly: 'Mensuel', quarterly: 'Trimestriel', semiannual: 'Semestriel', annual: 'Annuel' };
    result.tranches.forEach((tr, i) => {
        summaryData.push([`Tranche ${i + 1}: ${tr.name}`]);
        summaryData.push(['  Montant', Financial.formatCurrency(tr.amount)]);
        summaryData.push(['  Taux', tr.rate + ' %']);
        summaryData.push(['  Durée', tr.duration + ' mois']);
        summaryData.push(['  Type', tr.type === 'infine' ? 'In Fine' : 'Constant']);
        summaryData.push(['  Fréquence', freqLabelsExcel[tr.frequency || 'monthly']]);
        summaryData.push(['  Intérêts totaux', Financial.formatCurrency(tr.result.totalInterest)]);
        summaryData.push(['  Coût total', Financial.formatCurrency(tr.result.totalCost)]);
        summaryData.push(['']);
    });

    summaryData.push(['RÉSULTATS CONSOLIDÉS']);
    summaryData.push(['Dette totale', Financial.formatCurrency(result.consolidated.totalDebt)]);
    summaryData.push(['Taux moyen pondéré', result.consolidated.weightedRate.toFixed(2) + ' %']);
    summaryData.push(['Annuité totale', Financial.formatCurrency(result.consolidated.annualDebtService)]);
    summaryData.push(['Total intérêts', Financial.formatCurrency(result.consolidated.totalInterest)]);
    summaryData.push(['Coût total', Financial.formatCurrency(result.consolidated.totalCost)]);

    const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
    summaryWs['!cols'] = [{ wch: 30 }, { wch: 25 }];
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Résumé');

    // Sheet 2: Consolidated schedule
    const consHeaders = ['Période', 'Mensualité', 'Capital', 'Intérêts', 'CRD'];
    const consData = [consHeaders, ...result.consolidated.schedule.map(r => [
        r.period, f(r.payment), f(r.principal), f(r.interest), f(r.balance)
    ])];
    const consWs = XLSX.utils.aoa_to_sheet(consData);
    consWs['!cols'] = consHeaders.map(() => ({ wch: 16 }));
    XLSX.utils.book_append_sheet(wb, consWs, 'Consolidé');

    // Sheets per tranche
    result.tranches.forEach(tr => {
        const schedule = tr.result.schedule;
        if (!schedule?.length) return;
        const keys = Object.keys(schedule[0]);
        const trFreq = tr.frequency || 'monthly';
        const labels = {
            period: Financial.getPeriodLabel(trFreq), payment: Financial.getPaymentLabel(trFreq), principal: 'Capital',
            interest: 'Intérêts', insurance: 'Assurance', balance: 'CRD',
            totalInterest: 'Int. Cumulés', totalInsurance: 'Ass. Cumulées'
        };
        const headerLabels = keys.map(k => labels[k] || k);
        const data = [headerLabels, ...schedule.map(row => keys.map(k => {
            const v = row[k];
            return typeof v === 'number' ? f(v) : v;
        }))];
        const ws = XLSX.utils.aoa_to_sheet(data);
        ws['!cols'] = headerLabels.map(() => ({ wch: 16 }));
        XLSX.utils.book_append_sheet(wb, ws, tr.name.substring(0, 28));
    });

    XLSX.writeFile(wb, `tranching_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ── Load pending reload data ──
function loadPendingReload() {
    const pending = window._pendingReload;
    if (!pending) return;
    window._pendingReload = null;

    // Switch to correct type
    if (pending.type && pending.type !== currentType) {
        currentType = pending.type;
        document.querySelectorAll('#credit-tabs .tab').forEach(t => {
            t.classList.toggle('active', t.dataset.type === currentType);
        });
        document.getElementById('credit-form-fields').innerHTML = getFormHTML(currentType);
        const sub = document.querySelector('.card-subtitle');
        if (sub) sub.textContent = CREDIT_TYPES.find(t => t.id === currentType)?.desc || '';
    }

    // Map params to form fields
    if (pending.params) {
        const fieldMap = {
            principal: 'cr-principal',
            assetValue: 'cr-principal',
            creditLine: 'cr-principal',
            bridgeAmount: 'cr-principal',
            annualRate: 'cr-rate',
            cashRate: 'cr-rate',
            durationMonths: 'cr-duration',
            frequency: 'cr-frequency',
            deferralMonths: 'cr-deferral',
            insuranceMonthly: 'cr-insurance',
            insuranceRate: 'cr-insurance-rate',
            fees: 'cr-fees',
            deposit: 'cr-deposit',
            residualValue: 'cr-residual',
            utilization: 'cr-utilization',
            commitmentFee: 'cr-commitment',
            expectedSalePrice: 'cr-salePrice',
            capitalizedInterest: 'cr-capitalized',
            pikRate: 'cr-pikRate',
            equityKicker: 'cr-kicker'
        };

        Object.entries(pending.params).forEach(([key, value]) => {
            if (key === 'insuranceMode') return; // handled below
            const fieldId = fieldMap[key];
            if (!fieldId) return;
            const el = document.getElementById(fieldId);
            if (!el) return;
            if (el.type === 'checkbox') {
                el.checked = !!value;
            } else {
                el.value = value;
            }
        });

        // Restore insurance toggle state
        const hasRate = pending.params.insuranceRate > 0;
        const modeToggle = document.getElementById('insurance-mode-toggle');
        if (modeToggle) {
            modeToggle.querySelectorAll('.toggle-btn').forEach(b =>
                b.classList.toggle('active', b.dataset.mode === (hasRate ? 'rate' : 'amount'))
            );
            document.getElementById('insurance-amount-group')?.classList.toggle('hidden', hasRate);
            document.getElementById('insurance-rate-group')?.classList.toggle('hidden', !hasRate);
            document.getElementById('insurance-nature-toggle')?.classList.toggle('hidden', !hasRate);

            if (hasRate && pending.params.insuranceMode) {
                const natureToggle = document.getElementById('insurance-nature-toggle');
                natureToggle?.querySelectorAll('.toggle-btn-sm').forEach(b =>
                    b.classList.toggle('active', b.dataset.nature === pending.params.insuranceMode)
                );
            }
        }
    }

    // Restore tranching state
    if (pending.type === 'tranching' && pending.params?.tranches) {
        tranchingTranches = pending.params.tranches.map(t => ({ ...t }));
        const rowsEl = document.getElementById('tranching-rows');
        if (rowsEl) rowsEl.innerHTML = renderTranchingRows();
        refreshTranchingTotal();
        setupTranchingListeners();
    }

    // Restore deferral toggle
    if (pending.params?.deferralType) {
        const dtToggle = document.getElementById('deferral-type-toggle');
        dtToggle?.querySelectorAll('.toggle-btn').forEach(b =>
            b.classList.toggle('active', b.dataset.dtype === pending.params.deferralType)
        );
    }

    // Setup live formatting and insurance toggle after populating
    setupLiveFormatting();
    setupInsuranceToggle();
    setupDeferralToggle();
}

export const CreditModule = {
    render() {
        return `
            <div class="page-header">
                <h1>Simulation de Crédit Entreprise</h1>
                <p>Simulez et comparez différents types de financements</p>
            </div>

            <!-- Credit Type Tabs -->
            <div class="tabs" id="credit-tabs">
                ${CREDIT_TYPES.map(t => `
                    <button class="tab ${t.id === currentType ? 'active' : ''}" data-type="${t.id}" title="${t.desc}">
                        ${t.label}
                    </button>
                `).join('')}
            </div>

            <!-- Form -->
            <div class="card section">
                <div class="card-header">
                    <div>
                        <div class="card-title">Paramètres</div>
                        <div class="card-subtitle">${CREDIT_TYPES.find(t => t.id === currentType)?.desc}</div>
                    </div>
                </div>
                <form id="credit-form">
                    <div id="credit-form-fields">
                        ${getFormHTML(currentType)}
                    </div>
                    <div class="btn-group" style="margin-top: 20px">
                        <button type="submit" class="btn btn-primary btn-lg">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                            Simuler
                        </button>
                        <button type="button" class="btn btn-outline" id="btn-save-sim">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/></svg>
                            Sauvegarder
                        </button>
                        <button type="button" class="btn btn-ghost" id="btn-reset-sim">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
                            Réinitialiser
                        </button>
                    </div>
                </form>
            </div>

            <!-- Results -->
            <div id="credit-results"></div>

            <!-- Charts -->
            <div class="credit-output hidden">
                <div class="grid-2 section">
                    <div class="card">
                        <div class="card-title">Décomposition des mensualités</div>
                        <div class="chart-container"><canvas id="chart-amort"></canvas></div>
                    </div>
                    <div class="card">
                        <div class="card-title">Capital Restant Dû</div>
                        <div class="chart-container"><canvas id="chart-balance"></canvas></div>
                    </div>
                </div>
                <div class="card section" style="max-width:500px; margin:0 auto;">
                    <div class="card-title" style="text-align:center;">Répartition des coûts</div>
                    <div class="chart-container" style="max-height:300px;"><canvas id="chart-cost"></canvas></div>
                </div>
            </div>

            <!-- Schedule Table -->
            <div class="credit-output hidden">
                <div class="card section">
                    <div class="card-header">
                        <div class="card-title">Tableau d'amortissement</div>
                        <div class="btn-group">
                            <button class="btn btn-sm btn-outline" id="btn-export-excel">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                Excel
                            </button>
                            <button class="btn btn-sm btn-accent" id="btn-export-pdf">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                PDF
                            </button>
                        </div>
                    </div>
                    <div id="schedule-table"></div>
                </div>
            </div>
        `;
    },

    init() {
        // Tab switching
        document.getElementById('credit-tabs')?.addEventListener('click', e => {
            const btn = e.target.closest('.tab');
            if (!btn) return;
            currentType = btn.dataset.type;
            document.querySelectorAll('#credit-tabs .tab').forEach(t => t.classList.remove('active'));
            btn.classList.add('active');

            document.getElementById('credit-form-fields').innerHTML = getFormHTML(currentType);
            document.getElementById('credit-results').innerHTML = '';
            document.querySelectorAll('.credit-output').forEach(el => el.classList.add('hidden'));
            lastResult = null;

            // Update subtitle
            const sub = document.querySelector('.card-subtitle');
            if (sub) sub.textContent = CREDIT_TYPES.find(t => t.id === currentType)?.desc || '';

            // Re-setup live formatting, insurance toggle, deferral toggle
            setupLiveFormatting();
            setupInsuranceToggle();
            setupDeferralToggle();
            if (currentType === 'tranching') setupTranchingListeners();
        });

        // Form submission
        document.getElementById('credit-form')?.addEventListener('submit', e => {
            e.preventDefault();
            runSimulation();
        });

        // Save
        document.getElementById('btn-save-sim')?.addEventListener('click', saveSimulation);

        // Reset
        document.getElementById('btn-reset-sim')?.addEventListener('click', resetForm);

        // Export
        document.getElementById('btn-export-pdf')?.addEventListener('click', exportPdf);
        document.getElementById('btn-export-excel')?.addEventListener('click', exportExcel);

        // Setup live formatting, insurance toggle, deferral toggle
        setupLiveFormatting();
        setupInsuranceToggle();
        setupDeferralToggle();
        if (currentType === 'tranching') setupTranchingListeners();

        // Handle pending reload from history
        setTimeout(() => loadPendingReload(), 100);
    }
};
