/**
 * Auxy Partners - Passage d'un prêt d'un module à l'autre
 *
 * Un prêt simulé dans Crédit ou Immobilier devait être ressaisi dans
 * Profil de dette, Covenants, Benchmark et Stress Test. Handoff.send()
 * dépose le prêt (format commun, en €) pour le module cible et y navigue ;
 * la cible le récupère dans son render() avec Handoff.take().
 */

/**
 * @typedef {Object} HandoffLoan Prêt au format commun (montants en €)
 * @property {string} label
 * @property {number} amount
 * @property {number} rate Taux fixe, ou marge si rateType = 'floating'
 * @property {number} durationMonths Durée totale, différé inclus
 * @property {number} [deferralMonths]
 * @property {string} [amortType] 'constant' | 'degressif' | 'infine' | 'balloon'
 * @property {string} [frequency] 'monthly' | 'quarterly' | 'semiannual' | 'annual'
 * @property {string} [rateType] 'fixed' | 'floating'
 * @property {number} [balloonPct]
 */

/** Cibles proposées, dans l'ordre d'affichage */
export const HANDOFF_TARGETS = /** @type {Array<[string, string]>} */ ([
    ['debtprofile', 'Profil de dette'],
    ['covenants', 'Covenants & DSCR'],
    ['benchmark', 'Benchmark'],
    ['stress', 'Sensibilité taux × durée']
]);

/** @type {Record<string, HandoffLoan[]>} */
const inbox = {};

export const Handoff = {
    /** @param {string} page @param {HandoffLoan[]} loans */
    send(page, loans) {
        const valid = loans.filter(l => l && l.amount > 0 && l.durationMonths >= 1);
        if (!valid.length) { window.showToast?.('Aucun prêt à envoyer : lancez d’abord la simulation', 'warning'); return; }
        inbox[page] = valid;
        window.navigateTo?.(page);
        const target = HANDOFF_TARGETS.find(([p]) => p === page)?.[1] || page;
        window.showToast?.(`${valid.length > 1 ? `${valid.length} prêts envoyés` : 'Prêt envoyé'} vers ${target}`, 'success');
    },

    /** Prêts en attente pour cette page (vidés à la lecture). @param {string} page @returns {HandoffLoan[]} */
    take(page) {
        const loans = inbox[page] || [];
        delete inbox[page];
        return loans;
    },

    /** Barre de boutons « Envoyer vers… ». @param {string[]} [pages] */
    barHtml(pages = HANDOFF_TARGETS.map(([p]) => p)) {
        return `
            <div class="handoff-bar" role="group" aria-label="Envoyer ce prêt vers un autre module">
                <span class="handoff-label">Envoyer vers</span>
                ${HANDOFF_TARGETS.filter(([p]) => pages.includes(p)).map(([p, label]) => `<button type="button" class="btn btn-sm btn-outline" data-handoff="${p}">${label}</button>`).join('')}
            </div>`;
    }
};
