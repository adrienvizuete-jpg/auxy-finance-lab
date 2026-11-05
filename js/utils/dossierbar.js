/**
 * Auxy Partners - Bandeau « Dossier client » commun aux modules
 * Structuré, Covenants et Profil de dette : affiche le dossier actif,
 * importe un Data Pack (aperçu à valider avant enregistrement), charge le
 * dossier dans le module ou y enregistre les chiffres du module.
 */

import { Dossier } from './dossier.js';
import { escapeHtml } from './sanitize.js';

/** @typedef {import('./dossier.js').DossierData} DossierData */

const fmt = (/** @type {number | null | undefined} */ v) => (v == null || !isFinite(v) ? '—' : new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(v));

function summary() {
    const d = Dossier.get();
    if (!d) return '<span style="color:var(--text-muted)">Aucun dossier actif — importez un Data Pack ou enregistrez ce module.</span>';
    const parts = [`<strong>${escapeHtml(d.name)}</strong>`];
    if (d.ebitdaLtm != null) parts.push(`EBITDA ${fmt(d.ebitdaLtm)} k€`);
    if (d.forecast?.years?.length) parts.push(`BP ${escapeHtml(d.forecast.years[0])} → ${escapeHtml(d.forecast.years[d.forecast.years.length - 1])}`);
    if (d.debts?.length) parts.push(`${d.debts.length} dette${d.debts.length > 1 ? 's' : ''}`);
    if (d.source) parts.push(`<span style="color:var(--text-muted)">${escapeHtml(d.source)}</span>`);
    return parts.join(' · ');
}

export const DossierBar = {
    /** @param {string} moduleKey */
    html(moduleKey) {
        return `
            <div class="card section dossier-bar" data-module="${escapeHtml(moduleKey)}" style="padding:12px 16px">
                <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between">
                    <div style="font-size:0.88rem" id="dossier-summary">Dossier : ${summary()}</div>
                    <div class="btn-group">
                        <label class="btn btn-sm btn-outline" style="cursor:pointer">Importer un Data Pack
                            <input type="file" id="dossier-file" accept=".xlsx,.xlsm,.xls" hidden>
                        </label>
                        <button class="btn btn-sm btn-outline" id="dossier-load">Charger le dossier</button>
                        <button class="btn btn-sm btn-outline" id="dossier-save">Enregistrer dans le dossier</button>
                    </div>
                </div>
            </div>`;
    },

    /**
     * @param {{ toDossier: () => Partial<DossierData>, fromDossier: (d: DossierData) => void }} hooks
     */
    bind(hooks) {
        const refresh = () => {
            const el = document.getElementById('dossier-summary');
            if (el) el.innerHTML = `Dossier : ${summary()}`;
        };
        document.getElementById('dossier-load')?.addEventListener('click', () => {
            const d = Dossier.get();
            if (!d) { window.showToast?.('Aucun dossier actif', 'warning'); return; }
            hooks.fromDossier(d);
            window.showToast?.(`Dossier « ${d.name} » chargé`, 'success');
        });
        document.getElementById('dossier-save')?.addEventListener('click', () => {
            const d = Dossier.update(hooks.toDossier());
            refresh();
            window.showToast?.(`Dossier « ${d.name} » mis à jour`, 'success');
        });
        document.getElementById('dossier-file')?.addEventListener('change', async e => {
            const input = /** @type {HTMLInputElement} */ (e.target);
            const file = input.files?.[0];
            input.value = '';
            if (!file) return;
            try {
                const { pack, dossier } = await Dossier.readDataPack(file);
                if (!pack.periods.length || pack.lines.ebitda.every(v => v == null)) {
                    window.showToast?.('Aucune ligne EBITDA datée trouvée dans ce fichier', 'error');
                    return;
                }
                this._preview(pack, dossier, () => {
                    Dossier.replace(dossier); // nouveau client : les dettes de l'ancien ne doivent pas survivre
                    refresh();
                    hooks.fromDossier(/** @type {DossierData} */ (Dossier.get()));
                    window.showToast?.('Data Pack importé et chargé', 'success');
                });
            } catch (err) {
                window.showToast?.(`Import impossible : ${/** @type {Error} */ (err).message}`, 'error');
            }
        });
    },

    /**
     * Aperçu des chiffres lus, avec leur provenance, avant validation.
     * @param {ReturnType<typeof import('./dossier.js').parseDataPack>} pack
     * @param {DossierData} dossier
     * @param {() => void} onConfirm
     */
    _preview(pack, dossier, onConfirm) {
        const modal = document.getElementById('modal-overlay');
        const body = document.getElementById('modal-body');
        if (!modal || !body) return;
        const labels = { ebitda: 'EBITDA', tax: 'IS décaissé', capex: 'Capex', wcChange: 'Variation de BFR (+ = besoin)', netCash: 'Trésorerie nette' };
        const rows = Object.entries(labels).map(([k, label]) => {
            const vals = /** @type {Record<string, Array<number | null>>} */ (pack.lines)[k];
            const ref = /** @type {Record<string, string>} */ (pack.refs)[k];
            return `<tr><td>${label}${ref ? `<div style="font-size:0.72rem;color:var(--text-muted)">${escapeHtml(ref)}</div>` : '<div style="font-size:0.72rem;color:var(--warning)">non trouvée</div>'}</td>${vals.map(v => `<td class="number">${fmt(v)}</td>`).join('')}</tr>`;
        }).join('');
        body.innerHTML = `
            <h2 style="margin-bottom:4px">Import du Data Pack</h2>
            <p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:12px">Vérifiez les chiffres lus (k€) avant de les charger. Convention de signe : ${escapeHtml(pack.signConvention)}.</p>
            <div class="form-group" style="margin-bottom:12px">
                <label class="form-label">Nom du dossier</label>
                <input type="text" class="form-input" id="dossier-name" value="${escapeHtml(dossier.name)}" style="width:100%">
            </div>
            <div class="table-container"><table class="data-table">
                <thead><tr><th>Ligne</th>${pack.periods.map(p => `<th style="text-align:right">${escapeHtml(p.label)}<div style="font-weight:400;font-size:0.72rem">${escapeHtml(p.type || '')}</div></th>`).join('')}</tr></thead>
                <tbody>${rows}</tbody>
            </table></div>
            <p style="font-size:0.8rem;color:var(--text-muted);margin-top:8px">Prévisionnel retenu : ${dossier.forecast ? escapeHtml(dossier.forecast.years.join(', ')) : 'aucune colonne BP'} · EBITDA de référence : ${fmt(dossier.ebitdaLtm)} k€.</p>
            <div class="btn-group" style="justify-content:flex-end;margin-top:16px">
                <button class="btn btn-outline" id="dossier-cancel">Annuler</button>
                <button class="btn btn-primary" id="dossier-confirm">Charger ces chiffres</button>
            </div>`;
        modal.classList.remove('hidden');
        document.getElementById('dossier-cancel')?.addEventListener('click', () => modal.classList.add('hidden'));
        document.getElementById('dossier-confirm')?.addEventListener('click', () => {
            const name = /** @type {HTMLInputElement | null} */ (document.getElementById('dossier-name'))?.value.trim();
            if (name) dossier.name = name;
            modal.classList.add('hidden');
            onConfirm();
        });
    }
};
