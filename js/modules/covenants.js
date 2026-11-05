/**
 * Auxy Partners - Covenants & DSCR prévisionnel
 * EBITDA → cash-flow disponible (CFADS) multi-années × dette consolidée →
 * DSCR, levier net, ICR et marges vs covenants bancaires, année par année.
 * Calcul : js/utils/covenantengine.js. Unités : k€.
 */

import { CovenantEngine } from '../utils/covenantengine.js';
import { Financial } from '../utils/financial.js';
import { Market } from '../utils/market.js';
import { Charts } from '../utils/charts.js';
import { Export } from '../utils/export.js';
import { Storage } from '../utils/storage.js';
import { Share } from '../utils/share.js';
import { escapeHtml } from '../utils/sanitize.js';
import { DossierBar } from '../utils/dossierbar.js';
import { Dialog } from '../utils/dialog.js';
import { Fmt } from '../utils/format.js';

// ── State ──
let horizon = 5; // années
let ebitdaYears = [3750, 3900, 4050, 4200, 4350]; // k€
let growthPct = 4.0;
let covenantDscr = 1.20;  // DSCR minimum
let covenantLeverage = 3.50; // levier net maximum (dette nette / EBITDA)
// Passage EBITDA → CFADS (k€ par année), pré-rempli par ratios d'EBITDA
let taxPct = 12, capexPct = 12, wcPct = 2;
let taxYears = [], capexYears = [], wcYears = [];
let openingCash = 0;      // trésorerie d'ouverture (k€)
let dscrBasis = 'cfads';  // 'cfads' (définition bancaire) | 'ebitda' (approche simplifiée)
let excludeBullet = true; // in fine supposés refinancés : hors DSCR
// Marché des dettes à taux variable : Euribor par année, swap de couverture
let indexPath = [];       // vide → Euribor 3M publié (rates.json)
let swapRate = 2.8;
let floorZero = true;
// Mécanismes LBO : balayage de l'excess cash-flow et grille de marge
let sweepPct = 0;          // % fixe de l'ECF
let sweepGridText = '';    // ex. « 2,5:50 / 99:75 » (levier max : %)
let marginGridText = '';   // ex. « 2:2,00 / 3:2,50 / 99:3,00 » (levier max : marge)

/** « 2,5:50 / 99:75 » → [{ maxLeverage: 2.5, value: 50 }, …] */
function parseGrid(text) {
    return String(text || '').split(/[/;|]/).map(part => {
        const [lev, val] = part.split(':').map(v => Financial.parseNumber(v));
        return { maxLeverage: lev, value: val };
    }).filter(g => isFinite(g.maxLeverage) && isFinite(g.value));
}
let debts = [
    { label: 'Tranche A', amount: 8225, rate: 3.5, durationYears: 6, amortType: 'constant', frequency: 'monthly' },
    { label: 'Tranche B', amount: 3525, rate: 4.5, durationYears: 7, amortType: 'constant', frequency: 'monthly' }
];
let lastResult = null;

const AMORT_OPTIONS = { constant: 'Constant', degressif: 'Dégressif', infine: 'In Fine', custom: 'Profil libre', balloon: 'Ballon' };
const RATE_TYPES = { fixed: 'Fixe', floating: 'Variable' };
const FREQ_OPTIONS = { monthly: 'Mensuel', quarterly: 'Trimestriel', semiannual: 'Semestriel', annual: 'Annuel' };

const fmtK = v => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(v);
const fmtX = v => (v == null || !isFinite(v)) ? '—' : new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) + 'x';
/** Complète les lignes IS / capex / BFR jusqu'à 10 ans à partir des ratios d'EBITDA. */
function fillCashLines(force = false) {
    for (let i = 0; i < 10; i++) {
        const e = ebitdaYears[i] || 0;
        if (force || taxYears[i] == null) taxYears[i] = Math.round(e * taxPct / 100);
        if (force || capexYears[i] == null) capexYears[i] = Math.round(e * capexPct / 100);
        if (force || wcYears[i] == null) wcYears[i] = Math.round(e * wcPct / 100);
    }
}
fillCashLines();

const fmtPct1 = v => (v == null || !isFinite(v)) ? '—' : new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v) + ' %';

const X_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
const PLUS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';

// ── Moteur de calcul ──

const debtAnnualProfile = (debt, years) => CovenantEngine.debtAnnualProfile(debt, years, covInput().market);

function covInput() {
    return {
        years: horizon,
        ebitda: ebitdaYears.slice(0, horizon),
        tax: taxYears.slice(0, horizon),
        capex: capexYears.slice(0, horizon),
        wcChange: wcYears.slice(0, horizon),
        openingCash,
        debts,
        covenantDscr,
        covenantLeverage,
        dscrBasis,
        excludeBullet,
        market: { indexPath: indexPath.length ? indexPath : [marketIndex ?? 0], swapRate, floor: floorZero ? 0 : null },
        cashSweep: { pct: sweepPct, grid: parseGrid(sweepGridText).map(g => ({ maxLeverage: g.maxLeverage, pct: g.value })) },
        marginGrid: parseGrid(marginGridText).map(g => ({ maxLeverage: g.maxLeverage, margin: g.value }))
    };
}

/** Euribor 3M publié, utilisé tant qu'aucune trajectoire n'est saisie */
let marketIndex = null;

function compute() {
    return CovenantEngine.project(covInput());
}

// ── Rendus partiels ──

function renderEbitdaInputs() {
    return ebitdaYears.slice(0, horizon).map((v, i) => `
        <div class="form-group" style="min-width:110px">
            <label class="form-label">Année ${i + 1}</label>
            <input type="number" class="form-input cov-ebitda" data-year="${i}" value="${v}" step="50">
        </div>
    `).join('');
}

function renderCashInputs() {
    const line = (label, kind, arr) => `
        <tr>
            <td>${label}</td>
            ${arr.slice(0, horizon).map((v, i) => `<td style="text-align:right"><input class="er-input narrow cov-cf" type="number" data-kind="${kind}" data-year="${i}" value="${v ?? 0}" step="10" style="width:80px"></td>`).join('')}
        </tr>`;
    return `
        <table class="er-table">
            <thead><tr><th>k€</th>${Array.from({ length: horizon }, (_, i) => `<th style="text-align:right">Année ${i + 1}</th>`).join('')}</tr></thead>
            <tbody>
                ${line('IS décaissé', 'tax', taxYears)}
                ${line('Capex', 'capex', capexYears)}
                ${line('Variation de BFR (+ = besoin)', 'wc', wcYears)}
            </tbody>
        </table>`;
}

function renderDebtRows() {
    return debts.map((d, i) => {
        const profile = debtAnnualProfile(d, 1);
        const annuity = profile[0]?.service || 0;
        return `
        <tr data-index="${i}">
            <td><input class="er-input" type="text" value="${escapeHtml(d.label)}" data-field="label"></td>
            <td style="text-align:right"><input class="er-input narrow" type="number" value="${d.amount}" data-field="amount" step="100" min="0"></td>
            <td><select class="er-input" data-field="rateType" style="width:86px;font-size:0.75rem">${Object.entries(RATE_TYPES).map(([k, v]) => `<option value="${k}" ${k === (d.rateType || 'fixed') ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
            <td style="text-align:right"><input class="er-input narrow" type="number" value="${d.rate}" data-field="rate" step="0.05" min="0" max="30" style="width:70px" title="${d.rateType === 'floating' ? 'Marge sur Euribor' : 'Taux fixe'}"></td>
            <td style="text-align:right"><input class="er-input narrow" type="number" value="${d.hedgePct || 0}" data-field="hedgePct" step="10" min="0" max="100" style="width:60px" ${d.rateType === 'floating' ? '' : 'disabled'}></td>
            <td style="text-align:right"><input class="er-input narrow" type="number" value="${d.durationYears}" data-field="durationYears" step="0.25" min="0.08" max="30" style="width:60px"></td>
            <td><select class="er-input" data-field="amortType" style="width:100px;font-size:0.75rem">${Object.entries(AMORT_OPTIONS).map(([k, v]) => `<option value="${k}" ${k === d.amortType ? 'selected' : ''}>${v}</option>`).join('')}</select>
                ${d.amortType === 'custom' ? `<input class="er-input" type="text" data-field="customProfile" value="${escapeHtml((d.customProfile || []).join('/'))}" placeholder="10/15/20/25/30" style="width:100px;margin-top:4px" title="% du nominal amorti par année">` : ''}
                ${d.amortType === 'balloon' ? `<input class="er-input narrow" type="number" data-field="balloonPct" value="${d.balloonPct ?? 30}" min="0" max="100" step="5" style="width:60px;margin-top:4px" title="Ballon final (% du nominal)">` : ''}</td>
            <td><select class="er-input" data-field="frequency" style="width:100px;font-size:0.75rem">${Object.entries(FREQ_OPTIONS).map(([k, v]) => `<option value="${k}" ${k === d.frequency ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
            <td style="text-align:right" class="er-computed">${fmtK(annuity)}</td>
            <td style="width:30px">${debts.length > 1 ? `<button class="er-remove-btn" data-action="remove">${X_SVG}</button>` : ''}</td>
        </tr>`;
    }).join('');
}

const STATUS_BADGE = {
    ok: '<span class="cov-badge ok">Conforme</span>',
    warning: '<span class="cov-badge warning">Tendu</span>',
    breach: '<span class="cov-badge breach">Bris</span>'
};

function renderResultsTable(c) {
    const cols = c.rows;
    const cell = (formatter, field, cls = '') => cols.map(r => `<td class="number ${cls}">${formatter(r[field])}</td>`).join('');
    const dscrCell = cols.map(r => `<td class="number" style="font-weight:700;color:${r.dscr != null && r.dscr < covenantDscr ? 'var(--danger)' : 'var(--text-primary)'}">${fmtX(r.dscr)}</td>`).join('');
    const levCell = cols.map(r => `<td class="number" style="font-weight:700;color:${r.leverage != null && r.leverage > covenantLeverage ? 'var(--danger)' : 'var(--text-primary)'}">${fmtX(r.leverage)}</td>`).join('');
    const headroomCell = cols.map(r => {
        const h = r.headroomDscr;
        const color = h == null ? 'var(--text-muted)' : (h < 0 ? 'var(--danger)' : (h < 10 ? 'var(--warning)' : 'var(--success)'));
        return `<td class="number" style="color:${color}">${fmtPct1(h)}</td>`;
    }).join('');

    const levHeadroomCell = cols.map(r => {
        const h = r.headroomLev;
        const color = h == null ? 'var(--text-muted)' : (h < 0 ? 'var(--danger)' : (h < 10 ? 'var(--warning)' : 'var(--success)'));
        return `<td class="number" style="color:${color}">${fmtPct1(h)}</td>`;
    }).join('');
    const basisLabel = dscrBasis === 'ebitda' ? 'EBITDA' : 'CFADS';

    return `
        <div class="table-container">
            <table class="data-table cov-table">
                <thead>
                    <tr><th>k€</th>${cols.map(r => `<th style="text-align:right">Année ${r.year}</th>`).join('')}</tr>
                </thead>
                <tbody>
                    <tr><td>EBITDA</td>${cell(fmtK, 'ebitda')}</tr>
                    <tr><td style="padding-left:24px;color:var(--text-muted)">− IS, capex, ΔBFR</td>${cols.map(r => `<td class="number" style="color:var(--text-muted)">${fmtK(-(r.tax + r.capex + r.wcChange))}</td>`).join('')}</tr>
                    <tr><td><strong>CFADS</strong></td>${cell(fmtK, 'cfads')}</tr>
                    <tr class="cov-sep"><td>Service de dette testé (P+I)</td>${cell(fmtK, 'service')}</tr>
                    <tr><td style="padding-left:24px;color:var(--text-muted)">dont intérêts</td>${cell(fmtK, 'interest')}</tr>
                    ${cols.some(r => r.bullet > 0) ? `<tr><td style="padding-left:24px;color:var(--text-muted)">In fine ${excludeBullet ? 'refinancé (hors DSCR)' : 'remboursé'}</td>${cell(fmtK, 'bullet')}</tr>` : ''}
                    <tr class="cov-sep"><td><strong>DSCR</strong> <span class="cov-covenant-ref">(${basisLabel} / service, covenant ≥ ${fmtX(covenantDscr)})</span></td>${dscrCell}</tr>
                    <tr><td>Marge DSCR <span class="cov-covenant-ref">(baisse de ${basisLabel} supportable)</span></td>${headroomCell}</tr>
                    <tr><td>ICR <span class="cov-covenant-ref">(EBITDA / intérêts)</span></td>${cell(fmtX, 'icr')}</tr>
                    <tr class="cov-sep"><td>CRD fin d'année</td>${cell(fmtK, 'crd')}</tr>
                    <tr><td>Trésorerie fin d'année</td>${cell(fmtK, 'cash')}</tr>
                    <tr><td>Dette nette <span class="cov-covenant-ref">(« tréso. » = trésorerie nette)</span></td>${cell(Fmt.netDebtCell, 'netDebt')}</tr>
                    <tr><td><strong>Levier net</strong> <span class="cov-covenant-ref">(covenant ≤ ${fmtX(covenantLeverage)})</span></td>${levCell}</tr>
                    <tr><td>Marge levier <span class="cov-covenant-ref">(baisse d'EBITDA supportable)</span></td>${levHeadroomCell}</tr>
                    ${cols.some(r => r.sweep > 0) ? `<tr><td>Cash sweep (remboursement anticipé)</td>${cell(fmtK, 'sweep')}</tr>` : ''}
                    ${cols.some(r => r.marginDelta) ? `<tr><td style="color:var(--text-muted)">Ajustement de marge (pts)</td>${cols.map(r => `<td class="number" style="color:var(--text-muted)">${r.marginDelta ? (r.marginDelta > 0 ? '+' : '') + Financial.formatNumber(r.marginDelta, 2) : '—'}</td>`).join('')}</tr>` : ''}
                    ${cols.some(r => r.equityCure > 0) ? `<tr><td><strong>Equity cure nécessaire</strong> <span class="cov-covenant-ref">(apport pour rétablir les ratios)</span></td>${cols.map(r => `<td class="number" style="color:${r.equityCure > 0 ? 'var(--danger)' : 'var(--text-muted)'}">${r.equityCure > 0 ? fmtK(r.equityCure) : '—'}</td>`).join('')}</tr>` : ''}
                    <tr class="cov-sep"><td>Statut</td>${cols.map(r => `<td style="text-align:right">${STATUS_BADGE[r.status]}</td>`).join('')}</tr>
                </tbody>
            </table>
        </div>`;
}

// ── Recalcul ──
function recalculate() {
    const c = compute();

    // KPIs
    const setKpi = (id, val) => { const el = document.getElementById(id); if (el) el.innerHTML = val; };
    setKpi('cov-kpi-dscr', c.minDscrRow ? `${fmtX(c.minDscrRow.dscr)} <span class="cov-kpi-sub">année ${c.minDscrRow.year}</span>` : '—');
    setKpi('cov-kpi-lev', c.maxLevRow ? `${fmtX(c.maxLevRow.leverage)} <span class="cov-kpi-sub">année ${c.maxLevRow.year}</span>` : '—');
    const minHeadroom = c.minDscrRow?.headroomDscr;
    setKpi('cov-kpi-headroom', fmtPct1(minHeadroom));
    setKpi('cov-kpi-status', STATUS_BADGE[c.globalStatus]);
    const input = covInput();
    const drop = CovenantEngine.breakevenEbitdaDrop(input);
    const rise = CovenantEngine.breakevenIndexRise(input);
    setKpi('cov-kpi-ebitda-drop', drop == null ? '> 95 %' : drop === 0 ? 'déjà en bris' : `−${fmtPct1(drop)}`);
    setKpi('cov-kpi-rate-rise', rise == null ? (debts.some(d => d.rateType === 'floating' && (d.hedgePct || 0) < 100) ? '> 10 pts' : 'sans objet') : rise === 0 ? 'déjà en bris' : `+${Financial.formatNumber(rise, 2)} pt`);

    // Tableau
    const tableEl = document.getElementById('cov-results-table');
    if (tableEl) tableEl.innerHTML = renderResultsTable(c);

    // Graphique
    Charts.scheduleDraw('chart-covenants', () => Charts.covenantChart('chart-covenants', {
        labels: c.rows.map(r => `Année ${r.year}`),
        ebitda: c.rows.map(r => r.ebitda),
        debtService: c.rows.map(r => r.service),
        dscr: c.rows.map(r => r.dscr ?? 0),
        covenantDscr
    }));

    lastResult = {
        type: 'covenants',
        params: {
            horizon,
            ebitdaYears: ebitdaYears.slice(0, horizon),
            taxYears: taxYears.slice(0, horizon),
            capexYears: capexYears.slice(0, horizon),
            wcYears: wcYears.slice(0, horizon),
            taxPct, capexPct, wcPct,
            openingCash,
            dscrBasis,
            excludeBullet,
            indexPath: [...indexPath],
            swapRate,
            floorZero,
            sweepPct,
            sweepGridText,
            marginGridText,
            growthPct,
            covenantDscr,
            covenantLeverage,
            debts: debts.map(d => ({ ...d }))
        },
        results: {
            dscrMin: c.minDscrRow?.dscr ?? null,
            dscrMinYear: c.minDscrRow?.year ?? null,
            leverageMax: c.maxLevRow?.leverage ?? null,
            leverageMaxYear: c.maxLevRow?.year ?? null,
            globalStatus: c.globalStatus,
            ebitdaDropToBreach: drop,
            rateRiseToBreach: rise,
            rows: c.rows
        }
    };
}

// ── Actions ──

function applyGrowth() {
    const base = ebitdaYears[0] || 0;
    for (let i = 1; i < horizon; i++) {
        ebitdaYears[i] = Math.round(base * Math.pow(1 + growthPct / 100, i));
    }
    const wrap = document.getElementById('cov-ebitda-inputs');
    if (wrap) wrap.innerHTML = renderEbitdaInputs();
    recalculate();
}

function saveSimulation() {
    if (!lastResult) recalculate();
    const body = document.getElementById('modal-body');
    const defaultName = `Covenants — DSCR min ${fmtX(lastResult.results.dscrMin)}`;

    body.innerHTML = `
        <h2 style="margin-bottom:20px">Sauvegarder l'analyse</h2>
        <div class="form-group" style="margin-bottom:16px">
            <label class="form-label">Nom</label>
            <input type="text" class="form-input" id="save-cov-name" value="${escapeHtml(defaultName)}" style="width:100%">
        </div>
        <div class="form-group" style="margin-bottom:24px">
            <label class="form-label">Notes (optionnel)</label>
            <textarea class="form-input notes-input" id="save-cov-notes" rows="3" placeholder="Ajoutez des notes ou commentaires..."></textarea>
        </div>
        <div class="btn-group" style="justify-content:flex-end">
            <button class="btn btn-outline" id="save-cov-cancel">Annuler</button>
            <button class="btn btn-primary" id="save-cov-confirm">Sauvegarder</button>
        </div>
    `;
    Dialog.show();
    document.getElementById('save-cov-name')?.focus();
    document.getElementById('save-cov-cancel')?.addEventListener('click', () => Dialog.close());
    document.getElementById('save-cov-confirm')?.addEventListener('click', () => {
        const name = document.getElementById('save-cov-name')?.value || defaultName;
        const notes = document.getElementById('save-cov-notes')?.value || '';
        const id = Storage.saveSimulation({ ...lastResult, name, notes, typeLabel: 'Covenants & DSCR' });
        Dialog.close();
        window.showToast?.(id ? 'Analyse sauvegardée' : 'Échec de la sauvegarde : stockage local plein', id ? 'success' : 'error');
    });
}

function exportExcel() {
    if (typeof XLSX === 'undefined') { window.showToast?.('Outils d\u2019export Excel indisponibles (connexion ?) — réessayez', 'error'); return; }
    if (!lastResult) recalculate();
    const c = lastResult.results;
    const n = c.rows.length;
    const col = i => XLSX.utils.encode_col(i + 1); // B, C, …
    const num = (v, f) => ({ t: 'n', v: v ?? 0, ...(f ? { f } : {}) });
    const pct = (v, f) => ({ t: 'n', v: v ?? 0, f, z: '0.0%' });
    const ratio = (v, f) => ({ t: 'n', v: v ?? 0, f, z: '0.00"x"' });

    // Feuille Covenants : les montants issus des échéanciers sont des valeurs,
    // tous les ratios sont des FORMULES (modifiables dans Excel)
    const rows = [
        ['AUXY PARTNERS — Covenants & DSCR prévisionnel (k€)'],
        [''],
        ['Covenant DSCR minimum', ratio(covenantDscr)],
        ['Covenant levier net maximum', ratio(covenantLeverage)],
        ['Trésorerie d\'ouverture', num(openingCash)],
        ['Numérateur du DSCR', dscrBasis === 'ebitda' ? 'EBITDA' : 'CFADS'],
        [''],
        ['k€', ...c.rows.map(r => `Année ${r.year}`)]
    ];
    const R = { ebitda: 9, tax: 10, capex: 11, wc: 12, cfads: 13, service: 14, interest: 15, dscr: 16, mDscr: 17, crd: 18, cash: 19, net: 20, lev: 21, mLev: 22, icr: 23, status: 24, sweep: 25, cure: 26 };
    const line = (label, fn) => [label, ...c.rows.map((r, i) => fn(r, i, col(i)))];
    const num1 = dscrBasis === 'ebitda' ? R.ebitda : R.cfads;
    rows.push(line('EBITDA', r => num(Math.round(r.ebitda))));
    rows.push(line('IS décaissé', r => num(Math.round(r.tax))));
    rows.push(line('Capex', r => num(Math.round(r.capex))));
    rows.push(line('Variation de BFR (+ = besoin)', r => num(Math.round(r.wcChange))));
    rows.push(line('CFADS', (r, i, L) => num(r.cfads, `${L}${R.ebitda}-${L}${R.tax}-${L}${R.capex}-${L}${R.wc}`)));
    rows.push(line(`Service de dette testé${excludeBullet ? ' (in fine refinancés)' : ''}`, r => num(Math.round(r.service))));
    rows.push(line('dont intérêts', r => num(Math.round(r.interest))));
    rows.push(line('DSCR', (r, i, L) => ratio(r.dscr, `IF(${L}${R.service}>0,${L}${num1}/${L}${R.service},"")`)));
    rows.push(line('Marge DSCR', (r, i, L) => pct((r.headroomDscr ?? 0) / 100, `IF(N(${L}${R.dscr})>0,1-$B$3/${L}${R.dscr},"")`)));
    rows.push(line('CRD fin d\'année', r => num(Math.round(r.crd))));
    rows.push(line('Trésorerie fin d\'année (après sweep)', (r, i, L) => num(r.cash, `${i === 0 ? '$B$5' : `${col(i - 1)}${R.cash}`}+${L}${R.cfads}-${L}${R.service}-${L}${R.sweep}`)));
    rows.push(line('Dette nette', (r, i, L) => num(r.netDebt, `${L}${R.crd}-MAX(0,${L}${R.cash})`)));
    rows.push(line('Levier net', (r, i, L) => ratio(r.leverage, `IF(${L}${R.ebitda}>0,MAX(0,${L}${R.net})/${L}${R.ebitda},"")`)));
    rows.push(line('Marge levier', (r, i, L) => pct((r.headroomLev ?? 0) / 100, `IF(N(${L}${R.lev})>0,1-${L}${R.lev}/$B$4,"")`)));
    rows.push(line('ICR (EBITDA / intérêts)', (r, i, L) => ratio(r.icr, `IF(${L}${R.interest}>0,${L}${R.ebitda}/${L}${R.interest},"")`)));
    rows.push(line('Statut', (r, i, L) => ({ t: 's', v: ({ ok: 'Conforme', warning: 'Tendu', breach: 'BRIS' })[r.status],
        f: `IF(OR(AND(ISNUMBER(${L}${R.dscr}),${L}${R.dscr}<$B$3),AND(ISNUMBER(${L}${R.lev}),${L}${R.lev}>$B$4),AND(${L}${R.ebitda}<=0,${L}${R.crd}>0)),"BRIS",IF(MIN(IF(ISNUMBER(${L}${R.mDscr}),${L}${R.mDscr},1),IF(ISNUMBER(${L}${R.mLev}),${L}${R.mLev},1))<0.1,"Tendu","Conforme"))` })));
    rows.push(line('Cash sweep (remboursement anticipé)', r => num(Math.round(r.sweep || 0))));
    rows.push(line('Equity cure nécessaire', (r, i, L) => num(r.equityCure || 0, `MAX(0,IF(AND(ISNUMBER(${L}${R.dscr}),${L}${R.dscr}<$B$3),$B$3*${L}${R.service}-${L}${num1},0),IF(AND(ISNUMBER(${L}${R.lev}),${L}${R.lev}>$B$4),${L}${R.net}-$B$4*${L}${R.ebitda},0))`)));
    rows.push(['']);
    rows.push(['Baisse d\'EBITDA supportable (%)', c.ebitdaDropToBreach]);
    rows.push(['Hausse de l\'Euribor supportable (pts)', c.rateRiseToBreach]);
    rows.push(['']);
    rows.push(['DETTES (k€)', 'Montant', 'Taux / marge (%)', 'Durée (ans)', 'Amortissement', 'Fréquence', 'Taux', 'Couvert (%)']);
    debts.forEach(d => rows.push([d.label, d.amount, d.rate, d.durationYears, AMORT_OPTIONS[d.amortType], FREQ_OPTIONS[d.frequency], RATE_TYPES[d.rateType || 'fixed'], d.rateType === 'floating' ? d.hedgePct || 0 : null]));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 36 }, ...Array.from({ length: Math.max(n, 7) }, () => ({ wch: 13 }))];
    XLSX.utils.book_append_sheet(wb, ws, 'Covenants');

    // Hypothèses et définitions : ce qu'un lecteur doit savoir pour refaire le calcul
    const hyp = [
        ['HYPOTHÈSES ET DÉFINITIONS'],
        [''],
        ['Édité le', new Date().toLocaleDateString('fr-FR')],
        ['Horizon', `${horizon} ans (années glissantes depuis la date d'analyse)`],
        ['Euribor retenu (par année, %)', (indexPath.length ? indexPath : [marketIndex ?? 0]).map(v => Financial.formatNumber(v, 3)).join(' / ')],
        ['Source Euribor', indexPath.length ? 'trajectoire saisie' : 'Euribor 3M publié (veille Auxy), prolongé'],
        ['Floor de l\'index', floorZero ? '0 %' : 'aucun'],
        ['Taux du swap de couverture (%)', swapRate],
        [''],
        ['CFADS', 'EBITDA − IS décaissé − capex − variation de BFR'],
        ['DSCR', `${dscrBasis === 'ebitda' ? 'EBITDA' : 'CFADS'} / (intérêts + amortissement contractuel${excludeBullet ? ', in fine supposés refinancés' : ''})`],
        ['Levier net', '(CRD − trésorerie projetée) / EBITDA'],
        ['Marge DSCR', 'baisse du numérateur supportable avant bris = 1 − covenant / DSCR'],
        ['Marge levier', 'baisse d\'EBITDA supportable avant bris = 1 − levier / covenant'],
        ['Avertissement', 'Document de travail — simulation indicative, ne constitue pas un engagement de financement. Les définitions contractuelles (EBITDA ajusté, LTM, IFRS 16) peuvent différer.']
    ];
    const wsH = XLSX.utils.aoa_to_sheet(hyp);
    wsH['!cols'] = [{ wch: 34 }, { wch: 90 }];
    XLSX.utils.book_append_sheet(wb, wsH, 'Hypothèses');

    XLSX.writeFile(wb, `covenants_${new Date().toISOString().slice(0, 10)}.xlsx`);
    window.showToast?.('Export Excel téléchargé (formules vivantes + hypothèses)', 'success');
}

function exportPdf() {
    if (!lastResult) recalculate();
    // Le graphique est créé avec animation:false (paint synchrone) :
    // la capture Charts.toImage est fiable même juste après un recalcul.
    const c = lastResult.results;
    const sections = [
        { type: 'title', text: 'Synthèse' },
        { type: 'keyvalue', items: [
            { label: 'Covenant DSCR minimum', value: fmtX(covenantDscr) },
            { label: 'Covenant Levier maximum', value: fmtX(covenantLeverage) },
            { label: 'DSCR minimum projeté', value: `${fmtX(c.dscrMin)} (année ${c.dscrMinYear ?? '—'})` },
            { label: 'Levier maximum projeté', value: `${fmtX(c.leverageMax)} (année ${c.leverageMaxYear ?? '—'})` },
            { label: 'Statut global', value: ({ ok: 'Conforme', warning: 'Tendu (marge < 10 %)', breach: 'BRIS DE COVENANT' })[c.globalStatus] },
            { label: 'Baisse d\'EBITDA supportable', value: c.ebitdaDropToBreach == null ? '> 95 %' : `${fmtPct1(c.ebitdaDropToBreach)}` },
            { label: 'Hausse de l\'Euribor supportable', value: c.rateRiseToBreach == null ? 'sans objet / > 10 pts' : `${Financial.formatNumber(c.rateRiseToBreach, 2)} pt` }
        ] },
        { type: 'note', title: 'Définitions', text:
            `DSCR = ${dscrBasis === 'ebitda' ? 'EBITDA' : 'CFADS (EBITDA − IS − capex − variation de BFR)'} / service de la dette (intérêts + amortissement contractuel${excludeBullet ? ', remboursements in fine supposés refinancés' : ''}). ` +
            'Levier net = (CRD − trésorerie projetée) / EBITDA. Marge DSCR = baisse du numérateur supportable avant bris (1 − covenant / DSCR) ; marge levier = baisse d\'EBITDA supportable (1 − levier / covenant). ' +
            'Test annuel sur l\'exercice ; les définitions contractuelles (EBITDA ajusté, LTM, IFRS 16) peuvent différer.' },
        { type: 'chart', canvasId: 'chart-covenants', title: 'Trajectoire EBITDA / Service de dette / DSCR' },
        { type: 'title', text: 'Projection annuelle (k€)' },
        { type: 'table',
            headers: ['', ...c.rows.map(r => `Année ${r.year}`)],
            rows: [
                ['EBITDA', ...c.rows.map(r => fmtK(r.ebitda))],
                ['CFADS', ...c.rows.map(r => fmtK(r.cfads))],
                ['Service de dette testé', ...c.rows.map(r => fmtK(r.service))],
                ['dont intérêts', ...c.rows.map(r => fmtK(r.interest))],
                ['DSCR', ...c.rows.map(r => fmtX(r.dscr))],
                ['Marge DSCR', ...c.rows.map(r => fmtPct1(r.headroomDscr))],
                ['ICR', ...c.rows.map(r => fmtX(r.icr))],
                ['Dette nette', ...c.rows.map(r => fmtK(r.netDebt))],
                ['Levier net', ...c.rows.map(r => fmtX(r.leverage))],
                ['Marge levier', ...c.rows.map(r => fmtPct1(r.headroomLev))],
                ['Statut', ...c.rows.map(r => ({ ok: 'Conforme', warning: 'Tendu', breach: 'BRIS' })[r.status])]
            ] },
        { type: 'title', text: 'Structure de dette (k€)' },
        { type: 'table',
            headers: ['Ligne', 'Montant', 'Taux', 'Durée', 'Amortissement', 'Fréquence'],
            rows: debts.map(d => [d.label, fmtK(d.amount), `${d.rate} %`, `${d.durationYears} ans`, AMORT_OPTIONS[d.amortType], FREQ_OPTIONS[d.frequency]]) }
    ];
    Export.toPdf('Covenants & DSCR prévisionnel', sections, 'covenants', {
        cover: {
            subtitle: 'Analyse prévisionnelle des covenants bancaires',
            items: [
                { label: 'Horizon', value: `${horizon} ans` },
                { label: 'Dette totale', value: `${fmtK(debts.reduce((s, d) => s + d.amount, 0))} k€` },
                { label: 'EBITDA année 1', value: `${fmtK(ebitdaYears[0])} k€` },
                { label: 'Covenant DSCR', value: `≥ ${fmtX(covenantDscr)}` },
                { label: 'Covenant Levier', value: `≤ ${fmtX(covenantLeverage)}` }
            ]
        }
    });
}

function shareAnalysis() {
    if (!lastResult) recalculate();
    Share.copyLink('covenants', { type: 'covenants', params: lastResult.params });
}

function loadParams(p) {
    if (!p) return;
    if (p.horizon >= 1 && p.horizon <= 10) horizon = p.horizon;
    if (Array.isArray(p.ebitdaYears) && p.ebitdaYears.length) {
        ebitdaYears = p.ebitdaYears.map(v => parseFloat(v) || 0);
        while (ebitdaYears.length < 10) ebitdaYears.push(Math.round((ebitdaYears[ebitdaYears.length - 1] || 0)));
    }
    if (typeof p.growthPct === 'number') growthPct = p.growthPct;
    const nums = a => (Array.isArray(a) ? a.map(v => parseFloat(v) || 0) : null);
    if (typeof p.taxPct === 'number') taxPct = p.taxPct;
    if (typeof p.capexPct === 'number') capexPct = p.capexPct;
    if (typeof p.wcPct === 'number') wcPct = p.wcPct;
    // Analyses antérieures (EBITDA sans lignes de cash) : DSCR sur EBITDA
    // conservé pour retrouver les mêmes chiffres qu'à la sauvegarde. Un
    // chargement partiel (dettes seules) ne touche qu'aux champs fournis.
    const legacy = Array.isArray(p.ebitdaYears) && !Array.isArray(p.taxYears);
    if (legacy) {
        taxYears = Array(10).fill(0); capexYears = Array(10).fill(0); wcYears = Array(10).fill(0);
        dscrBasis = 'ebitda';
        excludeBullet = false;
    } else {
        if (Array.isArray(p.taxYears)) taxYears = nums(p.taxYears) || [];
        if (Array.isArray(p.capexYears)) capexYears = nums(p.capexYears) || [];
        if (Array.isArray(p.wcYears)) wcYears = nums(p.wcYears) || [];
        if (p.dscrBasis === 'ebitda' || p.dscrBasis === 'cfads') dscrBasis = p.dscrBasis;
        if (typeof p.excludeBullet === 'boolean') excludeBullet = p.excludeBullet;
    }
    fillCashLines();
    if (p.openingCash != null && isFinite(parseFloat(p.openingCash))) openingCash = parseFloat(p.openingCash);
    if (typeof p.covenantDscr === 'number' && p.covenantDscr > 0) covenantDscr = p.covenantDscr;
    if (typeof p.covenantLeverage === 'number' && p.covenantLeverage > 0) covenantLeverage = p.covenantLeverage;
    if (Array.isArray(p.debts) && p.debts.length) {
        debts = p.debts.map(d => ({
            label: String(d.label ?? 'Dette'),
            amount: parseFloat(d.amount) || 0,
            rate: parseFloat(d.rate) || 0,
            durationYears: Math.max(1 / 12, parseFloat(d.durationYears) || 1),
            amortType: AMORT_OPTIONS[d.amortType] ? d.amortType : 'constant',
            frequency: FREQ_OPTIONS[d.frequency] ? d.frequency : 'monthly',
            rateType: d.rateType === 'floating' ? 'floating' : 'fixed',
            hedgePct: Math.min(100, Math.max(0, parseFloat(d.hedgePct) || 0)),
            customProfile: Array.isArray(d.customProfile) ? d.customProfile.map(v => parseFloat(v) || 0) : undefined,
            balloonPct: d.balloonPct != null ? parseFloat(d.balloonPct) || 0 : undefined
        }));
    }
    if (Array.isArray(p.indexPath)) indexPath = p.indexPath.map(v => parseFloat(v)).filter(v => isFinite(v));
    if (typeof p.swapRate === 'number') swapRate = p.swapRate;
    if (typeof p.floorZero === 'boolean') floorZero = p.floorZero;
    if (typeof p.sweepPct === 'number') sweepPct = p.sweepPct;
    if (typeof p.sweepGridText === 'string') sweepGridText = p.sweepGridText.slice(0, 200);
    if (typeof p.marginGridText === 'string') marginGridText = p.marginGridText.slice(0, 200);
}

// ── Module ──
export const CovenantsModule = {
    render() {
        // S'assure que le tableau EBITDA couvre l'horizon
        while (ebitdaYears.length < 10) ebitdaYears.push(Math.round((ebitdaYears[ebitdaYears.length - 1] || 0) * (1 + growthPct / 100)));

        return `
            <div class="page-header">
                <h1>Covenants &amp; DSCR</h1>
                <p>Projection du DSCR et du levier vs covenants bancaires — headroom année par année</p>
            </div>
            ${DossierBar.html('covenants')}

            <!-- Hypothèses -->
            <div class="card section">
                <div class="card-title">Hypothèses</div>
                <div class="form-row" style="margin-top:12px">
                    <div class="form-group">
                        <label class="form-label">Horizon (années)</label>
                        <select class="form-select" id="cov-horizon">
                            ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `<option value="${n}" ${n === horizon ? 'selected' : ''}>${n} ans</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Covenant DSCR minimum</label>
                        <div class="input-group">
                            <input type="number" class="form-input" id="cov-dscr-min" value="${covenantDscr}" min="0.5" max="3" step="0.05">
                            <span class="input-suffix">x</span>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Covenant Levier net maximum</label>
                        <div class="input-group">
                            <input type="number" class="form-input" id="cov-lev-max" value="${covenantLeverage}" min="0.5" max="10" step="0.25">
                            <span class="input-suffix">x</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- EBITDA prévisionnel -->
            <div class="card section">
                <div class="card-header">
                    <div class="card-title">EBITDA prévisionnel (k€)</div>
                    <div class="cov-growth-control">
                        <span>Croissance</span>
                        <input type="number" class="form-input form-input-sm" id="cov-growth" value="${growthPct}" step="0.5" style="width:70px">
                        <span>%/an</span>
                        <button class="btn btn-sm btn-outline" id="cov-apply-growth">Appliquer</button>
                    </div>
                </div>
                <div class="form-row" id="cov-ebitda-inputs" style="margin-top:12px;flex-wrap:wrap">
                    ${renderEbitdaInputs()}
                </div>
            </div>

            <!-- EBITDA → CFADS -->
            <div class="card section">
                <div class="card-header">
                    <div class="card-title">Du EBITDA au cash-flow disponible (k€)</div>
                    <div class="cov-growth-control">
                        <span>IS</span><input type="number" class="form-input form-input-sm" id="cov-tax-pct" value="${taxPct}" step="1" style="width:60px">
                        <span>Capex</span><input type="number" class="form-input form-input-sm" id="cov-capex-pct" value="${capexPct}" step="1" style="width:60px">
                        <span>ΔBFR</span><input type="number" class="form-input form-input-sm" id="cov-wc-pct" value="${wcPct}" step="0.5" style="width:60px">
                        <span>% EBITDA</span>
                        <button class="btn btn-sm btn-outline" id="cov-apply-ratios">Appliquer</button>
                    </div>
                </div>
                <div class="table-container" id="cov-cash-inputs" style="margin-top:12px">${renderCashInputs()}</div>
                <div class="form-row" style="margin-top:12px">
                    <div class="form-group">
                        <label class="form-label">Trésorerie d'ouverture (k€)</label>
                        <input type="number" class="form-input" id="cov-opening-cash" value="${openingCash}" step="100">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Numérateur du DSCR</label>
                        <select class="form-select" id="cov-dscr-basis">
                            <option value="cfads" ${dscrBasis === 'cfads' ? 'selected' : ''}>CFADS (définition bancaire)</option>
                            <option value="ebitda" ${dscrBasis === 'ebitda' ? 'selected' : ''}>EBITDA (approche simplifiée)</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Remboursements in fine</label>
                        <select class="form-select" id="cov-bullet">
                            <option value="exclude" ${excludeBullet ? 'selected' : ''}>Refinancés (hors DSCR)</option>
                            <option value="include" ${!excludeBullet ? 'selected' : ''}>Remboursés sur le cash</option>
                        </select>
                    </div>
                </div>
            </div>

            <!-- Dettes -->
            <div class="card section">
                <div class="card-header">
                    <div class="card-title">Structure de dette (k€)</div>
                    <button class="btn btn-sm btn-outline" id="cov-add-debt">${PLUS_SVG} Ajouter une ligne</button>
                </div>
                <div class="table-container" style="margin-top:12px">
                    <table class="er-table">
                        <thead>
                            <tr>
                                <th>Libellé</th>
                                <th style="text-align:right">Montant (k€)</th>
                                <th>Taux</th>
                                <th style="text-align:right">Taux / marge (%)</th>
                                <th style="text-align:right">Couvert (%)</th>
                                <th style="text-align:right">Durée (ans)</th>
                                <th>Amortissement</th>
                                <th>Fréquence</th>
                                <th style="text-align:right">Annuité A1 (k€)</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody id="cov-debts-body">${renderDebtRows()}</tbody>
                    </table>
                </div>
            </div>

            <!-- Marché (dettes à taux variable) -->
            <div class="card section">
                <div class="card-title">Taux variable et couverture</div>
                <div class="form-row" style="margin-top:12px">
                    <div class="form-group">
                        <label class="form-label" title="Une valeur par année, séparées par / ; la dernière est prolongée">Euribor par année (%)</label>
                        <input type="text" class="form-input" id="cov-index-path" value="${escapeHtml(indexPath.map(v => Financial.formatNumber(v, 3)).join(' / '))}" placeholder="Euribor 3M du jour">
                        <div class="rate-hint" id="cov-index-hint"></div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Taux du swap de couverture (%)</label>
                        <input type="number" class="form-input" id="cov-swap-rate" value="${swapRate}" step="0.05">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Floor de l'index</label>
                        <select class="form-select" id="cov-floor">
                            <option value="0" ${floorZero ? 'selected' : ''}>Floor à 0 %</option>
                            <option value="none" ${!floorZero ? 'selected' : ''}>Sans floor</option>
                        </select>
                    </div>
                </div>
                <p style="font-size:0.8rem;color:var(--text-muted);margin:4px 0 0">Pour une ligne « Variable », la colonne taux est la marge sur Euribor ; « Couvert » est la part de l'encours swappée au taux ci-dessus.</p>
            </div>

            <!-- Mécanismes LBO -->
            <div class="card section">
                <div class="card-title">Mécanismes de la documentation (LBO)</div>
                <div class="form-row" style="margin-top:12px">
                    <div class="form-group">
                        <label class="form-label">Cash sweep (% de l'excess cash-flow)</label>
                        <input type="number" class="form-input" id="cov-sweep-pct" value="${sweepPct}" min="0" max="100" step="5">
                    </div>
                    <div class="form-group">
                        <label class="form-label" title="Levier max : % balayé, séparés par / — appliqué selon le levier de l'exercice précédent">Grille de sweep (levier : %)</label>
                        <input type="text" class="form-input" id="cov-sweep-grid" value="${escapeHtml(sweepGridText)}" placeholder="2,5:25 / 3,5:50 / 99:75">
                    </div>
                    <div class="form-group">
                        <label class="form-label" title="Levier max : marge (%) des dettes variables, selon le levier de l'exercice précédent">Grille de marge (levier : marge)</label>
                        <input type="text" class="form-input" id="cov-margin-grid" value="${escapeHtml(marginGridText)}" placeholder="2:2,00 / 3:2,50 / 99:3,00">
                    </div>
                </div>
                <p style="font-size:0.8rem;color:var(--text-muted);margin:4px 0 0">Excess cash-flow = CFADS − service de la dette ; le sweep est imputé sur les dernières échéances (l'amortissement contractuel reste inchangé). La grille de sweep, si elle est saisie, remplace le % fixe ; la 1re année, le palier est fixé par le levier d'entrée.</p>
            </div>

            <!-- KPIs -->
            <div class="er-kpi-grid section">
                <div class="er-kpi-card">
                    <div class="kpi-label">DSCR minimum</div>
                    <div class="kpi-value highlight" id="cov-kpi-dscr">—</div>
                </div>
                <div class="er-kpi-card">
                    <div class="kpi-label">Levier net maximum</div>
                    <div class="kpi-value highlight" id="cov-kpi-lev">—</div>
                </div>
                <div class="er-kpi-card">
                    <div class="kpi-label">Marge DSCR minimale</div>
                    <div class="kpi-value" id="cov-kpi-headroom">—</div>
                </div>
                <div class="er-kpi-card">
                    <div class="kpi-label">Statut global</div>
                    <div class="kpi-value" id="cov-kpi-status">—</div>
                </div>
                <div class="er-kpi-card">
                    <div class="kpi-label" title="Baisse uniforme de l'EBITDA sur tout l'horizon qui déclenche le premier bris">Baisse d'EBITDA supportable</div>
                    <div class="kpi-value" id="cov-kpi-ebitda-drop">—</div>
                </div>
                <div class="er-kpi-card">
                    <div class="kpi-label" title="Hausse de l'Euribor (dettes variables non couvertes) qui déclenche le premier bris">Hausse de taux supportable</div>
                    <div class="kpi-value" id="cov-kpi-rate-rise">—</div>
                </div>
            </div>

            <!-- Tableau -->
            <div class="card section">
                <div class="card-title">Projection annuelle</div>
                <div id="cov-results-table" style="margin-top:12px"></div>
            </div>

            <!-- Graphique -->
            <div class="card section">
                <div class="card-title">Trajectoire EBITDA / Service de dette / DSCR</div>
                <div class="chart-container" style="height:340px"><canvas id="chart-covenants"></canvas></div>
            </div>

            <!-- Actions -->
            <div class="btn-group section" style="justify-content:flex-start">
                <button class="btn btn-primary btn-lg" id="cov-recalc">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    Recalculer
                </button>
                <button class="btn btn-outline" id="cov-save">Sauvegarder</button>
                <button class="btn btn-outline" id="cov-export-excel">Exporter Excel</button>
                <button class="btn btn-accent" id="cov-export-pdf">Exporter PDF</button>
                <button class="btn btn-outline" id="cov-share">Partager</button>
            </div>
        `;
    },

    init() {
        // Dossier client : prévisionnel (EBITDA → CFADS), trésorerie et dettes
        DossierBar.bind({
            toDossier: () => ({
                forecast: {
                    years: Array.from({ length: horizon }, (_, i) => `Année ${i + 1}`),
                    ebitda: ebitdaYears.slice(0, horizon),
                    tax: taxYears.slice(0, horizon),
                    capex: capexYears.slice(0, horizon),
                    wcChange: wcYears.slice(0, horizon)
                },
                netCash: openingCash,
                debts: debts.map(d => ({ ...d })),
                source: 'module Covenants'
            }),
            fromDossier: d => {
                const fc = d.forecast;
                const p = {};
                if (fc?.ebitda?.length) {
                    Object.assign(p, { horizon: Math.min(10, fc.ebitda.length), ebitdaYears: fc.ebitda, taxYears: fc.tax, capexYears: fc.capex, wcYears: fc.wcChange, dscrBasis: 'cfads', excludeBullet: true });
                } else if (d.ebitdaLtm != null) {
                    Object.assign(p, { ebitdaYears: [d.ebitdaLtm], taxYears: [], capexYears: [], wcYears: [] });
                }
                if (d.netCash != null) p.openingCash = d.netCash;
                if (d.debts?.length) p.debts = d.debts;
                loadParams(p);
                if (d.ebitdaLtm != null && !fc?.ebitda?.length) applyGrowth();
                this._rerenderInputs();
                recalculate();
            }
        });

        // Hypothèses
        document.getElementById('cov-horizon')?.addEventListener('change', e => {
            horizon = parseInt(e.target.value) || 5;
            const wrap = document.getElementById('cov-ebitda-inputs');
            while (ebitdaYears.length < horizon) ebitdaYears.push(Math.round((ebitdaYears[ebitdaYears.length - 1] || 0) * (1 + growthPct / 100)));
            if (wrap) wrap.innerHTML = renderEbitdaInputs();
            fillCashLines();
            const cw = document.getElementById('cov-cash-inputs');
            if (cw) cw.innerHTML = renderCashInputs();
            recalculate();
        });
        document.getElementById('cov-dscr-min')?.addEventListener('input', e => {
            covenantDscr = parseFloat(e.target.value) || 1.2;
            recalculate();
        });
        document.getElementById('cov-lev-max')?.addEventListener('input', e => {
            covenantLeverage = parseFloat(e.target.value) || 3.5;
            recalculate();
        });

        // EBITDA
        document.getElementById('cov-ebitda-inputs')?.addEventListener('input', e => {
            const input = e.target.closest('.cov-ebitda');
            if (!input) return;
            const y = parseInt(input.dataset.year);
            if (!isNaN(y)) ebitdaYears[y] = parseFloat(input.value) || 0;
            recalculate();
        });
        document.getElementById('cov-growth')?.addEventListener('input', e => {
            growthPct = parseFloat(e.target.value) || 0;
        });
        document.getElementById('cov-apply-growth')?.addEventListener('click', applyGrowth);

        // EBITDA → CFADS
        document.getElementById('cov-cash-inputs')?.addEventListener('input', e => {
            const input = e.target.closest('.cov-cf');
            if (!input) return;
            const y = parseInt(input.dataset.year);
            const arr = { tax: taxYears, capex: capexYears, wc: wcYears }[input.dataset.kind];
            if (arr && !isNaN(y)) arr[y] = parseFloat(input.value) || 0;
            recalculate();
        });
        const ratioInput = (id, setter) => document.getElementById(id)?.addEventListener('input', e => setter(parseFloat(e.target.value) || 0));
        ratioInput('cov-tax-pct', v => { taxPct = v; });
        ratioInput('cov-capex-pct', v => { capexPct = v; });
        ratioInput('cov-wc-pct', v => { wcPct = v; });
        document.getElementById('cov-apply-ratios')?.addEventListener('click', () => {
            fillCashLines(true);
            const wrap = document.getElementById('cov-cash-inputs');
            if (wrap) wrap.innerHTML = renderCashInputs();
            recalculate();
        });
        document.getElementById('cov-opening-cash')?.addEventListener('input', e => {
            openingCash = parseFloat(e.target.value) || 0;
            recalculate();
        });
        document.getElementById('cov-dscr-basis')?.addEventListener('change', e => {
            dscrBasis = e.target.value === 'ebitda' ? 'ebitda' : 'cfads';
            recalculate();
        });
        document.getElementById('cov-index-path')?.addEventListener('input', e => {
            indexPath = String(e.target.value).split(/[/;|]/).map(v => Financial.parseNumber(v)).filter(v => !isNaN(v));
            recalculate();
        });
        document.getElementById('cov-swap-rate')?.addEventListener('input', e => {
            swapRate = parseFloat(e.target.value) || 0;
            recalculate();
        });
        document.getElementById('cov-sweep-pct')?.addEventListener('input', e => { sweepPct = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)); recalculate(); });
        document.getElementById('cov-sweep-grid')?.addEventListener('input', e => { sweepGridText = e.target.value.slice(0, 200); recalculate(); });
        document.getElementById('cov-margin-grid')?.addEventListener('input', e => { marginGridText = e.target.value.slice(0, 200); recalculate(); });
        document.getElementById('cov-floor')?.addEventListener('change', e => {
            floorZero = e.target.value !== 'none';
            recalculate();
        });
        Market.getRates().then(data => {
            marketIndex = Market.rateValue(data, 'euribor_3m');
            const hint = document.getElementById('cov-index-hint');
            if (hint && marketIndex != null) hint.textContent = `Par défaut : Euribor 3M ${Financial.formatNumber(marketIndex, 3)} % (${Market.formatUpdatedAt(data) || 'n.d.'}), prolongé sur l'horizon`;
            if (!indexPath.length && debts.some(d => d.rateType === 'floating')) recalculate();
        });
        document.getElementById('cov-bullet')?.addEventListener('change', e => {
            excludeBullet = e.target.value !== 'include';
            recalculate();
        });

        // Dettes
        const debtsBody = document.getElementById('cov-debts-body');
        const handleDebtInput = e => {
            const row = e.target.closest('tr');
            const field = e.target.dataset.field;
            if (!row || !field) return;
            const i = parseInt(row.dataset.index);
            if (isNaN(i) || !debts[i]) return;
            const isText = field === 'label' || e.target.tagName === 'SELECT';
            if (field === 'customProfile') {
                debts[i].customProfile = String(e.target.value).split(/[/;|]/).map(v => Financial.parseNumber(v)).filter(v => !isNaN(v));
            } else {
                debts[i][field] = isText ? e.target.value : (parseFloat(e.target.value) || 0);
            }
            if (field === 'amortType' && debts[i].amortType === 'balloon' && debts[i].balloonPct == null) debts[i].balloonPct = 30;
            if (field === 'amortType' && debts[i].amortType === 'custom' && !(debts[i].customProfile || []).length) {
                const n = Math.max(1, Math.round(debts[i].durationYears || 1));
                debts[i].customProfile = Array.from({ length: n }, () => Math.round(100 / n * 10) / 10);
            }
            // Type de taux / amortissement : la ligne change de forme
            if (e.type === 'change' && (field === 'rateType' || field === 'amortType')) {
                debtsBody.innerHTML = renderDebtRows();
            }
            if (field === 'durationYears') debts[i].durationYears = Math.max(1 / 12, parseFloat(e.target.value) || 1);
            recalculate();
        };
        debtsBody?.addEventListener('input', handleDebtInput);
        debtsBody?.addEventListener('change', handleDebtInput);
        debtsBody?.addEventListener('click', e => {
            const btn = e.target.closest('[data-action="remove"]');
            if (!btn) return;
            const row = btn.closest('tr');
            const i = parseInt(row?.dataset.index);
            if (!isNaN(i) && debts.length > 1) {
                debts.splice(i, 1);
                debtsBody.innerHTML = renderDebtRows();
                recalculate();
            }
        });
        document.getElementById('cov-add-debt')?.addEventListener('click', () => {
            debts.push({ label: `Dette ${debts.length + 1}`, amount: 1000, rate: 4.0, durationYears: 5, amortType: 'constant', frequency: 'monthly' });
            debtsBody.innerHTML = renderDebtRows();
            recalculate();
        });

        // Actions
        document.getElementById('cov-recalc')?.addEventListener('click', () => {
            debtsBody.innerHTML = renderDebtRows(); // rafraîchit les annuités affichées
            recalculate();
        });
        document.getElementById('cov-save')?.addEventListener('click', saveSimulation);
        document.getElementById('cov-export-excel')?.addEventListener('click', exportExcel);
        document.getElementById('cov-export-pdf')?.addEventListener('click', exportPdf);
        document.getElementById('cov-share')?.addEventListener('click', shareAnalysis);

        // Lien partagé (#covenants?s=...) ou rechargement depuis l'historique
        const shared = Share.getPayload();
        const pending = window._pendingReload;
        if (shared?.type === 'covenants' && shared.params) {
            loadParams(shared.params);
            this._rerenderInputs();
        } else if (pending?.type === 'covenants') {
            window._pendingReload = null;
            loadParams(pending.params);
            this._rerenderInputs();
        }

        recalculate();
    },

    _rerenderInputs() {
        const h = document.getElementById('cov-horizon');
        if (h) h.value = String(horizon);
        const d = document.getElementById('cov-dscr-min');
        if (d) d.value = covenantDscr;
        const l = document.getElementById('cov-lev-max');
        if (l) l.value = covenantLeverage;
        const g = document.getElementById('cov-growth');
        if (g) g.value = growthPct;
        const eb = document.getElementById('cov-ebitda-inputs');
        if (eb) eb.innerHTML = renderEbitdaInputs();
        const cw = document.getElementById('cov-cash-inputs');
        if (cw) cw.innerHTML = renderCashInputs();
        const oc = document.getElementById('cov-opening-cash');
        if (oc) oc.value = String(openingCash);
        const db2 = document.getElementById('cov-dscr-basis');
        if (db2) db2.value = dscrBasis;
        const bl = document.getElementById('cov-bullet');
        if (bl) bl.value = excludeBullet ? 'exclude' : 'include';
        const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = String(v); };
        setVal('cov-tax-pct', taxPct);
        setVal('cov-capex-pct', capexPct);
        setVal('cov-wc-pct', wcPct);
        setVal('cov-index-path', indexPath.map(v => Financial.formatNumber(v, 3)).join(' / '));
        setVal('cov-swap-rate', swapRate);
        setVal('cov-floor', floorZero ? '0' : 'none');
        setVal('cov-sweep-pct', sweepPct);
        setVal('cov-sweep-grid', sweepGridText);
        setVal('cov-margin-grid', marginGridText);
        const db = document.getElementById('cov-debts-body');
        if (db) db.innerHTML = renderDebtRows();
    }
};
