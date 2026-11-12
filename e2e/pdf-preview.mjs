/**
 * Aperçu des exports PDF — outil de relecture visuelle (hors CI).
 *
 *   node e2e/pdf-preview.mjs <dossier de sortie>
 *
 * Ouvre l'app dans Chrome headless, lance l'export PDF de chaque module avec
 * ses données par défaut et écrit les fichiers dans le dossier indiqué.
 * jsPDF.save est intercepté dans la page : rien n'est téléchargé.
 */

import http from 'node:http';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = process.argv[2];
if (!OUT) { console.error('Usage : node e2e/pdf-preview.mjs <dossier de sortie>'); process.exit(1); }
mkdirSync(OUT, { recursive: true });

const chromePath = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium-browser']
    .filter(Boolean).find(p => existsSync(/** @type {string} */ (p)));
if (!chromePath) { console.error('Chrome introuvable. Définir CHROME_PATH.'); process.exit(1); }

const MIME = /** @type {Record<string, string>} */ ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' });
const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    const filePath = normalize(join(ROOT, urlPath === '/' ? 'index.html' : urlPath));
    if (!filePath.startsWith(ROOT) || !existsSync(filePath) || statSync(filePath).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
    createReadStream(filePath).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(undefined)));
const base = `http://127.0.0.1:${/** @type {any} */ (server.address()).port}/`;

/** Scénarios : page, préparation (clics avant l'export), bouton d'export */
const SCENARIOS = [
    { name: 'structure', page: 'structured', before: [], button: '#er-export-pdf' },
    { name: 'credit', page: 'credit', before: ['#credit-form button[type="submit"]'], button: '#btn-export-pdf' },
    { name: 'credit-bpifrance', page: 'credit', before: ['#credit-tabs .tab[data-type="bpi"]', '#cr-bpi-cofi', '#credit-form button[type="submit"]'], button: '#btn-export-pdf' },
    { name: 'covenants', page: 'covenants', before: [], button: '#cov-export-pdf' },
    { name: 'profil-dette', page: 'debtprofile', before: [], button: '#dp-export-pdf' },
    { name: 'immobilier', page: 'immobilier', before: ['#immo-calculate'], button: '#immo-export-pdf' },
    { name: 'sensibilite', page: 'stress', before: ['#st-run'], button: '#st-export-pdf' },
    { name: 'benchmark', page: 'benchmark', before: ['#run-benchmark'], button: '#bench-export-pdf' }
];
const only = process.argv[3]?.split(',');

const browser = await puppeteer.launch({ executablePath: chromePath, headless: true, args: ['--no-sandbox'] });
try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    page.on('pageerror', err => console.error(`pageerror: ${err.message}`));
    await page.goto(`${base}#dashboard`, { waitUntil: 'networkidle0' });
    await page.evaluate(() => { try { window.localStorage.setItem('auxy_dossier_active', JSON.stringify({ name: 'EMEK GROUP', source: 'aperçu PDF' })); } catch { /* aperçu sans dossier */ } });
    await page.reload({ waitUntil: 'networkidle0' });
    // bibliothèques d'export chargées, puis interception de save()
    await page.waitForFunction(() => /** @type {any} */ (window).jspdf?.jsPDF?.API?.autoTable, { timeout: 30000 });
    await page.evaluate(() => {
        const w = /** @type {any} */ (window);
        w.__pdfs = [];
        w.jspdf.jsPDF.API.save = function (/** @type {string} */ name) { w.__pdfs.push({ name, data: this.output('datauristring') }); return this; };
    });
    for (const sc of SCENARIOS) {
        if (only && !only.includes(sc.name)) continue;
        await page.evaluate(p => /** @type {any} */ (window).navigateTo(p), sc.page);
        await page.waitForFunction(p => location.hash === `#${p}`, { timeout: 10000 }, sc.page);
        await new Promise(r => setTimeout(r, 900));
        for (const sel of sc.before) { await page.click(sel); await new Promise(r => setTimeout(r, 1200)); }
        const count = await page.evaluate(() => /** @type {any} */ (window).__pdfs.length);
        await page.waitForSelector(sc.button, { timeout: 10000 });
        await page.$eval(sc.button, el => /** @type {HTMLElement} */ (el).click());
        try {
            await page.waitForFunction(n => /** @type {any} */ (window).__pdfs.length > n, { timeout: 15000 }, count);
        } catch { console.error(`✗ ${sc.name} : aucun PDF produit`); continue; }
        const pdf = await page.evaluate(() => /** @type {any} */ (window).__pdfs.at(-1));
        const file = join(OUT, `${sc.name}.pdf`);
        writeFileSync(file, Buffer.from(pdf.data.split(',')[1], 'base64'));
        console.log(`✓ ${sc.name} → ${file}`);
    }
} finally {
    await browser.close();
    server.close();
}
process.exit(0); // Chrome headless ne rend pas toujours la main
