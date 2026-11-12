/**
 * Auxy Partners - Financement Structuré
 * Tableau Emplois-Ressources (Sources & Uses)
 */

import { CovenantEngine } from '../utils/covenantengine.js';
import { Storage } from '../utils/storage.js';
import { Share } from '../utils/share.js';
import { escapeHtml } from '../utils/sanitize.js';
import { DossierBar } from '../utils/dossierbar.js';
import { Market } from '../utils/market.js';
import { Dossier } from '../utils/dossier.js';
import { Financial } from '../utils/financial.js';
import { Dialog } from '../utils/dialog.js';
import { Draft } from '../utils/draft.js';
import { Export } from '../utils/export.js';

// ── State ──
let emplois = [
    { label: 'VT [Nom cible]', amount: 12700, kind: 'titres' },
    { label: 'Frais', amount: 250 }
];

let detteNonRef = [
    { label: 'Dette bancaire existante', amount: 500 },
    { label: 'Compte-courant associé', amount: 694 },
    { label: 'Crédit-bail', amount: 500 }
];

let tranchesSenior = [
    { label: 'A', pct: 70, duration: 6, taux: 3.5, amortType: 'constant', frequency: 'mensuel' },
    { label: 'B', pct: 30, duration: 7, taux: 4.5, amortType: 'constant', frequency: 'mensuel' }
];

// Autres financements (hors senior) : crédit vendeur, OC, Bpifrance, mezzanine…
let autresFin = [];
const AUTRE_TYPES = { vendeur: 'Crédit vendeur', oc: 'Obligations convertibles', bpi: 'Prêt Bpifrance', mezz: 'Mezzanine / PIK', unitranche: 'Unitranche', capex: 'Ligne capex' };

// Dimensionnement de la dette (contraintes bancaires)
let sizing = { maxLeverage: 3.5, minDscr: 1.2, horizon: 5, growth: 3, taxPct: 12, capexPct: 12, wcPct: 2, fpMinPct: 30 };
let marketIndex = null; // Euribor 3M publié, pour les tranches à taux variable

let ebitda = 3750;
let fondsPropres = 1200;
let tresorerieMin = 4200;
let lastResult = null;

// ── Formatting helpers ──
const fmtK = (v) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(v);
const fmtPct = (v) => new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v) + '%';
const fmtRatio = (v) => new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) + 'x';

const X_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
const PLUS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';

// ── Computed values ──
function compute() {
    const totalEmplois = emplois.reduce((s, e) => s + e.amount, 0);
    const totalDetteNonRef = detteNonRef.reduce((s, d) => s + d.amount, 0);
    const totalAutres = autresFin.reduce((s, a) => s + (a.amount || 0), 0);
    const detteSenior = Math.max(0, totalEmplois - fondsPropres - totalAutres);
    // Fonds propres au-delà du besoin : excédent signalé, ressources plafonnées aux emplois
    const excesFP = Math.max(0, fondsPropres - totalEmplois);
    const pctFP = totalEmplois > 0 ? (Math.min(fondsPropres, totalEmplois) / totalEmplois * 100) : 0;
    const pctSenior = totalEmplois > 0 ? (detteSenior / totalEmplois * 100) : 0;
    const pctAutres = totalEmplois > 0 ? (totalAutres / totalEmplois * 100) : 0;
    const tranchesDetail = tranchesSenior.map(t => ({ ...t, amount: trancheAmount(detteSenior, t) }));
    const detteFinClosing = detteSenior + totalAutres + totalDetteNonRef;
    const dfn = detteFinClosing - tresorerieMin;
    // EBITDA ≤ 0 : levier non significatif (et non « 0,00x »)
    const ratioLevier = ebitda > 0 ? dfn / ebitda : null;
    // VE retenue = prix des titres + dette non refinancée − trésorerie. Le prix
    // des titres est la ligne d'emplois marquée « titres » (à défaut la 1re).
    const vtRow = emplois.find(e => e.kind === 'titres') || emplois[0];
    const vt = vtRow ? vtRow.amount : 0;
    const veRetenue = vt + totalDetteNonRef - tresorerieMin;

    return {
        totalEmplois, totalDetteNonRef, detteSenior, excesFP, totalAutres, pctAutres,
        pctFP, pctSenior, tranchesDetail,
        detteFinClosing, dfn, ratioLevier, veRetenue, vtLabel: vtRow?.label || ''
    };
}

// ── Render dynamic rows ──
function renderEmploisRows() {
    return emplois.map((e, i) => `
        <tr data-section="emplois" data-index="${i}">
            <td><input class="er-input" type="text" value="${escapeHtml(e.label)}" data-field="label"></td>
            <td style="text-align:right"><input class="er-input narrow" type="number" value="${e.amount}" data-field="amount" step="50"></td>
            <td style="width:30px">${emplois.length > 1 ? `<button class="er-remove-btn" data-action="remove">${X_SVG}</button>` : ''}</td>
        </tr>
    `).join('');
}

function renderDetteNonRefRows() {
    return detteNonRef.map((d, i) => `
        <tr data-section="detteNonRef" data-index="${i}">
            <td><input class="er-input" type="text" value="${escapeHtml(d.label)}" data-field="label"></td>
            <td style="text-align:right"><input class="er-input narrow" type="number" value="${d.amount}" data-field="amount" step="50"></td>
            <td style="width:30px">${detteNonRef.length > 1 ? `<button class="er-remove-btn" data-action="remove">${X_SVG}</button>` : ''}</td>
        </tr>
    `).join('');
}

const AMORT_LABELS = { constant: 'Constant', degressif: 'Dégressif', infine: 'In Fine', custom: 'Profil libre', balloon: 'Ballon' };
const RATE_LABELS = { fixed: 'Fixe', floating: 'Variable' };
const FREQ_LABELS = { mensuel: 'Mensuel', trimestriel: 'Trimestriel', semestriel: 'Semestriel', annuel: 'Annuel', infine: 'In Fine' };

const FREQ_TO_ENGINE = { mensuel: 'monthly', trimestriel: 'quarterly', semestriel: 'semiannual', annuel: 'annual', infine: 'annual' };

/** Part de la dette senior affectée à une tranche (les % sont normalisés
 *  s'ils ne totalisent pas 100, pour que tranches et dette nette concordent). */
function trancheAmount(detteSenior, t) {
    const totalPct = tranchesSenior.reduce((s, x) => s + (x.pct || 0), 0);
    return totalPct > 0 ? detteSenior * (t.pct || 0) / totalPct : 0;
}

/** Service de la dette de la 1re année (k€) — moteur commun (taux 0 admis). */
/** Tranche (ou autre financement) au format moteur Covenants (k€). */
function toEngineDebt(t, amount, label = t.label) {
    const infine = t.frequency === 'infine' || t.amortType === 'infine';
    return {
        label,
        amount,
        rate: t.taux || 0,
        durationYears: t.duration || 1,
        amortType: infine ? 'infine' : (t.amortType || 'constant'),
        frequency: FREQ_TO_ENGINE[t.frequency] || 'monthly',
        rateType: t.rateType === 'floating' ? 'floating' : 'fixed',
        customProfile: t.customProfile,
        balloonPct: t.balloonPct,
        deferralMonths: infine ? 0 : Math.max(0, Math.round((t.deferral || 0) * 12))
    };
}

const marketForEngine = () => ({ indexPath: [marketIndex ?? 0], floor: 0 });

/** Service de la dette de la 1re année (k€) — moteur commun (taux 0 et variable admis). */
function computeAnnuity(amount, taux, durationYears, amortType = 'constant', frequency = 'mensuel', t = {}) {
    if (!(amount > 0) || !(durationYears > 0)) return 0;
    const profile = CovenantEngine.debtAnnualProfile(toEngineDebt({ ...t, taux, duration: durationYears, amortType, frequency }, amount), 1, marketForEngine());
    return profile[0]?.service || 0;
}

/** Dettes de la structure (senior + autres financements) au format moteur. */
function structureDebts(c) {
    return [
        ...tranchesSenior.map(t => toEngineDebt(t, trancheAmount(c.detteSenior, t), `Senior ${t.label}`)),
        ...autresFin.map(a => toEngineDebt(a, a.amount || 0, a.label || AUTRE_TYPES[a.type] || 'Financement'))
    ].filter(d => d.amount > 0);
}

/** Annuités A1 des autres financements, mises à jour sans réécrire les lignes (focus conservé). */
function refreshAutresComputed() {
    document.querySelectorAll('#er-autres-body tr[data-section="autres"]').forEach((row, i) => {
        const a = autresFin[i];
        const cell = row.querySelector('.er-computed');
        if (a && cell) cell.textContent = fmtK(computeAnnuity(a.amount || 0, a.taux || 0, a.duration || 1, a.amortType || 'infine', a.frequency || 'annuel', a));
    });
}

function renderAutresRows() {
    if (!autresFin.length) return '<tr><td colspan="10" style="color:var(--text-muted);font-size:0.85rem">Aucun — crédit vendeur, OC, prêt Bpifrance, mezzanine…</td></tr>';
    return autresFin.map((a, i) => `
        <tr data-section="autres" data-index="${i}">
            <td><input class="er-input" type="text" value="${escapeHtml(a.label)}" data-field="label" style="width:120px"></td>
            <td><select class="er-input" data-field="type" style="width:130px;font-size:0.75rem">${Object.entries(AUTRE_TYPES).map(([k, v]) => `<option value="${k}" ${k === a.type ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
            <td style="text-align:right"><input class="er-input narrow" type="number" value="${a.amount || 0}" data-field="amount" step="50" min="0"></td>
            <td><select class="er-input" data-field="rateType" style="width:80px;font-size:0.75rem">${Object.entries(RATE_LABELS).map(([k, v]) => `<option value="${k}" ${k === (a.rateType || 'fixed') ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
            <td style="text-align:right"><input class="er-input narrow" type="number" value="${a.taux || 0}" data-field="taux" step="0.25" min="0" max="30" style="width:70px"></td>
            <td style="text-align:right"><input class="er-input narrow" type="number" value="${a.duration || 1}" data-field="duration" step="1" min="1" style="width:60px"></td>
            <td style="text-align:right"><input class="er-input narrow" type="number" value="${a.deferral || 0}" data-field="deferral" step="1" min="0" max="5" style="width:55px" title="Différé d'amortissement en années, inclus dans la durée (prêt Bpifrance : 1 à 3 ans)"></td>
            <td><select class="er-input" data-field="amortType" style="width:100px;font-size:0.75rem">${Object.entries(AMORT_LABELS).filter(([k]) => k !== 'custom' && k !== 'balloon').map(([k, v]) => `<option value="${k}" ${k === (a.amortType || 'infine') ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
            <td style="text-align:right" class="er-computed">${fmtK(computeAnnuity(a.amount || 0, a.taux || 0, a.duration || 1, a.amortType || 'infine', a.frequency || 'annuel', a))}</td>
            <td style="width:30px"><button class="er-remove-btn" data-action="remove">${X_SVG}</button></td>
        </tr>`).join('');
}

/** Hypothèses de projection pour le dimensionnement : dossier actif sinon EBITDA LTM. */
function sizingProjection() {
    const d = Dossier.get();
    const fc = d?.forecast;
    const years = Math.max(1, Math.min(10, Math.round(sizing.horizon) || 5));
    const ebitdaPath = Array.from({ length: years }, (_, i) => fc?.ebitda?.[i] ?? Math.round(ebitda * Math.pow(1 + sizing.growth / 100, i + 1)));
    const pick = (arr, pct) => ebitdaPath.map((e, i) => (fc && arr?.[i] != null ? arr[i] : e * pct / 100));
    return {
        years,
        ebitda: ebitdaPath,
        tax: pick(fc?.tax, sizing.taxPct),
        capex: pick(fc?.capex, sizing.capexPct),
        wcChange: pick(fc?.wcChange, sizing.wcPct),
        fromDossier: !!fc?.ebitda?.length
    };
}

let lastSizing = null;
/** @type {ReturnType<typeof setTimeout> | undefined} */
let sizingTimer;
function renderSizing(c) {
    const el = document.getElementById('er-sizing-results');
    if (!el) return;
    const proj = sizingProjection();
    const result = CovenantEngine.maxDebt({
        ...proj,
        openingCash: 0,
        tranches: tranchesSenior.map(t => ({ ...toEngineDebt(t, 0, `Senior ${t.label}`), share: t.pct || 0 })),
        otherDebts: autresFin.map(a => toEngineDebt(a, a.amount || 0, a.label)).filter(d => d.amount > 0),
        entryEbitda: ebitda,
        entryNetOther: c.totalAutres + c.totalDetteNonRef - tresorerieMin,
        covenantDscr: sizing.minDscr,
        covenantLeverage: sizing.maxLeverage,
        market: marketForEngine(),
        excludeBullet: true
    });
    // Plancher de fonds propres exigé par les prêteurs (% des emplois)
    const byEquity = Math.max(0, c.totalEmplois * (1 - (sizing.fpMinPct || 0) / 100) - c.totalAutres);
    if (byEquity < result.max) { result.max = byEquity; result.binding = 'equity'; }
    lastSizing = result;
    const fpRequired = Math.max(0, c.totalEmplois - c.totalAutres - result.max);
    const card = (label, value, sub = '') => `<div class="er-kpi-card"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div>${sub ? `<div class="result-sub">${sub}</div>` : ''}</div>`;
    el.innerHTML = [
        card('Max. par le levier', `${fmtK(result.byLeverage)} k€`, `${fmtRatio(sizing.maxLeverage)} × EBITDA − autre dette nette`),
        card('Max. par le DSCR', `${fmtK(result.byDscr)} k€`, `DSCR ≥ ${fmtRatio(sizing.minDscr)} sur ${proj.years} ans${proj.fromDossier ? ' (BP du dossier)' : ''}`),
        card('Dette senior maximale', `<span style="color:var(--link)">${fmtK(result.max)} k€</span>`, `contrainte liante : ${({ dscr: 'DSCR', leverage: 'levier', equity: `fonds propres ≥ ${sizing.fpMinPct} %` })[result.binding]} · actuelle ${fmtK(c.detteSenior)} k€`),
        card('Fonds propres requis', `${fmtK(fpRequired)} k€`, `${c.totalEmplois > 0 ? fmtPct(fpRequired / c.totalEmplois * 100) : '—'} des emplois`)
    ].join('');
}

function renderTranchesRows(c) {
    return tranchesSenior.map((t, i) => {
        const amount = trancheAmount(c.detteSenior, t);
        const annuity = computeAnnuity(amount, t.taux || 0, t.duration || 1, t.amortType || 'constant', t.frequency || 'mensuel', t);
        const selAmort = () => Object.entries(AMORT_LABELS).map(([k, v]) => `<option value="${k}" ${k === (t.amortType || 'constant') ? 'selected' : ''}>${v}</option>`).join('');
        const selFreq = () => Object.entries(FREQ_LABELS).map(([k, v]) => `<option value="${k}" ${k === (t.frequency || 'mensuel') ? 'selected' : ''}>${v}</option>`).join('');
        return `
        <tr data-section="tranches" data-index="${i}">
            <td><input class="er-input" type="text" value="${escapeHtml(t.label)}" data-field="label" style="width:70px"></td>
            <td style="text-align:right"><input class="er-input narrow" type="number" value="${t.pct}" data-field="pct" step="5" min="0" max="100"></td>
            <td style="text-align:right"><input class="er-input narrow" type="number" value="${t.duration}" data-field="duration" step="1" min="1"></td>
            <td style="text-align:right"><input class="er-input narrow" type="number" value="${t.deferral || 0}" data-field="deferral" step="1" min="0" max="5" style="width:55px" title="Différé d'amortissement en années, inclus dans la durée : intérêts seuls"></td>
            <td><select class="er-input" data-field="rateType" style="width:80px;font-size:0.75rem">${Object.entries(RATE_LABELS).map(([k, v]) => `<option value="${k}" ${k === (t.rateType || 'fixed') ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
            <td style="text-align:right"><input class="er-input narrow" type="number" value="${t.taux || 0}" data-field="taux" step="0.05" min="0" max="50" style="width:70px" title="${t.rateType === 'floating' ? 'Marge sur Euribor 3M' : 'Taux fixe'}"></td>
            <td><select class="er-input" data-field="amortType" style="width:100px;font-size:0.75rem">${selAmort()}</select>
                ${t.amortType === 'custom' ? `<input class="er-input" type="text" data-field="customProfile" value="${escapeHtml((t.customProfile || []).join('/'))}" placeholder="10/15/20/25/30" style="width:100px;margin-top:4px" title="% du nominal amorti par année">` : ''}
                ${t.amortType === 'balloon' ? `<input class="er-input narrow" type="number" data-field="balloonPct" value="${t.balloonPct ?? 30}" min="0" max="100" step="5" style="width:60px;margin-top:4px" title="Ballon final (% du nominal)">` : ''}</td>
            <td><select class="er-input" data-field="frequency" style="width:100px;font-size:0.75rem">${selFreq()}</select></td>
            <td style="text-align:right" class="er-computed" data-computed="amount">${fmtK(amount)}</td>
            <td style="text-align:right" class="er-computed" data-computed="annuity">${fmtK(annuity)}</td>
            <td style="width:30px">${tranchesSenior.length > 1 ? `<button class="er-remove-btn" data-action="remove">${X_SVG}</button>` : ''}</td>
        </tr>
    `}).join('');
}

// ── Recalculate and update display ──
function recalculate() {
    const c = compute();

    // Emplois total
    const elTotalEmplois = document.getElementById('er-total-emplois');
    if (elTotalEmplois) elTotalEmplois.textContent = fmtK(c.totalEmplois);

    // Ressources
    const elFPPct = document.getElementById('er-fp-pct');
    const elSeniorAmount = document.getElementById('er-senior-amount');
    const elSeniorPct = document.getElementById('er-senior-pct');
    const elTotalRessources = document.getElementById('er-total-ressources');

    if (elFPPct) {
        elFPPct.textContent = fmtPct(c.pctFP);
        elFPPct.title = c.excesFP > 0 ? `Fonds propres supérieurs aux emplois de ${fmtK(c.excesFP)} k€ : aucune dette senior nécessaire` : '';
        elFPPct.style.color = c.excesFP > 0 ? 'var(--warning)' : '';
    }
    if (elSeniorAmount) elSeniorAmount.textContent = fmtK(c.detteSenior);
    if (elSeniorPct) elSeniorPct.textContent = fmtPct(c.pctSenior);
    if (elTotalRessources) elTotalRessources.textContent = fmtK(c.totalEmplois);

    // Balance bar
    const bar = document.getElementById('er-balance-bar');
    if (bar && c.totalEmplois > 0) {
        const fpW = Math.max(c.pctFP, 2);
        const senW = Math.max(c.pctSenior, 2);
        bar.innerHTML = `
            <div class="bar-fp" style="width:${fpW}%">${c.pctFP > 8 ? 'FP ' + fmtPct(c.pctFP) : ''}</div>
            <div class="bar-senior" style="width:${senW}%">${c.pctSenior > 8 ? 'Senior ' + fmtPct(c.pctSenior) : ''}</div>
        `;
    }

    // Tranches amounts
    // Mise à jour en place des cellules calculées : réécrire le tableau à
    // chaque frappe faisait perdre le focus (impossible de taper « 3,75 »)
    const tbody = document.getElementById('er-tranches-body');
    if (tbody) {
        const rows = tbody.querySelectorAll('tr[data-section="tranches"]');
        if (rows.length !== tranchesSenior.length) {
            tbody.innerHTML = renderTranchesRows(c);
        } else {
            rows.forEach((row, i) => {
                const t = tranchesSenior[i];
                const amount = trancheAmount(c.detteSenior, t);
                const amountCell = row.querySelector('[data-computed="amount"]');
                const annuityCell = row.querySelector('[data-computed="annuity"]');
                if (amountCell) amountCell.textContent = fmtK(amount);
                if (annuityCell) annuityCell.textContent = fmtK(computeAnnuity(amount, t.taux || 0, t.duration || 1, t.amortType || 'constant', t.frequency || 'mensuel', t));
            });
        }
    }

    // Tranches total % warning
    const totalPct = tranchesSenior.reduce((s, t) => s + t.pct, 0);
    const pctWarn = document.getElementById('er-tranches-pct-warn');
    if (pctWarn) {
        pctWarn.style.display = totalPct !== 100 ? 'block' : 'none';
        pctWarn.textContent = `⚠ Total = ${totalPct}% — montants recalculés au prorata (vérifiez la répartition)`;
    }

    // Dette non refinancée sous-total
    const elDnrTotal = document.getElementById('er-dnr-total');
    if (elDnrTotal) elDnrTotal.textContent = fmtK(c.totalDetteNonRef);

    // Annuité totale
    const totalAnnuity = tranchesSenior.reduce((sum, t) => {
        const amount = trancheAmount(c.detteSenior, t);
        return sum + computeAnnuity(amount, t.taux || 0, t.duration || 1, t.amortType || 'constant', t.frequency || 'mensuel', t);
    }, 0) + autresFin.reduce((sum, a) => sum + computeAnnuity(a.amount || 0, a.taux || 0, a.duration || 1, a.amortType || 'infine', a.frequency || 'annuel', a), 0);

    // Autres financements : total et part des ressources
    const elAutres = document.getElementById('er-autres-amount');
    if (elAutres) elAutres.textContent = fmtK(c.totalAutres);
    const elAutresPct = document.getElementById('er-autres-pct');
    if (elAutresPct) elAutresPct.textContent = fmtPct(c.pctAutres);
    // Dimensionnement (≈ 50 projections) : 150 ms après la dernière frappe
    clearTimeout(sizingTimer);
    if (!lastSizing) renderSizing(c);
    else sizingTimer = setTimeout(() => renderSizing(compute()), 150);
    const elAnnuityTotal = document.getElementById('er-annuity-total');
    if (elAnnuityTotal) elAnnuityTotal.textContent = fmtK(totalAnnuity);

    // KPIs
    const setKpi = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setKpi('kpi-ve', fmtK(c.veRetenue));
    setKpi('kpi-df-closing', fmtK(c.detteFinClosing));
    // DFN négative = trésorerie nette : libellé et signe lisibles
    setKpi('kpi-dfn', fmtK(Math.abs(c.dfn)));
    const dfnLabel = document.getElementById('kpi-dfn')?.closest('.er-kpi-card')?.querySelector('.kpi-label');
    if (dfnLabel) dfnLabel.textContent = c.dfn < 0 ? 'Trésorerie nette' : 'DFN';
    setKpi('kpi-levier', c.ratioLevier == null ? 'n.s.' : fmtRatio(c.ratioLevier));
    setKpi('kpi-annuity-total', fmtK(totalAnnuity));

    // Store last result
    lastResult = {
        type: 'structured',
        params: { ebitda, fondsPropres, tresorerieMin, emplois: [...emplois], detteNonRef: [...detteNonRef], tranchesSenior: tranchesSenior.map(t => ({ ...t })), autresFin: autresFin.map(a => ({ ...a })), sizing: { ...sizing } },
        results: { ...c }
    };
    Draft.save('structured', lastResult.params);
}

// ── Input handler (delegated) ──
function handleTableInput(e) {
    const input = e.target.closest('.er-input');
    if (!input) return;
    const row = input.closest('tr');
    if (!row) return;

    const section = row.dataset.section;
    const index = parseInt(row.dataset.index);
    const field = input.dataset.field;
    if (field === undefined) return;

    const isSelect = input.tagName === 'SELECT';
    const isText = field === 'label' || isSelect;
    const val = isText ? input.value : (parseFloat(input.value) || 0);

    const parsed = field === 'customProfile'
        ? String(input.value).split(/[/;|]/).map(v => Financial.parseNumber(v)).filter(v => !isNaN(v))
        : val;
    if (section === 'emplois' && emplois[index]) emplois[index][field] = parsed;
    else if (section === 'detteNonRef' && detteNonRef[index]) detteNonRef[index][field] = parsed;
    else if (section === 'tranches' && tranchesSenior[index]) tranchesSenior[index][field] = parsed;
    else if (section === 'autres' && autresFin[index]) autresFin[index][field] = parsed;

    // Profil libre sans profil saisi : répartition linéaire par défaut (sinon
    // tout tomberait à l'échéance, comme un in fine)
    if (field === 'amortType' && parsed === 'balloon') {
        const target = section === 'tranches' ? tranchesSenior[index] : null;
        if (target && target.balloonPct == null) target.balloonPct = 30;
    }
    if (field === 'amortType' && parsed === 'custom') {
        const target = section === 'tranches' ? tranchesSenior[index] : section === 'autres' ? autresFin[index] : null;
        if (target && !(target.customProfile || []).length) {
            const n = Math.max(1, Math.round(target.duration || 1));
            target.customProfile = Array.from({ length: n }, () => Math.round(100 / n * 10) / 10);
        }
    }

    // Nature « Prêt Bpifrance » : structure usuelle proposée (7 ans dont 2 de
    // différé, échéances constantes trimestrielles), modifiable ensuite
    const bpiPreset = e.type === 'change' && section === 'autres' && field === 'type' && parsed === 'bpi' && autresFin[index];
    if (bpiPreset) Object.assign(autresFin[index], { duration: 7, deferral: 2, amortType: 'constant', frequency: 'trimestriel', ...(autresFin[index].label === 'Crédit vendeur' ? { label: 'Prêt Bpifrance' } : {}) });

    // Changement de nature de taux / d'amortissement : la ligne change de forme
    if (e.type === 'change' && (field === 'rateType' || field === 'amortType' || bpiPreset)) {
        const body = row.parentElement;
        if (section === 'tranches' && body) body.innerHTML = renderTranchesRows(compute());
        if (section === 'autres' && body) body.innerHTML = renderAutresRows();
    }

    recalculate();
}

// ── Remove handler ──
function handleRemove(e) {
    const btn = e.target.closest('[data-action="remove"]');
    if (!btn) return;
    const row = btn.closest('tr');
    if (!row) return;

    const section = row.dataset.section;
    const index = parseInt(row.dataset.index);

    if (section === 'emplois' && emplois.length > 1) {
        emplois.splice(index, 1);
        document.getElementById('er-emplois-body').innerHTML = renderEmploisRows();
    } else if (section === 'detteNonRef' && detteNonRef.length > 1) {
        detteNonRef.splice(index, 1);
        document.getElementById('er-dnr-body').innerHTML = renderDetteNonRefRows();
    } else if (section === 'tranches' && tranchesSenior.length > 1) {
        tranchesSenior.splice(index, 1);
    } else if (section === 'autres') {
        autresFin.splice(index, 1);
        document.getElementById('er-autres-body').innerHTML = renderAutresRows();
    }

    recalculate();
}

// ── Save simulation ──
function saveSimulation() {
    if (!lastResult) {
        recalculate();
    }

    const body = document.getElementById('modal-body');
    const defaultName = `Emplois-Ressources — ${fmtK(lastResult.results.totalEmplois)} k€`;

    body.innerHTML = `
        <h2 style="margin-bottom:20px">Sauvegarder la simulation</h2>
        <div class="form-group" style="margin-bottom:16px">
            <label class="form-label">Nom de la simulation</label>
            <input type="text" class="form-input" id="save-sf-name" value="${escapeHtml(defaultName)}" style="width:100%">
        </div>
        <div class="form-group" style="margin-bottom:24px">
            <label class="form-label">Notes (optionnel)</label>
            <textarea class="form-input notes-input" id="save-sf-notes" rows="3" placeholder="Ajoutez des notes ou commentaires..."></textarea>
        </div>
        <div class="btn-group" style="justify-content:flex-end">
            <button class="btn btn-outline" id="save-sf-cancel">Annuler</button>
            <button class="btn btn-primary" id="save-sf-confirm">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/></svg>
                Sauvegarder
            </button>
        </div>
    `;

    Dialog.show();
    document.getElementById('save-sf-name')?.focus();

    document.getElementById('save-sf-cancel')?.addEventListener('click', () => Dialog.close());
    document.getElementById('save-sf-confirm')?.addEventListener('click', () => {
        const name = document.getElementById('save-sf-name')?.value || defaultName;
        const notes = document.getElementById('save-sf-notes')?.value || '';

        const id = Storage.saveSimulation({
            ...lastResult,
            name,
            notes,
            typeLabel: 'Financement Structuré'
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
function shareStructured() {
    if (!lastResult) recalculate();
    Share.copyLink('structured', { type: 'structured', params: lastResult.params });
}

// ── Export Excel ──
/**
 * PDF du plan de financement, sur le modèle des mémos Emplois / Ressources :
 * Emplois et Ressources côte à côte, position au closing, ratios, conditions
 * des financements, puis service de la dette par ligne et par année.
 */
function exportPdf() {
    if (!lastResult) recalculate();
    const c = lastResult.results;
    const k = v => fmtK(v);
    const pct = (v, d = 1) => `${Financial.formatNumber(v, d)} %`;
    const x = v => (ebitda > 0 ? fmtRatio(v / ebitda) : 'n.s.');
    const share = v => (c.totalEmplois > 0 ? pct(v / c.totalEmplois * 100, 0) : '');
    const client = Dossier.get()?.name || '';
    const debts = structureDebts(c);
    const market = marketForEngine();

    // ── Emplois | Ressources ──
    const emploisRows = [...emplois.map(e => [e.label, k(e.amount), share(e.amount)]), ['Total', k(c.totalEmplois), '100 %']];
    const ressRows = [];
    const bold = [];
    ressRows.push(['Fonds propres', k(Math.min(fondsPropres, c.totalEmplois)), '', pct(c.pctFP, 0)]);
    autresFin.filter(a => (a.amount || 0) > 0).forEach(a => ressRows.push([a.label || AUTRE_TYPES[a.type] || 'Financement', k(a.amount), x(a.amount), share(a.amount)]));
    bold.push(ressRows.length);
    ressRows.push(['Dette senior', k(c.detteSenior), x(c.detteSenior), pct(c.pctSenior, 0)]);
    c.tranchesDetail.forEach(t => ressRows.push([`   Tranche ${t.label} — ${t.duration} ans`, k(t.amount), '', share(t.amount)]));
    ressRows.push(['Total', k(c.totalEmplois), '', '100 %']);

    // ── Service de la dette par ligne et par année (moteur Covenants) ──
    const years = Math.min(10, Math.max(1, Math.ceil(Math.max(...debts.map(d => d.durationYears), 1))));
    const profiles = debts.map(d => ({ label: d.label, rows: CovenantEngine.debtAnnualProfile(d, years, market) }));
    const yearHead = Array.from({ length: years }, (_, i) => `A${i + 1}`);
    const byYear = field => {
        const rows = profiles.map(p => [p.label, ...p.rows.map(r => k(r[field])), k(p.rows.reduce((s, r) => s + r[field], 0))]);
        const totals = Array.from({ length: years }, (_, i) => profiles.reduce((s, p) => s + (p.rows[i]?.[field] || 0), 0));
        rows.push(['Total', ...totals.map(k), k(totals.reduce((s, v) => s + v, 0))]);
        return rows;
    };
    const serviceA1 = profiles.reduce((s, p) => s + (p.rows[0]?.service || 0), 0);
    const servicePeak = Array.from({ length: years }, (_, i) => profiles.reduce((s, p) => s + (p.rows[i]?.service || 0), 0))
        .reduce((m, v, i) => (v > m.v ? { v, i } : m), { v: 0, i: 0 });

    const sections = [
        { type: 'title', text: 'Analyse Emplois / Ressources', subtitle: `Montants en k€ · EBITDA de référence ${k(ebitda)} k€` },
        { type: 'columns',
            left: { headers: ['Emplois', 'Montant (k€)', '%'], rows: emploisRows, totalFill: 'navy' },
            right: { headers: ['Ressources', 'Montant (k€)', 'x EBITDA', '%'], rows: ressRows, totalFill: 'navy', boldRows: bold } },
        ...(c.excesFP > 0 ? [{ type: 'note', text: `Les fonds propres dépassent le besoin de ${k(c.excesFP)} k€ : les ressources sont plafonnées aux emplois.` }] : []),
        { type: 'title', text: 'Position au closing et ratios' },
        { type: 'kpicards', items: [
            { label: 'Dette financière au closing', value: `${k(c.detteFinClosing)} k€`, sub: `dont non refinancée ${k(c.totalDetteNonRef)} k€` },
            { label: c.dfn < 0 ? 'Trésorerie nette' : 'Dette financière nette', value: `${k(Math.abs(c.dfn))} k€`, sub: `trésorerie au closing ${k(tresorerieMin)} k€` },
            { label: 'Levier brut', value: x(c.detteFinClosing), sub: 'dette financière / EBITDA' },
            { label: 'Levier net', value: c.ratioLevier == null ? 'n.s.' : fmtRatio(c.ratioLevier), sub: 'dette nette / EBITDA' },
            { label: 'Service de la dette année 1', value: `${k(serviceA1)} k€`, sub: 'capital + intérêts' },
            { label: 'Service de la dette maximal', value: `${k(servicePeak.v)} k€`, sub: `année ${servicePeak.i + 1}` },
            { label: 'EBITDA / service année 1', value: serviceA1 > 0 ? fmtRatio(ebitda / serviceA1) : 'n.s.', sub: 'avant IS, capex et BFR' },
            { label: 'VE retenue', value: `${k(c.veRetenue)} k€`, sub: ebitda > 0 ? `${fmtRatio(c.veRetenue / ebitda)} l’EBITDA` : '' }
        ] }
    ];
    if (lastSizing) {
        sections.push({ type: 'note', title: 'Capacité d’endettement', text: `Dette senior maximale : ${k(lastSizing.max)} k€ (contrainte liante : ${({ dscr: 'DSCR', leverage: 'levier', equity: 'fonds propres minimum' })[lastSizing.binding] || lastSizing.binding}). Maximum par le levier : ${k(lastSizing.byLeverage)} k€ ; maximum par le DSCR : ${k(lastSizing.byDscr)} k€.` });
    }

    sections.push({ type: 'title', text: 'Conditions des financements', subtitle: 'Montants en k€' });
    sections.push({ type: 'table', headers: ['Ligne', 'Montant', 'Taux / marge', 'Durée', 'Différé', 'Amortissement', 'Périodicité', 'Annuité A1'],
        rows: [
            ...c.tranchesDetail.map(t => [`Senior ${t.label}`, k(t.amount), `${pct(t.taux || 0, 2)}${t.rateType === 'floating' ? ' + Euribor' : ''}`, `${t.duration} ans`, t.deferral ? `${t.deferral} an${t.deferral > 1 ? 's' : ''}` : '—', AMORT_LABELS[t.amortType] || 'Constant', FREQ_LABELS[t.frequency] || 'Mensuel',
                k(computeAnnuity(t.amount, t.taux || 0, t.duration || 1, t.amortType || 'constant', t.frequency || 'mensuel', t))]),
            ...autresFin.filter(a => (a.amount || 0) > 0).map(a => [a.label || AUTRE_TYPES[a.type] || 'Financement', k(a.amount), `${pct(a.taux || 0, 2)}${a.rateType === 'floating' ? ' + Euribor' : ''}`, `${a.duration || 1} ans`, a.deferral ? `${a.deferral} an${a.deferral > 1 ? 's' : ''}` : '—', AMORT_LABELS[a.amortType] || 'In Fine', FREQ_LABELS[a.frequency] || 'Annuel',
                k(computeAnnuity(a.amount || 0, a.taux || 0, a.duration || 1, a.amortType || 'infine', a.frequency || 'annuel', a))])
        ] });

    if (profiles.length) {
        sections.push({ type: 'title', text: 'Amortissement du capital', subtitle: 'k€ par année depuis le closing' });
        sections.push({ type: 'table', headers: ['Ligne \\ Année', ...yearHead, 'Total'], rows: byYear('principal') });
        sections.push({ type: 'title', text: 'Intérêts', subtitle: `k€ par année${debts.some(d => d.rateType === 'floating') ? ' · taux variable : Euribor 3M du jour maintenu, floor à 0 %' : ''}` });
        sections.push({ type: 'table', headers: ['Ligne \\ Année', ...yearHead, 'Total'], rows: byYear('interest') });
        sections.push({ type: 'title', text: 'Service de la dette', subtitle: 'Capital + intérêts, k€ par année' });
        sections.push({ type: 'table', headers: ['Ligne \\ Année', ...yearHead, 'Total'], rows: byYear('service'),
            note: years < Math.ceil(Math.max(...debts.map(d => d.durationYears))) ? `Tableau limité aux ${years} premières années.` : '' });
    }
    if (detteNonRef.some(d => d.amount > 0)) {
        sections.push({ type: 'title', text: 'Dette non refinancée', subtitle: 'Conservée au closing, k€' });
        sections.push({ type: 'table', headers: ['Dette', 'Montant'], rows: [...detteNonRef.map(d => [d.label, k(d.amount)]), ['Total', k(c.totalDetteNonRef)]] });
    }

    Export.toPdf(`Financement structuré${client ? ' — ' + client : ''}`, sections, 'financement_structure', {
        cover: { kind: 'Financement structuré', client, subtitle: 'Analyse Emplois / Ressources', items: [
            { label: 'Total emplois', value: `${k(c.totalEmplois)} k€` },
            { label: 'Dette senior', value: `${k(c.detteSenior)} k€` },
            { label: 'Levier net', value: c.ratioLevier == null ? 'n.s.' : fmtRatio(c.ratioLevier) }
        ] }
    });
}

function exportExcel() {
    if (typeof XLSX === 'undefined') {
        window.showToast?.('Outils d\u2019export Excel indisponibles (connexion ?) — réessayez', 'error');
        return;
    }
    if (!lastResult) recalculate();

    const c = lastResult.results;
    const wb = XLSX.utils.book_new();
    const rows = [];

    // EBITDA
    rows.push(['EBITDA LTM', ebitda]);
    rows.push([]);

    // EMPLOIS
    rows.push(['EMPLOIS (Uses)', '', '']);
    emplois.forEach(e => rows.push([e.label, e.amount]));
    rows.push(['TOTAL EMPLOIS', c.totalEmplois]);
    rows.push([]);

    // RESSOURCES
    rows.push(['RESSOURCES (Sources)', 'Montant', '%']);
    rows.push(['Fonds Propres', fondsPropres, c.pctFP / 100]);
    rows.push(['Autres financements', c.totalAutres, c.pctAutres / 100]);
    rows.push(['Dette Senior', c.detteSenior, c.pctSenior / 100]);
    rows.push(['TOTAL RESSOURCES', c.totalEmplois, 1]);
    rows.push([]);

    // Tranches
    rows.push(['TRANCHES DETTE SENIOR', '% Senior', 'Durée (ans)', 'Taux (%)', 'Amortissement', 'Fréquence', 'Montant', 'Annuité', 'Différé (ans)']);
    c.tranchesDetail.forEach(t => {
        const annuity = computeAnnuity(t.amount, t.taux || 0, t.duration || 1, t.amortType || 'constant', t.frequency || 'mensuel', t);
        rows.push([`Tranche ${t.label}`, t.pct / 100, t.duration, (t.taux || 0) / 100, AMORT_LABELS[t.amortType] || 'Constant', FREQ_LABELS[t.frequency] || 'Mensuel', t.amount, annuity, t.deferral || 0]);
    });
    rows.push([]);

    // Autres financements
    if (autresFin.length) {
        rows.push(['AUTRES FINANCEMENTS', 'Nature', 'Montant', 'Taux / marge (%)', 'Durée (ans)', 'Différé (ans)', 'Amortissement', 'Annuité A1']);
        autresFin.forEach(a => rows.push([a.label, AUTRE_TYPES[a.type] || '', a.amount || 0, a.taux || 0, a.duration || 1, a.deferral || 0, AMORT_LABELS[a.amortType] || 'In Fine',
            computeAnnuity(a.amount || 0, a.taux || 0, a.duration || 1, a.amortType || 'infine', a.frequency || 'annuel', a)]));
        rows.push([]);
    }

    // Dette non refinancée
    rows.push(['DETTE NON REFINANCÉE']);
    detteNonRef.forEach(d => rows.push([d.label, d.amount]));
    rows.push(['Ss Total', c.totalDetteNonRef]);
    rows.push([]);

    // Trésorerie
    rows.push(['Trésorerie Minimum au Closing', -tresorerieMin]);
    rows.push([]);

    // KPIs
    rows.push(['--- INDICATEURS CLÉS ---']);
    rows.push(['VE retenue (VT + DNR - Tréso)', c.veRetenue]);
    rows.push(['Dette Financière au Closing', c.detteFinClosing]);
    rows.push(['DFN (Dette Fin. Nette)', c.dfn]);
    rows.push(['Ratio Levier Net (DFN / EBITDA)', c.ratioLevier ?? 'n.s.']);
    if (lastSizing) {
        rows.push([]);
        rows.push(['--- CAPACITÉ D\'ENDETTEMENT SENIOR ---']);
        rows.push(['Hypothèses', `levier net ≤ ${sizing.maxLeverage}x, DSCR ≥ ${sizing.minDscr}x sur ${sizing.horizon} ans, fonds propres ≥ ${sizing.fpMinPct} % des emplois`]);
        rows.push(['Max. par le levier', Math.round(lastSizing.byLeverage)]);
        rows.push(['Max. par le DSCR', Math.round(lastSizing.byDscr)]);
        rows.push(['Dette senior maximale', Math.round(lastSizing.max)]);
        rows.push(['Contrainte liante', ({ dscr: 'DSCR', leverage: 'Levier', equity: 'Fonds propres minimum' })[lastSizing.binding]]);
    }
    rows.push([]);
    rows.push(['Document de travail — simulation indicative, ne constitue pas un engagement de financement. Montants en k€.']);

    const ws = XLSX.utils.aoa_to_sheet(rows);

    // Column widths
    ws['!cols'] = [{ wch: 32 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];

    XLSX.utils.book_append_sheet(wb, ws, 'Emplois-Ressources');
    XLSX.writeFile(wb, `emplois_ressources_${new Date().toISOString().slice(0, 10)}.xlsx`);
    window.showToast?.('Export Excel téléchargé', 'success');
}

// ── Load from history ──
function loadFromHistory() {
    const pending = window._pendingReload;
    if (!pending || pending.type !== 'structured') return;
    window._pendingReload = null;

    const p = pending.params;
    if (p) {
        if (p.ebitda !== undefined) ebitda = p.ebitda;
        if (p.fondsPropres !== undefined) fondsPropres = p.fondsPropres;
        if (p.tresorerieMin !== undefined) tresorerieMin = p.tresorerieMin;
        // Champs numériques convertis : un lien partagé ne peut pas injecter de
        // texte dans les attributs value="…" des lignes
        const n = v => (isFinite(parseFloat(v)) ? parseFloat(v) : 0);
        const nums = arr => (Array.isArray(arr) ? arr.map(n) : undefined);
        if (Array.isArray(p.emplois)) emplois = p.emplois.map(e => ({ ...e, label: String(e.label ?? ''), amount: n(e.amount) }));
        if (Array.isArray(p.detteNonRef)) detteNonRef = p.detteNonRef.map(d => ({ ...d, label: String(d.label ?? ''), amount: n(d.amount) }));
        if (Array.isArray(p.tranchesSenior)) tranchesSenior = p.tranchesSenior.map(t => ({ ...t, label: String(t.label ?? ''), pct: n(t.pct), duration: n(t.duration) || 1, deferral: Math.max(0, n(t.deferral)), taux: n(t.taux), balloonPct: t.balloonPct != null ? n(t.balloonPct) : undefined, customProfile: nums(t.customProfile) }));
        if (Array.isArray(p.autresFin)) autresFin = p.autresFin.map(a => ({ ...a, label: String(a.label ?? ''), amount: n(a.amount), duration: n(a.duration) || 1, taux: n(a.taux), deferral: Math.max(0, n(a.deferral)) }));
        if (p.sizing && typeof p.sizing === 'object') sizing = { ...sizing, ...p.sizing };
    }

    // Re-render dynamic parts
    const elEbitda = document.getElementById('er-ebitda');
    const elFP = document.getElementById('er-fp-amount');
    const elTreso = document.getElementById('er-treso');

    if (elEbitda) elEbitda.value = ebitda;
    if (elFP) elFP.value = fondsPropres;
    if (elTreso) elTreso.value = tresorerieMin;

    document.getElementById('er-emplois-body').innerHTML = renderEmploisRows();
    document.getElementById('er-dnr-body').innerHTML = renderDetteNonRefRows();
    const tranchesBody = document.getElementById('er-tranches-body');
    if (tranchesBody) tranchesBody.innerHTML = renderTranchesRows(compute());
    const autresBody = document.getElementById('er-autres-body');
    if (autresBody) autresBody.innerHTML = renderAutresRows();
    document.querySelectorAll('.er-sizing').forEach(inp => { inp.value = sizing[inp.dataset.field]; });

    recalculate();
}

// ── Module export ──
export const StructuredModule = {
    render() {
        const c = compute();

        return `
            <div class="page-header">
                <h1>Financement Structuré</h1>
                <p>Tableau Emplois-Ressources — Modélisation Sources & Uses</p>
            </div>
            ${DossierBar.html('structured')}

            <!-- Données de référence -->
            <div class="card section">
                <div class="card-title">Données de référence</div>
                <div class="form-row" style="margin-top:12px">
                    <div class="form-group">
                        <label class="form-label">EBITDA LTM (k€)</label>
                        <input type="number" class="form-input" id="er-ebitda" value="${ebitda}" step="50">
                    </div>
                </div>
            </div>

            <!-- Emplois / Ressources grid -->
            <div class="er-grid section">
                <!-- EMPLOIS -->
                <div class="er-section">
                    <div class="er-section-header emplois">Emplois (Uses)</div>
                    <table class="er-table">
                        <thead><tr><th>Libellé</th><th style="text-align:right">Montant (k€)</th><th></th></tr></thead>
                        <tbody id="er-emplois-body">
                            ${renderEmploisRows()}
                        </tbody>
                        <tfoot>
                            <tr class="er-total-row">
                                <td>TOTAL EMPLOIS</td>
                                <td style="text-align:right" id="er-total-emplois">${fmtK(c.totalEmplois)}</td>
                                <td></td>
                            </tr>
                        </tfoot>
                    </table>
                    <button class="er-add-btn" id="er-add-emploi">${PLUS_SVG} Ajouter un emploi</button>
                </div>

                <!-- RESSOURCES -->
                <div class="er-section">
                    <div class="er-section-header ressources">Ressources (Sources)</div>
                    <table class="er-table">
                        <thead><tr><th>Source</th><th style="text-align:right">Montant (k€)</th><th style="text-align:right">%</th></tr></thead>
                        <tbody>
                            <tr>
                                <td>Fonds Propres</td>
                                <td style="text-align:right"><input class="er-input narrow" type="number" id="er-fp-amount" value="${fondsPropres}" step="50"></td>
                                <td style="text-align:right" class="er-pct" id="er-fp-pct">${fmtPct(c.pctFP)}</td>
                            </tr>
                            <tr>
                                <td>Autres financements</td>
                                <td style="text-align:right" class="er-computed" id="er-autres-amount">${fmtK(c.totalAutres)}</td>
                                <td style="text-align:right" class="er-pct" id="er-autres-pct">${fmtPct(c.pctAutres)}</td>
                            </tr>
                            <tr>
                                <td>Dette Senior <span style="font-size:0.75rem;color:var(--text-muted)">(solde)</span></td>
                                <td style="text-align:right" class="er-computed" id="er-senior-amount">${fmtK(c.detteSenior)}</td>
                                <td style="text-align:right" class="er-pct" id="er-senior-pct">${fmtPct(c.pctSenior)}</td>
                            </tr>
                        </tbody>
                        <tfoot>
                            <tr class="er-total-row">
                                <td>TOTAL RESSOURCES</td>
                                <td style="text-align:right" id="er-total-ressources">${fmtK(c.totalEmplois)}</td>
                                <td style="text-align:right" class="er-pct">100%</td>
                            </tr>
                        </tfoot>
                    </table>

                    <!-- Balance bar -->
                    <div class="er-balance-bar" id="er-balance-bar">
                        <div class="bar-fp" style="width:${Math.max(c.pctFP, 2)}%">${c.pctFP > 8 ? 'FP ' + fmtPct(c.pctFP) : ''}</div>
                        <div class="bar-senior" style="width:${Math.max(c.pctSenior, 2)}%">${c.pctSenior > 8 ? 'Senior ' + fmtPct(c.pctSenior) : ''}</div>
                    </div>
                </div>
            </div>

            <!-- Tranches Senior -->
            <div class="card section">
                <div class="card-header">
                    <div class="card-title">Tranches de la dette senior</div>
                    <button class="btn btn-sm btn-outline" id="er-add-tranche">${PLUS_SVG} Ajouter tranche</button>
                </div>
                <div class="table-container" style="margin-top:12px">
                    <table class="er-table">
                        <thead>
                            <tr>
                                <th>Tranche</th>
                                <th style="text-align:right">% Senior</th>
                                <th style="text-align:right">Durée (ans)</th>
                                <th style="text-align:right" title="Différé d'amortissement, inclus dans la durée">Différé (ans)</th>
                                <th>Taux</th>
                                <th style="text-align:right">Taux / marge (%)</th>
                                <th>Amortissement</th>
                                <th>Fréquence</th>
                                <th style="text-align:right">Montant (k€)</th>
                                <th style="text-align:right">Annuité (k€)</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody id="er-tranches-body">
                            ${renderTranchesRows(c)}
                        </tbody>
                        <tfoot>
                            <tr class="er-total-row">
                                <td colspan="8">Total (senior + autres financements)</td>
                                <td style="text-align:right" id="er-annuity-total">—</td>
                                <td></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
                <div id="er-tranches-pct-warn" style="color:var(--warning);font-size:0.8rem;margin:8px 12px;display:none"></div>
            </div>

            <!-- Autres financements -->
            <div class="card section">
                <div class="card-header">
                    <div class="card-title">Autres financements (hors senior)</div>
                    <button class="btn btn-sm btn-outline" id="er-add-bpi" title="7 ans dont 2 ans de différé, échéances constantes trimestrielles">${PLUS_SVG} Prêt Bpifrance</button>
                    <button class="btn btn-sm btn-outline" id="er-add-autre">${PLUS_SVG} Ajouter</button>
                </div>
                <div class="table-container" style="margin-top:12px">
                    <table class="er-table">
                        <thead><tr><th>Libellé</th><th>Nature</th><th style="text-align:right">Montant (k€)</th><th>Taux</th><th style="text-align:right">Taux / marge (%)</th><th style="text-align:right">Durée (ans)</th><th style="text-align:right" title="Différé d'amortissement, inclus dans la durée">Différé (ans)</th><th>Amortissement</th><th style="text-align:right">Annuité A1 (k€)</th><th></th></tr></thead>
                        <tbody id="er-autres-body">${renderAutresRows()}</tbody>
                    </table>
                </div>
                <p style="font-size:0.8rem;color:var(--text-muted);margin:8px 12px 0">Ces financements réduisent la dette senior (solde des emplois) et entrent dans la dette nette et le service de la dette. Les OC sont traitées comme de la dette tant qu'elles ne sont pas converties.</p>
            </div>

            <!-- Dimensionnement de la dette -->
            <div class="card section">
                <div class="card-title">Capacité d'endettement senior</div>
                <div class="form-row" style="margin-top:12px;flex-wrap:wrap">
                    <div class="form-group"><label class="form-label">Levier net max à l'entrée (x)</label><input type="number" class="form-input er-sizing" data-field="maxLeverage" value="${sizing.maxLeverage}" step="0.25"></div>
                    <div class="form-group"><label class="form-label">DSCR minimum (x)</label><input type="number" class="form-input er-sizing" data-field="minDscr" value="${sizing.minDscr}" step="0.05"></div>
                    <div class="form-group"><label class="form-label">Fonds propres min. (% emplois)</label><input type="number" class="form-input er-sizing" data-field="fpMinPct" value="${sizing.fpMinPct}" step="5" min="0" max="100"></div>
                    <div class="form-group"><label class="form-label">Horizon (ans)</label><input type="number" class="form-input er-sizing" data-field="horizon" value="${sizing.horizon}" min="1" max="10" step="1"></div>
                    <div class="form-group"><label class="form-label">Croissance EBITDA (%/an)</label><input type="number" class="form-input er-sizing" data-field="growth" value="${sizing.growth}" step="0.5"></div>
                    <div class="form-group"><label class="form-label">IS / capex / ΔBFR (% EBITDA)</label>
                        <div style="display:flex;gap:4px"><input type="number" class="form-input er-sizing" data-field="taxPct" value="${sizing.taxPct}" step="1" style="width:64px"><input type="number" class="form-input er-sizing" data-field="capexPct" value="${sizing.capexPct}" step="1" style="width:64px"><input type="number" class="form-input er-sizing" data-field="wcPct" value="${sizing.wcPct}" step="0.5" style="width:64px"></div></div>
                </div>
                <div class="er-kpi-grid" id="er-sizing-results" style="margin-top:12px"></div>
                <div class="btn-group" style="margin-top:8px;justify-content:flex-start">
                    <button class="btn btn-sm btn-outline" id="er-apply-sizing">Retenir cette dette senior (ajuste les fonds propres)</button>
                </div>
                <p style="font-size:0.8rem;color:var(--text-muted);margin:8px 0 0">Dette senior maximale répartie selon les tranches ci-dessus, telle que le levier net d'entrée et le DSCR (CFADS / service, autres financements compris) respectent les seuils sur tout l'horizon. Prévisionnel du dossier actif s'il existe, sinon EBITDA LTM × croissance.</p>
            </div>

            <!-- Dette non refinancée -->
            <div class="card section">
                <div class="card-title">Dette non refinancée</div>
                <div class="table-container" style="margin-top:12px">
                    <table class="er-table">
                        <thead><tr><th>Libellé</th><th style="text-align:right">Montant (k€)</th><th></th></tr></thead>
                        <tbody id="er-dnr-body">
                            ${renderDetteNonRefRows()}
                        </tbody>
                        <tfoot>
                            <tr class="er-subtotal-row">
                                <td>Ss Total</td>
                                <td style="text-align:right" id="er-dnr-total">${fmtK(c.totalDetteNonRef)}</td>
                                <td></td>
                            </tr>
                        </tfoot>
                    </table>
                    <button class="er-add-btn" id="er-add-dnr">${PLUS_SVG} Ajouter une dette</button>
                </div>
            </div>

            <!-- Trésorerie minimum -->
            <div class="card section">
                <div class="card-title">Trésorerie Minimum au Closing</div>
                <div class="form-row" style="margin-top:12px">
                    <div class="form-group">
                        <label class="form-label">Montant (k€)</label>
                        <input type="number" class="form-input" id="er-treso" value="${tresorerieMin}" step="100">
                    </div>
                </div>
            </div>

            <!-- KPIs -->
            <div class="card section">
                <div class="card-title">Indicateurs clés</div>
                <div class="er-kpi-grid" style="margin-top:16px">
                    <div class="er-kpi-card">
                        <div class="kpi-label">VE retenue</div>
                        <div class="kpi-value" id="kpi-ve">${fmtK(c.veRetenue)}</div>
                        <div style="font-size:0.7rem;color:var(--text-muted);margin-top:4px">VT + DNR - Tréso</div>
                    </div>
                    <div class="er-kpi-card">
                        <div class="kpi-label">Dette Fin. Closing</div>
                        <div class="kpi-value" id="kpi-df-closing">${fmtK(c.detteFinClosing)}</div>
                    </div>
                    <div class="er-kpi-card">
                        <div class="kpi-label">${c.dfn < 0 ? 'Trésorerie nette' : 'DFN'}</div>
                        <div class="kpi-value highlight" id="kpi-dfn">${fmtK(Math.abs(c.dfn))}</div>
                    </div>
                    <div class="er-kpi-card">
                        <div class="kpi-label">Ratio Levier Net</div>
                        <div class="kpi-value highlight" id="kpi-levier">${c.ratioLevier == null ? 'n.s.' : fmtRatio(c.ratioLevier)}</div>
                    </div>
                    <div class="er-kpi-card">
                        <div class="kpi-label">Annuité Totale</div>
                        <div class="kpi-value" id="kpi-annuity-total">—</div>
                        <div style="font-size:0.7rem;color:var(--text-muted);margin-top:4px">Service de dette annuel</div>
                    </div>
                </div>
            </div>

            <!-- Action buttons -->
            <div class="btn-group section" style="justify-content:flex-start">
                <button class="btn btn-primary btn-lg" id="er-recalculate">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    Recalculer
                </button>
                <button class="btn btn-outline" id="er-save">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/></svg>
                    Sauvegarder
                </button>
                <button class="btn btn-outline" id="er-export">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Exporter Excel
                </button>
                <button class="btn btn-outline" id="er-export-pdf">Exporter PDF</button>
                <button class="btn btn-outline" id="er-share">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                    Partager
                </button>
            </div>
        `;
    },

    init() {
        // Dossier client : EBITDA de référence, trésorerie, dette senior → Covenants
        DossierBar.bind({
            toDossier: () => {
                const c = compute();
                return {
                    ebitdaLtm: ebitda,
                    netCash: tresorerieMin,
                    debts: structureDebts(c).map(d => ({ ...d, amount: Math.round(d.amount) })),
                    source: 'module Financement Structuré'
                };
            },
            fromDossier: d => {
                window._pendingReload = { type: 'structured', params: {
                    ...(d.ebitdaLtm != null ? { ebitda: d.ebitdaLtm } : {}),
                    ...(d.netCash != null ? { tresorerieMin: d.netCash } : {})
                } };
                loadFromHistory();
            }
        });

        // ── Direct inputs ──
        const bindInput = (id, setter) => {
            document.getElementById(id)?.addEventListener('input', e => {
                setter(parseFloat(e.target.value) || 0);
                recalculate();
            });
        };

        bindInput('er-ebitda', v => { ebitda = v; });
        bindInput('er-fp-amount', v => { fondsPropres = v; });
        bindInput('er-treso', v => { tresorerieMin = v; });

        // ── Emplois table ──
        const emploisBody = document.getElementById('er-emplois-body');
        emploisBody?.addEventListener('input', handleTableInput);
        emploisBody?.addEventListener('click', handleRemove);

        document.getElementById('er-add-emploi')?.addEventListener('click', () => {
            emplois.push({ label: 'Nouvel emploi', amount: 0 });
            emploisBody.innerHTML = renderEmploisRows();
            recalculate();
        });

        // ── Tranches table ──
        const tranchesBody = document.getElementById('er-tranches-body');
        tranchesBody?.addEventListener('input', handleTableInput);
        tranchesBody?.addEventListener('change', handleTableInput);
        tranchesBody?.addEventListener('click', handleRemove);

        document.getElementById('er-add-tranche')?.addEventListener('click', () => {
            tranchesSenior.push({ label: String.fromCharCode(65 + tranchesSenior.length), pct: 0, duration: 5, taux: 3.0, amortType: 'constant', frequency: 'mensuel' });
            recalculate();
        });

        // ── Autres financements ──
        const autresBody = document.getElementById('er-autres-body');
        autresBody?.addEventListener('input', e => { handleTableInput(e); refreshAutresComputed(); });
        autresBody?.addEventListener('change', e => { handleTableInput(e); refreshAutresComputed(); });
        autresBody?.addEventListener('click', handleRemove);
        document.getElementById('er-add-bpi')?.addEventListener('click', () => {
            autresFin.push({ label: 'Prêt Bpifrance', type: 'bpi', amount: 1000, taux: 4.5, duration: 7, deferral: 2, amortType: 'constant', frequency: 'trimestriel', rateType: 'fixed' });
            autresBody.innerHTML = renderAutresRows();
            recalculate();
        });
        document.getElementById('er-add-autre')?.addEventListener('click', () => {
            autresFin.push({ label: 'Crédit vendeur', type: 'vendeur', amount: 1000, taux: 4.0, duration: 5, amortType: 'infine', frequency: 'annuel', rateType: 'fixed' });
            autresBody.innerHTML = renderAutresRows();
            recalculate();
        });

        // ── Dimensionnement ──
        document.querySelectorAll('.er-sizing').forEach(inp => inp.addEventListener('input', e => {
            sizing[e.target.dataset.field] = parseFloat(e.target.value) || 0;
            recalculate();
        }));
        document.getElementById('er-apply-sizing')?.addEventListener('click', () => {
            if (!lastSizing) return;
            const c = compute();
            fondsPropres = Math.round(Math.max(0, c.totalEmplois - c.totalAutres - lastSizing.max));
            const fp = document.getElementById('er-fp-amount');
            if (fp) fp.value = String(fondsPropres);
            recalculate();
            window.showToast?.(`Dette senior retenue : ${fmtK(lastSizing.max)} k€ — fonds propres ajustés à ${fmtK(fondsPropres)} k€`, 'success');
        });

        // Euribor publié pour les tranches à taux variable
        Market.getRates().then(data => {
            marketIndex = Market.rateValue(data, 'euribor_3m');
            recalculate();
        }).catch(() => {});

        // ── Dette non refinancée table ──
        const dnrBody = document.getElementById('er-dnr-body');
        dnrBody?.addEventListener('input', handleTableInput);
        dnrBody?.addEventListener('click', handleRemove);

        document.getElementById('er-add-dnr')?.addEventListener('click', () => {
            detteNonRef.push({ label: 'Nouvelle dette', amount: 0 });
            dnrBody.innerHTML = renderDetteNonRefRows();
            recalculate();
        });

        // ── Action buttons ──
        document.getElementById('er-recalculate')?.addEventListener('click', recalculate);
        document.getElementById('er-save')?.addEventListener('click', saveSimulation);
        document.getElementById('er-export')?.addEventListener('click', exportExcel);
        document.getElementById('er-export-pdf')?.addEventListener('click', exportPdf);
        document.getElementById('er-share')?.addEventListener('click', shareStructured);

        // ── Lien de partage (#structured?s=...) ──
        const shared = Share.getPayload();
        if (shared?.type === 'structured' && shared?.params) {
            window._pendingReload = { type: 'structured', params: shared.params };
        }

        // ── Load from history (ou lien partagé) ──
        loadFromHistory();

        // ── Initial calculation ──
        recalculate();
    }
};
