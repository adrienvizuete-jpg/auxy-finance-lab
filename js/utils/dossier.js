/**
 * Auxy Partners - Dossier client partagé entre modules
 *
 * Un dossier actif (nom, EBITDA, passage au cash-flow, trésorerie, dettes)
 * que Structuré, Covenants et Profil de dette peuvent charger ou alimenter,
 * au lieu de ressaisir les mêmes chiffres dans chaque module.
 *
 * Import d'un Data Pack Auxy (Excel) : lecture des lignes EBITDA, IS
 * décaissé, CAPEX, variation de BFR et trésorerie nette, par période
 * (lignes d'en-tête : type Réel / Man / BP et date de clôture). Chaque
 * valeur importée garde sa référence de cellule (« tout chiffre vérifiable »).
 *
 * parseDataPack() est PUR (tableaux de lignes en entrée) — testé dans
 * tests/dossier.test.mjs ; la lecture du fichier passe par SheetJS.
 */

import { Storage } from './storage.js';

/**
 * @typedef {Object} DossierDebt Dette au format Covenants (k€)
 * @property {string} label
 * @property {number} amount
 * @property {number} rate
 * @property {number} durationYears
 * @property {string} amortType
 * @property {string} frequency
 * @property {string} [rateType]
 * @property {number} [hedgePct]
 * @property {number[]} [customProfile]
 * @property {number} [balloonPct]
 */

/**
 * @typedef {Object} DossierData
 * @property {string} name
 * @property {number | null} [ebitdaLtm] EBITDA de la dernière période réelle (k€)
 * @property {number | null} [netCash] Trésorerie nette de la dernière période réelle (k€)
 * @property {{ years: string[], ebitda: number[], tax: number[], capex: number[], wcChange: number[] } | null} [forecast]
 * @property {DossierDebt[]} [debts]
 * @property {string} [source] Origine des chiffres (fichier, module)
 * @property {Record<string, string>} [refs] Références de cellules des lignes importées
 * @property {string} [updatedAt]
 */

/** Libellés reconnus (premières colonnes), du plus spécifique au plus général. */
const LINE_PATTERNS = {
    ebitda: [/ebitda\s+ajust[ée]\s*(ii|2)?\b/i, /^\W*ebitda\b(?!.*(transfert|%|marge))/i],
    wcChange: [/variation\s+(du\s+)?bfr/i, /\bvar\.?\s*bfr/i],
    capex: [/\bcapex\b/i, /investissements?\s+(nets?|corporels)/i],
    tax: [/\bis\s+d[ée]caiss[ée]/i, /imp[oô]ts?\s+(sur\s+les\s+soci[ée]t[ée]s\s+)?d[ée]caiss/i],
    netCash: [/tr[ée]sorerie\s+(financi[èe]re\s+)?nette(?!.*variation)/i]
};

/** Feuilles explorées en priorité (Cash Flow d'abord : il porte les flux décaissés). */
const SHEET_PRIORITY = [/cash\s*flow/i, /tr[ée]sorerie/i, /ebitda/i, /p\s*&\s*l/i];

/** @param {unknown} v */
const isNum = v => typeof v === 'number' && isFinite(v);

/**
 * Repère les colonnes de périodes : ligne contenant au moins deux dates
 * (ou années 1990-2100), avec la ligne de type (Réel / Man / BP) au-dessus.
 * @param {unknown[][]} rows
 */
function findPeriods(rows) {
    for (let r = 0; r < Math.min(rows.length, 15); r++) {
        const row = rows[r] || [];
        /** @type {Array<{ col: number, year: number, label: string }>} */
        const cols = [];
        row.forEach((v, c) => {
            if (v instanceof Date && !isNaN(v.getTime())) cols.push({ col: c, year: v.getFullYear(), label: `${String(v.getMonth() + 1).padStart(2, '0')}/${v.getFullYear()}` });
            else if (isNum(v) && /** @type {number} */ (v) >= 1990 && /** @type {number} */ (v) <= 2100 && Number.isInteger(v)) cols.push({ col: c, year: /** @type {number} */ (v), label: String(v) });
        });
        if (cols.length >= 2) {
            const typeRow = rows[r - 1] || [];
            return cols.map(p => {
                const t = String(typeRow[p.col] ?? '').trim();
                const type = /bp|budget|pr[ée]v/i.test(t) ? 'BP' : /man|situation|ltm/i.test(t) ? 'Man' : /r[ée]el|r[ée]alis/i.test(t) ? 'Réel' : '';
                return { ...p, type };
            });
        }
    }
    return [];
}

/**
 * Analyse un Data Pack (feuilles en tableaux de lignes).
 * @param {Array<{ name: string, rows: unknown[][] }>} sheets
 */
export function parseDataPack(sheets) {
    const ordered = [...sheets].sort((a, b) => rank(a.name) - rank(b.name));
    /** @type {Record<string, { values: Record<number, number>, ref: string, periods: ReturnType<typeof findPeriods> }>} */
    const found = {};

    for (const sheet of ordered) {
        const periods = findPeriods(sheet.rows);
        if (!periods.length) continue;
        for (const [key, patterns] of Object.entries(LINE_PATTERNS)) {
            if (found[key]) continue;
            for (const re of patterns) {
                const r = sheet.rows.findIndex(row => (row || []).slice(0, 3).some(v => typeof v === 'string' && re.test(v.trim())));
                if (r < 0) continue;
                const row = sheet.rows[r];
                /** @type {Record<number, number>} */
                const values = {};
                periods.forEach(p => { if (isNum(row[p.col])) values[p.col] = /** @type {number} */ (row[p.col]); });
                if (!Object.keys(values).length) continue;
                found[key] = { values, ref: `${sheet.name}!ligne ${r + 1}`, periods };
                break;
            }
        }
    }

    const base = found.ebitda || Object.values(found)[0];
    const periods = base ? base.periods : [];
    /** @param {string} key */
    const series = key => periods.map(p => found[key]?.values[p.col] ?? null);

    // Convention de signe : dans une cascade de cash-flow, capex / IS / BFR
    // sont souvent saisis en négatif (sortie de cash). On les ramène en
    // montants positifs = besoin de cash, convention du module Covenants.
    const capexRaw = series('capex').filter(isNum);
    const cashEffect = capexRaw.length > 0 && capexRaw.filter(v => /** @type {number} */ (v) < 0).length >= capexRaw.length / 2;
    /** @param {Array<number | null>} arr */
    const toNeed = arr => arr.map(v => (v == null ? null : cashEffect ? -v : v));

    return {
        periods: periods.map(p => ({ label: p.label, year: p.year, type: p.type })),
        lines: {
            ebitda: series('ebitda'),
            tax: toNeed(series('tax')),
            capex: toNeed(series('capex')),
            wcChange: toNeed(series('wcChange')),
            netCash: series('netCash')
        },
        refs: Object.fromEntries(Object.entries(found).map(([k, v]) => [k, v.ref])),
        signConvention: cashEffect ? 'flux de trésorerie (négatifs inversés)' : 'besoins en positif'
    };
}

/** @param {string} name */
function rank(name) {
    const i = SHEET_PRIORITY.findIndex(re => re.test(name));
    return i < 0 ? SHEET_PRIORITY.length : i;
}

/**
 * Dossier à partir d'un Data Pack analysé : EBITDA et trésorerie de la
 * dernière période réelle (ou de situation), prévisionnel = colonnes BP
 * (à défaut les périodes postérieures à la dernière réelle).
 * @param {ReturnType<typeof parseDataPack>} pack
 * @param {string} [fileName]
 * @returns {DossierData}
 */
export function dossierFromDataPack(pack, fileName = '') {
    const idx = pack.periods.map((_, i) => i);
    const lastActual = [...idx].reverse().find(i => pack.periods[i].type !== 'BP' && pack.lines.ebitda[i] != null);
    let fc = idx.filter(i => pack.periods[i].type === 'BP' && pack.lines.ebitda[i] != null);
    if (!fc.length && lastActual != null) fc = idx.filter(i => i > lastActual && pack.lines.ebitda[i] != null);
    const pick = (/** @type {Array<number | null>} */ arr) => fc.map(i => arr[i] ?? 0);
    const name = fileName.replace(/\.(xlsx|xlsm|xls|xltx)$/i, '').replace(/_/g, ' ').trim();
    return {
        name: name || 'Dossier importé',
        ebitdaLtm: lastActual != null ? pack.lines.ebitda[lastActual] : null,
        netCash: lastActual != null ? pack.lines.netCash[lastActual] : null,
        forecast: fc.length ? {
            years: fc.map(i => pack.periods[i].label),
            ebitda: pick(pack.lines.ebitda),
            tax: pick(pack.lines.tax),
            capex: pick(pack.lines.capex),
            wcChange: pick(pack.lines.wcChange)
        } : null,
        source: fileName ? `Data Pack ${fileName}` : 'Data Pack',
        refs: pack.refs
    };
}

const KEY = 'dossier_active';

export const Dossier = {
    /** @returns {DossierData | null} */
    get() {
        const d = Storage.get(KEY);
        return d && typeof d === 'object' && typeof d.name === 'string' ? d : null;
    },

    /** Fusionne dans le dossier actif (crée s'il n'existe pas).
     *  @param {Partial<DossierData>} patch
     *  @returns {DossierData} */
    update(patch) {
        const next = { ...(this.get() || { name: 'Dossier' }), ...patch, updatedAt: new Date().toISOString() };
        Storage.set(KEY, next);
        return /** @type {DossierData} */ (next);
    },

    clear() {
        Storage.remove(KEY);
    },

    /**
     * Lit un fichier Excel (Data Pack) via SheetJS et retourne le dossier
     * proposé, sans l'enregistrer (l'utilisateur valide l'aperçu).
     * @param {File} file
     */
    async readDataPack(file) {
        const X = /** @type {any} */ (globalThis).XLSX;
        if (!X) throw new Error('Bibliothèque Excel non chargée');
        if (file.size > 15 * 1024 * 1024) throw new Error('Fichier trop volumineux (> 15 Mo)');
        const wb = X.read(await file.arrayBuffer(), { cellDates: true, cellFormula: false, cellHTML: false });
        const sheets = wb.SheetNames.map((/** @type {string} */ name) => ({
            name,
            rows: X.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: true })
        }));
        const pack = parseDataPack(sheets);
        return { pack, dossier: dossierFromDataPack(pack, file.name) };
    }
};

