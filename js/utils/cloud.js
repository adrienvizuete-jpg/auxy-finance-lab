/**
 * Auxy Partners - Synchronisation cabinet (Supabase, API REST pure)
 *
 * Sauvegarde et partage des simulations entre les associés, sans aucune
 * dépendance : les API Auth (GoTrue) et REST (PostgREST) de Supabase sont
 * consommées en fetch. Connexion par code à 6 chiffres reçu par e-mail
 * (pas de redirection — compatible PWA et routeur à hash).
 *
 * Sécurité :
 *  - l'« anon key » est publique par conception (présente dans toute app
 *    Supabase) ; la protection des données vient des Row Level Security
 *    policies : seuls les comptes e-mail du cabinet, créés par invitation,
 *    peuvent lire/écrire la table `dossiers` (voir docs/CLOUD-SETUP.md) ;
 *  - les jetons de session sont stockés en localStorage et rafraîchis
 *    automatiquement.
 *
 * Configuration : data/cloud-config.json { "url": "", "anonKey": "" }.
 * Tant que ce fichier est vide, le module se déclare non configuré et
 * l'UI affiche la marche à suivre.
 */

import { Storage } from './storage.js';

/** @typedef {import('./storage.js').Simulation} Simulation */

/**
 * Session Supabase persistée en localStorage.
 * @typedef {Object} Session
 * @property {string} access_token
 * @property {string | null} [refresh_token]
 * @property {number} [expires_at] Échéance (epoch secondes)
 * @property {string | null} [email]
 */

/**
 * Configuration cloud chargée depuis data/cloud-config.json
 * ({} si non configuré, null tant que non chargée).
 * @typedef {{ url?: string, anonKey?: string }} CloudConfig
 */

/** Config dont la présence des deux champs a été vérifiée (isConfigured). */
/** @typedef {{ url: string, anonKey: string }} CloudConfigReady */

const SESSION_KEY = 'cloud_session';
/** @type {CloudConfig | null} */
let config = null; // { url, anonKey } | null une fois chargé ({} si non configuré)

// ── Configuration ──

/** @returns {Promise<CloudConfig>} */
export async function loadCloudConfig() {
    if (config !== null) return config;
    try {
        const resp = await fetch('data/cloud-config.json', { cache: 'no-store' });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        config = (data?.url && data?.anonKey) ? { url: data.url.replace(/\/$/, ''), anonKey: data.anonKey } : {};
    } catch {
        config = {};
    }
    return config;
}

function isConfigured() {
    return !!(config?.url && config?.anonKey);
}

// ── Session ──

/** @returns {Session | null} */
function getSession() {
    return Storage.get(SESSION_KEY);
}

/** @param {Session | null} s */
function setSession(s) {
    if (s) Storage.set(SESSION_KEY, s);
    else Storage.remove(SESSION_KEY);
}

/**
 * fetch authentifié sur l'API Supabase (suppose la config chargée).
 * @param {string} path
 * @param {RequestInit & { headers?: Record<string, string> }} [options]
 * @returns {Promise<Response>}
 */
async function authFetch(path, options = {}) {
    const session = await ensureFreshSession();
    if (!session) throw new Error('Non connecté');
    const resp = await fetch(`${(/** @type {CloudConfigReady} */ (config)).url}${path}`, {
        ...options,
        headers: {
            apikey: (/** @type {CloudConfigReady} */ (config)).anonKey,
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            ...(options.headers || {})
        }
    });
    if (!resp.ok) {
        const detail = await resp.text().catch(() => '');
        throw new Error(`HTTP ${resp.status}${detail ? ` — ${detail.slice(0, 180)}` : ''}`);
    }
    return resp;
}

/** Rafraîchit la session si elle expire dans moins de 60 s. Retourne null si déconnecté.
 *  @returns {Promise<Session | null>} */
async function ensureFreshSession() {
    const s = getSession();
    if (!s?.access_token) return null;
    if (s.expires_at && (s.expires_at - 60) * 1000 > Date.now()) return s;
    if (!s.refresh_token) { setSession(null); return null; }
    try {
        const resp = await fetch(`${(/** @type {CloudConfigReady} */ (config)).url}/auth/v1/token?grant_type=refresh_token`, {
            method: 'POST',
            headers: { apikey: (/** @type {CloudConfigReady} */ (config)).anonKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: s.refresh_token })
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        const fresh = {
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
            email: data.user?.email || s.email
        };
        setSession(fresh);
        return fresh;
    } catch {
        setSession(null);
        return null;
    }
}

// ── API publique ──

export const Cloud = {
    /** @returns {Promise<{ state: string, email?: string | null }>} */
    async status() {
        await loadCloudConfig();
        if (!isConfigured()) return { state: 'unconfigured' };
        const session = await ensureFreshSession();
        return session
            ? { state: 'connected', email: session.email }
            : { state: 'disconnected' };
    },

    /**
     * Envoie le lien de connexion par e-mail (compte créé par invitation
     * uniquement). Le lien ramène sur l'app, qui capte la session via
     * captureSessionFromHash().
     * @param {string} email
     */
    async requestLink(email) {
        await loadCloudConfig();
        if (!isConfigured()) throw new Error('Cloud non configuré');
        const redirect = encodeURIComponent(window.location.origin + window.location.pathname);
        const resp = await fetch(`${(/** @type {CloudConfigReady} */ (config)).url}/auth/v1/otp?redirect_to=${redirect}`, {
            method: 'POST',
            headers: { apikey: (/** @type {CloudConfigReady} */ (config)).anonKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, create_user: false })
        });
        if (!resp.ok) {
            const body = await resp.json().catch(() => ({}));
            if (resp.status === 422 || /signup/i.test(body?.msg || body?.error_description || '')) {
                throw new Error('Adresse non autorisée — les comptes sont créés par invitation.');
            }
            if (resp.status === 429) {
                throw new Error('Limite d\'envoi d\'e-mails atteinte (2/heure sur le service intégré) — réessayez dans une heure, ou utilisez le dernier lien déjà reçu par e-mail s\'il n\'a pas servi.');
            }
            throw new Error(body?.msg || body?.error_description || `Erreur ${resp.status}`);
        }
    },

    /**
     * Capte la session au retour d'un lien magique / d'invitation
     * (#access_token=...&refresh_token=...). Retourne { email } en cas de
     * succès, { error } si le lien est expiré/invalide, null sinon.
     * @returns {{ email: string | null } | { error: string } | null}
     */
    captureSessionFromHash() {
        const hash = window.location.hash.replace(/^#/, '');
        if (!hash.includes('access_token=') && !hash.includes('error_description=')) return null;
        const params = new URLSearchParams(hash);
        const errorDesc = params.get('error_description');
        if (errorDesc) return { error: errorDesc.replace(/\+/g, ' ') };
        const access_token = params.get('access_token');
        if (!access_token) return null;
        let email = null;
        try {
            const payload = JSON.parse(atob(access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
            email = payload.email || null;
        } catch { /* JWT illisible : la session reste valide, e-mail inconnu */ }
        setSession({
            access_token,
            refresh_token: params.get('refresh_token'),
            expires_at: Math.floor(Date.now() / 1000) + parseInt(params.get('expires_in') || '3600', 10),
            email
        });
        return { email };
    },

    /** Vérifie le code reçu par e-mail et ouvre la session
     *  @param {string} email
     *  @param {string} code
     *  @returns {Promise<string>} e-mail du compte connecté */
    async verifyCode(email, code) {
        await loadCloudConfig();
        const resp = await fetch(`${(/** @type {CloudConfigReady} */ (config)).url}/auth/v1/verify`, {
            method: 'POST',
            headers: { apikey: (/** @type {CloudConfigReady} */ (config)).anonKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'email', email, token: code.trim() })
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !data.access_token) {
            throw new Error(data?.msg || data?.error_description || 'Code invalide ou expiré');
        }
        setSession({
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
            email: data.user?.email || email
        });
        return data.user?.email || email;
    },

    signOut() {
        setSession(null);
    },

    /**
     * Push : envoie les simulations locales vers le cloud (upsert par id —
     * idempotent, n'efface jamais rien côté serveur).
     * @returns {Promise<{ sent: number }>}
     */
    async pushSimulations() {
        const sims = Storage.getHistory();
        if (!sims.length) return { sent: 0 };
        const session = await ensureFreshSession();
        const rows = sims.map(sim => ({
            id: sim.id,
            name: sim.name || sim.typeLabel || sim.type || 'Simulation',
            type: sim.type || 'inconnu',
            payload: sim,
            updated_at: new Date().toISOString(),
            updated_by: session?.email || null
        }));
        await authFetch('/rest/v1/dossiers?on_conflict=id', {
            method: 'POST',
            headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
            body: JSON.stringify(rows)
        });
        return { sent: rows.length };
    },

    /**
     * Pull : récupère les simulations du cabinet et les fusionne dans
     * l'historique local (par id, la plus récente gagne).
     * @returns {Promise<{ fetched: number, added: number }>}
     */
    async pullSimulations() {
        const resp = await authFetch('/rest/v1/dossiers?select=id,payload,updated_by&order=updated_at.desc&limit=500');
        /** @type {Array<{ id: string, payload: Simulation, updated_by?: string | null }>} */
        const rows = await resp.json();
        const remote = rows.map(r => r.payload).filter(p => p && p.id);
        const { merged, added } = mergeSimulations(Storage.getHistory(), remote);
        if (added > 0) Storage.set('history', merged.slice(0, 200));
        return { fetched: remote.length, added };
    }
};

/**
 * Fusion locale/distante par id : union, et en cas de doublon la simulation
 * la plus récente (champ date) l'emporte. Résultat trié par date décroissante.
 * Fonction pure — testée dans tests/cloud.test.mjs.
 * @param {Simulation[] | null | undefined} local
 * @param {Simulation[] | null | undefined} remote
 * @returns {{ merged: Simulation[], added: number }}
 */
export function mergeSimulations(local, remote) {
    /** @type {Map<string, Simulation>} */
    const byId = new Map();
    for (const sim of local || []) {
        if (sim?.id) byId.set(sim.id, sim);
    }
    let added = 0;
    for (const sim of remote || []) {
        if (!sim?.id) continue;
        const existing = byId.get(sim.id);
        if (!existing) {
            byId.set(sim.id, sim);
            added++;
        } else if (new Date(sim.date || 0) > new Date(existing.date || 0)) {
            byId.set(sim.id, sim);
        }
    }
    const merged = [...byId.values()].sort((a, b) => /** @type {any} */ (new Date(b.date || 0)) - /** @type {any} */ (new Date(a.date || 0)));
    return { merged, added };
}
