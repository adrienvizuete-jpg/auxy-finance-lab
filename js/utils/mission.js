/**
 * Auxy Partners - Parcours de mission guidés
 *
 * Les modules étaient des silos : rien n'indiquait l'enchaînement d'une
 * mission. Un parcours propose les étapes dans l'ordre (LBO : Emplois-
 * ressources → Covenants → Profil de dette → dossier banque), affiché dans
 * l'en-tête de contexte, avec « Étape suivante ». Le dossier client actif
 * relie les étapes (import du Data Pack une fois, chargement partout).
 */

import { Storage } from './storage.js';

/**
 * @typedef {{ page: string, label: string, credit?: string, hint: string }} MissionStep
 * @typedef {{ id: string, label: string, desc: string, steps: MissionStep[] }} MissionDef
 */

/** @type {MissionDef[]} */
export const MISSIONS = [
    {
        id: 'lbo', label: 'LBO / dette d’acquisition',
        desc: 'Emplois-ressources, dimensionnement, covenants, profil consolidé, dossier banque.',
        steps: [
            { page: 'structured', label: 'Emplois-ressources', hint: 'Importez le Data Pack, posez les emplois et dimensionnez la dette senior.' },
            { page: 'covenants', label: 'Covenants', hint: 'Projetez DSCR et levier, testez sweep, grille de marge et stress inversé.' },
            { page: 'debtprofile', label: 'Profil de dette', hint: 'Consolidez la nouvelle dette et l’existant, par prêteur et par année.' },
            { page: 'history', label: 'Dossier banque', hint: 'Enregistrez chaque analyse puis exportez-les en un seul PDF.' }
        ]
    },
    {
        id: 'refi', label: 'Refinancement',
        desc: 'Dette existante, scénario de refinancement, nouvelle dette à taux variable, covenants.',
        steps: [
            { page: 'debtprofile', label: 'Dette existante', hint: 'Saisissez le pool actuel et le scénario de refinancement (coûts de sortie, VAN).' },
            { page: 'credit', credit: 'variable', label: 'Nouvelle dette', hint: 'Simulez la nouvelle dette : Euribor + marge, floor, couverture.' },
            { page: 'covenants', label: 'Covenants', hint: 'Vérifiez DSCR et levier avec la nouvelle structure.' },
            { page: 'history', label: 'Dossier banque', hint: 'Exportez les analyses enregistrées en un seul PDF.' }
        ]
    },
    {
        id: 'bfr', label: 'Financement du BFR',
        desc: 'Comparatif affacturage / Dailly / RCF, ligne revolving, stress de taux.',
        steps: [
            { page: 'credit', credit: 'bfr', label: 'Comparatif BFR', hint: 'Comparez affacturage, Dailly / escompte et RCF sur le poste clients.' },
            { page: 'credit', credit: 'revolving', label: 'Ligne RCF', hint: 'Dimensionnez la ligne : tirage, commission de non-utilisation, saisonnalité.' },
            { page: 'stress', label: 'Stress de taux', hint: 'Mesurez la sensibilité du coût à la hausse des taux.' },
            { page: 'history', label: 'Dossier banque', hint: 'Exportez les analyses enregistrées en un seul PDF.' }
        ]
    },
    {
        id: 'immo', label: 'Immobilier d’entreprise',
        desc: 'Montage foncier, ICR / LTV dans le temps, crédit-bail immobilier vs emprunt.',
        steps: [
            { page: 'immobilier', label: 'Montage', hint: 'Prix, frais de notaire par régime, loyers, financement et ballon.' },
            { page: 'credit', credit: 'creditbail', label: 'Crédit-bail', hint: 'Simulez le crédit-bail (loyers à échoir, option d’achat).' },
            { page: 'history', label: 'Dossier banque', hint: 'Exportez les analyses enregistrées en un seul PDF.' }
        ]
    }
];

const KEY = 'mission_active';

/** @returns {{ def: MissionDef, step: number } | null} */
function active() {
    const m = Storage.get(KEY);
    const def = m && MISSIONS.find(x => x.id === m.id);
    if (!def) return null;
    const step = Math.min(Math.max(0, Number(m.step) || 0), def.steps.length - 1);
    return { def, step };
}

function notify() {
    window.dispatchEvent(new CustomEvent('mission:change'));
}

export const Mission = {
    active,

    /** @param {string} id */
    start(id) {
        if (!MISSIONS.some(m => m.id === id)) return;
        Storage.set(KEY, { id, step: 0 });
        Mission.go(0);
    },

    /** @param {number} index */
    go(index) {
        const a = active();
        if (!a) return;
        const i = Math.min(Math.max(0, index), a.def.steps.length - 1);
        Storage.set(KEY, { id: a.def.id, step: i });
        const step = a.def.steps[i];
        if (step.credit) /** @type {any} */ (window)._creditType = step.credit;
        notify();
        window.navigateTo?.(step.page);
    },

    stop() {
        Storage.remove(KEY);
        notify();
    }
};
