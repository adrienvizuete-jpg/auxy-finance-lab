/**
 * Auxy Partners - En-tête de contexte : client actif + parcours de mission
 *
 * Le dossier client n'apparaissait que dans le bandeau de trois modules :
 * on ne savait pas sur quel client on travaillait. Cet en-tête, présent sur
 * toutes les pages, affiche le client actif (changer, reprendre un dossier
 * récent, en créer un) et, si un parcours est lancé, ses étapes.
 */

import { Dossier } from './dossier.js';
import { Mission } from './mission.js';
import { Dialog } from './dialog.js';
import { escapeHtml } from './sanitize.js';

/** @param {string | undefined} iso */
const when = iso => {
    const t = iso ? Date.parse(iso) : NaN;
    return isFinite(t) ? new Date(t).toLocaleDateString('fr-FR') : '';
};

function stepperHtml(page) {
    const a = Mission.active();
    if (!a) return '';
    const steps = a.def.steps.map((s, i) => {
        const here = i === a.step && s.page === page;
        const state = i < a.step ? 'done' : i === a.step ? 'current' : '';
        return `<li><button type="button" class="mission-step ${state} ${here ? 'here' : ''}" data-step="${i}" ${i === a.step ? 'aria-current="step"' : ''}>
            <span class="mission-step-num">${i < a.step ? '✓' : i + 1}</span>${escapeHtml(s.label)}</button></li>`;
    }).join('');
    const cur = a.def.steps[a.step];
    const onStep = cur.page === page;
    const next = a.step < a.def.steps.length - 1
        ? `<button type="button" class="btn btn-sm btn-primary" id="mission-next">Étape suivante →</button>`
        : `<button type="button" class="btn btn-sm btn-outline" id="mission-stop">Terminer le parcours</button>`;
    return `
        <div class="mission-bar" role="navigation" aria-label="Parcours ${escapeHtml(a.def.label)}">
            <div class="mission-head"><strong>Parcours ${escapeHtml(a.def.label)}</strong>
                <span class="mission-hint">${onStep ? escapeHtml(cur.hint) : `Étape en cours : ${escapeHtml(cur.label)}`}</span></div>
            <ol class="mission-steps">${steps}</ol>
            <div class="mission-actions">
                ${onStep ? next : `<button type="button" class="btn btn-sm btn-primary" id="mission-resume">Revenir à l’étape</button>`}
                ${a.step < a.def.steps.length - 1 ? '<button type="button" class="btn btn-sm btn-outline" id="mission-stop">Quitter</button>' : ''}
            </div>
        </div>`;
}

function render(page) {
    const bar = document.getElementById('context-bar');
    if (!bar) return;
    const d = Dossier.get();
    const client = d
        ? `<span class="context-label">Client</span> <strong class="context-client">${escapeHtml(d.name)}</strong>${d.updatedAt ? ` <span class="context-meta">mis à jour le ${when(d.updatedAt)}</span>` : ''}`
        : '<span class="context-label">Aucun dossier client actif</span>';
    bar.innerHTML = `
        <div class="context-row">
            <div class="context-dossier">${client}</div>
            <button type="button" class="btn btn-sm btn-outline" id="context-switch">${d ? 'Changer de dossier' : 'Choisir un dossier'}</button>
        </div>
        ${stepperHtml(page)}`;
    const mobile = document.querySelector('.mobile-title');
    if (mobile) mobile.textContent = d ? d.name : 'Auxy Partners';
}

/** Fenêtre : dossiers récents, nouveau dossier, fermer le dossier */
export function openDossierPicker() {
    const d = Dossier.get();
    const recent = Dossier.recent();
    const rows = recent.map(r => `
        <li class="dossier-pick-row">
            <div><strong>${escapeHtml(r.name)}</strong>
                <div class="context-meta">${[r.ebitdaLtm != null ? `EBITDA ${new Intl.NumberFormat('fr-FR').format(r.ebitdaLtm)} k€` : '', r.debts?.length ? `${r.debts.length} dette(s)` : '', when(r.updatedAt)].filter(Boolean).join(' · ')}</div></div>
            ${d && d.name === r.name ? '<span class="cov-badge ok">Actif</span>' : `<button type="button" class="btn btn-sm btn-outline" data-activate="${escapeHtml(r.name)}">Reprendre</button>`}
        </li>`).join('');
    Dialog.open(`
        <h2 style="margin-bottom:12px">Dossier client</h2>
        ${recent.length ? `<ul class="dossier-pick">${rows}</ul>` : '<p class="context-meta" style="margin-bottom:12px">Aucun dossier récent. Créez-en un ou importez un Data Pack depuis Structuré, Covenants ou Profil de dette.</p>'}
        <div class="form-group" style="margin:16px 0 8px">
            <label class="form-label" for="dossier-new-name">Nouveau dossier</label>
            <div style="display:flex;gap:8px"><input type="text" class="form-input" id="dossier-new-name" placeholder="Ex : SAS Dupont Industries" maxlength="80" style="flex:1">
            <button type="button" class="btn btn-primary" id="dossier-new">Créer</button></div>
        </div>
        ${d ? '<div class="btn-group" style="justify-content:flex-end;margin-top:12px"><button type="button" class="btn btn-outline" id="dossier-close">Fermer le dossier actif</button></div>' : ''}`);
    const body = document.getElementById('modal-body');
    body?.querySelectorAll('[data-activate]').forEach(btn => btn.addEventListener('click', () => {
        const name = /** @type {HTMLElement} */ (btn).dataset.activate || '';
        if (Dossier.activate(name)) window.showToast?.(`Dossier « ${name} » actif`, 'success');
        Dialog.close();
    }));
    const create = () => {
        const input = /** @type {HTMLInputElement | null} */ (document.getElementById('dossier-new-name'));
        const name = input?.value.trim().slice(0, 80);
        if (!name) { input?.focus(); return; }
        Dossier.replace({ name, source: 'créé manuellement' });
        window.showToast?.(`Dossier « ${name} » créé`, 'success');
        Dialog.close();
    };
    document.getElementById('dossier-new')?.addEventListener('click', create);
    document.getElementById('dossier-new-name')?.addEventListener('keydown', e => { if (e.key === 'Enter') create(); });
    document.getElementById('dossier-close')?.addEventListener('click', () => { Dossier.clear(); Dialog.close(); });
}

/** @param {() => string} currentPage */
export function initContextBar(currentPage) {
    const bar = document.getElementById('context-bar');
    if (!bar) return;
    const refresh = () => render(currentPage());
    window.addEventListener('dossier:change', refresh);
    window.addEventListener('mission:change', refresh);
    bar.addEventListener('click', e => {
        const t = e.target instanceof Element ? e.target : null;
        if (!t) return;
        if (t.closest('#context-switch')) openDossierPicker();
        else if (t.closest('#mission-next')) { const a = Mission.active(); if (a) Mission.go(a.step + 1); }
        else if (t.closest('#mission-resume')) { const a = Mission.active(); if (a) Mission.go(a.step); }
        else if (t.closest('#mission-stop')) Mission.stop();
        else {
            const step = t.closest('[data-step]');
            if (step) Mission.go(Number(/** @type {HTMLElement} */ (step).dataset.step));
        }
    });
    return refresh;
}
