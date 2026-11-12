/**
 * Auxy Partners - Recalcul d'un échéancier à partir des paramètres enregistrés
 *
 * L'Historique ne stocke plus les échéanciers (17 à 48 Ko par simulation,
 * de quoi saturer le stockage du navigateur) : il garde les paramètres et la
 * synthèse, et l'échéancier est recalculé ici pour les exports.
 */

import { Financial } from './financial.js';
import { LoanEngine } from './loanengine.js';

/**
 * @param {string | undefined} type Type de simulation du module Crédit
 * @param {any} p Paramètres enregistrés
 * @returns {any[] | null} Échéancier, ou null si le type n'en a pas / n'est pas recalculable
 */
export function recomputeSchedule(type, p) {
    if (!p || typeof p !== 'object') return null;
    try {
        switch (type) {
            case 'constant': return Financial.amortissableConstant(p).schedule;
            case 'degressif': return Financial.amortissableDegressif(p).schedule;
            case 'infine': return Financial.inFine(p).schedule;
            case 'creditbail': return Financial.creditBail(p).schedule ?? null;
            case 'revolving': return Financial.revolving(p).schedule ?? null;
            case 'relais': return Financial.pretRelais(p).schedule ?? null;
            case 'mezzanine': return Financial.detteMezzanine(p).schedule ?? null;
            case 'variable': return LoanEngine.build(p).rows;
            case 'bpi': {
                const bpi = { principal: p.principal, annualRate: p.annualRate, durationYears: p.durationMonths / 12, deferralYears: (p.deferralMonths || 0) / 12, fees: p.fees || 0, amortProfile: p.amortProfile, retenuePct: p.retenuePct || 0, retenueRate: p.retenueRate || 0 };
                if (p.cofinancement) {
                    return Financial.cofinancementBpifrance({ bpi, bank: { principal: p.bankAmount, annualRate: p.bankRate, durationYears: p.bankDurationMonths / 12, deferralMonths: p.bankDeferralMonths || 0, amortProfile: p.bankProfile }, frequency: p.frequency }).schedule;
                }
                return Financial.pretBpifrance({ ...bpi, frequency: p.frequency }).schedule;
            }
            default: return null;
        }
    } catch {
        return null;
    }
}
