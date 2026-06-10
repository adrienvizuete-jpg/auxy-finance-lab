/**
 * Auxy Partners - Profil de Dette consolidé (debt wall)
 * Saisie des crédits existants d'un client → échéancier consolidé,
 * mur de la dette par année, identification des fenêtres de refinancement.
 * Unités : € (comme le module Crédit).
 */

import { Financial } from '../utils/financial.js';
import { Charts } from '../utils/charts.js';
import { Export } from '../utils/export.js';
import { Storage } from '../utils/storage.js';
import { Share } from '../utils/share.js';
import { escapeHtml } from '../utils/sanitize.js';

// ── State ──
let startYear = new Date().getFullYear();
let loans = [
    { label: 'Crédit immobilier', crd: 1200000, rate: 3.2, remainingMonths: 96, amortType: 'constant', frequency: 'monthly' },
    { label: 'Prêt équipement', crd: 450000, rate: 4.1, remainingMonths: 48, amortType: 'constant', frequency: 'monthly' },
    { label: 'Crédit-bail', crd: 230000, rate: 4.8, remainingMonths: 36, amortType: 'constant', frequency: 'monthly' }
];
let lastResult = null;

const AMORT_OPTIONS = { constant: 'Constant', degressif: 'Dégressif', infine: 'In Fine' };
const FREQ_OPTIONS = { monthly: 'Mensuel', quarterly: 'Trimestriel', semiannual: 'Semestriel', annual: 'Annuel' };

const f0 = v => Financial.formatCurrency(v, 0);
const fmtPct = v => Financial.formatPercent(v, 2);

const X_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
const PLUS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';

// ── Moteur ──

function loanSchedule(loan) {
    const params = {
        principal: loan.crd,
        annualRate: loan.rate,
        durationMonths: loan.remainingMonths,
        frequency: loan.frequency
    };
    if (loan.amortType === 'infine') return Financial.inFine(params);
    if (loan.amortType === 'degressif') return Financial.amortissableDegressif(params);
    return Financial.amortissableConstant(params);
}

function compute() {
    const horizonYears = Math.max(1, Math.ceil(Math.max(...loans.map(l => l.remainingMonths || 1)) / 12));
    const yearLabels = Array.from({ length: horizonYears }, (_, i) => String(startYear + i));

    const perLoan = loans.map(loan => {
        const result = loanSchedule(loan);
        const ppy = Financial.getPeriodsPerYear(loan.frequency);
        const schedule = result.schedule || [];
        const annual = [];
        for (let y = 0; y < horizonYears; y++) {
            const rows = schedule.slice(y * ppy, (y + 1) * ppy);
            const principal = rows.reduce((s, r) => s + (r.principal || 0), 0);
            const interest = rows.reduce((s, r) => s + (r.interest || 0), 0);
            const lastRow = schedule[Math.min((y + 1) * ppy, schedule.length) - 1];
            const crd = ((y + 1) * ppy >= schedule.length) ? 0 : (lastRow?.balance ?? 0);
            annual.push({ principal, interest, service: principal + interest, crd: Math.max(0, crd) });
        }
        return { loan, result, annual };
    });

    const years = yearLabels.map((label, y) => {
        const principal = perLoan.reduce((s, p) => s + p.annual[y].principal, 0);
        const interest = perLoan.reduce((s, p) => s + p.annual[y].interest, 0);
        const crd = perLoan.reduce((s, p) => s + p.annual[y].crd, 0);
        return { label, principal, interest, service: principal + interest, crd };
    });

    const totalDebt = loans.reduce((s, l) => s + (l.crd || 0), 0);
    const weightedRate = totalDebt > 0 ? loans.reduce((s, l) => s + (l.crd || 0) * (l.rate || 0), 0) / totalDebt : 0;
    const peak = years.reduce((a, b) => (b.service > a.service ? b : a), years[0]);
    const amortized3y = years.slice(0, 3).reduce((s, y) => s + y.principal, 0);
    const pctAmortized3y = totalDebt > 0 ? amortized3y / totalDebt * 100 : 0;
    const maxMaturityMonths = Math.max(...loans.map(l => l.remainingMonths || 0));

    return { yearLabels, perLoan, years, totalDebt, weightedRate, peak, pctAmortized3y, maxMaturityMonths };
}

// ── Rendus ──

function renderLoanRows() {
    return loans.map((l, i) => {
        const sched = loanSchedule(l);
        const ppy = Financial.getPeriodsPerYear(l.frequency);
        const annuity = (sched.schedule || []).slice(0, ppy).reduce((s, r) => s + r.payment, 0);
        return `
        <tr data-index="${i}">
            <td><input class="er-input" type="text" value="${escapeHtml(l.label)}" data-field="label"></td>
            <td style="text-align:right"><input class="er-input narrow" type="number" value="${l.crd}" data-field="crd" step="10000" min="0" style="width:110px"></td>
            <td style="text-align:right"><input class="er-input narrow" type="number" value="${l.rate}" data-field="rate" step="0.1" min="0" max="30" style="width:70px"></td>
            <td style="text-align:right"><input class="er-input narrow" type="number" value="${l.remainingMonths}" data-field="remainingMonths" step="1" min="1" max="480" style="width:70px"></td>
            <td><select class="er-input" data-field="amortType" style="width:100px;font-size:0.75rem">${Object.entries(AMORT_OPTIONS).map(([k, v]) => `<option value="${k}" ${k === l.amortType ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
            <td><select class="er-input" data-field="frequency" style="width:100px;font-size:0.75rem">${Object.entries(FREQ_OPTIONS).map(([k, v]) => `<option value="${k}" ${k === l.frequency ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
            <td style="text-align:right" class="er-computed">${f0(annuity)}</td>
            <td style="width:30px">${loans.length > 1 ? `<button class="er-remove-btn" data-action="remove">${X_SVG}</button>` : ''}</td>
        </tr>`;
    }).join('');
}

function renderAnnualTable(c) {
    return `
        <div class="table-container">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Année</th>
                        <th style="text-align:right">Service de dette</th>
                        <th style="text-align:right">dont capital</th>
                        <th style="text-align:right">dont intérêts</th>
                        <th style="text-align:right">CRD fin d'année</th>
                    </tr>
                </thead>
                <tbody>
                    ${c.years.map(y => `
                        <tr ${y === c.peak && y.service > 0 ? 'class="dp-peak-row"' : ''}>
                            <td>${y.label}${y === c.peak && y.service > 0 ? ' <span class="cov-badge warning" title="Pic du service de dette">pic</span>' : ''}</td>
                            <td class="number">${f0(y.service)}</td>
                            <td class="number">${f0(y.principal)}</td>
                            <td class="number">${f0(y.interest)}</td>
                            <td class="number">${f0(y.crd)}</td>
                        </tr>`).join('')}
                </tbody>
            </table>
        </div>`;
}

function recalculate() {
    const c = compute();

    const setKpi = (id, val) => { const el = document.getElementById(id); if (el) el.innerHTML = val; };
    setKpi('dp-kpi-total', f0(c.totalDebt));
    setKpi('dp-kpi-rate', fmtPct(c.weightedRate));
    setKpi('dp-kpi-service', f0(c.years[0]?.service || 0));
    setKpi('dp-kpi-peak', c.peak ? `${f0(c.peak.service)} <span class="cov-kpi-sub">${c.peak.label}</span>` : '—');
    setKpi('dp-kpi-amort3', `${Financial.formatNumber(c.pctAmortized3y, 0)} %`);

    const tableEl = document.getElementById('dp-annual-table');
    if (tableEl) tableEl.innerHTML = renderAnnualTable(c);

    // Mur de la dette (capital remboursé par an, empilé par ligne)
    Charts.debtWall('chart-debt-wall', c.yearLabels,
        c.perLoan.map(p => ({ label: p.loan.label, data: p.annual.map(a => a.principal) })));

    // CRD consolidé
    Charts.multiLineComparison('chart-debt-crd',
        [{ label: 'CRD consolidé', data: c.years.map(y => y.crd) }], c.yearLabels);

    lastResult = {
        type: 'debtprofile',
        params: { startYear, loans: loans.map(l => ({ ...l })) },
        results: {
            totalDebt: c.totalDebt,
            weightedRate: c.weightedRate,
            annualDebtService: c.years[0]?.service || 0,
            peakYear: c.peak?.label ?? null,
            peakService: c.peak?.service ?? 0,
            pctAmortized3y: c.pctAmortized3y,
            years: c.years
        }
    };
}

// ── Actions ──

function saveProfile() {
    if (!lastResult) recalculate();
    const modal = document.getElementById('modal-overlay');
    const body = document.getElementById('modal-body');
    const defaultName = `Profil de dette — ${f0(lastResult.results.totalDebt)}`;

    body.innerHTML = `
        <h2 style="margin-bottom:20px">Sauvegarder le profil</h2>
        <div class="form-group" style="margin-bottom:16px">
            <label class="form-label">Nom</label>
            <input type="text" class="form-input" id="save-dp-name" value="${escapeHtml(defaultName)}" style="width:100%">
        </div>
        <div class="form-group" style="margin-bottom:24px">
            <label class="form-label">Notes (optionnel)</label>
            <textarea class="form-input notes-input" id="save-dp-notes" rows="3" placeholder="Ajoutez des notes ou commentaires..."></textarea>
        </div>
        <div class="btn-group" style="justify-content:flex-end">
            <button class="btn btn-outline" id="save-dp-cancel">Annuler</button>
            <button class="btn btn-primary" id="save-dp-confirm">Sauvegarder</button>
        </div>
    `;
    modal.classList.remove('hidden');
    document.getElementById('save-dp-name')?.focus();
    document.getElementById('save-dp-cancel')?.addEventListener('click', () => modal.classList.add('hidden'));
    document.getElementById('save-dp-confirm')?.addEventListener('click', () => {
        const name = document.getElementById('save-dp-name')?.value || defaultName;
        const notes = document.getElementById('save-dp-notes')?.value || '';
        const id = Storage.saveSimulation({ ...lastResult, name, notes, typeLabel: 'Profil de Dette' });
        modal.classList.add('hidden');
        window.showToast?.(id ? 'Profil sauvegardé' : 'Échec de la sauvegarde : stockage local plein', id ? 'success' : 'error');
    });
}

function exportExcel() {
    if (typeof XLSX === 'undefined') { alert('Bibliothèque Excel non chargée'); return; }
    if (!lastResult) recalculate();
    const r = lastResult.results;

    const wb = XLSX.utils.book_new();
    const rows = [
        ['AUXY PARTNERS — Profil de Dette consolidé'],
        [''],
        ['Dette totale (CRD)', Math.round(r.totalDebt)],
        ['Taux moyen pondéré (%)', Math.round(r.weightedRate * 100) / 100],
        ['Service de dette année 1', Math.round(r.annualDebtService)],
        ['Pic de service', `${r.peakYear} (${Math.round(r.peakService)})`],
        [''],
        ['CRÉDITS EXISTANTS', 'CRD (€)', 'Taux (%)', 'Durée restante (mois)', 'Amortissement', 'Fréquence']
    ];
    loans.forEach(l => rows.push([l.label, l.crd, l.rate, l.remainingMonths, AMORT_OPTIONS[l.amortType], FREQ_OPTIONS[l.frequency]]));
    rows.push(['']);
    rows.push(['Année', 'Service de dette', 'dont capital', 'dont intérêts', 'CRD fin d\'année']);
    r.years.forEach(y => rows.push([y.label, Math.round(y.service), Math.round(y.principal), Math.round(y.interest), Math.round(y.crd)]));

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 26 }, { wch: 16 }, { wch: 14 }, { wch: 20 }, { wch: 16 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Profil de dette');
    XLSX.writeFile(wb, `profil_dette_${new Date().toISOString().slice(0, 10)}.xlsx`);
    window.showToast?.('Export Excel téléchargé', 'success');
}

function exportPdf() {
    if (!lastResult) recalculate();
    const r = lastResult.results;
    const sections = [
        { type: 'title', text: 'Synthèse' },
        { type: 'keyvalue', items: [
            { label: 'Dette totale (CRD)', value: f0(r.totalDebt) },
            { label: 'Taux moyen pondéré', value: fmtPct(r.weightedRate) },
            { label: 'Service de dette année 1', value: f0(r.annualDebtService) },
            { label: 'Pic de service', value: `${r.peakYear} — ${f0(r.peakService)}` },
            { label: 'Capital amorti à 3 ans', value: `${Financial.formatNumber(r.pctAmortized3y, 0)} %` }
        ] },
        { type: 'chart', canvasId: 'chart-debt-wall', title: 'Mur de la dette (capital remboursé par an)' },
        { type: 'title', text: 'Échéancier consolidé' },
        { type: 'table',
            headers: ['Année', 'Service', 'dont capital', 'dont intérêts', 'CRD fin'],
            rows: r.years.map(y => [y.label, f0(y.service), f0(y.principal), f0(y.interest), f0(y.crd)]) },
        { type: 'title', text: 'Crédits existants' },
        { type: 'table',
            headers: ['Ligne', 'CRD', 'Taux', 'Durée restante', 'Amortissement', 'Fréquence'],
            rows: loans.map(l => [l.label, f0(l.crd), `${l.rate} %`, `${l.remainingMonths} mois`, AMORT_OPTIONS[l.amortType], FREQ_OPTIONS[l.frequency]]) }
    ];
    Export.toPdf('Profil de Dette consolidé', sections, 'profil_dette', {
        cover: {
            subtitle: 'Échéancier consolidé et mur de la dette',
            items: [
                { label: 'Dette totale', value: f0(r.totalDebt) },
                { label: 'Nombre de lignes', value: String(loans.length) },
                { label: 'Taux moyen pondéré', value: fmtPct(r.weightedRate) },
                { label: 'Pic de service', value: `${r.peakYear}` }
            ]
        }
    });
}

function shareProfile() {
    if (!lastResult) recalculate();
    Share.copyLink('debtprofile', { type: 'debtprofile', params: lastResult.params });
}

function loadParams(p) {
    if (!p) return;
    if (p.startYear >= 2000 && p.startYear <= 2100) startYear = parseInt(p.startYear);
    if (Array.isArray(p.loans) && p.loans.length) {
        loans = p.loans.map(l => ({
            label: String(l.label ?? 'Crédit'),
            crd: parseFloat(l.crd) || 0,
            rate: parseFloat(l.rate) || 0,
            remainingMonths: Math.max(1, parseInt(l.remainingMonths) || 1),
            amortType: AMORT_OPTIONS[l.amortType] ? l.amortType : 'constant',
            frequency: FREQ_OPTIONS[l.frequency] ? l.frequency : 'monthly'
        }));
    }
}

// ── Module ──
export const DebtProfileModule = {
    render() {
        return `
            <div class="page-header">
                <h1>Profil de Dette</h1>
                <p>Échéancier consolidé des crédits existants — mur de la dette et fenêtres de refinancement</p>
            </div>

            <div class="card section">
                <div class="card-header">
                    <div class="card-title">Crédits existants (€)</div>
                    <div style="display:flex;align-items:center;gap:12px">
                        <label class="form-label" style="margin:0">1ère année</label>
                        <input type="number" class="form-input form-input-sm" id="dp-start-year" value="${startYear}" min="2000" max="2100" step="1" style="width:90px">
                        <button class="btn btn-sm btn-outline" id="dp-add-loan">${PLUS_SVG} Ajouter un crédit</button>
                    </div>
                </div>
                <div class="table-container" style="margin-top:12px">
                    <table class="er-table">
                        <thead>
                            <tr>
                                <th>Libellé</th>
                                <th style="text-align:right">CRD (€)</th>
                                <th style="text-align:right">Taux (%)</th>
                                <th style="text-align:right">Restant (mois)</th>
                                <th>Amortissement</th>
                                <th>Fréquence</th>
                                <th style="text-align:right">Annuité (€)</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody id="dp-loans-body">${renderLoanRows()}</tbody>
                    </table>
                </div>
            </div>

            <!-- KPIs -->
            <div class="er-kpi-grid section">
                <div class="er-kpi-card">
                    <div class="kpi-label">Dette totale</div>
                    <div class="kpi-value highlight" id="dp-kpi-total">—</div>
                </div>
                <div class="er-kpi-card">
                    <div class="kpi-label">Taux moyen pondéré</div>
                    <div class="kpi-value" id="dp-kpi-rate">—</div>
                </div>
                <div class="er-kpi-card">
                    <div class="kpi-label">Service année 1</div>
                    <div class="kpi-value" id="dp-kpi-service">—</div>
                </div>
                <div class="er-kpi-card">
                    <div class="kpi-label">Pic de service</div>
                    <div class="kpi-value highlight" id="dp-kpi-peak">—</div>
                </div>
                <div class="er-kpi-card">
                    <div class="kpi-label">Amorti à 3 ans</div>
                    <div class="kpi-value" id="dp-kpi-amort3">—</div>
                </div>
            </div>

            <!-- Mur de la dette -->
            <div class="card section">
                <div class="card-title">Mur de la dette — capital remboursé par an</div>
                <div class="chart-container" style="height:340px"><canvas id="chart-debt-wall"></canvas></div>
            </div>

            <div class="grid-2 section">
                <div class="card">
                    <div class="card-title">CRD consolidé</div>
                    <div class="chart-container"><canvas id="chart-debt-crd"></canvas></div>
                </div>
                <div class="card">
                    <div class="card-title">Échéancier annuel</div>
                    <div id="dp-annual-table" style="margin-top:8px"></div>
                </div>
            </div>

            <!-- Actions -->
            <div class="btn-group section" style="justify-content:flex-start">
                <button class="btn btn-primary btn-lg" id="dp-recalc">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    Recalculer
                </button>
                <button class="btn btn-outline" id="dp-save">Sauvegarder</button>
                <button class="btn btn-outline" id="dp-export-excel">Exporter Excel</button>
                <button class="btn btn-accent" id="dp-export-pdf">Exporter PDF</button>
                <button class="btn btn-outline" id="dp-share">Partager</button>
            </div>
        `;
    },

    init() {
        const body = document.getElementById('dp-loans-body');

        document.getElementById('dp-start-year')?.addEventListener('input', e => {
            startYear = parseInt(e.target.value) || new Date().getFullYear();
            recalculate();
        });

        const handleInput = e => {
            const row = e.target.closest('tr');
            const field = e.target.dataset.field;
            if (!row || !field) return;
            const i = parseInt(row.dataset.index);
            if (isNaN(i) || !loans[i]) return;
            const isText = field === 'label' || e.target.tagName === 'SELECT';
            loans[i][field] = isText ? e.target.value : (parseFloat(e.target.value) || 0);
            if (field === 'remainingMonths') loans[i].remainingMonths = Math.max(1, parseInt(e.target.value) || 1);
            recalculate();
        };
        body?.addEventListener('input', handleInput);
        body?.addEventListener('change', handleInput);
        body?.addEventListener('click', e => {
            const btn = e.target.closest('[data-action="remove"]');
            if (!btn) return;
            const i = parseInt(btn.closest('tr')?.dataset.index);
            if (!isNaN(i) && loans.length > 1) {
                loans.splice(i, 1);
                body.innerHTML = renderLoanRows();
                recalculate();
            }
        });

        document.getElementById('dp-add-loan')?.addEventListener('click', () => {
            loans.push({ label: `Crédit ${loans.length + 1}`, crd: 500000, rate: 4.0, remainingMonths: 60, amortType: 'constant', frequency: 'monthly' });
            body.innerHTML = renderLoanRows();
            recalculate();
        });

        document.getElementById('dp-recalc')?.addEventListener('click', () => {
            body.innerHTML = renderLoanRows();
            recalculate();
        });
        document.getElementById('dp-save')?.addEventListener('click', saveProfile);
        document.getElementById('dp-export-excel')?.addEventListener('click', exportExcel);
        document.getElementById('dp-export-pdf')?.addEventListener('click', exportPdf);
        document.getElementById('dp-share')?.addEventListener('click', shareProfile);

        // Lien partagé (#debtprofile?s=...) ou rechargement depuis l'historique
        const shared = Share.getPayload();
        const pending = window._pendingReload;
        if (shared?.type === 'debtprofile' && shared.params) {
            loadParams(shared.params);
            this._rerenderInputs();
        } else if (pending?.type === 'debtprofile') {
            window._pendingReload = null;
            loadParams(pending.params);
            this._rerenderInputs();
        }

        recalculate();
    },

    _rerenderInputs() {
        const sy = document.getElementById('dp-start-year');
        if (sy) sy.value = startYear;
        const body = document.getElementById('dp-loans-body');
        if (body) body.innerHTML = renderLoanRows();
    }
};
