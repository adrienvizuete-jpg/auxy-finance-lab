/**
 * Auxy Partners - Profil de Dette v2
 *
 * Saisie des crédits depuis leurs conditions d'ORIGINE (montant initial,
 * date de 1ère échéance, durée totale) → reconstitution de l'historique
 * (exposition, service de dette) + projection, mur de la dette, frise des
 * financements, variation de l'endettement par exercice fiscal.
 *
 * - CRD calculé à la date d'analyse + contrôle facultatif vs liasse/tableau
 *   d'amortissement (flag si écart > 1 %)
 * - nouveaux financements imbriqués dans la projection, avec comparaison
 *   « avec / sans »
 * - calage possible sur un exercice fiscal décalé (mois de clôture)
 *
 * Moteur de calcul : js/utils/debtengine.js (pur, testé).
 */

import { Financial } from '../utils/financial.js';
import { DebtEngine } from '../utils/debtengine.js';
import { Charts } from '../utils/charts.js';
import { Export } from '../utils/export.js';
import { Storage } from '../utils/storage.js';
import { Share } from '../utils/share.js';
import { Market } from '../utils/market.js';
import { escapeHtml } from '../utils/sanitize.js';

// ── State ──
const now = new Date();
let dossierName = '';
let analysis = { year: now.getFullYear(), month: now.getMonth() + 1 };
let closingMonth = 12;
let includeNew = true;
let loans = [
    { label: 'Crédit immobilier', amount: 1200000, startYear: 2019, startMonth: 7, durationMonths: 180, rate: 2.1, amortType: 'constant', frequency: 'monthly', isNew: false, crdCheck: null },
    { label: 'Prêt équipement', amount: 450000, startYear: 2023, startMonth: 3, durationMonths: 84, rate: 4.1, amortType: 'constant', frequency: 'monthly', isNew: false, crdCheck: null },
    { label: 'Crédit-bail matériel', amount: 230000, startYear: 2024, startMonth: 1, durationMonths: 60, rate: 4.8, amortType: 'constant', frequency: 'monthly', isNew: false, crdCheck: null }
];
let lastResult = null;
let marketRates = null; // pré-remplissage du taux des nouveaux financements

const AMORT_OPTIONS = { constant: 'Constant', degressif: 'Dégressif', infine: 'In Fine' };
const FREQ_OPTIONS = { monthly: 'Mensuel', quarterly: 'Trimestriel', semiannual: 'Semestriel', annual: 'Annuel' };
const MONTH_NAMES = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

const f0 = v => Financial.formatCurrency(v, 0);
const fmtPct = v => Financial.formatPercent(v, 2);

const X_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
const COPY_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>';
const PLUS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';

// ── Helpers ──

const analysisIdx = () => DebtEngine.monthIndex(analysis.year, analysis.month);
const monthValue = (year, month) => `${year}-${String(month).padStart(2, '0')}`;
const analysisLabel = () => `${String(analysis.month).padStart(2, '0')}/${analysis.year}`;

function parseMonthValue(value) {
    const m = /^(\d{4})-(\d{2})$/.exec(value || '');
    if (!m) return null;
    const year = parseInt(m[1]), month = parseInt(m[2]);
    if (year < 1980 || year > 2080 || month < 1 || month > 12) return null;
    return { year, month };
}

function validLoans() {
    return loans.filter(l => l.amount > 0 && l.durationMonths >= 1);
}

function computeAll() {
    return DebtEngine.aggregate(loans, {
        closingMonth,
        includeNew,
        analysisIdx: analysisIdx()
    });
}

// ── Grille de saisie ──

function renderLoanRows() {
    return loans.map((l, i) => `
        <tr data-index="${i}" class="${l.isNew ? 'dp-row-new' : ''}">
            <td><input class="er-input" type="text" value="${escapeHtml(l.label)}" data-field="label" style="min-width:130px"></td>
            <td style="text-align:right"><input class="er-input narrow" type="number" value="${l.amount}" data-field="amount" step="10000" min="0" style="width:105px"></td>
            <td><input class="er-input" type="month" value="${monthValue(l.startYear, l.startMonth)}" data-field="start" style="width:130px"></td>
            <td style="text-align:right"><input class="er-input narrow" type="number" value="${l.durationMonths}" data-field="durationMonths" step="12" min="1" max="480" style="width:65px"></td>
            <td style="text-align:right"><input class="er-input narrow" type="number" value="${l.rate}" data-field="rate" step="0.05" min="0" max="30" style="width:65px"></td>
            <td><select class="er-input" data-field="amortType" style="width:92px;font-size:0.75rem">${Object.entries(AMORT_OPTIONS).map(([k, v]) => `<option value="${k}" ${k === l.amortType ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
            <td><select class="er-input" data-field="frequency" style="width:92px;font-size:0.75rem">${Object.entries(FREQ_OPTIONS).map(([k, v]) => `<option value="${k}" ${k === l.frequency ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
            <td style="text-align:center"><input type="checkbox" data-field="isNew" ${l.isNew ? 'checked' : ''} title="Nouveau financement (projeté)"></td>
            <td style="text-align:right">
                <span class="er-computed" id="dp-crd-calc-${i}">—</span>
                <div class="dp-crd-gap" id="dp-crd-gap-${i}"></div>
            </td>
            <td style="text-align:right"><input class="er-input narrow" type="number" value="${l.crdCheck ?? ''}" data-field="crdCheck" step="1000" min="0" placeholder="contrôle" style="width:100px" title="CRD constaté à la date d'analyse (liasse ou tableau d'amortissement) — facultatif"></td>
            <td style="width:56px;white-space:nowrap">
                <button class="er-remove-btn" data-action="duplicate" title="Dupliquer la ligne">${COPY_SVG}</button>
                ${loans.length > 1 ? `<button class="er-remove-btn" data-action="remove" title="Supprimer">${X_SVG}</button>` : ''}
            </td>
        </tr>`).join('');
}

/** Met à jour les CRD calculés + badges d'écart, sans re-render (focus conservé) */
function refreshCrdCells() {
    const aIdx = analysisIdx();
    loans.forEach((l, i) => {
        const cell = document.getElementById(`dp-crd-calc-${i}`);
        const gapEl = document.getElementById(`dp-crd-gap-${i}`);
        if (!cell) return;
        if (!(l.amount > 0 && l.durationMonths >= 1)) {
            cell.textContent = '—';
            if (gapEl) gapEl.innerHTML = '';
            return;
        }
        const sched = DebtEngine.buildSchedule(l);
        const crd = DebtEngine.crdAt(sched, aIdx);
        cell.textContent = f0(crd);
        if (gapEl) {
            const gap = DebtEngine.crdGapPct(crd, l.crdCheck);
            if (gap == null) {
                gapEl.innerHTML = '';
            } else {
                const ok = Math.abs(gap) <= 1;
                const sign = gap > 0 ? '+' : '';
                gapEl.innerHTML = `<span class="cov-badge ${ok ? 'ok' : 'breach'}" title="Écart CRD calculé vs constaté">${ok ? '✓' : '⚠'} ${sign}${Financial.formatNumber(gap, 1)} %</span>`;
            }
        }
    });
}

// ── Tableau de variation de l'endettement ──

function renderVariationTable(agg) {
    if (!agg.years.length) return '<p style="color:var(--text-muted)">Aucun crédit valide.</p>';
    return `
        <div class="table-container">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Exercice</th>
                        <th style="text-align:right">Encours ouverture</th>
                        <th style="text-align:right">Tirages</th>
                        <th style="text-align:right">Amortissement</th>
                        <th style="text-align:right">Encours clôture</th>
                        <th style="text-align:right">Intérêts</th>
                        <th style="text-align:right">Service de dette</th>
                    </tr>
                </thead>
                <tbody>
                    ${agg.years.map(y => `
                        <tr class="${y.isPast ? 'dp-past-row' : ''} ${y.isCurrent ? 'dp-current-row' : ''}">
                            <td>${y.label}${y.isCurrent ? ' <span class="cov-badge warning">en cours</span>' : ''}</td>
                            <td class="number">${f0(y.opening)}</td>
                            <td class="number">${y.drawdowns > 0 ? '+ ' + f0(y.drawdowns) : '—'}</td>
                            <td class="number">${y.principal > 0 ? '− ' + f0(y.principal) : '—'}</td>
                            <td class="number" style="font-weight:600">${f0(y.closing)}</td>
                            <td class="number">${f0(y.interest)}</td>
                            <td class="number" style="font-weight:600">${f0(y.service)}</td>
                        </tr>`).join('')}
                </tbody>
            </table>
        </div>`;
}

// ── Recalcul global ──

function recalculate() {
    const agg = computeAll();
    const aIdx = analysisIdx();
    const k = DebtEngine.kpis(agg, aIdx);

    refreshCrdCells();

    const setKpi = (id, val, sub = '') => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = val + (sub ? ` <span class="cov-kpi-sub">${sub}</span>` : '');
    };

    if (k) {
        setKpi('dp-kpi-expo', f0(k.exposure));
        setKpi('dp-kpi-service', f0(k.currentService), k.currentLabel);
        setKpi('dp-kpi-peak', k.peak ? f0(k.peak.service) : '—', k.peak?.label ?? '');
        setKpi('dp-kpi-rate', fmtPct(k.weightedRate));
        setKpi('dp-kpi-wal', `${Financial.formatNumber(k.wal, 1)} ans`);
        setKpi('dp-kpi-amort3', `${Financial.formatNumber(k.amortized3yPct, 0)} %`);
        const newInfo = document.getElementById('dp-new-info');
        if (newInfo) {
            newInfo.textContent = k.newCount > 0 && includeNew
                ? `+ ${k.newCount} nouveau${k.newCount > 1 ? 'x' : ''} financement${k.newCount > 1 ? 's' : ''} à venir : ${f0(k.newAmount)}`
                : '';
        }
    } else {
        ['dp-kpi-expo', 'dp-kpi-service', 'dp-kpi-peak', 'dp-kpi-rate', 'dp-kpi-wal', 'dp-kpi-amort3']
            .forEach(id => setKpi(id, '—'));
    }

    // Tableau de variation
    const tableEl = document.getElementById('dp-variation-table');
    if (tableEl) tableEl.innerHTML = renderVariationTable(agg);

    // Frise des financements
    const ganttItems = agg.schedules.map(s => {
        const start = s.loan.startYear + (s.loan.startMonth - 1) / 12;
        const end = Math.floor(s.sched.lastIdx / 12) + (s.sched.lastIdx % 12) / 12 + 1 / 12;
        return {
            label: s.loan.label,
            start,
            end,
            isNew: !!s.loan.isNew,
            tooltip: `${f0(s.loan.amount)} · ${s.loan.rate} % · ${s.loan.durationMonths} mois${s.loan.isNew ? ' · nouveau' : ''}`
        };
    });
    Charts.debtGantt('chart-debt-gantt', ganttItems, {
        markerValue: analysis.year + (analysis.month - 1) / 12,
        markerLabel: analysisLabel()
    });

    // Mur de la dette + encours
    Charts.debtTimeline('chart-debt-wall', {
        labels: agg.years.map(y => y.label),
        series: agg.perLoanCapital,
        crd: agg.years.map(y => y.closing),
        pastCount: agg.years.filter(y => y.isPast).length,
        markerLabel: analysisLabel()
    });

    lastResult = {
        type: 'debtprofile',
        params: {
            dossierName,
            analysis: { ...analysis },
            closingMonth,
            includeNew,
            loans: loans.map(l => ({ ...l }))
        },
        results: k ? {
            exposure: k.exposure,
            currentService: k.currentService,
            currentLabel: k.currentLabel,
            peakYear: k.peak?.label ?? null,
            peakService: k.peak?.service ?? 0,
            weightedRate: k.weightedRate,
            wal: k.wal,
            amortized3yPct: k.amortized3yPct,
            years: agg.years
        } : { years: [] }
    };
}

// ── Actions ──

function addLoan(isNew) {
    const aIdx = analysisIdx();
    const startIdx = isNew ? aIdx + 2 : aIdx - 12; // nouveau : départ dans 2 mois
    const startYear = Math.floor(startIdx / 12);
    const startMonth = (startIdx % 12) + 1;
    let rate = 4.0;
    if (isNew) {
        const e3m = Market.rateValue(marketRates, 'euribor_3m');
        if (e3m != null) rate = Math.round((e3m + 2.0) * 100) / 100; // Euribor 3M + 200 bp
    }
    loans.push({
        label: isNew ? `Nouveau financement ${loans.filter(l => l.isNew).length + 1}` : `Crédit ${loans.length + 1}`,
        amount: 500000,
        startYear,
        startMonth,
        durationMonths: 60,
        rate,
        amortType: 'constant',
        frequency: 'monthly',
        isNew,
        crdCheck: null
    });
    document.getElementById('dp-loans-body').innerHTML = renderLoanRows();
    recalculate();
}

function saveProfile() {
    if (!lastResult) recalculate();
    const modal = document.getElementById('modal-overlay');
    const body = document.getElementById('modal-body');
    const defaultName = dossierName
        ? `Profil de dette — ${dossierName}`
        : `Profil de dette — ${f0(lastResult.results.exposure || 0)}`;

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

    // Feuille 1 : inventaire
    const inv = [
        ['AUXY PARTNERS — Profil de Dette'],
        dossierName ? ['Dossier', dossierName] : [],
        ['Date d\'analyse', analysisLabel()],
        ['Clôture d\'exercice', closingMonth === 12 ? 'Décembre (année civile)' : MONTH_NAMES[closingMonth - 1]],
        [''],
        ['CRÉDITS', 'Montant initial (€)', '1ère échéance', 'Durée (mois)', 'Taux (%)', 'Amortissement', 'Périodicité', 'Nouveau', 'CRD à l\'analyse (€)', 'CRD constaté (€)']
    ].filter(row => row.length);
    const aIdx = analysisIdx();
    validLoans().forEach(l => {
        const crd = DebtEngine.crdAt(DebtEngine.buildSchedule(l), aIdx);
        inv.push([l.label, l.amount, monthValue(l.startYear, l.startMonth), l.durationMonths, l.rate,
            AMORT_OPTIONS[l.amortType], FREQ_OPTIONS[l.frequency], l.isNew ? 'Oui' : '', Math.round(crd), l.crdCheck ?? '']);
    });
    const wsInv = XLSX.utils.aoa_to_sheet(inv);
    wsInv['!cols'] = [{ wch: 26 }, { wch: 16 }, { wch: 13 }, { wch: 12 }, { wch: 9 }, { wch: 14 }, { wch: 12 }, { wch: 9 }, { wch: 17 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, wsInv, 'Crédits');

    // Feuille 2 : variation de l'endettement
    const vard = [['Exercice', 'Encours ouverture', 'Tirages', 'Amortissement', 'Encours clôture', 'Intérêts', 'Service de dette']];
    (r.years || []).forEach(y => vard.push([y.label, Math.round(y.opening), Math.round(y.drawdowns), Math.round(y.principal), Math.round(y.closing), Math.round(y.interest), Math.round(y.service)]));
    const wsVar = XLSX.utils.aoa_to_sheet(vard);
    wsVar['!cols'] = vard[0].map(() => ({ wch: 17 }));
    XLSX.utils.book_append_sheet(wb, wsVar, 'Variation endettement');

    XLSX.writeFile(wb, `profil_dette_${new Date().toISOString().slice(0, 10)}.xlsx`);
    window.showToast?.('Export Excel téléchargé', 'success');
}

function exportPdf() {
    if (!lastResult) recalculate();
    // Les graphiques sont créés avec animation:false (paint synchrone) :
    // la capture Charts.toImage est fiable même juste après un recalcul.
    const r = lastResult.results;
    const aIdx = analysisIdx();

    const sections = [
        { type: 'kpicards', items: [
            { label: 'Encours de dette', value: f0(r.exposure || 0), sub: `au ${analysisLabel()}` },
            { label: 'Service de dette', value: f0(r.currentService || 0), sub: `exercice ${r.currentLabel}` },
            { label: 'Pic de service', value: r.peakYear ? f0(r.peakService) : '—', sub: r.peakYear ? `exercice ${r.peakYear}` : '' },
            { label: 'Taux moyen pondéré', value: fmtPct(r.weightedRate || 0), sub: 'pondéré par encours' },
            { label: 'Durée de vie moyenne', value: `${Financial.formatNumber(r.wal || 0, 1)} ans`, sub: 'WAL des flux futurs' },
            { label: 'Amorti à 3 ans', value: `${Financial.formatNumber(r.amortized3yPct || 0, 0)} %`, sub: 'du capital restant' }
        ] },
        { type: 'chart', canvasId: 'chart-debt-gantt', title: 'Frise des financements', maxHeight: 70 },
        { type: 'chart', canvasId: 'chart-debt-wall', title: 'Mur de la dette et encours' },
        { type: 'title', text: 'Inventaire des crédits' },
        { type: 'table',
            headers: ['Crédit', 'Montant initial', '1ère éch.', 'Durée', 'Taux', 'Amort.', `CRD au ${analysisLabel()}`],
            rows: validLoans().map(l => {
                const crd = DebtEngine.crdAt(DebtEngine.buildSchedule(l), aIdx);
                return [
                    l.label + (l.isNew ? ' (nouveau)' : ''),
                    f0(l.amount),
                    monthValue(l.startYear, l.startMonth),
                    `${l.durationMonths} mois`,
                    `${l.rate} %`,
                    AMORT_OPTIONS[l.amortType],
                    f0(crd)
                ];
            }) },
        { type: 'title', text: 'Variation de l\'endettement par exercice' },
        { type: 'table',
            headers: ['Exercice', 'Ouverture', 'Tirages', 'Amortissement', 'Clôture', 'Intérêts', 'Service'],
            highlightRows: (r.years || []).map((y, i) => y.isCurrent ? i : -1).filter(i => i >= 0),
            rows: (r.years || []).map(y => [
                y.label + (y.isPast ? '' : y.isCurrent ? ' (en cours)' : ' (proj.)'),
                f0(y.opening), y.drawdowns > 0 ? f0(y.drawdowns) : '—',
                y.principal > 0 ? f0(y.principal) : '—',
                f0(y.closing), f0(y.interest), f0(y.service)
            ]) },
        { type: 'note', title: 'Méthodologie & conventions', text:
            'Échéanciers reconstitués depuis les conditions d\'origine de chaque crédit (montant initial, date de première échéance, durée, taux). ' +
            'Le tirage est rattaché au mois précédant la première échéance. ' +
            `Exercices ${closingMonth === 12 ? 'calés sur l\'année civile' : 'clos en ' + MONTH_NAMES[closingMonth - 1].toLowerCase()}. ` +
            `Le CRD « à l'analyse » est le solde après la dernière échéance antérieure au ${analysisLabel()}. ` +
            (includeNew ? 'Les nouveaux financements sont inclus dans la projection. ' : 'Les nouveaux financements sont exclus de cette projection. ') +
            'Calculs réalisés au pas mensuel sur la base des taux nominaux saisis ; hors assurance et frais annexes. ' +
            'Document de travail établi par Auxy Partners — ne constitue pas un engagement de financement.' }
    ];

    Export.toPdf(`Profil de Dette${dossierName ? ' — ' + dossierName : ''}`, sections, 'profil_dette', {
        cover: {
            subtitle: 'Exposition crédit, service de la dette historique et projeté',
            items: [
                ...(dossierName ? [{ label: 'Dossier', value: dossierName }] : []),
                { label: 'Date d\'analyse', value: analysisLabel() },
                { label: 'Encours de dette', value: f0(r.exposure || 0) },
                { label: 'Nombre de crédits', value: String(validLoans().length) },
                { label: 'Clôture d\'exercice', value: closingMonth === 12 ? 'Année civile' : MONTH_NAMES[closingMonth - 1] }
            ]
        }
    });
}

function shareProfile() {
    if (!lastResult) recalculate();
    Share.copyLink('debtprofile', { type: 'debtprofile', params: lastResult.params });
}

// ── Restauration (partage / historique), avec rétrocompatibilité v1 ──

function loadParams(p) {
    if (!p) return;
    if (typeof p.dossierName === 'string') dossierName = p.dossierName.slice(0, 80);
    if (p.analysis && parseMonthValue(monthValue(p.analysis.year, p.analysis.month))) {
        analysis = { year: parseInt(p.analysis.year), month: parseInt(p.analysis.month) };
    }
    if (p.closingMonth >= 1 && p.closingMonth <= 12) closingMonth = parseInt(p.closingMonth);
    if (typeof p.includeNew === 'boolean') includeNew = p.includeNew;

    if (Array.isArray(p.loans) && p.loans.length) {
        loans = p.loans.map(l => {
            // Ancien format v1 : { crd, remainingMonths } → équivalent depuis la date d'analyse
            if (l.crd != null && l.startYear == null) {
                const startIdx = analysisIdx() + 1;
                return {
                    label: String(l.label ?? 'Crédit'),
                    amount: parseFloat(l.crd) || 0,
                    startYear: Math.floor(startIdx / 12),
                    startMonth: (startIdx % 12) + 1,
                    durationMonths: Math.max(1, parseInt(l.remainingMonths) || 1),
                    rate: parseFloat(l.rate) || 0,
                    amortType: AMORT_OPTIONS[l.amortType] ? l.amortType : 'constant',
                    frequency: FREQ_OPTIONS[l.frequency] ? l.frequency : 'monthly',
                    isNew: false,
                    crdCheck: null
                };
            }
            return {
                label: String(l.label ?? 'Crédit'),
                amount: parseFloat(l.amount) || 0,
                startYear: parseInt(l.startYear) || analysis.year,
                startMonth: Math.min(12, Math.max(1, parseInt(l.startMonth) || 1)),
                durationMonths: Math.max(1, parseInt(l.durationMonths) || 1),
                rate: parseFloat(l.rate) || 0,
                amortType: AMORT_OPTIONS[l.amortType] ? l.amortType : 'constant',
                frequency: FREQ_OPTIONS[l.frequency] ? l.frequency : 'monthly',
                isNew: !!l.isNew,
                crdCheck: l.crdCheck != null && isFinite(parseFloat(l.crdCheck)) ? parseFloat(l.crdCheck) : null
            };
        });
    }
}

// ── Module ──

export const DebtProfileModule = {
    render() {
        return `
            <div class="page-header">
                <h1>Profil de Dette</h1>
                <p>Exposition crédit et service de la dette — historique reconstitué et projection, depuis les conditions d'origine</p>
            </div>

            <!-- Paramètres du dossier -->
            <div class="card section">
                <div class="card-title">Dossier</div>
                <div class="form-row" style="margin-top:12px">
                    <div class="form-group">
                        <label class="form-label">Nom du dossier / client</label>
                        <input type="text" class="form-input" id="dp-dossier" value="${escapeHtml(dossierName)}" placeholder="Ex : SAS Dupont Industries">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Date d'analyse</label>
                        <input type="month" class="form-input" id="dp-analysis" value="${monthValue(analysis.year, analysis.month)}" title="Alignez-la sur une clôture pour contrôler les CRD vs liasse">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Clôture d'exercice</label>
                        <select class="form-select" id="dp-closing">
                            ${MONTH_NAMES.map((m, i) => `<option value="${i + 1}" ${i + 1 === closingMonth ? 'selected' : ''}>${m}${i + 1 === 12 ? ' (année civile)' : ''}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Nouveaux financements</label>
                        <div class="toggle-group" id="dp-include-toggle">
                            <button type="button" class="toggle-btn ${includeNew ? 'active' : ''}" data-inc="1">Inclus</button>
                            <button type="button" class="toggle-btn ${includeNew ? '' : 'active'}" data-inc="0">Exclus</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Crédits -->
            <div class="card section">
                <div class="card-header">
                    <div>
                        <div class="card-title">Crédits</div>
                        <div class="card-subtitle">Conditions d'origine — le CRD à la date d'analyse est recalculé et contrôlable vs liasse</div>
                    </div>
                    <div class="btn-group">
                        <button class="btn btn-sm btn-outline" id="dp-add-existing">${PLUS_SVG} Crédit existant</button>
                        <button class="btn btn-sm btn-accent" id="dp-add-new">${PLUS_SVG} Nouveau financement</button>
                    </div>
                </div>
                <div class="table-container" style="margin-top:12px">
                    <table class="er-table">
                        <thead>
                            <tr>
                                <th>Libellé</th>
                                <th style="text-align:right">Montant initial (€)</th>
                                <th>1ère échéance</th>
                                <th style="text-align:right">Durée (mois)</th>
                                <th style="text-align:right">Taux (%)</th>
                                <th>Amortissement</th>
                                <th>Périodicité</th>
                                <th title="Nouveau financement à imbriquer dans la projection">Nouveau</th>
                                <th style="text-align:right">CRD au ${analysisLabel()}</th>
                                <th style="text-align:right">CRD constaté (€)</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody id="dp-loans-body">${renderLoanRows()}</tbody>
                    </table>
                </div>
            </div>

            <!-- KPIs -->
            <div class="er-kpi-grid section" style="grid-template-columns:repeat(auto-fit, minmax(160px, 1fr))">
                <div class="er-kpi-card">
                    <div class="kpi-label">Encours au ${analysisLabel()}</div>
                    <div class="kpi-value highlight" id="dp-kpi-expo">—</div>
                    <div style="font-size:0.7rem;color:var(--text-muted);margin-top:4px" id="dp-new-info"></div>
                </div>
                <div class="er-kpi-card">
                    <div class="kpi-label">Service de dette</div>
                    <div class="kpi-value" id="dp-kpi-service">—</div>
                </div>
                <div class="er-kpi-card">
                    <div class="kpi-label">Pic de service</div>
                    <div class="kpi-value highlight" id="dp-kpi-peak">—</div>
                </div>
                <div class="er-kpi-card">
                    <div class="kpi-label">Taux moyen pondéré</div>
                    <div class="kpi-value" id="dp-kpi-rate">—</div>
                </div>
                <div class="er-kpi-card">
                    <div class="kpi-label">Durée de vie moy. (WAL)</div>
                    <div class="kpi-value" id="dp-kpi-wal">—</div>
                </div>
                <div class="er-kpi-card">
                    <div class="kpi-label">Amorti à 3 ans</div>
                    <div class="kpi-value" id="dp-kpi-amort3">—</div>
                </div>
            </div>

            <!-- Frise -->
            <div class="card section">
                <div class="card-title">Frise des financements</div>
                <div class="chart-container" style="height:${Math.max(140, 60 + loans.length * 34)}px"><canvas id="chart-debt-gantt"></canvas></div>
            </div>

            <!-- Mur de la dette -->
            <div class="card section">
                <div class="card-title">Mur de la dette &amp; encours — historique et projection</div>
                <div class="chart-container" style="height:360px"><canvas id="chart-debt-wall"></canvas></div>
            </div>

            <!-- Variation de l'endettement -->
            <div class="card section">
                <div class="card-title">Variation de l'endettement par exercice</div>
                <div id="dp-variation-table" style="margin-top:12px"></div>
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

        // Taux de marché pour le pré-remplissage des nouveaux financements
        Market.getRates().then(d => { marketRates = d; }).catch(() => {});

        // ── Paramètres dossier ──
        document.getElementById('dp-dossier')?.addEventListener('input', e => {
            dossierName = e.target.value.slice(0, 80);
        });
        document.getElementById('dp-analysis')?.addEventListener('change', e => {
            const parsed = parseMonthValue(e.target.value);
            if (parsed) {
                analysis = parsed;
                // les libellés d'en-tête de colonne et de KPI dépendent de la date → re-render complet
                window.navigateTo?.('debtprofile');
            }
        });
        document.getElementById('dp-closing')?.addEventListener('change', e => {
            closingMonth = parseInt(e.target.value) || 12;
            recalculate();
        });
        document.getElementById('dp-include-toggle')?.addEventListener('click', e => {
            const btn = e.target.closest('.toggle-btn');
            if (!btn) return;
            includeNew = btn.dataset.inc === '1';
            document.querySelectorAll('#dp-include-toggle .toggle-btn').forEach(b => b.classList.toggle('active', b === btn));
            recalculate();
        });

        // ── Grille crédits ──
        const handleInput = e => {
            const row = e.target.closest('tr');
            const field = e.target.dataset.field;
            if (!row || !field) return;
            const i = parseInt(row.dataset.index);
            if (isNaN(i) || !loans[i]) return;

            if (field === 'start') {
                const parsed = parseMonthValue(e.target.value);
                if (parsed) { loans[i].startYear = parsed.year; loans[i].startMonth = parsed.month; }
            } else if (field === 'isNew') {
                loans[i].isNew = e.target.checked;
                row.classList.toggle('dp-row-new', loans[i].isNew);
            } else if (field === 'crdCheck') {
                const v = parseFloat(e.target.value);
                loans[i].crdCheck = isFinite(v) && v > 0 ? v : null;
            } else if (field === 'label') {
                loans[i].label = e.target.value;
            } else if (e.target.tagName === 'SELECT') {
                loans[i][field] = e.target.value;
            } else {
                loans[i][field] = parseFloat(e.target.value) || 0;
                if (field === 'durationMonths') loans[i].durationMonths = Math.max(1, parseInt(e.target.value) || 1);
            }
            recalculate();
        };
        body?.addEventListener('input', handleInput);
        body?.addEventListener('change', handleInput);
        body?.addEventListener('click', e => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            const i = parseInt(btn.closest('tr')?.dataset.index);
            if (isNaN(i) || !loans[i]) return;
            if (btn.dataset.action === 'remove' && loans.length > 1) {
                loans.splice(i, 1);
            } else if (btn.dataset.action === 'duplicate') {
                loans.splice(i + 1, 0, { ...loans[i], label: `${loans[i].label} (copie)`, crdCheck: null });
            } else {
                return;
            }
            body.innerHTML = renderLoanRows();
            recalculate();
        });

        document.getElementById('dp-add-existing')?.addEventListener('click', () => addLoan(false));
        document.getElementById('dp-add-new')?.addEventListener('click', () => addLoan(true));

        // ── Actions ──
        document.getElementById('dp-recalc')?.addEventListener('click', () => {
            body.innerHTML = renderLoanRows();
            recalculate();
        });
        document.getElementById('dp-save')?.addEventListener('click', saveProfile);
        document.getElementById('dp-export-excel')?.addEventListener('click', exportExcel);
        document.getElementById('dp-export-pdf')?.addEventListener('click', exportPdf);
        document.getElementById('dp-share')?.addEventListener('click', shareProfile);

        // ── Lien partagé ou rechargement historique (rétrocompatible v1) ──
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
        const d = document.getElementById('dp-dossier');
        if (d) d.value = dossierName;
        const a = document.getElementById('dp-analysis');
        if (a) a.value = monthValue(analysis.year, analysis.month);
        const c = document.getElementById('dp-closing');
        if (c) c.value = String(closingMonth);
        document.querySelectorAll('#dp-include-toggle .toggle-btn').forEach(b =>
            b.classList.toggle('active', (b.dataset.inc === '1') === includeNew));
        const body = document.getElementById('dp-loans-body');
        if (body) body.innerHTML = renderLoanRows();
    }
};
