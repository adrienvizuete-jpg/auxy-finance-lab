/**
 * Auxy Partners - Financement Structuré
 * Tableau Emplois-Ressources (Sources & Uses)
 */

import { Financial } from '../utils/financial.js';
import { Export } from '../utils/export.js';
import { Storage } from '../utils/storage.js';

// ── State ──
let emplois = [
    { label: 'VT [Nom cible]', amount: 12700 },
    { label: 'Frais', amount: 250 }
];

let detteNonRef = [
    { label: 'Dette bancaire existante', amount: 500 },
    { label: 'Compte-courant associé', amount: 694 },
    { label: 'Crédit-bail', amount: 500 }
];

let tranchesSenior = [
    { label: 'A', pct: 70, duration: 6 },
    { label: 'B', pct: 30, duration: 7 }
];

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
    const detteSenior = Math.max(0, totalEmplois - fondsPropres);
    const pctFP = totalEmplois > 0 ? (fondsPropres / totalEmplois * 100) : 0;
    const pctSenior = totalEmplois > 0 ? (detteSenior / totalEmplois * 100) : 0;
    const tranchesDetail = tranchesSenior.map(t => ({
        ...t,
        amount: detteSenior * t.pct / 100
    }));
    const detteFinClosing = detteSenior + totalDetteNonRef;
    const dfn = detteFinClosing - tresorerieMin;
    const ratioLevier = ebitda > 0 ? dfn / ebitda : 0;
    // VE retenue = VT (1er emploi) + Dette non refinancée - Trésorerie min
    const vt = emplois.length > 0 ? emplois[0].amount : 0;
    const veRetenue = vt + totalDetteNonRef - tresorerieMin;

    return {
        totalEmplois, totalDetteNonRef, detteSenior,
        pctFP, pctSenior, tranchesDetail,
        detteFinClosing, dfn, ratioLevier, veRetenue
    };
}

// ── Render dynamic rows ──
function renderEmploisRows() {
    return emplois.map((e, i) => `
        <tr data-section="emplois" data-index="${i}">
            <td><input class="er-input" type="text" value="${e.label}" data-field="label"></td>
            <td style="text-align:right"><input class="er-input narrow" type="number" value="${e.amount}" data-field="amount" step="50"></td>
            <td style="width:30px">${emplois.length > 1 ? `<button class="er-remove-btn" data-action="remove">${X_SVG}</button>` : ''}</td>
        </tr>
    `).join('');
}

function renderDetteNonRefRows() {
    return detteNonRef.map((d, i) => `
        <tr data-section="detteNonRef" data-index="${i}">
            <td><input class="er-input" type="text" value="${d.label}" data-field="label"></td>
            <td style="text-align:right"><input class="er-input narrow" type="number" value="${d.amount}" data-field="amount" step="50"></td>
            <td style="width:30px">${detteNonRef.length > 1 ? `<button class="er-remove-btn" data-action="remove">${X_SVG}</button>` : ''}</td>
        </tr>
    `).join('');
}

function renderTranchesRows(c) {
    return tranchesSenior.map((t, i) => `
        <tr data-section="tranches" data-index="${i}">
            <td><input class="er-input" type="text" value="${t.label}" data-field="label" style="width:80px"></td>
            <td style="text-align:right"><input class="er-input narrow" type="number" value="${t.pct}" data-field="pct" step="5" min="0" max="100"></td>
            <td style="text-align:right"><input class="er-input narrow" type="number" value="${t.duration}" data-field="duration" step="1" min="1"></td>
            <td style="text-align:right" class="er-computed">${fmtK(c.detteSenior * t.pct / 100)}</td>
            <td style="width:30px">${tranchesSenior.length > 1 ? `<button class="er-remove-btn" data-action="remove">${X_SVG}</button>` : ''}</td>
        </tr>
    `).join('');
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

    if (elFPPct) elFPPct.textContent = fmtPct(c.pctFP);
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
    const tbody = document.getElementById('er-tranches-body');
    if (tbody) {
        tbody.innerHTML = renderTranchesRows(c);
    }

    // Tranches total % warning
    const totalPct = tranchesSenior.reduce((s, t) => s + t.pct, 0);
    const pctWarn = document.getElementById('er-tranches-pct-warn');
    if (pctWarn) {
        pctWarn.style.display = totalPct !== 100 ? 'block' : 'none';
        pctWarn.textContent = `⚠ Total = ${totalPct}% (doit être 100%)`;
    }

    // Dette non refinancée sous-total
    const elDnrTotal = document.getElementById('er-dnr-total');
    if (elDnrTotal) elDnrTotal.textContent = fmtK(c.totalDetteNonRef);

    // KPIs
    const setKpi = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setKpi('kpi-ve', fmtK(c.veRetenue));
    setKpi('kpi-df-closing', fmtK(c.detteFinClosing));
    setKpi('kpi-dfn', fmtK(c.dfn));
    setKpi('kpi-levier', fmtRatio(c.ratioLevier));

    // Store last result
    lastResult = {
        type: 'structured',
        params: { ebitda, fondsPropres, tresorerieMin, emplois: [...emplois], detteNonRef: [...detteNonRef], tranchesSenior: [...tranchesSenior] },
        results: { ...c }
    };
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

    const val = field === 'label' ? input.value : (parseFloat(input.value) || 0);

    if (section === 'emplois' && emplois[index]) emplois[index][field] = val;
    else if (section === 'detteNonRef' && detteNonRef[index]) detteNonRef[index][field] = val;
    else if (section === 'tranches' && tranchesSenior[index]) tranchesSenior[index][field] = val;

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
    }

    recalculate();
}

// ── Save simulation ──
function saveSimulation() {
    if (!lastResult) {
        recalculate();
    }

    const modal = document.getElementById('modal-overlay');
    const body = document.getElementById('modal-body');
    const defaultName = `Emplois-Ressources — ${fmtK(lastResult.results.totalEmplois)} k€`;

    body.innerHTML = `
        <h2 style="margin-bottom:20px">Sauvegarder la simulation</h2>
        <div class="form-group" style="margin-bottom:16px">
            <label class="form-label">Nom de la simulation</label>
            <input type="text" class="form-input" id="save-sf-name" value="${defaultName}" style="width:100%">
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

    modal.classList.remove('hidden');
    document.getElementById('save-sf-name')?.focus();

    document.getElementById('save-sf-cancel')?.addEventListener('click', () => modal.classList.add('hidden'));
    document.getElementById('save-sf-confirm')?.addEventListener('click', () => {
        const name = document.getElementById('save-sf-name')?.value || defaultName;
        const notes = document.getElementById('save-sf-notes')?.value || '';

        Storage.saveSimulation({
            ...lastResult,
            name,
            notes,
            typeLabel: 'Financement Structuré'
        });

        modal.classList.add('hidden');
        window.showToast?.('Simulation sauvegardée', 'success');
    });
}

// ── Export Excel ──
function exportExcel() {
    if (typeof XLSX === 'undefined') {
        alert('Bibliothèque Excel non chargée');
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
    rows.push(['Dette Senior', c.detteSenior, c.pctSenior / 100]);
    rows.push(['TOTAL RESSOURCES', c.totalEmplois, 1]);
    rows.push([]);

    // Tranches
    rows.push(['TRANCHES DETTE SENIOR', '% Senior', 'Durée (ans)', 'Montant']);
    c.tranchesDetail.forEach(t => rows.push([`Tranche ${t.label}`, t.pct / 100, t.duration, t.amount]));
    rows.push([]);

    // Dette non refinancée
    rows.push(['DETTE NON REFINANCÉE']);
    detteNonRef.forEach(d => rows.push([d.label, d.amount]));
    rows.push(['Ss Total', c.totalDetteNonRef]);
    rows.push([]);

    // Trésorerie
    rows.push(['Trésorerie Minimum au Closing', `(${fmtK(tresorerieMin)})`]);
    rows.push([]);

    // KPIs
    rows.push(['--- INDICATEURS CLÉS ---']);
    rows.push(['VE retenue (VT + DNR - Tréso)', c.veRetenue]);
    rows.push(['Dette Financière au Closing', c.detteFinClosing]);
    rows.push(['DFN (Dette Fin. Nette)', c.dfn]);
    rows.push(['Ratio Levier Net (DFN / EBITDA)', c.ratioLevier]);

    const ws = XLSX.utils.aoa_to_sheet(rows);

    // Column widths
    ws['!cols'] = [{ wch: 32 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];

    XLSX.utils.book_append_sheet(wb, ws, 'Emplois-Ressources');
    XLSX.writeFile(wb, 'Emplois_Ressources.xlsx');
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
        if (Array.isArray(p.emplois)) emplois = p.emplois.map(e => ({ ...e }));
        if (Array.isArray(p.detteNonRef)) detteNonRef = p.detteNonRef.map(d => ({ ...d }));
        if (Array.isArray(p.tranchesSenior)) tranchesSenior = p.tranchesSenior.map(t => ({ ...t }));
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
                                <td>Dette Senior</td>
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
                                <th style="text-align:right">Montant (k€)</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody id="er-tranches-body">
                            ${renderTranchesRows(c)}
                        </tbody>
                    </table>
                </div>
                <div id="er-tranches-pct-warn" style="color:var(--warning);font-size:0.8rem;margin:8px 12px;display:none"></div>
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
                        <div class="kpi-label">DFN</div>
                        <div class="kpi-value highlight" id="kpi-dfn">${fmtK(c.dfn)}</div>
                    </div>
                    <div class="er-kpi-card">
                        <div class="kpi-label">Ratio Levier Net</div>
                        <div class="kpi-value highlight" id="kpi-levier">${fmtRatio(c.ratioLevier)}</div>
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
            </div>
        `;
    },

    init() {
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
        tranchesBody?.addEventListener('click', handleRemove);

        document.getElementById('er-add-tranche')?.addEventListener('click', () => {
            tranchesSenior.push({ label: String.fromCharCode(65 + tranchesSenior.length), pct: 0, duration: 5 });
            recalculate();
        });

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

        // ── Load from history ──
        loadFromHistory();

        // ── Initial calculation ──
        recalculate();
    }
};
