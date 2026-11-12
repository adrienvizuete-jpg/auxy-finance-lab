/**
 * Auxy Partners - Credit Simulation Module
 * Types: Amortissable Constant, Dégressif, In Fine, Crédit-Bail, Revolving, Prêt Relais, Dette Mezzanine
 */

import { Financial } from '../utils/financial.js';
import { Charts } from '../utils/charts.js';
import { Export } from '../utils/export.js';
import { Storage } from '../utils/storage.js';
import { PARAM_LABELS, RESULT_LABELS, t, formatValue } from '../utils/i18n.js';
import { escapeHtml } from '../utils/sanitize.js';
import { Share } from '../utils/share.js';
import { Market } from '../utils/market.js';
import { LoanEngine } from '../utils/loanengine.js';
import { Dialog } from '../utils/dialog.js';
import { Handoff } from '../utils/handoff.js';

const CREDIT_TYPES = [
    { id: 'constant', label: 'Amortissable Constant', desc: 'Mensualités fixes' },
    { id: 'degressif', label: 'Amortissable Dégressif', desc: 'Amortissement constant' },
    { id: 'infine', label: 'In Fine', desc: 'Intérêts seuls + bullet' },
    { id: 'bpi', label: 'Prêt Bpifrance', desc: 'Différé de 1 à 3 ans (intérêts seuls), puis échéances constantes — 7 ans, parfois 8 ou 10' },
    { id: 'creditbail', label: 'Crédit-Bail', desc: "Leasing avec option d'achat" },
    { id: 'revolving', label: 'Revolving', desc: 'Ligne de crédit' },
    { id: 'relais', label: 'Prêt Relais', desc: 'Court terme, intérêts capitalisés' },
    { id: 'mezzanine', label: 'Dette Mezzanine', desc: 'Cash + PIK + equity kicker' },
    { id: 'variable', label: 'Taux variable', desc: 'Euribor + marge, floor, couverture, Exact/360' },
    { id: 'bfr', label: 'BFR : comparatif', desc: 'Affacturage, Dailly / escompte, RCF — coût du financement du poste clients' },
    { id: 'tranching', label: 'Tranching', desc: 'Financement multi-tranches (LBO)' }
];

/** Types regroupés en 3 familles : la barre de 10 onglets débordait */
const CREDIT_FAMILIES = [
    { id: 'mt', label: 'Moyen / long terme', desc: 'Amortissable, in fine, Bpifrance, taux variable, crédit-bail', types: ['constant', 'degressif', 'infine', 'bpi', 'variable', 'creditbail'] },
    { id: 'ct', label: 'Court terme & BFR', desc: 'Comparatif BFR, RCF, prêt relais', types: ['bfr', 'revolving', 'relais'] },
    { id: 'st', label: 'Structuré', desc: 'Mezzanine, tranching LBO', types: ['mezzanine', 'tranching'] }
];

let currentType = 'constant';

/** Familles et onglets alignés sur le type courant (rechargement d'une simulation) */
function syncTypeTabs() {
    const tabs = document.getElementById('credit-tabs');
    if (tabs) tabs.innerHTML = typeTabsHtml();
    document.querySelectorAll('#credit-families .credit-family').forEach(b => {
        const on = !!CREDIT_FAMILIES.find(f => f.id === /** @type {HTMLElement} */ (b).dataset.family)?.types.includes(currentType);
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', String(on));
    });
}

/** Onglets des types de la famille du type courant */
function typeTabsHtml() {
    const fam = CREDIT_FAMILIES.find(f => f.types.includes(currentType)) || CREDIT_FAMILIES[0];
    return fam.types.map(id => CREDIT_TYPES.find(t => t.id === id)).filter(Boolean).map(t => `
                    <button class="tab ${t.id === currentType ? 'active' : ''}" data-type="${t.id}" title="${t.desc}">
                        ${t.label}
                    </button>`).join('');
}
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
    creditbail: { 'cr-principal': 500000, 'cr-deposit': 50000, 'cr-rate': 5.0, 'cr-duration': 60, 'cr-residual': 25000, 'cr-fees': 0, 'cr-timing': 'advance', 'cr-first-rent': 0 },
    revolving: { 'cr-principal': 1000000, 'cr-utilization': 60, 'cr-rate': 5.5, 'cr-commitment': 0.5, 'cr-duration': 12 },
    relais: { 'cr-principal': 300000, 'cr-salePrice': 450000, 'cr-rate': 5.0, 'cr-duration': 18, 'cr-capitalized': false, 'cr-fees': 0 },
    mezzanine: { 'cr-principal': 2000000, 'cr-duration': 60, 'cr-rate': 8.0, 'cr-pikRate': 4.0, 'cr-kicker': 5.0, 'cr-fees': 0, 'cr-pik-compounding': 'annual' },
    bpi: { 'cr-principal': 500000, 'cr-rate': 4.5, 'cr-bpi-years': '7', 'cr-bpi-deferral': '2', 'cr-frequency': 'quarterly', 'cr-bpi-profile': 'constant', 'cr-fees': 0, 'cr-bpi-retenue': 5, 'cr-bpi-retenue-rate': 0, 'cr-bpi-cofi': false, 'cr-bank-amount': 500000, 'cr-bank-rate': 4.5, 'cr-bank-years': 7, 'cr-bank-deferral': 0, 'cr-bank-profile': 'constant' },
    variable: { 'cr-principal': 5000000, 'cr-duration': 84, 'cr-frequency': 'quarterly', 'cr-vamort': 'constant', 'cr-margin': 2.25, 'cr-upfront': 1.0 },
    bfr: {},
    tranching: {}
};


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
            <td><input type="text" class="form-input form-input-sm" value="${escapeHtml(t.name)}" data-field="name" style="min-width:100px"></td>
            <td><input type="number" class="form-input form-input-sm" value="${t.amount}" data-field="amount" min="0" step="1"></td>
            <td><input type="number" class="form-input form-input-sm" value="${t.rate}" data-field="rate" min="0" max="50" step="0.25" style="width:80px"></td>
            <td><input type="number" class="form-input form-input-sm" value="${t.duration}" data-field="duration" min="1" max="720" step="1" style="width:80px"></td>
            <td><input type="number" class="form-input form-input-sm" value="${t.deferral || 0}" data-field="deferral" min="0" max="60" step="12" style="width:70px" title="Différé d'amortissement en mois, inclus dans la durée : intérêts seuls (prêt Bpifrance : 12 à 36 mois)"></td>
            <td>
                <select class="form-input form-input-sm" data-field="type">
                    <option value="constant" ${t.type === 'constant' ? 'selected' : ''}>Constant</option>
                    <option value="degressif" ${t.type === 'degressif' ? 'selected' : ''}>Dégressif</option>
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
    // Idempotent : init() et le rechargement d'une simulation l'appellent
    // tous deux sur le même tableau (sinon « Ajouter » créait 2 tranches)
    if (!table || table.dataset.bound === '1') return;
    table.dataset.bound = '1';

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

    document.getElementById('btn-add-bpi')?.addEventListener('click', () => {
        tranchingTranches.push({ name: 'Prêt Bpifrance', amount: 1000000, rate: 4.5, duration: 84, deferral: 24, type: 'constant', frequency: 'quarterly' });
        document.getElementById('tranching-rows').innerHTML = renderTranchingRows();
        refreshTranchingTotal();
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

    const flag = (el, message) => {
        valid = false;
        el.classList.add('invalid');
        el.setAttribute('aria-invalid', 'true');
        const error = document.createElement('div');
        error.className = 'form-error';
        error.id = `${el.id}-error`;
        error.textContent = message;
        el.setAttribute('aria-describedby', error.id);
        el.closest('.form-group')?.appendChild(error);
    };
    document.querySelectorAll('#credit-form-fields [aria-invalid]').forEach(el => { el.removeAttribute('aria-invalid'); el.removeAttribute('aria-describedby'); });

    requiredFields.forEach(({ id, label, min }) => {
        const el = document.getElementById(id);
        if (!el) return;
        const val = parseFloat(el.value);
        if (isNaN(val) || val < (min ?? 0.01)) flag(el, `${label} est requis`);
    });

    // Validation HTML native désactivée (novalidate : elle refusait 4,125 %
    // ou 62 jours à cause des pas) : seuls les maxima déclarés sont contrôlés
    document.querySelectorAll('#credit-form-fields input[max]').forEach(el => {
        const input = /** @type {HTMLInputElement} */ (el);
        const val = parseFloat(input.value);
        if (!isNaN(val) && input.max !== '' && val > parseFloat(input.max) && !input.classList.contains('invalid')) {
            const lbl = input.closest('.form-group')?.querySelector('.form-label')?.textContent?.trim() || 'Valeur';
            flag(input, `${lbl} : maximum ${input.max}`);
        }
    });

    const firstInvalid = document.querySelector('#credit-form-fields .invalid');
    if (firstInvalid) /** @type {HTMLElement} */ (firstInvalid).focus();
    return valid;
}

function getRequiredFields(type) {
    const base = [
        { id: 'cr-principal', label: 'Montant', min: 1 },
        { id: 'cr-rate', label: 'Taux', min: 0 },
        { id: 'cr-duration', label: 'Durée', min: 1 }
    ];
    switch (type) {
        case 'creditbail':
            return [
                { id: 'cr-principal', label: 'Valeur du bien', min: 1 },
                { id: 'cr-rate', label: 'Taux', min: 0 },
                { id: 'cr-duration', label: 'Durée', min: 1 }
            ];
        case 'revolving':
            return [
                { id: 'cr-principal', label: 'Ligne de crédit', min: 1 },
                { id: 'cr-rate', label: 'Taux', min: 0 },
                { id: 'cr-duration', label: 'Durée', min: 1 }
            ];
        case 'bpi':
            return [
                { id: 'cr-principal', label: 'Montant', min: 1 },
                { id: 'cr-rate', label: 'Taux', min: 0 }
            ];
        case 'bfr':
            return [
                { id: 'cr-principal', label: 'CA confié', min: 1 },
                { id: 'cr-dso', label: 'Délai clients', min: 1 }
            ];
        case 'variable':
            return [
                { id: 'cr-principal', label: 'Montant', min: 1 },
                { id: 'cr-margin', label: 'Marge', min: 0 },
                { id: 'cr-duration', label: 'Durée', min: 1 }
            ];
        case 'relais':
            return [
                { id: 'cr-principal', label: 'Montant du prêt', min: 1 },
                { id: 'cr-salePrice', label: 'Prix de vente', min: 1 },
                { id: 'cr-rate', label: 'Taux', min: 0 },
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

        case 'bpi':
            return `
        <div class="form-row">
            <div class="form-group">
                <label class="form-label">Montant du prêt (€)</label>
                <div class="input-group">
                    <input type="number" class="form-input" id="cr-principal" value="500000" min="0" step="1">
                    <span class="input-suffix">€</span>
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">Taux fixe annuel (%)</label>
                <div class="input-group">
                    <input type="number" class="form-input" id="cr-rate" value="4.5" min="0" max="50" step="0.01">
                    <span class="input-suffix">%</span>
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">Frais de dossier (€)</label>
                <div class="input-group">
                    <input type="number" class="form-input" id="cr-fees" value="0" min="0" step="1">
                    <span class="input-suffix">€</span>
                </div>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label class="form-label">Durée totale, différé inclus</label>
                <select class="form-select" id="cr-bpi-years">
                    ${[5, 6, 7, 8, 9, 10].map(y => `<option value="${y}" ${y === 7 ? 'selected' : ''}>${y} ans${y === 7 ? ' (usuel)' : ''}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Différé d'amortissement</label>
                <select class="form-select" id="cr-bpi-deferral">
                    <option value="1">1 an</option>
                    <option value="2" selected>2 ans</option>
                    <option value="3">3 ans</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Périodicité</label>
                <select class="form-select" id="cr-frequency">
                    <option value="monthly">Mensuelle</option>
                    <option value="quarterly" selected>Trimestrielle (usuel Bpifrance)</option>
                    <option value="semiannual">Semestrielle</option>
                    <option value="annual">Annuelle</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Amortissement après différé</label>
                <select class="form-select" id="cr-bpi-profile">
                    <option value="constant" selected>Échéances constantes</option>
                    <option value="degressif">Capital constant (linéaire)</option>
                </select>
            </div>
        </div>
        <p id="cr-bpi-hint" style="font-size:0.82rem;color:var(--text-muted);margin-top:4px"></p>
        <div class="form-row">
            <div class="form-group">
                <label class="form-label" title="Prélevée sur le décaissement, restituée après complet remboursement du prêt">Retenue de garantie (%)</label>
                <div class="input-group">
                    <input type="number" class="form-input" id="cr-bpi-retenue" value="5" min="0" max="20" step="0.5">
                    <span class="input-suffix">%</span>
                </div>
            </div>
            <div class="form-group">
                <label class="form-label" title="Taux servi par Bpifrance sur la retenue, capitalisé jusqu'à la restitution. 0 si non rémunérée.">Rémunération de la retenue (%)</label>
                <div class="input-group">
                    <input type="number" class="form-input" id="cr-bpi-retenue-rate" value="0" min="0" max="20" step="0.05">
                    <span class="input-suffix">%</span>
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">Cofinancement</label>
                <label style="display:flex;gap:8px;align-items:center;min-height:42px;cursor:pointer">
                    <input type="checkbox" id="cr-bpi-cofi"> Ajouter le prêt bancaire associé
                </label>
            </div>
        </div>
        <div id="cr-bank-block" class="hidden">
            <div class="card-subtitle" style="margin:8px 0">Prêt bancaire cofinancé — même périodicité que le prêt Bpifrance</div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Montant du prêt bancaire (€)</label>
                    <div class="input-group">
                        <input type="number" class="form-input" id="cr-bank-amount" value="500000" min="0" step="1">
                        <span class="input-suffix">€</span>
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">Taux fixe annuel (%)</label>
                    <div class="input-group">
                        <input type="number" class="form-input" id="cr-bank-rate" value="4.5" min="0" max="50" step="0.01">
                        <span class="input-suffix">%</span>
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">Durée (ans)</label>
                    <div class="input-group">
                        <input type="number" class="form-input" id="cr-bank-years" value="7" min="1" max="25" step="1">
                        <span class="input-suffix">ans</span>
                    </div>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Différé du prêt bancaire (mois)</label>
                    <div class="input-group">
                        <input type="number" class="form-input" id="cr-bank-deferral" value="0" min="0" max="60" step="1">
                        <span class="input-suffix">mois</span>
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">Amortissement</label>
                    <select class="form-select" id="cr-bank-profile">
                        <option value="constant" selected>Échéances constantes</option>
                        <option value="degressif">Capital constant (linéaire)</option>
                    </select>
                </div>
            </div>
        </div>`;

        case 'variable':
            return `
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Montant emprunté (€)</label>
                        <div class="input-group"><input type="number" class="form-input" id="cr-principal" value="5000000" min="0" step="1"><span class="input-suffix">€</span></div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Durée (mois)</label>
                        <div class="input-group"><input type="number" class="form-input" id="cr-duration" value="84" min="1" max="360" step="1"><span class="input-suffix">mois</span></div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Date de tirage</label>
                        <input type="date" class="form-input" id="cr-start" value="${new Date().toISOString().slice(0, 10)}">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Périodicité</label>
                        <select class="form-select" id="cr-frequency">
                            <option value="quarterly">Trimestrielle</option>
                            <option value="monthly">Mensuelle</option>
                            <option value="semiannual">Semestrielle</option>
                            <option value="annual">Annuelle</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Amortissement</label>
                        <select class="form-select" id="cr-vamort">
                            <option value="constant">Échéances constantes</option>
                            <option value="degressif">Amortissement constant</option>
                            <option value="custom">Profil annuel libre</option>
                            <option value="balloon">Avec ballon final</option>
                            <option value="infine">In fine</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label" title="% du nominal amorti chaque année, séparés par /">Profil (% par an)</label>
                        <input type="text" class="form-input" id="cr-profile" value="10/15/20/25/30" placeholder="10/15/20/25/30">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Ballon final (% du nominal)</label>
                        <div class="input-group"><input type="number" class="form-input" id="cr-balloon" value="30" min="0" max="100" step="5"><span class="input-suffix">%</span></div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Différé (mois)</label>
                        <div class="input-group"><input type="number" class="form-input" id="cr-deferral" value="0" min="0" max="60" step="1"><span class="input-suffix">mois</span></div>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Marge (%)</label>
                        <div class="input-group"><input type="number" class="form-input" id="cr-margin" value="2.25" min="0" max="20" step="any"><span class="input-suffix">%</span></div>
                    </div>
                    <div class="form-group">
                        <label class="form-label" title="Une valeur par année, séparées par / ; la dernière est prolongée">Euribor par année (%)</label>
                        <input type="text" class="form-input" id="cr-index-path" value="" placeholder="ex. 2,76 / 2,50 / 2,40">
                        <div class="rate-hint" id="cr-index-hint"></div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Floor de l'index</label>
                        <select class="form-select" id="cr-floor">
                            <option value="0">Floor à 0 %</option>
                            <option value="none">Sans floor</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Base de calcul</label>
                        <select class="form-select" id="cr-daycount">
                            <option value="act/360">Exact/360 (Euribor)</option>
                            <option value="act/365">Exact/365</option>
                            <option value="30/360">30/360</option>
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Couverture de taux</label>
                        <select class="form-select" id="cr-hedge">
                            <option value="none">Aucune</option>
                            <option value="swap">Swap (payeur fixe)</option>
                            <option value="cap">Cap</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Part couverte (%)</label>
                        <div class="input-group"><input type="number" class="form-input" id="cr-hedge-pct" value="70" min="0" max="100" step="5"><span class="input-suffix">%</span></div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Taux swap / strike cap (%)</label>
                        <div class="input-group"><input type="number" class="form-input" id="cr-hedge-rate" value="2.80" min="-1" max="15" step="any"><span class="input-suffix">%</span></div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Prime du cap (% du couvert)</label>
                        <div class="input-group"><input type="number" class="form-input" id="cr-cap-premium" value="1.0" min="0" max="10" step="0.1"><span class="input-suffix">%</span></div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Frais d'arrangement (%)</label>
                        <div class="input-group"><input type="number" class="form-input" id="cr-upfront" value="1.0" min="0" max="10" step="any"><span class="input-suffix">%</span></div>
                    </div>
                </div>`;

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
                        <label class="form-label">Paiement des loyers</label>
                        <select class="form-select" id="cr-timing">
                            <option value="advance">Terme à échoir (début de période)</option>
                            <option value="arrears">Terme échu (fin de période)</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Premier loyer majoré (% du bien)</label>
                        <div class="input-group">
                            <input type="number" class="form-input" id="cr-first-rent" value="0" min="0" max="50" step="1">
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
                        <label class="form-label">Commission de non-utilisation</label>
                        <div class="input-group">
                            <input type="number" class="form-input" id="cr-commitment" value="0.5" min="0" max="100" step="any">
                            <select class="form-select" id="cr-commitment-mode" style="max-width:150px">
                                <option value="flat">%/an du non tiré</option>
                                <option value="ofMargin">% de la marge</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Marge (pour « % de la marge »)</label>
                        <div class="input-group">
                            <input type="number" class="form-input" id="cr-rcf-margin" value="1.5" min="0" max="20" step="any">
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
                </div>
                <div class="form-row">
                    <div class="form-group" style="flex:2">
                        <label class="form-label" title="12 valeurs de janvier à décembre, séparées par / ; vide = taux d'utilisation constant">Profil de tirage mensuel (% de la ligne)</label>
                        <input type="text" class="form-input" id="cr-rcf-profile" value="" placeholder="ex. 20/30/60/80/90/70/40/20/10/0/30/50">
                    </div>
                    <div class="form-group">
                        <label class="form-label" title="Au-delà de x % de tirage : +y %/an sur le tiré, ex. 33:0,10 / 66:0,20">Commission d'utilisation (paliers)</label>
                        <input type="text" class="form-input" id="cr-rcf-tiers" value="" placeholder="33:0,10 / 66:0,20">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Frais de mise en place (% ligne)</label>
                        <div class="input-group">
                            <input type="number" class="form-input" id="cr-upfront" value="0" min="0" max="5" step="any">
                            <span class="input-suffix">%</span>
                        </div>
                    </div>
                </div>`;

        case 'bfr':
            return `
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">CA TTC confié / mobilisable (€/an)</label>
                        <div class="input-group"><input type="number" class="form-input" id="cr-principal" value="12000000" min="0" step="10000"><span class="input-suffix">€</span></div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Délai de paiement clients (jours)</label>
                        <div class="input-group"><input type="number" class="form-input" id="cr-dso" value="60" min="0" max="365" step="5"><span class="input-suffix">j</span></div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Euribor 3M (%)</label>
                        <div class="input-group"><input type="number" class="form-input" id="cr-bfr-index" value="2.75" step="any"><span class="input-suffix">%</span></div>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">Affacturage : commission (% CA)</label><input type="number" class="form-input" id="cr-fact-comm" value="0.25" step="any" min="0"></div>
                    <div class="form-group"><label class="form-label">Affacturage : marge (%)</label><input type="number" class="form-input" id="cr-fact-margin" value="1.20" step="any" min="0"></div>
                    <div class="form-group"><label class="form-label">Retenue de garantie (%)</label><input type="number" class="form-input" id="cr-fact-reserve" value="10" step="1" min="0" max="50"></div>
                    <div class="form-group"><label class="form-label">Frais fixes affacturage (€/an)</label><input type="number" class="form-input" id="cr-fact-fixed" value="3000" step="500" min="0"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">Dailly : marge (%)</label><input type="number" class="form-input" id="cr-dailly-margin" value="1.00" step="any" min="0"></div>
                    <div class="form-group"><label class="form-label">Quotité financée (%)</label><input type="number" class="form-input" id="cr-dailly-advance" value="80" step="5" min="0" max="100"></div>
                    <div class="form-group"><label class="form-label">Frais par bordereau (€) × nb/an</label>
                        <div style="display:flex;gap:4px"><input type="number" class="form-input" id="cr-dailly-fee" value="50" step="10" min="0"><input type="number" class="form-input" id="cr-dailly-batches" value="24" step="1" min="0"></div></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">RCF : marge (%)</label><input type="number" class="form-input" id="cr-rcfc-margin" value="1.50" step="any" min="0"></div>
                    <div class="form-group"><label class="form-label">Non-utilisation (% de la marge)</label><input type="number" class="form-input" id="cr-rcfc-commit" value="35" step="5" min="0"></div>
                    <div class="form-group"><label class="form-label">Taille de ligne (€)</label><input type="number" class="form-input" id="cr-rcfc-line" value="2500000" step="50000" min="0"></div>
                    <div class="form-group"><label class="form-label">Frais de mise en place (%) / durée (ans)</label>
                        <div style="display:flex;gap:4px"><input type="number" class="form-input" id="cr-rcfc-upfront" value="0.50" step="any" min="0"><input type="number" class="form-input" id="cr-rcfc-years" value="3" step="1" min="1"></div></div>
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
                    <div class="form-group">
                        <label class="form-label">Capitalisation du PIK</label>
                        <select class="form-select" id="cr-pik-compounding">
                            <option value="annual">Annuelle</option>
                            <option value="monthly">Mensuelle</option>
                        </select>
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
                        <button type="button" class="btn btn-ghost btn-sm" id="btn-add-bpi" title="7 ans dont 2 ans de différé, échéances constantes trimestrielles">+ Prêt Bpifrance</button>
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
                                    <th title="Différé d'amortissement, inclus dans la durée">Différé (mois)</th>
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

// Affichage TAEG : valeur, ou « n.c. » expliqué quand l'IRR ne converge pas
function taegItem(result) {
    if (result.taeg != null) {
        const teg = result.teg != null
            ? `<div class="result-item"><div class="result-label" title="Taux de période × nombre de périodes : indicateur d'usage du crédit professionnel">TEG (proportionnel)</div><div class="result-value">${Financial.formatPercent(result.teg)}</div></div>`
            : '';
        return `${teg}<div class="result-item"><div class="result-label" title="Annualisation actuarielle : norme du crédit aux particuliers">TAEG (actuariel)</div><div class="result-value">${Financial.formatPercent(result.taeg)}</div></div>`;
    }
    return `<div class="result-item"><div class="result-label">TAEG</div><div class="result-value" title="TAEG non calculable : les flux de cette simulation n'admettent pas de taux actuariel unique" style="color:var(--text-muted)">n.c.</div></div>`;
}

/**
 * Prêt(s) de la simulation courante au format commun, pour « Envoyer vers… ».
 * Vide pour les produits qui ne sont pas des prêts amortissables ou in fine.
 * @returns {import('../utils/handoff.js').HandoffLoan[]}
 */
function loansForHandoff() {
    if (!lastResult?.params) return [];
    const p = lastResult.params;
    const label = CREDIT_TYPES.find(t => t.id === lastResult.type)?.label || 'Prêt';
    switch (lastResult.type) {
        case 'constant':
        case 'degressif':
        case 'infine':
            return [{ label, amount: p.principal, rate: p.annualRate, durationMonths: p.durationMonths, deferralMonths: lastResult.type === 'infine' ? 0 : (p.deferralMonths || 0), amortType: lastResult.type, frequency: p.frequency || 'monthly' }];
        case 'bpi': {
            const loans = [{ label: 'Prêt Bpifrance', amount: p.principal, rate: p.annualRate, durationMonths: p.durationMonths, deferralMonths: p.deferralMonths || 0, amortType: p.amortProfile || 'constant', frequency: p.frequency || 'quarterly' }];
            if (p.cofinancement) loans.push({ label: 'Prêt bancaire cofinancé', amount: p.bankAmount, rate: p.bankRate, durationMonths: p.bankDurationMonths, deferralMonths: p.bankDeferralMonths || 0, amortType: p.bankProfile || 'constant', frequency: p.frequency || 'quarterly' });
            return loans;
        }
        case 'variable':
            return [{ label: 'Prêt à taux variable', amount: p.principal, rate: p.margin || 0, durationMonths: p.durationMonths, deferralMonths: p.deferralMonths || 0, amortType: ['constant', 'degressif', 'infine', 'balloon'].includes(p.amortType) ? p.amortType : 'constant', frequency: p.frequency || 'quarterly', rateType: 'floating', balloonPct: p.balloonPct }];
        default:
            return [];
    }
}

/** Cibles possibles : Benchmark et sensibilité ne traitent que le taux fixe, un prêt à la fois */
function handoffPages() {
    const loans = loansForHandoff();
    if (!loans.length) return [];
    // Chaque cible ne reçoit que ce qu'elle sait modéliser, pour ne pas changer le prêt en route :
    // Profil de dette est à taux fixe sans ballon ; Benchmark et sensibilité prennent un seul
    // prêt à taux fixe sans différé (Benchmark : mensualités uniquement).
    const floating = loans.some(l => l.rateType === 'floating');
    const balloon = loans.some(l => l.amortType === 'balloon');
    const simple = loans.length === 1 && !floating && !balloon && !(loans[0].deferralMonths > 0);
    const pages = ['covenants'];
    if (!floating && !balloon) pages.unshift('debtprofile');
    if (simple && (loans[0].frequency || 'monthly') === 'monthly') pages.push('benchmark');
    if (simple) pages.push('stress');
    return pages;
}

/** Cofinancement Bpifrance + banque : synthèse consolidée puis détail par prêt */
function getCofinancementHTML(result) {
    const f = Financial.formatCurrency;
    const p = Financial.formatPercent;
    const payLabel = Financial.getPaymentLabel(result.frequency || 'quarterly');
    const { bpi, bank } = result.loans;
    const pay = r => r.periodicPayment ?? r.firstPayment ?? 0;
    const row = (label, r, principal, rate, years, deferral) => `
        <tr><td><strong>${label}</strong></td><td class="number">${f(principal)}</td><td class="number">${p(rate)}</td>
            <td class="number">${years} ans</td><td class="number">${deferral}</td>
            <td class="number">${f(pay(r))}</td><td class="number">${f(r.totalInterest)}</td><td class="number">${p(r.teg)}</td></tr>`;
    const bp = lastResult.params; // lastResult est posé avant le rendu
    return `
        <div class="results-grid">
            <div class="result-item"><div class="result-label">Financement total</div><div class="result-value">${f(result.totalPrincipal)}</div><div class="result-sub">Bpifrance ${Financial.formatNumber(result.bpiShare, 0)} % · net décaissé ${f(result.netDisbursed)}</div></div>
            <div class="result-item"><div class="result-label">Service de dette année 1</div><div class="result-value">${f(result.firstYearService)}</div><div class="result-sub">pendant le différé Bpifrance</div></div>
            <div class="result-item"><div class="result-label">Service de dette maximal</div><div class="result-value">${f(result.peakService)}</div><div class="result-sub">année ${result.peakYear}</div></div>
            <div class="result-item"><div class="result-label">Taux facial moyen pondéré</div><div class="result-value">${p(result.weightedRate)}</div></div>
            <div class="result-item"><div class="result-label">Coût total des intérêts</div><div class="result-value">${f(result.totalInterest)}</div></div>
            <div class="result-item"><div class="result-label">Total remboursé</div><div class="result-value">${f(result.totalPayment)}</div></div>
            ${result.retenueAmount > 0 ? `<div class="result-item"><div class="result-label">Retenue de garantie Bpifrance</div><div class="result-value">${f(result.retenueAmount)}</div><div class="result-sub">restituée en fin de prêt</div></div>` : ''}
            ${taegItem(result)}
        </div>
        <div class="table-container" style="margin-top:16px">
            <table class="data-table">
                <thead><tr><th>Prêt</th><th>Montant (€)</th><th>Taux</th><th>Durée</th><th>Différé</th><th>${payLabel} après différé</th><th>Intérêts</th><th>TEG</th></tr></thead>
                <tbody>
                    ${row('Bpifrance', bpi, bp.principal, bp.annualRate, bp.durationMonths / 12, `${bp.deferralMonths / 12} an${bp.deferralMonths > 12 ? 's' : ''}`)}
                    ${row('Banque', bank, bp.bankAmount, bp.bankRate, bp.bankDurationMonths / 12, bp.bankDeferralMonths ? `${bp.bankDeferralMonths} mois` : '—')}
                </tbody>
            </table>
        </div>
        <div class="table-container" style="margin-top:12px">
            <table class="data-table">
                <thead><tr><th>Service de dette consolidé</th>${result.annualService.map((_, i) => `<th>Année ${i + 1}</th>`).join('')}</tr></thead>
                <tbody><tr><td>Capital + intérêts</td>${result.annualService.map(v => `<td class="number">${Financial.formatNumber(v, 0)}</td>`).join('')}</tr></tbody>
            </table>
        </div>`;
}

function getResultsHTML(type, result) {
    const f = Financial.formatCurrency;
    const p = Financial.formatPercent;
    const freq = result.frequency || 'monthly';
    const payLabel = Financial.getPaymentLabel(freq);
    const ppy = Financial.getPeriodsPerYear(freq);
    const deferralInfo = result.deferralMonths > 0 ? `<div class="result-item"><div class="result-label">Différé</div><div class="result-value">${result.deferralMonths} mois (${result.deferralType === 'total' ? 'total' : 'partiel'})</div></div>` : '';

    switch (type) {
        case 'bpi': {
            if (result.cofinancement) return getCofinancementHTML(result);
            // Mêmes indicateurs que le profil d'amortissement retenu, précédés
            // des deux phases du prêt : différé (intérêts seuls) puis amortissement
            const phases = `
                    <div class="result-item">
                        <div class="result-label">${payLabel} pendant le différé</div>
                        <div class="result-value">${f(result.deferralPayment)}</div>
                        <div class="result-sub">intérêts seuls, ${result.deferralMonths / 12} an${result.deferralMonths > 12 ? 's' : ''}</div>
                    </div>
                    <div class="result-item">
                        <div class="result-label">Amortissement</div>
                        <div class="result-value">${result.amortYears} ans</div>
                        <div class="result-sub">${result.amortProfile === 'degressif' ? 'capital constant' : 'échéances constantes'}</div>
                    </div>`;
            const retenue = result.retenueAmount > 0 ? `
                    <div class="result-item">
                        <div class="result-label" title="Prélevée sur le décaissement, restituée après complet remboursement">Retenue de garantie</div>
                        <div class="result-value">${f(result.retenueAmount)}</div>
                        <div class="result-sub">net décaissé ${f(result.netDisbursed)}${result.retenueRefund > result.retenueAmount + 0.5 ? ` · restituée ${f(result.retenueRefund)}` : ''}</div>
                    </div>
                    <div class="result-item">
                        <div class="result-label" title="Le TEG et le TAEG affichés sont calculés sur les flux nets, retenue comprise">Taux hors retenue</div>
                        <div class="result-value">${p(result.tegExRetenue)}</div>
                        <div class="result-sub">TEG retenue comprise ci-contre</div>
                    </div>` : '';
            return getResultsHTML(result.amortProfile === 'degressif' ? 'degressif' : 'constant', result)
                .replace('<div class="results-grid">', `<div class="results-grid">${phases}${retenue}`);
        }
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
                    ${taegItem(result)}
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
                    ${taegItem(result)}
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
                    ${taegItem(result)}
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
                    ${taegItem(result)}
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
                        <div class="result-label">Tiré moyen / pic</div>
                        <div class="result-value">${f(result.avgUtilized)}</div>
                        <div class="result-sub">pic ${f(result.peakUtilized)} · ${result.monthsAtZero > 0 ? `${result.monthsAtZero} mois à zéro (clean-down possible)` : 'aucun mois à zéro (clean-down non respecté)'}</div>
                    </div>
                    <div class="result-item">
                        <div class="result-label">Commissions d'utilisation / frais</div>
                        <div class="result-value">${f(result.totalUtilizationFee + result.upfrontFee)}</div>
                        <div class="result-sub">non-utilisation au taux de ${p(result.commitmentRate)}</div>
                    </div>
                    <div class="result-item">
                        <div class="result-label">Taux effectif (sur le tiré)</div>
                        <div class="result-value">${p(result.effectiveRate)}</div>
                        <div class="result-sub">Coût rapporté à la ligne : ${p(result.lineCostRate)}</div>
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
                    ${taegItem(result)}
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
                        <div class="result-label">Coût moyen simple (non actuariel)</div>
                        <div class="result-value">${p(result.allInCost)}</div>
                    </div>
                    ${taegItem(result)}
                </div>`;

        case 'bfr': {
            const best = result.solutions.reduce((a, b) => ((b.ratePct ?? Infinity) < (a.ratePct ?? Infinity) ? b : a));
            return `
                <div class="results-grid">
                    <div class="result-item"><div class="result-label">Encours clients moyen</div><div class="result-value">${f(result.receivables)}</div><div class="result-sub">CA TTC × délai / 365</div></div>
                </div>
                <div class="table-container" style="margin-top:12px">
                    <table class="data-table">
                        <thead><tr><th>Solution</th><th style="text-align:right">Financement moyen</th><th style="text-align:right">Coût annuel</th><th style="text-align:right">Coût / financement</th><th>Remarque</th></tr></thead>
                        <tbody>${result.solutions.map(x => `<tr style="${x === best ? 'font-weight:700' : ''}"><td>${x.name}${x === best ? ' ★' : ''}</td><td class="number">${f(x.financed)}</td><td class="number">${f(x.cost)}</td><td class="number">${p(x.ratePct)}</td><td style="font-size:0.8rem;color:var(--text-muted)">${escapeHtml(x.note)}</td></tr>`).join('')}</tbody>
                    </table>
                </div>
                <p style="font-size:0.8rem;color:var(--text-muted);margin-top:8px">Comparaison du seul coût financier (base Exact/360). L'affacturage finance moins (retenue de garantie) mais externalise le recouvrement et l'assurance-crédit : à intégrer dans l'arbitrage.</p>`;
        }

        case 'variable':
            return `
                <div class="results-grid">
                    <div class="result-item">
                        <div class="result-label">1re ${payLabel.toLowerCase()}</div>
                        <div class="result-value">${f(result.periodicPayment)}</div>
                        <div class="result-sub">taux tout compris ${p(result.firstRate)}</div>
                    </div>
                    <div class="result-item">
                        <div class="result-label">Total intérêts</div>
                        <div class="result-value">${f(result.totalInterest)}</div>
                    </div>
                    <div class="result-item">
                        <div class="result-label">Couverture (net)</div>
                        <div class="result-value">${f(result.totalHedge + result.hedgePremium)}</div>
                        <div class="result-sub">${result.hedgePremium > 0 ? `dont prime ${f(result.hedgePremium)}` : '+ = coût, − = gain'}</div>
                    </div>
                    <div class="result-item">
                        <div class="result-label">Frais d'arrangement</div>
                        <div class="result-value">${f(result.upfrontFee)}</div>
                    </div>
                    <div class="result-item">
                        <div class="result-label">Coût total</div>
                        <div class="result-value">${f(result.totalCost)}</div>
                    </div>
                    ${taegItem(result)}
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
                                    <span class="badge badge-blue">${({ infine: 'In Fine', degressif: 'Dégressif' })[tr.type] || 'Constant'}</span>
                                    <span class="badge" style="background:var(--bg-secondary);color:var(--text-secondary);font-size:0.7rem">${freqLabels[trFreq]}</span>
                                    <strong>${escapeHtml(tr.name)}</strong>
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

function runSimulation({ scroll = true } = {}) {
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
        case 'bpi': {
            const years = val('cr-bpi-years') || 7;
            const deferralYears = Math.min(val('cr-bpi-deferral') || 0, years - 1);
            const amortProfile = /** @type {HTMLSelectElement | null} */ (document.getElementById('cr-bpi-profile'))?.value === 'degressif' ? 'degressif' : 'constant';
            // params au format des prêts amortissables (rechargement, exports, dossier banque)
            params = { principal: val('cr-principal'), annualRate: val('cr-rate'), durationMonths: years * 12, deferralMonths: deferralYears * 12, deferralType: 'partial', frequency, amortProfile, fees: val('cr-fees'), retenuePct: val('cr-bpi-retenue'), retenueRate: val('cr-bpi-retenue-rate') };
            const bpiLoan = { principal: params.principal, annualRate: params.annualRate, durationYears: years, deferralYears, fees: params.fees, amortProfile, retenuePct: params.retenuePct, retenueRate: params.retenueRate };
            if (val('cr-bpi-cofi') && val('cr-bank-amount') > 0) {
                // paramètres à plat : rechargement, exports et dossier banque les lisent tels quels
                const bankProfile = /** @type {HTMLSelectElement | null} */ (document.getElementById('cr-bank-profile'))?.value === 'degressif' ? 'degressif' : 'constant';
                const bankYears = Math.max(1, Math.round(val('cr-bank-years')) || 7);
                Object.assign(params, { cofinancement: true, bankAmount: val('cr-bank-amount'), bankRate: val('cr-bank-rate'), bankDurationMonths: bankYears * 12, bankDeferralMonths: Math.min(val('cr-bank-deferral'), bankYears * 12 - 12), bankProfile });
                result = Financial.cofinancementBpifrance({
                    bpi: bpiLoan,
                    bank: { principal: params.bankAmount, annualRate: params.bankRate, durationYears: bankYears, deferralMonths: params.bankDeferralMonths, amortProfile: bankProfile },
                    frequency
                });
            } else {
                result = Financial.pretBpifrance({ ...bpiLoan, frequency });
            }
            break;
        }
        case 'creditbail':
            params = { assetValue: val('cr-principal'), deposit: val('cr-deposit'), annualRate: val('cr-rate'), durationMonths: val('cr-duration'), residualValue: val('cr-residual'), fees: val('cr-fees'), paymentTiming: document.getElementById('cr-timing')?.value || 'advance', firstRentPct: val('cr-first-rent') };
            result = Financial.creditBail(params);
            break;
        case 'revolving':
            {
                const list = txt => String(txt || '').split(/[/;|]/).map(v => Financial.parseNumber(v)).filter(v => !isNaN(v));
                const tiers = String(document.getElementById('cr-rcf-tiers')?.value || '').split(/[/;|]/).map(part => {
                    const [above, fee] = part.split(':').map(v => Financial.parseNumber(v));
                    return { above, fee };
                }).filter(t => isFinite(t.above) && isFinite(t.fee));
                params = {
                    creditLine: val('cr-principal'), utilization: val('cr-utilization'), annualRate: val('cr-rate'),
                    commitmentFee: val('cr-commitment'), durationMonths: val('cr-duration'),
                    commitmentMode: document.getElementById('cr-commitment-mode')?.value || 'flat',
                    margin: val('cr-rcf-margin'),
                    utilizationProfile: list(document.getElementById('cr-rcf-profile')?.value),
                    utilizationFees: tiers,
                    upfrontFeePct: val('cr-upfront')
                };
            }
            result = Financial.revolving(params);
            break;
        case 'relais':
            params = { bridgeAmount: val('cr-principal'), annualRate: val('cr-rate'), durationMonths: val('cr-duration'), expectedSalePrice: val('cr-salePrice'), capitalizedInterest: val('cr-capitalized'), fees: val('cr-fees') };
            result = Financial.pretRelais(params);
            break;
        case 'mezzanine':
            params = { principal: val('cr-principal'), cashRate: val('cr-rate'), pikRate: val('cr-pikRate'), durationMonths: val('cr-duration'), equityKicker: val('cr-kicker'), fees: val('cr-fees'), pikCompounding: document.getElementById('cr-pik-compounding')?.value || 'annual' };
            result = Financial.detteMezzanine(params);
            break;
        case 'bfr':
            params = {
                turnover: val('cr-principal'), dso: val('cr-dso'), index: val('cr-bfr-index'),
                factoring: { commissionPct: val('cr-fact-comm'), margin: val('cr-fact-margin'), reservePct: val('cr-fact-reserve'), fixedFees: val('cr-fact-fixed') },
                dailly: { margin: val('cr-dailly-margin'), advancePct: val('cr-dailly-advance'), feePerBatch: val('cr-dailly-fee'), batchesPerYear: val('cr-dailly-batches') },
                rcf: { margin: val('cr-rcfc-margin'), commitmentPctOfMargin: val('cr-rcfc-commit'), line: val('cr-rcfc-line'), upfrontFeePct: val('cr-rcfc-upfront'), years: val('cr-rcfc-years') }
            };
            result = { ...Financial.bfrComparison(params), schedule: [] };
            break;
        case 'variable': {
            const str = id => document.getElementById(id)?.value || '';
            const list = txt => String(txt).split(/[/;|]/).map(v => Financial.parseNumber(v)).filter(v => !isNaN(v));
            const hedgeType = str('cr-hedge') || 'none';
            const hedgeRate = val('cr-hedge-rate');
            params = {
                principal: val('cr-principal'),
                durationMonths: val('cr-duration'),
                frequency: str('cr-frequency') || 'quarterly',
                amortType: str('cr-vamort') || 'constant',
                customProfile: list(str('cr-profile')),
                balloonPct: val('cr-balloon'),
                deferralMonths: val('cr-deferral'),
                rateType: 'floating',
                margin: val('cr-margin'),
                indexPath: list(str('cr-index-path')),
                floor: str('cr-floor') === 'none' ? null : 0,
                dayCount: str('cr-daycount') || 'act/360',
                startDate: str('cr-start') || undefined,
                hedge: { type: hedgeType, pct: val('cr-hedge-pct'), swapRate: hedgeRate, capStrike: hedgeRate, capPremiumPct: val('cr-cap-premium') },
                upfrontFeePct: val('cr-upfront')
            };
            if (!params.indexPath.length) params.indexPath = [0];
            const built = LoanEngine.build(params);
            const first = built.rows[0];
            result = {
                ...built,
                schedule: built.rows,
                frequency: params.frequency,
                periodicPayment: first ? first.payment : 0,
                firstRate: first ? first.rate : null,
                totalHedge: built.totalHedge
            };
            break;
        }
        case 'tranching':
            params = { tranches: tranchingTranches.map(t => ({ ...t })) };
            result = Financial.tranching(tranchingTranches);
            // Alias consolidated schedule for charts/table compatibility
            result.schedule = result.consolidated.schedule;
            break;
    }

    lastResult = { type: currentType, params, results: result };

    // Durée non multiple de la périodicité : le moteur arrondit au nombre de
    // périodes le plus proche — on le dit plutôt que de le taire.
    if (!result.cofinancement && result.effectiveDurationMonths && params.durationMonths && result.effectiveDurationMonths !== Math.round(params.durationMonths)) {
        window.showToast?.(`Durée modélisée : ${result.effectiveDurationMonths} mois (multiple de la périodicité) au lieu de ${params.durationMonths}`, 'warning');
    }

    // Render results
    const resultsDiv = document.getElementById('credit-results');
    // pas sur le prêt Bpifrance : le module de remboursement anticipé ne connaît ni le différé ni le profil choisi
    const supportsPrepayment = ['constant', 'degressif', 'infine'].includes(currentType);
    if (resultsDiv) {
        resultsDiv.innerHTML = `
            <div class="results-panel">
                ${getResultsHTML(currentType, result)}
            </div>
            ${handoffPages().length ? Handoff.barHtml(handoffPages()) : ''}
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
                        <label class="form-label">Indemnité (IRA)</label>
                        <select class="form-select" id="ra-ira-mode">
                            <option value="legal">Plafond légal : min(3 % CRD ; 6 mois)</option>
                            <option value="pct">Forfait % du capital remboursé</option>
                            <option value="months">N mois d'intérêts</option>
                            <option value="none">Sans indemnité</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Paramètre IRA (% ou mois)</label>
                        <input type="number" class="form-input" id="ra-ira-param" value="3" min="0" step="0.5">
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

    // Cost breakdown — masqué s'il n'y a qu'une seule composante (donut mono-segment sans information)
    const breakdown = [];
    if (result.totalInterest) breakdown.push({ label: 'Intérêts', value: result.totalInterest });
    if (result.totalInsurance) breakdown.push({ label: 'Assurance', value: result.totalInsurance });
    if (result.totalCommitment) breakdown.push({ label: 'Commissions', value: result.totalCommitment });
    if (result.totalPikInterest) breakdown.push({ label: 'Intérêts PIK', value: result.totalPikInterest });
    if (result.equityKickerValue) breakdown.push({ label: 'Equity Kicker', value: result.equityKickerValue });
    if (params.fees) breakdown.push({ label: 'Frais', value: params.fees });

    const costCard = document.getElementById('cost-breakdown-card');
    if (breakdown.length >= 2) {
        costCard?.classList.remove('hidden');
        Charts.costBreakdown('chart-cost', breakdown);
    } else {
        costCard?.classList.add('hidden');
    }

    // Show schedule table
    renderScheduleTable(result.schedule);

    // Show sections
    document.querySelectorAll('.credit-output').forEach(el => el.classList.remove('hidden'));

    // Amène les résultats à l'écran (les KPI sont sous la ligne de flottaison)
    if (scroll) {
        document.getElementById('credit-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
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
    if ('date' in first) columns.push({ key: 'date', label: 'Date', format: 'date' });
    if ('indexRate' in first) columns.push({ key: 'indexRate', label: 'Index', format: 'pct' });
    if ('rate' in first) columns.push({ key: 'rate', label: 'Taux', format: 'pct' });
    if ('payment' in first) columns.push({ key: 'payment', label: payLabel, format: 'currency' });
    if ('cashPayment' in first) columns.push({ key: 'cashPayment', label: 'Cash', format: 'currency' });
    if ('principal' in first) columns.push({ key: 'principal', label: 'Capital', format: 'currency' });
    if ('interest' in first) columns.push({ key: 'interest', label: 'Intérêts', format: 'currency' });
    if ('pikInterest' in first) columns.push({ key: 'pikInterest', label: 'PIK', format: 'currency' });
    if ('insurance' in first && schedule.some(r => r.insurance > 0)) columns.push({ key: 'insurance', label: 'Assurance', format: 'currency' });
    if ('commitmentFee' in first) columns.push({ key: 'commitmentFee', label: 'Com.', format: 'currency' });
    if ('hedgeFlow' in first && schedule.some(r => r.hedgeFlow)) columns.push({ key: 'hedgeFlow', label: 'Couverture', format: 'currency' });
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
                        <tr>${columns.map(c => `<td class="${c.format && c.format !== 'date' ? 'number' : ''}">${c.format === 'currency' ? Financial.formatCurrency(row[c.key], 2) : c.format === 'pct' ? Financial.formatPercent(row[c.key], 3) : c.format === 'date' ? new Date(row[c.key]).toLocaleDateString('fr-FR', { timeZone: 'UTC' }) : escapeHtml(row[c.key])}</td>`).join('')}</tr>
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
                <tr>${columns.map(c => `<td class="${c.format && c.format !== 'date' ? 'number' : ''}">${c.format === 'currency' ? Financial.formatCurrency(row[c.key], 2) : c.format === 'pct' ? Financial.formatPercent(row[c.key], 3) : c.format === 'date' ? new Date(row[c.key]).toLocaleDateString('fr-FR', { timeZone: 'UTC' }) : escapeHtml(row[c.key])}</td>`).join('')}</tr>
            `).join('');
            this.remove();
        });
    }
}

// ── Prepayment analysis ──
function runPrepaymentAnalysis() {
    if (!lastResult?.results?.schedule) return;
    const period = parseInt(document.getElementById('ra-period')?.value) || 24;
    const amount = parseFloat(document.getElementById('ra-amount')?.value);
    if (!(amount > 0)) { window.showToast?.('Saisissez le montant remboursé', 'warning'); return; }
    const strategy = document.getElementById('ra-strategy')?.value || 'reduceDuration';
    const iraMode = document.getElementById('ra-ira-mode')?.value || 'legal';
    const iraParam = parseFloat(document.getElementById('ra-ira-param')?.value);

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
        iraMode,
        iraPct: isNaN(iraParam) ? 3 : iraParam,
        iraMonths: isNaN(iraParam) ? 6 : iraParam,
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
                    <div class="result-sub">${({
                        legal: `min(3 % CRD = ${f(analysis.ira3pct)} ; 6 mois d'int. = ${f(analysis.ira6mois)})`,
                        pct: 'forfait contractuel sur le capital remboursé',
                        months: 'mois d\'intérêts sur le capital remboursé',
                        none: 'aucune indemnité'
                    })[analysis.iraMode] || ''}</div>
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

// ── Prêt Bpifrance : rappel de la structure (différé + amortissement) ──
function setupBpiHint() {
    const hint = document.getElementById('cr-bpi-hint');
    const years = /** @type {HTMLSelectElement | null} */ (document.getElementById('cr-bpi-years'));
    const deferral = /** @type {HTMLSelectElement | null} */ (document.getElementById('cr-bpi-deferral'));
    if (!hint || !years || !deferral) return;
    const show = () => {
        const y = Number(years.value) || 7;
        // un différé au moins égal à la durée n'a pas de sens : options désactivées
        [...deferral.options].forEach(o => { o.disabled = Number(o.value) >= y; });
        if (Number(deferral.value) >= y) deferral.value = String(Math.max(1, y - 1));
        const d = Number(deferral.value) || 0;
        hint.textContent = `${d} an${d > 1 ? 's' : ''} de différé (intérêts seuls), puis ${y - d} an${y - d > 1 ? 's' : ''} d'amortissement. Durée totale : ${y} ans.`;
    };
    const cofi = /** @type {HTMLInputElement | null} */ (document.getElementById('cr-bpi-cofi'));
    const bank = document.getElementById('cr-bank-block');
    const toggleBank = () => bank?.classList.toggle('hidden', !cofi?.checked);
    // onchange (et non addEventListener) : rappelée après un rechargement sans empiler d'écouteurs
    years.onchange = show;
    deferral.onchange = show;
    if (cofi) cofi.onchange = toggleBank;
    show();
    toggleBank();
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
    const body = document.getElementById('modal-body');

    const typeLabel = CREDIT_TYPES.find(t => t.id === currentType)?.label || currentType;
    const defaultName = `${typeLabel} - ${Financial.formatCurrency(lastResult.params.principal || lastResult.params.assetValue || lastResult.params.creditLine || lastResult.params.bridgeAmount)}`;

    body.innerHTML = `
        <h2 style="margin-bottom:20px">Sauvegarder la simulation</h2>
        <div class="form-group" style="margin-bottom:16px">
            <label class="form-label">Nom de la simulation</label>
            <input type="text" class="form-input" id="save-sim-name" value="${escapeHtml(defaultName)}" style="width:100%">
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

    Dialog.show();

    // Focus name input
    document.getElementById('save-sim-name')?.focus();

    document.getElementById('save-cancel')?.addEventListener('click', () => {
        Dialog.close();
    });

    document.getElementById('save-confirm')?.addEventListener('click', () => {
        const name = document.getElementById('save-sim-name')?.value || defaultName;
        const notes = document.getElementById('save-sim-notes')?.value || '';

        const id = Storage.saveSimulation({
            ...lastResult,
            name,
            notes,
            typeLabel
        });

        Dialog.close();
        if (id) {
            window.showToast?.('Simulation sauvegardée', 'success');
        } else {
            window.showToast?.('Échec de la sauvegarde : stockage local plein', 'error');
        }
    });
}

// ── Partage par URL ──
function shareSimulation() {
    if (!lastResult) {
        window.showToast?.("Lancez d'abord une simulation", 'warning');
        return;
    }
    Share.copyLink('credit', { type: currentType, params: lastResult.params, autorun: true });
}

// ── Taux de marché (hint cliquable sous le champ taux) ──
/** Taux variable : pré-remplit la trajectoire d'index avec l'Euribor 3M publié. */
async function prefillIndexPath() {
    const bfrIndex = document.getElementById('cr-bfr-index');
    if (bfrIndex) {
        const d = await Market.getRates();
        const v = Market.rateValue(d, 'euribor_3m');
        // seulement la valeur par défaut : une simulation rechargée garde son index
        if (v != null && document.contains(bfrIndex) && bfrIndex.value === bfrIndex.defaultValue) bfrIndex.value = String(Math.round(v * 1000) / 1000);
    }
    const input = document.getElementById('cr-index-path');
    if (!input) return;
    const data = await Market.getRates();
    if (!document.contains(input)) return;
    const e3m = Market.rateValue(data, 'euribor_3m');
    const e12m = Market.rateValue(data, 'euribor_12m');
    const hint = document.getElementById('cr-index-hint');
    if (e3m != null && !input.value) input.value = Financial.formatNumber(e3m, 3);
    if (hint && (e3m != null || e12m != null)) {
        const updated = Market.formatUpdatedAt(data);
        hint.textContent = `Marché${updated ? ` (${updated})` : ''} : Euribor 3M ${e3m != null ? Financial.formatNumber(e3m, 3) + ' %' : 'n.d.'} · 12M ${e12m != null ? Financial.formatNumber(e12m, 3) + ' %' : 'n.d.'} — trajectoire à saisir par année (taux du jour prolongé par défaut)`;
    }
}

async function setupRateHint() {
    const rateInput = document.getElementById('cr-rate');
    if (!rateInput) return;
    const group = rateInput.closest('.form-group');
    if (!group || group.querySelector('.rate-hint')) return;

    const data = await Market.getRates();
    if (!data) return;
    // Le formulaire a pu être re-rendu pendant le fetch
    if (!document.contains(rateInput)) return;

    const entries = [
        ['euribor_3m', data.rates?.euribor_3m],
        ['oat_10y', data.rates?.oat_10y]
    ].filter(([, r]) => r && typeof r.value === 'number');
    if (entries.length === 0) return;

    const updated = Market.formatUpdatedAt(data);
    const hint = document.createElement('div');
    hint.className = 'rate-hint';
    // Arrondi à 2 décimales : l'input taux a step="0.01", une 3e décimale
    // déclencherait la validation HTML native et bloquerait le submit
    hint.innerHTML = `Marché${updated ? ` (${updated})` : ''} : ` + entries.map(([key, r]) => {
        const v = (Math.round(r.value * 100) / 100).toFixed(2);
        const note = Market.rateNote(data, key);
        return `<button type="button" class="rate-hint-value" data-rate="${v}" title="Utiliser ${v} %">${escapeHtml(r.label)} ${Financial.formatNumber(r.value, 2)} %${note ? ` (${escapeHtml(note)})` : ''}</button>`;
    }).join(' · ');
    group.appendChild(hint);

    hint.addEventListener('click', e => {
        const btn = e.target.closest('[data-rate]');
        if (!btn) return;
        rateInput.value = btn.dataset.rate;
        rateInput.dispatchEvent(new Event('input', { bubbles: true }));
        window.showToast?.(`Taux ${btn.dataset.rate} % appliqué`, 'info');
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
        setupBpiHint(); // bloc bancaire et rappel de structure alignés sur les valeurs par défaut
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

    // Graphiques affichés à l'écran (décomposition + CRD)
    if (lastResult.results.schedule?.[0]?.principal !== undefined) {
        sections.push({ type: 'chart', canvasId: 'chart-amort', title: 'Décomposition des échéances' });
        sections.push({ type: 'chart', canvasId: 'chart-balance', title: 'Capital restant dû' });
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

    const p = lastResult.params;
    const coverItems = [
        p.principal != null && { label: 'Montant', value: Financial.formatCurrency(p.principal) },
        p.assetValue != null && { label: 'Valeur du bien', value: Financial.formatCurrency(p.assetValue) },
        p.creditLine != null && { label: 'Ligne de crédit', value: Financial.formatCurrency(p.creditLine) },
        p.bridgeAmount != null && { label: 'Montant du relais', value: Financial.formatCurrency(p.bridgeAmount) },
        p.annualRate != null && { label: 'Taux annuel', value: `${p.annualRate} %` },
        p.cashRate != null && { label: 'Taux cash', value: `${p.cashRate} %` },
        p.durationMonths != null && { label: 'Durée', value: `${p.durationMonths} mois` }
    ].filter(Boolean);

    Export.toPdf(`Simulation ${typeLabel}`, sections, `simulation_${currentType}`, {
        cover: { subtitle: 'Simulation de financement', items: coverItems }
    });
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
        window.showToast?.('Outils d\u2019export Excel indisponibles (connexion ?) — réessayez', 'error');
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
        summaryData.push(['  Montant', Math.round(tr.amount * 100) / 100, '€']);
        summaryData.push(['  Taux', tr.rate + ' %']);
        summaryData.push(['  Durée', tr.duration + ' mois']);
        summaryData.push(['  Type', ({ infine: 'In Fine', degressif: 'Dégressif' })[tr.type] || 'Constant']);
        summaryData.push(['  Fréquence', freqLabelsExcel[tr.frequency || 'monthly']]);
        summaryData.push(['  Intérêts totaux', Math.round(tr.result.totalInterest * 100) / 100, '€']);
        summaryData.push(['  Coût total', Math.round(tr.result.totalCost * 100) / 100, '€']);
        summaryData.push(['']);
    });

    summaryData.push(['RÉSULTATS CONSOLIDÉS']);
    summaryData.push(['Dette totale', Math.round(result.consolidated.totalDebt * 100) / 100, '€']);
    summaryData.push(['Taux moyen pondéré', Math.round(result.consolidated.weightedRate * 100) / 100, '%']);
    summaryData.push(['Annuité totale', Math.round(result.consolidated.annualDebtService * 100) / 100, '€']);
    summaryData.push(['Total intérêts', Math.round(result.consolidated.totalInterest * 100) / 100, '€']);
    summaryData.push(['Coût total', Math.round(result.consolidated.totalCost * 100) / 100, '€']);

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
        // Nom d'onglet Excel : 31 caractères max, sans / \\ ? * [ ] :, et unique
        const base = (String(tr.name || 'Tranche').replace(/[\\/?*[\]:]/g, ' ').trim() || 'Tranche').substring(0, 24);
        let sheetName = base, n = 2;
        while (wb.SheetNames.includes(sheetName)) sheetName = `${base} (${n++})`;
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });

    XLSX.writeFile(wb, `tranching_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ── Load pending reload data ──
function loadPendingReload() {
    const pending = window._pendingReload;
    // Ne consomme que les simulations de ce module (sinon une analyse
    // Covenants restée en attente casserait le formulaire Crédit)
    if (!pending || !CREDIT_TYPES.some(t => t.id === pending.type)) return;
    window._pendingReload = null;

    // Switch to correct type
    if (pending.type && pending.type !== currentType) {
        currentType = pending.type;
        syncTypeTabs();
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
            equityKicker: 'cr-kicker',
            paymentTiming: 'cr-timing',
            firstRentPct: 'cr-first-rent',
            pikCompounding: 'cr-pik-compounding'
        };
        // Simulations antérieures : conventions de l'époque (terme échu, PIK mensuel)
        const legacy = { ...pending.params };
        if (pending.type === 'creditbail' && legacy.paymentTiming == null) legacy.paymentTiming = 'arrears';
        if (pending.type === 'mezzanine' && legacy.pikCompounding == null) legacy.pikCompounding = 'monthly';
        pending.params = legacy;

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

        // RCF et comparatif BFR : champs propres (listes, paramètres imbriqués)
        const setField = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = String(v); };
        if (pending.type === 'bpi') {
            const p = pending.params;
            /** @param {string} id @param {number} years */
            const pick = (id, years) => {
                const sel = /** @type {HTMLSelectElement | null} */ (document.getElementById(id));
                if (!sel || !(years > 0)) return;
                // durée hors liste (lien partagé, ancienne simulation) : option ajoutée
                if (![...sel.options].some(o => Number(o.value) === years)) sel.add(new Option(`${years} ans`, String(years)));
                sel.value = String(years);
            };
            pick('cr-bpi-years', Math.round((p.durationMonths || 84) / 12));
            pick('cr-bpi-deferral', Math.round((p.deferralMonths || 0) / 12));
            const prof = /** @type {HTMLSelectElement | null} */ (document.getElementById('cr-bpi-profile'));
            if (prof) prof.value = p.amortProfile === 'degressif' ? 'degressif' : 'constant';
            /** @param {string} id @param {unknown} v */
            const put = (id, v) => { const el = /** @type {HTMLInputElement | null} */ (document.getElementById(id)); if (el && v != null) el.value = String(v); };
            // simulations enregistrées avant la retenue : 0 %, pour retrouver le même résultat
            put('cr-bpi-retenue', p.retenuePct ?? 0);
            put('cr-bpi-retenue-rate', p.retenueRate ?? 0);
            const cofi = /** @type {HTMLInputElement | null} */ (document.getElementById('cr-bpi-cofi'));
            if (cofi) cofi.checked = !!p.cofinancement;
            if (p.cofinancement) {
                put('cr-bank-amount', p.bankAmount);
                put('cr-bank-rate', p.bankRate);
                put('cr-bank-years', Math.round((p.bankDurationMonths || 84) / 12));
                put('cr-bank-deferral', p.bankDeferralMonths || 0);
                put('cr-bank-profile', p.bankProfile === 'degressif' ? 'degressif' : 'constant');
            }
            setupBpiHint();
        }
        if (pending.type === 'revolving') {
            const p = pending.params;
            setField('cr-commitment-mode', p.commitmentMode);
            setField('cr-rcf-margin', p.margin);
            setField('cr-upfront', p.upfrontFeePct);
            if (Array.isArray(p.utilizationProfile)) setField('cr-rcf-profile', p.utilizationProfile.join('/'));
            if (Array.isArray(p.utilizationFees)) setField('cr-rcf-tiers', p.utilizationFees.map(t => `${t.above}:${Financial.formatNumber(t.fee, 2)}`).join(' / '));
        }
        if (pending.type === 'bfr') {
            const p = pending.params;
            setField('cr-principal', p.turnover); setField('cr-dso', p.dso); setField('cr-bfr-index', p.index);
            setField('cr-fact-comm', p.factoring?.commissionPct); setField('cr-fact-margin', p.factoring?.margin);
            setField('cr-fact-reserve', p.factoring?.reservePct); setField('cr-fact-fixed', p.factoring?.fixedFees);
            setField('cr-dailly-margin', p.dailly?.margin); setField('cr-dailly-advance', p.dailly?.advancePct);
            setField('cr-dailly-fee', p.dailly?.feePerBatch); setField('cr-dailly-batches', p.dailly?.batchesPerYear);
            setField('cr-rcfc-margin', p.rcf?.margin); setField('cr-rcfc-commit', p.rcf?.commitmentPctOfMargin);
            setField('cr-rcfc-line', p.rcf?.line); setField('cr-rcfc-upfront', p.rcf?.upfrontFeePct); setField('cr-rcfc-years', p.rcf?.years);
        }

        // Taux variable : champs propres (listes, couverture)
        if (pending.type === 'variable') {
            const p = pending.params;
            const set = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = String(v); };
            set('cr-vamort', p.amortType);
            set('cr-margin', p.margin);
            set('cr-balloon', p.balloonPct);
            set('cr-daycount', p.dayCount);
            set('cr-start', p.startDate);
            set('cr-upfront', p.upfrontFeePct);
            set('cr-floor', p.floor == null ? 'none' : '0');
            if (Array.isArray(p.indexPath)) set('cr-index-path', p.indexPath.map(v => Financial.formatNumber(v, 3)).join(' / '));
            if (Array.isArray(p.customProfile)) set('cr-profile', p.customProfile.join('/'));
            if (p.hedge) {
                set('cr-hedge', p.hedge.type);
                set('cr-hedge-pct', p.hedge.pct);
                set('cr-hedge-rate', p.hedge.type === 'cap' ? p.hedge.capStrike : p.hedge.swapRate);
                set('cr-cap-premium', p.hedge.capPremiumPct);
            }
        }

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
    setupInsuranceToggle();
    setupDeferralToggle();
    setupBpiHint();
}

export const CreditModule = {
    render() {
        // Type demandé par un parcours de mission (js/utils/mission.js)
        const asked = /** @type {any} */ (window)._creditType;
        if (asked && CREDIT_TYPES.some(t => t.id === asked)) {
            currentType = asked;
            // la dernière simulation d'un autre type ne doit pas reprendre la main au retour
            if (lastResult && lastResult.type !== asked) lastResult = null;
        }
        /** @type {any} */ (window)._creditType = null;
        return `
            <div class="page-header">
                <h1>Simulation de Crédit Entreprise</h1>
                <p>Simulez et comparez différents types de financements</p>
            </div>

            <!-- Familles puis types de crédit -->
            <div class="credit-families" id="credit-families" role="group" aria-label="Famille de financement">
                ${CREDIT_FAMILIES.map(f => `
                    <button type="button" class="credit-family ${f.types.includes(currentType) ? 'active' : ''}" data-family="${f.id}" aria-pressed="${f.types.includes(currentType)}">
                        <span class="credit-family-label">${f.label}</span><span class="credit-family-desc">${f.desc}</span>
                    </button>`).join('')}
            </div>
            <div class="tabs" id="credit-tabs">${typeTabsHtml()}</div>

            <!-- Form -->
            <div class="card section">
                <div class="card-header">
                    <div>
                        <div class="card-title">Paramètres</div>
                        <div class="card-subtitle">${CREDIT_TYPES.find(t => t.id === currentType)?.desc}</div>
                    </div>
                </div>
                <form id="credit-form" novalidate>
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
                        <button type="button" class="btn btn-outline" id="btn-share-sim">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                            Partager
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
                <div class="card section" id="cost-breakdown-card" style="max-width:500px; margin:0 auto;">
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
        // « Envoyer vers… » : le prêt simulé part dans un autre module, sans ressaisie
        document.getElementById('credit-results')?.addEventListener('click', e => {
            const btn = e.target.closest('[data-handoff]');
            if (btn) Handoff.send(btn.dataset.handoff, loansForHandoff());
        });

        // Famille : affiche ses types et ouvre le premier
        document.getElementById('credit-families')?.addEventListener('click', e => {
            const btn = e.target.closest('.credit-family');
            if (!btn) return;
            const fam = CREDIT_FAMILIES.find(f => f.id === btn.dataset.family);
            if (!fam || fam.types.includes(currentType)) return;
            document.querySelectorAll('#credit-families .credit-family').forEach(b => {
                const on = b === btn;
                b.classList.toggle('active', on);
                b.setAttribute('aria-pressed', String(on));
            });
            const tabs = document.getElementById('credit-tabs');
            const previous = currentType;
            currentType = fam.types[0];
            if (tabs) tabs.innerHTML = typeTabsHtml();
            currentType = previous;
            /** @type {HTMLElement | null} */ (tabs?.querySelector(`.tab[data-type="${fam.types[0]}"]`))?.click();
        });

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
            setupInsuranceToggle();
            setupDeferralToggle();
    setupBpiHint();
        setupBpiHint();
            setupBpiHint();
            setupRateHint();
            prefillIndexPath();
        prefillIndexPath();
            if (currentType === 'tranching') setupTranchingListeners();
        });

        // Form submission
        document.getElementById('credit-form')?.addEventListener('submit', e => {
            e.preventDefault();
            runSimulation();
        });

        // Save
        document.getElementById('btn-save-sim')?.addEventListener('click', saveSimulation);

        // Share
        document.getElementById('btn-share-sim')?.addEventListener('click', shareSimulation);

        // Reset
        document.getElementById('btn-reset-sim')?.addEventListener('click', resetForm);

        // Export
        document.getElementById('btn-export-pdf')?.addEventListener('click', exportPdf);
        document.getElementById('btn-export-excel')?.addEventListener('click', exportExcel);

        // Setup live formatting, insurance toggle, deferral toggle
        setupInsuranceToggle();
        setupDeferralToggle();
    setupBpiHint();
        setupBpiHint();
        setupRateHint();
        prefillIndexPath();
        if (currentType === 'tranching') setupTranchingListeners();

        // Lien de partage (#credit?s=...) : restaure les paramètres et relance le calcul
        const shared = Share.getPayload();
        if (shared?.type && shared?.params) {
            window._pendingReload = { type: shared.type, params: shared.params };
        } else if (!window._pendingReload && lastResult && lastResult.type !== 'tranching' && CREDIT_TYPES.some(t => t.id === lastResult.type)) {
            // Retour sur la page (navigation, changement de thème) : le formulaire
            // reprend la dernière simulation au lieu des valeurs par défaut — sinon
            // « Sauvegarder » enregistrait autre chose que ce qui est affiché.
            window._pendingReload = { type: lastResult.type, params: lastResult.params };
        }

        // Handle pending reload from history (ou lien partagé)
        setTimeout(() => {
            loadPendingReload();
            if (shared?.autorun) runSimulation({ scroll: false });
        }, 100);
    }
};
